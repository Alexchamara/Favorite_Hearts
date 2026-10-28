-- Stage 2: who may edit, candidate consent, invitations, takeover and document review. Hand-written;
-- builds on 0003_access_rules.sql (same fh_app role, helper style, and one statement per breakpoint).

-- ===== Editing and interests follow the candidate's permissions (OWNER-DECISIONS section 5, spec I07) ====

-- A self-managed candidate, or the active manager while the candidate allows it. A joined candidate
-- does not edit a managed profile until taking it over; they control consent, permissions and sharing.
CREATE FUNCTION app.can_edit_profile(target uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT EXISTS (SELECT 1 FROM profile WHERE id = target AND management = 'self' AND candidate_user_id = app.user_id())
        OR EXISTS (SELECT 1 FROM profile_manager WHERE profile_id = target AND manager_user_id = app.user_id()
                   AND revoked_at IS NULL AND can_edit)
  $$;
--> statement-breakpoint
CREATE FUNCTION app.can_manage_interests(target uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT EXISTS (SELECT 1 FROM profile WHERE id = target AND management = 'self' AND candidate_user_id = app.user_id())
        OR EXISTS (SELECT 1 FROM profile_manager WHERE profile_id = target AND manager_user_id = app.user_id()
                   AND revoked_at IS NULL AND can_manage_interests)
  $$;
--> statement-breakpoint
-- A managed profile still waiting for its candidate, who has not objected.
CREATE FUNCTION app.awaits_candidate(target uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT EXISTS (SELECT 1 FROM profile WHERE id = target AND management = 'manager'
                   AND candidate_user_id IS NULL AND candidate_objection_at IS NULL)
  $$;
--> statement-breakpoint
DROP POLICY profile_update_operator ON profile;
--> statement-breakpoint
CREATE POLICY profile_update_operator ON profile FOR UPDATE TO fh_app
  USING (app.can_edit_profile(id) AND status <> 'suspended')
  WITH CHECK (app.can_edit_profile(id) AND status <> 'suspended'
              AND (status <> 'published' OR (app.publisher_verified(id) AND candidate_objection_at IS NULL)));
--> statement-breakpoint
DROP POLICY private_contact_insert ON private_contact;
--> statement-breakpoint
CREATE POLICY private_contact_insert ON private_contact FOR INSERT TO fh_app
  WITH CHECK (app.can_edit_profile(profile_id));
--> statement-breakpoint
DROP POLICY private_contact_delete ON private_contact;
--> statement-breakpoint
CREATE POLICY private_contact_delete ON private_contact FOR DELETE TO fh_app
  USING (app.can_edit_profile(profile_id));
--> statement-breakpoint
DROP POLICY interest_insert ON interest;
--> statement-breakpoint
CREATE POLICY interest_insert ON interest FOR INSERT TO fh_app
  WITH CHECK (status = 'pending' AND sender_user_id = app.user_id() AND app.can_manage_interests(sender_profile_id)
              AND app.has_active_entitlement(sender_profile_id) AND app.can_browse(receiver_profile_id));
--> statement-breakpoint
DROP POLICY interest_update ON interest;
--> statement-breakpoint
CREATE POLICY interest_update ON interest FOR UPDATE TO fh_app
  USING (status = 'pending' AND (app.can_manage_interests(sender_profile_id)
         OR (app.can_manage_interests(receiver_profile_id) AND app.has_active_entitlement(receiver_profile_id))))
  WITH CHECK (status <> 'accepted' OR app.has_active_entitlement(receiver_profile_id));
--> statement-breakpoint
DROP POLICY connection_update ON connection;
--> statement-breakpoint
CREATE POLICY connection_update ON connection FOR UPDATE TO fh_app
  USING (ended_at IS NULL AND (app.can_manage_interests(profile_low) OR app.can_manage_interests(profile_high)))
  WITH CHECK (ended_at IS NOT NULL AND ended_by_user_id = app.user_id());
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.can_open_connection(p_interest uuid, p_low uuid, p_high uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT EXISTS (SELECT 1 FROM interest i
                   WHERE i.id = p_interest AND i.status = 'accepted'
                     AND i.pair_low = p_low AND i.pair_high = p_high
                     AND app.can_manage_interests(i.receiver_profile_id))
  $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.interest_guard() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF current_user <> 'fh_app' THEN RETURN NEW; END IF;
    IF (NEW.id, NEW.sender_profile_id, NEW.receiver_profile_id, NEW.sender_user_id, NEW.share_consent_version,
        NEW.idempotency_key, NEW.created_at)
       IS DISTINCT FROM (OLD.id, OLD.sender_profile_id, OLD.receiver_profile_id, OLD.sender_user_id,
        OLD.share_consent_version, OLD.idempotency_key, OLD.created_at) THEN
      RAISE EXCEPTION 'interest details are fixed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF OLD.status <> 'pending' OR NEW.status = 'pending' THEN
      RAISE EXCEPTION 'only a pending interest can be answered or withdrawn' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = 'withdrawn' AND NOT app.can_manage_interests(OLD.sender_profile_id) THEN
      RAISE EXCEPTION 'only the sender can withdraw' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.status IN ('accepted', 'declined') AND NOT app.can_manage_interests(OLD.receiver_profile_id) THEN
      RAISE EXCEPTION 'only the receiver can answer' USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.responded_at := now();
    RETURN NEW;
  END
  $$;
--> statement-breakpoint
DROP POLICY invitation_insert ON invitation;
--> statement-breakpoint
CREATE POLICY invitation_insert ON invitation FOR INSERT TO fh_app
  WITH CHECK (issued_by_user_id = app.user_id() AND app.is_active_manager_of(profile_id)
              AND app.awaits_candidate(profile_id) AND consumed_at IS NULL AND superseded_at IS NULL);
--> statement-breakpoint

-- ===== Profiles: consent fields belong to the candidate =================================================

-- As 0003, plus: the API role cannot set candidate confirmation or objection itself (only the reviewed
-- invitation and candidate functions below do), so a manager cannot override a candidate's "no".
CREATE OR REPLACE FUNCTION app.profile_before_write() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF TG_OP = 'INSERT' THEN
      NEW.first_published_at := NULL;
      NEW.version := 1;
      IF current_user = 'fh_app' THEN
        NEW.candidate_confirmed_at := NULL;
        NEW.candidate_objection_at := NULL;
      END IF;
      RETURN NEW;
    END IF;
    IF current_user = 'fh_app'
       AND (NEW.id, NEW.management, NEW.created_by_user_id, NEW.candidate_user_id, NEW.created_at,
            NEW.candidate_confirmed_at, NEW.candidate_objection_at)
           IS DISTINCT FROM (OLD.id, OLD.management, OLD.created_by_user_id, OLD.candidate_user_id, OLD.created_at,
            OLD.candidate_confirmed_at, OLD.candidate_objection_at) THEN
      RAISE EXCEPTION 'profile ownership and consent fields are fixed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.first_published_at := coalesce(OLD.first_published_at,
                                       CASE WHEN NEW.status = 'published' THEN now() END);
    NEW.version := OLD.version + 1;
    RETURN NEW;
  END
  $$;
--> statement-breakpoint
-- Contacts: verification is never self-claimed and is cleared when the value changes (spec P06);
-- a joined candidate may only change what is shared, and only the candidate decides sharing (section 4).
CREATE FUNCTION app.private_contact_guard() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF current_user <> 'fh_app' THEN RETURN NEW; END IF;
    IF TG_OP = 'INSERT' THEN
      NEW.verified_at := NULL;
      RETURN NEW;
    END IF;
    IF (NEW.id, NEW.profile_id, NEW.person, NEW.kind, NEW.platform, NEW.value, NEW.created_at)
       IS DISTINCT FROM (OLD.id, OLD.profile_id, OLD.person, OLD.kind, OLD.platform, OLD.value, OLD.created_at)
       AND NOT app.can_edit_profile(OLD.profile_id) THEN
      RAISE EXCEPTION 'only someone who can edit the profile changes its contacts' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.value IS DISTINCT FROM OLD.value THEN
      NEW.verified_at := NULL;
    ELSIF NEW.verified_at IS DISTINCT FROM OLD.verified_at THEN
      RAISE EXCEPTION 'contact verification is set only by a code check' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.share_with_connections IS DISTINCT FROM OLD.share_with_connections
       AND EXISTS (SELECT 1 FROM profile p WHERE p.id = OLD.profile_id
                   AND p.candidate_user_id IS NOT NULL AND p.candidate_user_id <> app.user_id()) THEN
      RAISE EXCEPTION 'only the candidate decides what is shared' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END
  $$;
--> statement-breakpoint
CREATE TRIGGER private_contact_guard BEFORE INSERT OR UPDATE ON private_contact
  FOR EACH ROW EXECUTE FUNCTION app.private_contact_guard();
--> statement-breakpoint

-- ===== Badges (OWNER-DECISIONS section 5: three badges, each meaning one thing) ==========================

-- Manager verified: the active manager's identity document is approved and phone verified.
-- Candidate confirmed: the invited candidate accepted and has not objected (managed profiles only).
-- Candidate identity verified: the candidate's own document approved and phone verified.
-- Only for profiles the actor may already see; never evidence from one person for another.
CREATE FUNCTION app.profile_badges(target uuid)
  RETURNS TABLE (manager_verified boolean, candidate_confirmed boolean, candidate_identity_verified boolean)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT
      EXISTS (SELECT 1 FROM profile_manager pm JOIN auth_user u ON u.id = pm.manager_user_id
              WHERE pm.profile_id = p.id AND pm.revoked_at IS NULL AND u.phone_number_verified IS TRUE
                AND EXISTS (SELECT 1 FROM verification_case vc WHERE vc.subject_user_id = u.id AND vc.status = 'approved')),
      p.management = 'manager' AND p.candidate_confirmed_at IS NOT NULL AND p.candidate_objection_at IS NULL,
      EXISTS (SELECT 1 FROM auth_user u WHERE u.id = p.candidate_user_id AND u.phone_number_verified IS TRUE
                AND EXISTS (SELECT 1 FROM verification_case vc WHERE vc.subject_user_id = u.id AND vc.status = 'approved'))
    FROM profile p
    WHERE p.id = target AND (app.operates_profile(p.id) OR app.is_staff() OR app.can_browse(p.id))
  $$;
--> statement-breakpoint

-- The people around a profile, for its own operators only: the active manager (name, relationship,
-- permissions), whether the candidate joined, and the publisher's own check status when it is the actor.
CREATE FUNCTION app.profile_people(target uuid) RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    WITH p AS (SELECT * FROM profile WHERE id = target AND app.operates_profile(id)),
    m AS (SELECT pm.*, u.name FROM profile_manager pm JOIN auth_user u ON u.id = pm.manager_user_id
          WHERE pm.profile_id = target AND pm.revoked_at IS NULL),
    publisher AS (SELECT u.* FROM auth_user u
                  WHERE u.id = coalesce((SELECT manager_user_id FROM m), (SELECT candidate_user_id FROM p)))
    SELECT jsonb_build_object(
      'manager', (SELECT jsonb_build_object('name', name, 'relationship', relationship, 'canEdit', can_edit,
                    'canManageInterests', can_manage_interests, 'canViewPrivateDetails', can_view_private_details,
                    'since', granted_at) FROM m),
      'candidateJoined', (SELECT candidate_user_id IS NOT NULL FROM p),
      'publisher', (SELECT jsonb_build_object(
                      'isMe', pu.id = app.user_id(),
                      'phoneVerified', coalesce(pu.phone_number_verified, false),
                      'documentStatus', CASE WHEN pu.id = app.user_id() THEN coalesce(
                        (SELECT vc.status::text FROM verification_case vc WHERE vc.subject_user_id = pu.id
                         ORDER BY (vc.status = 'approved') DESC, vc.submitted_at DESC LIMIT 1), 'none') END)
                    FROM publisher pu))
    FROM p
  $$;
--> statement-breakpoint

-- ===== Invitations (OWNER-DECISIONS section 5) =============================================================
-- The API stores only digests: sha256 of the link token, and an HMAC of the 6-digit code. These functions
-- run the whole check-and-change atomically (row lock), so two clients cannot both accept (spec I03).
-- Wrong codes are counted and committed; 5 wrong codes end that code.

-- Limited context for someone holding a live link (spec I04): names, channel and expiry only.
CREATE FUNCTION app.invitation_preview(p_token_hash text) RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT jsonb_build_object(
             'channel', i.channel, 'contact', i.contact, 'expiresAt', i.expires_at,
             'candidateName', p.display_name, 'managerName', u.name, 'relationship', pm.relationship)
    FROM invitation i
    JOIN profile p ON p.id = i.profile_id
    LEFT JOIN profile_manager pm ON pm.profile_id = p.id AND pm.revoked_at IS NULL
    LEFT JOIN auth_user u ON u.id = pm.manager_user_id
    WHERE i.token_hash = p_token_hash AND i.consumed_at IS NULL AND i.superseded_at IS NULL AND i.expires_at > now()
  $$;
--> statement-breakpoint
-- Issues a fresh code for a live invitation (10 minutes, within the link's own expiry), at most
-- p_max_sends times per invitation. Returns the nominated channel and contact for the API to send it.
CREATE FUNCTION app.invitation_issue_code(p_token_hash text, p_code_hash text, p_max_sends integer) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    inv invitation%ROWTYPE;
  BEGIN
    SELECT * INTO inv FROM invitation WHERE token_hash = p_token_hash FOR UPDATE;
    IF NOT FOUND OR inv.consumed_at IS NOT NULL OR inv.superseded_at IS NOT NULL OR inv.expires_at <= now() THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    IF inv.code_sends >= p_max_sends THEN
      RETURN jsonb_build_object('status', 'limit');
    END IF;
    UPDATE invitation
      SET code_hash = p_code_hash, code_expires_at = least(now() + interval '10 minutes', inv.expires_at),
          code_attempts = 0, code_sends = code_sends + 1
      WHERE id = inv.id;
    RETURN jsonb_build_object('status', 'sent', 'channel', inv.channel, 'contact', inv.contact);
  END
  $$;
--> statement-breakpoint
-- Shared check for accept/decline. Returns NULL when the code is right, else a status.
CREATE FUNCTION app.invitation_check_code(inv invitation, p_code_hash text) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  BEGIN
    IF inv.consumed_at IS NOT NULL OR inv.superseded_at IS NOT NULL OR inv.expires_at <= now() THEN
      RETURN 'invalid';
    END IF;
    IF inv.code_hash IS NULL OR inv.code_expires_at <= now() OR inv.code_attempts >= 5 THEN
      RETURN 'code_expired';
    END IF;
    IF inv.code_hash <> p_code_hash THEN
      UPDATE invitation SET code_attempts = code_attempts + 1 WHERE id = inv.id;
      RETURN 'wrong_code';
    END IF;
    RETURN NULL;
  END
  $$;
--> statement-breakpoint
-- The signed-in candidate accepts: becomes the profile's candidate, confirmation is recorded, and the
-- nominated contact counts as verified by the candidate (it received the code). Identity review is
-- separate (spec I05). The manager themself, or someone already a candidate, cannot accept.
CREATE FUNCTION app.invitation_accept(p_token_hash text, p_code_hash text) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    inv invitation%ROWTYPE;
    me text := app.user_id();
    problem text;
    proven contact_kind;
  BEGIN
    IF me IS NULL THEN
      RETURN jsonb_build_object('status', 'unauthenticated');
    END IF;
    SELECT * INTO inv FROM invitation WHERE token_hash = p_token_hash FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    problem := app.invitation_check_code(inv, p_code_hash);
    IF problem IS NOT NULL THEN
      RETURN jsonb_build_object('status', problem);
    END IF;
    IF inv.issued_by_user_id = me
       OR EXISTS (SELECT 1 FROM profile_manager WHERE profile_id = inv.profile_id AND manager_user_id = me) THEN
      RETURN jsonb_build_object('status', 'is_manager');
    END IF;
    IF EXISTS (SELECT 1 FROM profile WHERE candidate_user_id = me AND status <> 'deleted') THEN
      RETURN jsonb_build_object('status', 'already_candidate');
    END IF;
    PERFORM 1 FROM profile WHERE id = inv.profile_id AND management = 'manager' AND candidate_user_id IS NULL
      AND candidate_objection_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    UPDATE invitation SET consumed_at = now(), consumed_by_user_id = me, code_hash = NULL WHERE id = inv.id;
    UPDATE profile SET candidate_user_id = me, candidate_confirmed_at = now() WHERE id = inv.profile_id;
    proven := CASE WHEN inv.channel = 'email' THEN 'email'::contact_kind ELSE 'phone'::contact_kind END;
    UPDATE private_contact SET verified_at = now()
      WHERE profile_id = inv.profile_id AND person = 'candidate' AND kind = proven AND lower(value) = lower(inv.contact);
    IF NOT FOUND THEN
      INSERT INTO private_contact (profile_id, person, kind, value, verified_at)
        VALUES (inv.profile_id, 'candidate', proven, inv.contact, now());
    END IF;
    RETURN jsonb_build_object('status', 'accepted', 'profileId', inv.profile_id);
  END
  $$;
--> statement-breakpoint
-- The candidate declines with the code (no account needed): the profile is taken down and no one but
-- the candidate can publish it again (spec I06).
CREATE FUNCTION app.invitation_decline(p_token_hash text, p_code_hash text) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    inv invitation%ROWTYPE;
    problem text;
  BEGIN
    SELECT * INTO inv FROM invitation WHERE token_hash = p_token_hash FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    problem := app.invitation_check_code(inv, p_code_hash);
    IF problem IS NOT NULL THEN
      RETURN jsonb_build_object('status', problem);
    END IF;
    UPDATE invitation SET consumed_at = now(), consumed_by_user_id = app.user_id(), code_hash = NULL WHERE id = inv.id;
    UPDATE profile
      SET candidate_objection_at = now(),
          status = CASE WHEN status = 'published' THEN 'paused'::profile_status ELSE status END
      WHERE id = inv.profile_id;
    RETURN jsonb_build_object('status', 'declined');
  END
  $$;
--> statement-breakpoint

-- ===== The joined candidate's controls (OWNER-DECISIONS section 5) =====================================

-- Takeover: the manager loses access at once, the profile becomes self-managed and keeps its plan
-- (entitlements belong to the profile). Manager evidence never counts for the candidate: a published
-- profile pauses until the candidate's own document and phone are verified (spec 6.3; proposed).
CREATE FUNCTION app.candidate_take_over(target uuid) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    prof profile%ROWTYPE;
  BEGIN
    SELECT * INTO prof FROM profile WHERE id = target FOR UPDATE;
    IF NOT FOUND OR app.user_id() IS NULL OR prof.candidate_user_id IS DISTINCT FROM app.user_id() THEN
      RETURN jsonb_build_object('status', 'forbidden');
    END IF;
    IF prof.management = 'self' THEN
      RETURN jsonb_build_object('status', 'already_self_managed');
    END IF;
    UPDATE profile_manager SET revoked_at = now(), revoked_reason = 'candidate_removed'
      WHERE profile_id = target AND revoked_at IS NULL;
    UPDATE profile
      SET management = 'self',
          status = CASE WHEN status = 'published' AND NOT app.publisher_verified(target)
                        THEN 'paused'::profile_status ELSE status END
      WHERE id = target;
    RETURN jsonb_build_object('status', 'taken_over', 'profileStatus', (SELECT status FROM profile WHERE id = target));
  END
  $$;
--> statement-breakpoint
-- Withdraw consent (one-click takedown): hidden at once; only the candidate can lift the objection.
CREATE FUNCTION app.candidate_withdraw_consent(target uuid) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  BEGIN
    UPDATE profile
      SET candidate_objection_at = now(),
          status = CASE WHEN status = 'published' THEN 'paused'::profile_status ELSE status END
      WHERE id = target AND management = 'manager' AND candidate_user_id = app.user_id();
    IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'forbidden');
    END IF;
    RETURN jsonb_build_object('status', 'withdrawn');
  END
  $$;
--> statement-breakpoint
-- Restoring consent never republishes or restores a revoked manager (spec I09): publishing is a separate step.
CREATE FUNCTION app.candidate_restore_consent(target uuid) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  BEGIN
    UPDATE profile SET candidate_objection_at = NULL
      WHERE id = target AND candidate_user_id = app.user_id() AND candidate_objection_at IS NOT NULL;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'forbidden');
    END IF;
    RETURN jsonb_build_object('status', 'restored');
  END
  $$;
--> statement-breakpoint

-- ===== Document review (OWNER-DECISIONS sections 5, 8) ===================================================

-- Decisions are final (a rejected member submits a new case, spec P05) and stamped by the database:
-- reviewer, time, and the purge deadline 90 days after the decision.
CREATE FUNCTION app.verification_case_review() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF current_user <> 'fh_app' THEN RETURN NEW; END IF;
    IF OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'a decided verification case is final' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = 'pending'
       OR (NEW.id, NEW.subject_user_id, NEW.profile_id, NEW.document_type, NEW.evidence_key, NEW.submitted_at,
           NEW.purged_at)
          IS DISTINCT FROM (OLD.id, OLD.subject_user_id, OLD.profile_id, OLD.document_type, OLD.evidence_key,
           OLD.submitted_at, OLD.purged_at) THEN
      RAISE EXCEPTION 'a review only records a decision' USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.reviewed_by_user_id := app.user_id();
    NEW.reviewed_at := now();
    NEW.purge_after := now() + interval '90 days';
    RETURN NEW;
  END
  $$;
--> statement-breakpoint
CREATE TRIGGER verification_case_review BEFORE UPDATE ON verification_case
  FOR EACH ROW EXECUTE FUNCTION app.verification_case_review();
--> statement-breakpoint
-- The staff review queue: who submitted (to compare with the document) and their profiles, never the
-- file itself (that needs a separate, audited request). Empty for anyone who is not staff.
CREATE FUNCTION app.staff_verification_queue(p_status text) RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', vc.id, 'documentType', vc.document_type, 'status', vc.status,
             'submittedAt', vc.submitted_at, 'reviewedAt', vc.reviewed_at, 'decisionReason', vc.decision_reason,
             'evidenceAvailable', vc.evidence_key IS NOT NULL,
             'subject', jsonb_build_object(
               'name', u.name,
               'email', CASE WHEN u.email LIKE '%@phone.favoritehearts.invalid' THEN NULL ELSE u.email END,
               'phone', u.phone_number,
               'phoneVerified', coalesce(u.phone_number_verified, false),
               'profiles', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                                'displayName', p.display_name,
                                'role', CASE WHEN p.candidate_user_id = u.id THEN 'candidate' ELSE 'manager' END)), '[]'::jsonb)
                            FROM profile p
                            WHERE p.candidate_user_id = u.id
                               OR p.id IN (SELECT profile_id FROM profile_manager
                                           WHERE manager_user_id = u.id AND revoked_at IS NULL))))
             ORDER BY vc.submitted_at), '[]'::jsonb)
    FROM verification_case vc LEFT JOIN auth_user u ON u.id = vc.subject_user_id
    WHERE app.is_staff() AND vc.status::text = p_status
  $$;
--> statement-breakpoint

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO fh_app;
