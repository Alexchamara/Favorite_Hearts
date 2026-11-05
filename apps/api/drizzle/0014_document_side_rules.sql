-- Identity documents in several photos (owner, 5 Nov 2026): the front and back of an NIC or driving licence, a
-- passport's photo page, and a selfie while the owner requires one; photos kept as drafts until sent (24 hours at
-- most), and a phone link (QR code) that lets a phone add photos without signing in. Hand-written; see
-- docs/ARCHITECTURE.md, "Identity documents".

-- ===== Service switches: a new switch has no row until the owner first sets it ================================

GRANT INSERT ON operations_flag TO fh_app;
--> statement-breakpoint
CREATE POLICY operations_flag_insert ON operations_flag FOR INSERT TO fh_app
  WITH CHECK (app.is_owner() AND updated_by_user_id = app.user_id());
--> statement-breakpoint

-- ===== Cases: every side is part of the record ==================================================================

-- A decided case stays exactly as reviewed, its back and selfie included (replaces 0005's version).
CREATE OR REPLACE FUNCTION app.verification_case_review() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF current_user <> 'fh_app' THEN RETURN NEW; END IF;
    IF OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'a decided verification case is final' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = 'pending'
       OR (NEW.id, NEW.subject_user_id, NEW.profile_id, NEW.document_type, NEW.evidence_key, NEW.evidence_back_key,
           NEW.selfie_key, NEW.submitted_at, NEW.purged_at)
          IS DISTINCT FROM (OLD.id, OLD.subject_user_id, OLD.profile_id, OLD.document_type, OLD.evidence_key,
           OLD.evidence_back_key, OLD.selfie_key, OLD.submitted_at, OLD.purged_at) THEN
      RAISE EXCEPTION 'a review only records a decision' USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.reviewed_by_user_id := app.user_id();
    NEW.reviewed_at := now();
    NEW.purge_after := now() + interval '90 days';
    RETURN NEW;
  END
  $$;
--> statement-breakpoint
-- The purge (90 days after the decision, or the account's deletion) clears the front; the back and selfie go with it,
-- through the file-deletion queue, so no path can forget them.
CREATE FUNCTION app.verification_case_purge_sides() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  BEGIN
    IF NEW.purged_at IS NOT NULL AND OLD.purged_at IS NULL THEN
      INSERT INTO storage_deletion (bucket, object_key)
        SELECT 'private', k FROM unnest(ARRAY[NEW.evidence_back_key, NEW.selfie_key]) AS k WHERE k IS NOT NULL
        ON CONFLICT DO NOTHING;
      NEW.evidence_back_key := NULL;
      NEW.selfie_key := NULL;
    END IF;
    RETURN NEW;
  END
  $$;
--> statement-breakpoint
CREATE TRIGGER verification_case_purge_sides BEFORE UPDATE ON verification_case
  FOR EACH ROW EXECUTE FUNCTION app.verification_case_purge_sides();
--> statement-breakpoint
-- A case removed outright (a pending case when its account is deleted) queues every file it still holds.
CREATE FUNCTION app.verification_case_forget_files() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  BEGIN
    INSERT INTO storage_deletion (bucket, object_key)
      SELECT 'private', k FROM unnest(ARRAY[OLD.evidence_key, OLD.evidence_back_key, OLD.selfie_key]) AS k WHERE k IS NOT NULL
      ON CONFLICT DO NOTHING;
    RETURN OLD;
  END
  $$;
--> statement-breakpoint
CREATE TRIGGER verification_case_forget_files BEFORE DELETE ON verification_case
  FOR EACH ROW EXECUTE FUNCTION app.verification_case_forget_files();
--> statement-breakpoint

-- ===== Drafts and phone links: each member sees only their own ===================================================

-- The app role only reads drafts; adding, replacing, removing and sending them go through the functions below, which
-- queue every file that is no longer needed, so no identity photo is ever left behind.
GRANT SELECT ON verification_draft TO fh_app;
--> statement-breakpoint
ALTER TABLE verification_draft ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY verification_draft_select ON verification_draft FOR SELECT TO fh_app USING (user_id = app.user_id());
--> statement-breakpoint
-- Adds or replaces the signed-in member's photo of one side (from this device, or `p_via` = 'phone' through a link).
CREATE FUNCTION app.put_draft(p_user_id text, p_side document_side, p_key text, p_via text) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    created uuid;
  BEGIN
    IF p_user_id IS NULL THEN RAISE EXCEPTION 'not signed in' USING ERRCODE = 'insufficient_privilege'; END IF;
    IF app.flag('document_submissions_paused') THEN
      RAISE EXCEPTION 'document submissions are paused' USING ERRCODE = 'insufficient_privilege';
    END IF;
    WITH replaced AS (
      DELETE FROM verification_draft WHERE user_id = p_user_id AND side = p_side RETURNING object_key
    )
    INSERT INTO storage_deletion (bucket, object_key) SELECT 'private', object_key FROM replaced ON CONFLICT DO NOTHING;
    INSERT INTO verification_draft (user_id, side, object_key, via, expires_at)
      VALUES (p_user_id, p_side, p_key, p_via, now() + interval '24 hours')
      RETURNING id INTO created;
    RETURN created;
  END
  $$;
--> statement-breakpoint
CREATE FUNCTION app.add_draft(p_side document_side, p_key text) RETURNS uuid
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$ SELECT app.put_draft(app.user_id(), p_side, p_key, 'device') $$;
--> statement-breakpoint
-- Removes one of the signed-in member's drafts and queues its file. False when there was no such draft.
CREATE FUNCTION app.remove_draft(p_id uuid) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    gone text;
  BEGIN
    DELETE FROM verification_draft WHERE id = p_id AND user_id = app.user_id() RETURNING object_key INTO gone;
    IF gone IS NULL THEN RETURN false; END IF;
    INSERT INTO storage_deletion (bucket, object_key) VALUES ('private', gone) ON CONFLICT DO NOTHING;
    RETURN true;
  END
  $$;
--> statement-breakpoint
-- Sends the signed-in member's drafts for review as one case: the front (a passport's photo page), the back for an NIC
-- or driving licence, and the selfie while the owner requires it. Drafts the case does not use are deleted, the
-- phone link is closed. The API checks the same first, to say clearly what is missing.
CREATE FUNCTION app.submit_document(p_type document_type) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    me text := app.user_id();
    front_key text;
    back_key text;
    selfie_key text;
    needs_back boolean := p_type IN ('nic', 'driving_licence');
    needs_selfie boolean := app.flag('selfie_required');
    created uuid;
  BEGIN
    IF me IS NULL THEN RAISE EXCEPTION 'not signed in' USING ERRCODE = 'insufficient_privilege'; END IF;
    IF app.flag('document_submissions_paused') THEN
      RAISE EXCEPTION 'document submissions are paused' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT max(object_key) FILTER (WHERE side = 'front'), max(object_key) FILTER (WHERE side = 'back'),
           max(object_key) FILTER (WHERE side = 'selfie')
      INTO front_key, back_key, selfie_key
      FROM verification_draft WHERE user_id = me AND expires_at > now();
    IF front_key IS NULL OR (needs_back AND back_key IS NULL) OR (needs_selfie AND selfie_key IS NULL) THEN
      RAISE EXCEPTION 'a document photo is missing' USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO verification_case (subject_user_id, document_type, evidence_key, evidence_back_key, selfie_key)
      VALUES (me, p_type, front_key, CASE WHEN needs_back THEN back_key END, CASE WHEN needs_selfie THEN selfie_key END)
      RETURNING id INTO created;
    WITH gone AS (DELETE FROM verification_draft WHERE user_id = me RETURNING object_key)
    INSERT INTO storage_deletion (bucket, object_key)
      SELECT 'private', object_key FROM gone
      WHERE object_key NOT IN (front_key, coalesce(CASE WHEN needs_back THEN back_key END, ''), coalesce(CASE WHEN needs_selfie THEN selfie_key END, ''))
      ON CONFLICT DO NOTHING;
    UPDATE verification_upload_link SET revoked_at = now() WHERE user_id = me AND revoked_at IS NULL;
    RETURN created;
  END
  $$;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON verification_upload_link TO fh_app;
--> statement-breakpoint
ALTER TABLE verification_upload_link ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY verification_upload_link_select ON verification_upload_link FOR SELECT TO fh_app USING (user_id = app.user_id());
--> statement-breakpoint
CREATE POLICY verification_upload_link_insert ON verification_upload_link FOR INSERT TO fh_app
  WITH CHECK (user_id = app.user_id() AND revoked_at IS NULL AND expires_at <= now() + interval '15 minutes 1 second');
--> statement-breakpoint
-- A member can only end their own link, never reopen or lengthen it.
CREATE POLICY verification_upload_link_update ON verification_upload_link FOR UPDATE TO fh_app
  USING (user_id = app.user_id()) WITH CHECK (user_id = app.user_id() AND revoked_at IS NOT NULL);
--> statement-breakpoint

-- ===== The phone page: it holds only a token, so these functions decide what it may do ==========================

-- The member a link belongs to, while it is open and the account can still send documents; NULL otherwise.
CREATE FUNCTION app.upload_link_owner(p_token_hash text) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT l.user_id FROM verification_upload_link l
    JOIN member_account ma ON ma.user_id = l.user_id AND ma.status = 'active'
    WHERE l.token_hash = p_token_hash AND l.revoked_at IS NULL AND l.expires_at > now()
      AND NOT app.flag('document_submissions_paused')
  $$;
--> statement-breakpoint
-- What the phone page may show: when the link ends and which photos are in. Never who the member is.
CREATE FUNCTION app.upload_link_status(p_token_hash text) RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT jsonb_build_object(
             'expiresAt', l.expires_at,
             'selfieRequired', app.flag('selfie_required'),
             'uploaded', (SELECT coalesce(jsonb_agg(d.side ORDER BY d.side), '[]'::jsonb)
                          FROM verification_draft d WHERE d.user_id = l.user_id AND d.expires_at > now()))
    FROM verification_upload_link l
    WHERE l.token_hash = p_token_hash AND l.user_id = app.upload_link_owner(p_token_hash)
  $$;
--> statement-breakpoint
-- Adds (or replaces) one side through a link; the replaced photo's file is queued for deletion.
CREATE FUNCTION app.add_draft_via_link(p_token_hash text, p_side document_side, p_key text) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    owner_id text := app.upload_link_owner(p_token_hash);
  BEGIN
    IF owner_id IS NULL THEN
      RAISE EXCEPTION 'upload link not valid' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN app.put_draft(owner_id, p_side, p_key, 'phone');
  END
  $$;
--> statement-breakpoint

-- ===== Clean-up ===================================================================================================

-- Drafts older than a day are deleted with their files (run every 10 minutes by storage.cleanup); links a day past
-- their end are forgotten.
CREATE FUNCTION app.purge_expired_drafts() RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    purged integer;
  BEGIN
    WITH gone AS (DELETE FROM verification_draft WHERE expires_at <= now() RETURNING object_key)
    INSERT INTO storage_deletion (bucket, object_key) SELECT 'private', object_key FROM gone ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS purged = ROW_COUNT;
    DELETE FROM verification_upload_link WHERE expires_at < now() - interval '1 day';
    RETURN purged;
  END
  $$;
--> statement-breakpoint
-- Deleting an account removes its drafts and files at once and closes its links.
CREATE FUNCTION app.member_account_forget_drafts() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  BEGIN
    WITH gone AS (DELETE FROM verification_draft WHERE user_id = NEW.user_id RETURNING object_key)
    INSERT INTO storage_deletion (bucket, object_key) SELECT 'private', object_key FROM gone ON CONFLICT DO NOTHING;
    UPDATE verification_upload_link SET revoked_at = now() WHERE user_id = NEW.user_id AND revoked_at IS NULL;
    RETURN NEW;
  END
  $$;
--> statement-breakpoint
CREATE TRIGGER member_account_forget_drafts AFTER UPDATE OF status ON member_account
  FOR EACH ROW WHEN (NEW.status = 'deleted' AND OLD.status IS DISTINCT FROM 'deleted')
  EXECUTE FUNCTION app.member_account_forget_drafts();
--> statement-breakpoint

-- ===== Staff queue: which sides each case has (replaces 0011's version) ==========================================

CREATE OR REPLACE FUNCTION app.staff_verification_queue(p_status text) RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', vc.id, 'documentType', vc.document_type, 'status', vc.status,
             'submittedAt', vc.submitted_at, 'reviewedAt', vc.reviewed_at, 'decisionReason', vc.decision_reason,
             'evidenceAvailable', vc.evidence_key IS NOT NULL,
             'sides', (SELECT coalesce(jsonb_agg(v.side ORDER BY v.n), '[]'::jsonb)
                       FROM (VALUES (1, 'front', vc.evidence_key), (2, 'back', vc.evidence_back_key), (3, 'selfie', vc.selfie_key))
                            AS v(n, side, object_key)
                       WHERE v.object_key IS NOT NULL),
             'subject', jsonb_build_object(
               'name', nullif(u.name, ''),
               'email', CASE WHEN u.email LIKE '%.favoritehearts.invalid' THEN NULL ELSE u.email END,
               'phone', u.phone_number,
               'phoneVerified', coalesce(u.phone_number_verified, false),
               'accountDeleted', coalesce(ma.status = 'deleted', false),
               'profiles', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                                'displayName', p.display_name,
                                'role', CASE WHEN p.candidate_user_id = u.id THEN 'candidate' ELSE 'manager' END)), '[]'::jsonb)
                            FROM profile p
                            WHERE p.candidate_user_id = u.id
                               OR p.id IN (SELECT profile_id FROM profile_manager
                                           WHERE manager_user_id = u.id AND revoked_at IS NULL))))
             ORDER BY vc.submitted_at), '[]'::jsonb)
    FROM verification_case vc
    LEFT JOIN auth_user u ON u.id = vc.subject_user_id
    LEFT JOIN member_account ma ON ma.user_id = vc.subject_user_id
    WHERE app.is_staff() AND vc.status::text = p_status
  $$;
--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO fh_app;
--> statement-breakpoint
-- put_draft takes any member's id: it is reachable only through add_draft (the signed-in member) and add_draft_via_link
-- (a valid link's member), never directly.
REVOKE EXECUTE ON FUNCTION app.put_draft(text, document_side, text, text) FROM PUBLIC, fh_app;
