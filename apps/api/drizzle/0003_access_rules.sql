-- Access rules for the domain tables (Stage 1). Hand-written; see docs/ARCHITECTURE.md "Database access".
--
-- * The API runs every member/staff transaction as the role fh_app (src/db/actor.ts: SET LOCAL ROLE),
--   with app.user_id / app.role set for that transaction. fh_app has no BYPASSRLS and only the grants
--   below, and every domain table has row-level security enabled: anything not allowed here is denied.
-- * Helper functions are SECURITY DEFINER (owned by the migration role, which owns the tables), so
--   policies can look across tables without recursion. They only ever answer about the current actor.
-- * Triggers hold invariants that a policy cannot express (state transitions, capacity, immutability).
-- * Seeds the plan catalogue with the provisional prices from docs/OWNER-DECISIONS.md section 2.
-- Every statement is separated by a breakpoint so each runs on its own (required by PGlite in tests).

CREATE SCHEMA IF NOT EXISTS app;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fh_app') THEN
    CREATE ROLE fh_app NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
-- Lets the API's database user switch to fh_app. If the API connects with a different login role
-- than the one running migrations, also run: GRANT fh_app TO <api login role>;
GRANT fh_app TO CURRENT_USER;
--> statement-breakpoint
GRANT USAGE ON SCHEMA app, public TO fh_app;
--> statement-breakpoint

-- ===== Actor ===========================================================================================

CREATE FUNCTION app.user_id() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.user_id', true), '') $$;
--> statement-breakpoint
CREATE FUNCTION app.role() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.role', true), '') $$;
--> statement-breakpoint
-- Staff powers need all of: the claimed role, an active staff_member row with that role, and two-step
-- login enabled (OWNER-DECISIONS section 10; Part 2 "admin two-step login is enforced by the backend").
CREATE FUNCTION app.is_staff(roles text[] DEFAULT ARRAY['owner', 'backup_reviewer']) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT coalesce(app.role() = ANY (roles), false) AND EXISTS (
      SELECT 1 FROM staff_member s JOIN auth_user u ON u.id = s.user_id
      WHERE s.user_id = app.user_id() AND s.role::text = app.role() AND s.revoked_at IS NULL
        AND u.two_factor_enabled IS TRUE)
  $$;
--> statement-breakpoint
CREATE FUNCTION app.is_owner() RETURNS boolean
  LANGUAGE sql STABLE
  AS $$ SELECT app.is_staff(ARRAY['owner']) $$;
--> statement-breakpoint
CREATE FUNCTION app.is_active_member() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$ SELECT EXISTS (SELECT 1 FROM member_account WHERE user_id = app.user_id() AND status = 'active') $$;
--> statement-breakpoint
CREATE FUNCTION app.flag(flag_key text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$ SELECT coalesce((SELECT enabled FROM operations_flag WHERE key::text = flag_key), false) $$;
--> statement-breakpoint

-- ===== Profiles the actor operates =====================================================================

-- The candidate's own account, plus an active (not revoked) manager. A revoked manager operates nothing.
CREATE FUNCTION app.operated_profiles() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT id FROM profile WHERE candidate_user_id = app.user_id()
    UNION
    SELECT profile_id FROM profile_manager WHERE manager_user_id = app.user_id() AND revoked_at IS NULL
  $$;
--> statement-breakpoint
CREATE FUNCTION app.operates_profile(target uuid) RETURNS boolean
  LANGUAGE sql STABLE
  AS $$ SELECT target IN (SELECT app.operated_profiles()) $$;
--> statement-breakpoint
CREATE FUNCTION app.is_candidate_of(target uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$ SELECT EXISTS (SELECT 1 FROM profile WHERE id = target AND candidate_user_id = app.user_id()) $$;
--> statement-breakpoint
CREATE FUNCTION app.is_active_manager_of(target uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT EXISTS (SELECT 1 FROM profile_manager
                   WHERE profile_id = target AND manager_user_id = app.user_id() AND revoked_at IS NULL)
  $$;
--> statement-breakpoint
-- A manager may attach themselves only to a profile they just created for a candidate, and only once.
CREATE FUNCTION app.created_unclaimed_profile(target uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT EXISTS (SELECT 1 FROM profile WHERE id = target AND created_by_user_id = app.user_id()
                   AND management = 'manager' AND candidate_user_id IS NULL)
       AND NOT EXISTS (SELECT 1 FROM profile_manager WHERE profile_id = target)
  $$;
--> statement-breakpoint
-- Profiles through which the actor may read a connection's private details: the candidate always,
-- a manager only while the candidate allows it (can_view_private_details).
CREATE FUNCTION app.private_viewing_profiles() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT id FROM profile WHERE candidate_user_id = app.user_id()
    UNION
    SELECT profile_id FROM profile_manager
    WHERE manager_user_id = app.user_id() AND revoked_at IS NULL AND can_view_private_details
  $$;
--> statement-breakpoint

-- ===== Plan access, blocks, discovery and private details ============================================

-- The latest entitlement event decides (append-only history, highest seq wins).
CREATE FUNCTION app.has_active_entitlement(target uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT coalesce((
      SELECT e.kind IN ('grant', 'replace') AND e.starts_at <= now() AND now() < e.ends_at
      FROM entitlement_event e WHERE e.profile_id = target ORDER BY e.seq DESC LIMIT 1), false)
  $$;
--> statement-breakpoint
CREATE FUNCTION app.is_blocked(a uuid, b uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT EXISTS (SELECT 1 FROM block WHERE revoked_at IS NULL
                   AND ((blocker_profile_id = a AND blocked_profile_id = b)
                     OR (blocker_profile_id = b AND blocked_profile_id = a)))
  $$;
--> statement-breakpoint
-- Discovery: an active member may see a published profile unless a block exists either way between it
-- and any profile the member operates. Anonymous visitors (no app.user_id) never see member profiles.
CREATE FUNCTION app.can_browse(target uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT app.is_active_member()
       AND EXISTS (SELECT 1 FROM profile WHERE id = target AND status = 'published')
       AND NOT EXISTS (SELECT 1 FROM app.operated_profiles() AS v(id) WHERE app.is_blocked(v.id, target))
  $$;
--> statement-breakpoint
-- Private contacts and original gallery photos (OWNER-DECISIONS sections 3, 4, 7): only through an
-- active connection, while the actor's own profile has an active plan, with no block either way.
-- Whether the other side's expired plan should also hide details is open (spec O03); not applied.
CREATE FUNCTION app.can_view_private(target uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT EXISTS (
      SELECT 1
      FROM app.private_viewing_profiles() AS v(id)
      JOIN connection c ON c.ended_at IS NULL
        AND c.profile_low = least(v.id, target) AND c.profile_high = greatest(v.id, target)
      JOIN profile t ON t.id = target AND t.status NOT IN ('suspended', 'deleted')
      WHERE app.has_active_entitlement(v.id) AND NOT app.is_blocked(v.id, target))
  $$;
--> statement-breakpoint
-- Publishing needs the publisher's approved identity document and verified phone (OWNER-DECISIONS
-- section 5). The publisher is the active manager, otherwise the candidate (e.g. after a takeover).
CREATE FUNCTION app.publisher_verified(target uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM auth_user u
      WHERE u.id = coalesce(
              (SELECT manager_user_id FROM profile_manager WHERE profile_id = target AND revoked_at IS NULL),
              (SELECT candidate_user_id FROM profile WHERE id = target))
        AND u.phone_number_verified IS TRUE
        AND EXISTS (SELECT 1 FROM verification_case vc WHERE vc.subject_user_id = u.id AND vc.status = 'approved'))
  $$;
--> statement-breakpoint
CREATE FUNCTION app.operates_photo(target_photo uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$ SELECT EXISTS (SELECT 1 FROM photo WHERE id = target_photo AND app.operates_profile(profile_id)) $$;
--> statement-breakpoint
-- Originals: the operators, staff, other members for a cover shown publicly, or a qualifying connection.
CREATE FUNCTION app.can_view_photo_original(target_photo uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM photo ph JOIN profile p ON p.id = ph.profile_id
      WHERE ph.id = target_photo AND (
        app.operates_profile(p.id)
        OR app.is_staff()
        OR (ph.moderation_status = 'visible'
            AND ((ph.is_cover AND p.cover_public AND app.can_browse(p.id)) OR app.can_view_private(p.id)))))
  $$;
--> statement-breakpoint
CREATE FUNCTION app.can_open_connection(p_interest uuid, p_low uuid, p_high uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT EXISTS (SELECT 1 FROM interest i
                   WHERE i.id = p_interest AND i.status = 'accepted'
                     AND i.pair_low = p_low AND i.pair_high = p_high
                     AND app.operates_profile(i.receiver_profile_id))
  $$;
--> statement-breakpoint
-- A payment's quote must be a current price version, copied exactly (no member-chosen amounts).
CREATE FUNCTION app.is_current_price(p_price uuid, p_plan text, p_currency text, p_amount integer) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT EXISTS (SELECT 1 FROM price_version
                   WHERE id = p_price AND plan_id = p_plan AND currency::text = p_currency
                     AND amount_minor = p_amount AND effective_to IS NULL AND effective_from <= now())
  $$;
--> statement-breakpoint
-- Received interests for a profile WITHOUT the sender's identity (OWNER-DECISIONS section 4: the
-- browser never receives the sender before payment). Unpaid receivers can only use this function;
-- the interest table itself hides pending rows from them.
CREATE FUNCTION app.received_interest_previews(receiver uuid)
  RETURNS TABLE (interest_id uuid, received_at timestamptz, sender_age integer, sender_occupation text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT i.id, i.created_at,
           CASE WHEN s.birth_date IS NULL THEN NULL ELSE date_part('year', age(s.birth_date))::integer END,
           s.occupation
    FROM interest i JOIN profile s ON s.id = i.sender_profile_id
    WHERE i.receiver_profile_id = receiver AND i.status = 'pending'
      AND app.operates_profile(receiver) AND NOT app.is_blocked(i.sender_profile_id, receiver)
    ORDER BY i.created_at DESC
  $$;
--> statement-breakpoint

-- ===== Invariant triggers ==============================================================================

-- Append-only history: rows are never edited, by anyone.
CREATE FUNCTION app.forbid_update() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
  END
  $$;
--> statement-breakpoint
CREATE TRIGGER entitlement_event_append_only BEFORE UPDATE ON entitlement_event
  FOR EACH ROW EXECUTE FUNCTION app.forbid_update();
--> statement-breakpoint
CREATE TRIGGER audit_event_append_only BEFORE UPDATE ON audit_event
  FOR EACH ROW EXECUTE FUNCTION app.forbid_update();
--> statement-breakpoint
CREATE TRIGGER disclosure_event_append_only BEFORE UPDATE ON disclosure_event
  FOR EACH ROW EXECUTE FUNCTION app.forbid_update();
--> statement-breakpoint
-- Prices are versioned: a version may only be closed (effective_to set once), never edited or deleted.
CREATE FUNCTION app.price_version_guard() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'price versions are never deleted' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF OLD.effective_to IS NOT NULL OR NEW.effective_to IS NULL
       OR (NEW.id, NEW.plan_id, NEW.residence_band, NEW.currency, NEW.amount_minor, NEW.effective_from,
           NEW.created_by_user_id, NEW.created_at)
          IS DISTINCT FROM
          (OLD.id, OLD.plan_id, OLD.residence_band, OLD.currency, OLD.amount_minor, OLD.effective_from,
           OLD.created_by_user_id, OLD.created_at) THEN
      RAISE EXCEPTION 'a price version can only be closed; add a new version instead'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END
  $$;
--> statement-breakpoint
CREATE TRIGGER price_version_immutable BEFORE UPDATE OR DELETE ON price_version
  FOR EACH ROW EXECUTE FUNCTION app.price_version_guard();
--> statement-breakpoint
-- Members cannot change their own account status or manager capacity (staff / owner only).
CREATE FUNCTION app.member_account_guard() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF current_user <> 'fh_app' THEN RETURN NEW; END IF;
    IF NEW.user_id <> OLD.user_id THEN
      RAISE EXCEPTION 'member_account.user_id is fixed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT app.is_staff() THEN
      RAISE EXCEPTION 'only staff change an account status' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.max_managed_profiles IS DISTINCT FROM OLD.max_managed_profiles AND NOT app.is_owner() THEN
      RAISE EXCEPTION 'only the owner changes manager capacity' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END
  $$;
--> statement-breakpoint
CREATE TRIGGER member_account_guard BEFORE UPDATE ON member_account
  FOR EACH ROW EXECUTE FUNCTION app.member_account_guard();
--> statement-breakpoint
-- OWNER-DECISIONS section 5: up to 3 profiles per manager unless the owner raised the capacity.
-- The advisory lock serialises concurrent attempts for the same manager.
CREATE FUNCTION app.enforce_manager_capacity() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    capacity integer;
    active_count integer;
  BEGIN
    IF NEW.revoked_at IS NOT NULL THEN RETURN NEW; END IF;
    PERFORM pg_advisory_xact_lock(hashtext('profile_manager:' || NEW.manager_user_id));
    SELECT coalesce((SELECT max_managed_profiles FROM member_account WHERE user_id = NEW.manager_user_id), 3)
      INTO capacity;
    SELECT count(*) INTO active_count FROM profile_manager
      WHERE manager_user_id = NEW.manager_user_id AND revoked_at IS NULL AND id <> NEW.id;
    IF active_count >= capacity THEN
      RAISE EXCEPTION 'manager_capacity_reached' USING ERRCODE = 'check_violation',
        DETAIL = format('This manager already runs %s profiles (limit %s).', active_count, capacity);
    END IF;
    RETURN NEW;
  END
  $$;
--> statement-breakpoint
CREATE TRIGGER profile_manager_capacity BEFORE INSERT OR UPDATE OF revoked_at ON profile_manager
  FOR EACH ROW EXECUTE FUNCTION app.enforce_manager_capacity();
--> statement-breakpoint
-- The candidate controls the manager's permissions; a manager may only step down; revocation is final.
CREATE FUNCTION app.profile_manager_guard() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF current_user <> 'fh_app' THEN RETURN NEW; END IF;
    IF (NEW.profile_id, NEW.manager_user_id, NEW.relationship, NEW.authority_declared_at, NEW.granted_at)
       IS DISTINCT FROM (OLD.profile_id, OLD.manager_user_id, OLD.relationship, OLD.authority_declared_at, OLD.granted_at) THEN
      RAISE EXCEPTION 'manager membership details are fixed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF OLD.revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'a revoked manager cannot be restored' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF (NEW.can_edit, NEW.can_manage_interests, NEW.can_view_private_details)
       IS DISTINCT FROM (OLD.can_edit, OLD.can_manage_interests, OLD.can_view_private_details)
       AND NOT (app.is_candidate_of(OLD.profile_id) OR app.is_owner()) THEN
      RAISE EXCEPTION 'only the candidate sets manager permissions' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END
  $$;
--> statement-breakpoint
CREATE TRIGGER profile_manager_guard BEFORE UPDATE ON profile_manager
  FOR EACH ROW EXECUTE FUNCTION app.profile_manager_guard();
--> statement-breakpoint
-- OWNER-DECISIONS section 5: the candidate contact must differ from the manager's own, the validity
-- window starts now (24 hours at most, by check constraint), and a new invitation cancels the live one.
CREATE FUNCTION app.invitation_before_insert() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  BEGIN
    NEW.created_at := now();
    IF EXISTS (SELECT 1 FROM auth_user u
               WHERE u.id = NEW.issued_by_user_id
                 AND (lower(u.email) = lower(NEW.contact) OR u.phone_number = NEW.contact))
       OR EXISTS (SELECT 1 FROM private_contact c
                  WHERE c.profile_id = NEW.profile_id AND c.person = 'manager'
                    AND lower(c.value) = lower(NEW.contact)) THEN
      RAISE EXCEPTION 'invitation_contact_matches_manager' USING ERRCODE = 'check_violation',
        DETAIL = 'The candidate contact must be different from the manager''s.';
    END IF;
    UPDATE invitation SET superseded_at = now()
      WHERE profile_id = NEW.profile_id AND consumed_at IS NULL AND superseded_at IS NULL;
    RETURN NEW;
  END
  $$;
--> statement-breakpoint
CREATE TRIGGER invitation_before_insert BEFORE INSERT ON invitation
  FOR EACH ROW EXECUTE FUNCTION app.invitation_before_insert();
--> statement-breakpoint
-- Profiles: first_published_at is set once (spec 6.1), version increments on every change, and the
-- API role cannot rewrite who created or owns the profile (joining/takeover use reviewed functions).
CREATE FUNCTION app.profile_before_write() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF TG_OP = 'INSERT' THEN
      NEW.first_published_at := NULL;
      NEW.version := 1;
      RETURN NEW;
    END IF;
    IF current_user = 'fh_app'
       AND (NEW.id, NEW.management, NEW.created_by_user_id, NEW.candidate_user_id, NEW.created_at)
           IS DISTINCT FROM (OLD.id, OLD.management, OLD.created_by_user_id, OLD.candidate_user_id, OLD.created_at) THEN
      RAISE EXCEPTION 'profile ownership fields are fixed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.first_published_at := coalesce(OLD.first_published_at,
                                       CASE WHEN NEW.status = 'published' THEN now() END);
    NEW.version := OLD.version + 1;
    RETURN NEW;
  END
  $$;
--> statement-breakpoint
CREATE TRIGGER profile_before_write BEFORE INSERT OR UPDATE ON profile
  FOR EACH ROW EXECUTE FUNCTION app.profile_before_write();
--> statement-breakpoint
-- Interests: only pending ones change; the sender may withdraw, the receiver accepts or declines.
CREATE FUNCTION app.interest_guard() RETURNS trigger
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
    IF NEW.status = 'withdrawn' AND NOT app.operates_profile(OLD.sender_profile_id) THEN
      RAISE EXCEPTION 'only the sender can withdraw' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.status IN ('accepted', 'declined') AND NOT app.operates_profile(OLD.receiver_profile_id) THEN
      RAISE EXCEPTION 'only the receiver can answer' USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.responded_at := now();
    RETURN NEW;
  END
  $$;
--> statement-breakpoint
CREATE TRIGGER interest_guard BEFORE UPDATE ON interest
  FOR EACH ROW EXECUTE FUNCTION app.interest_guard();
--> statement-breakpoint
-- Connections can only be ended, once.
CREATE FUNCTION app.connection_guard() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF current_user <> 'fh_app' THEN RETURN NEW; END IF;
    IF OLD.ended_at IS NOT NULL
       OR (NEW.id, NEW.interest_id, NEW.profile_low, NEW.profile_high, NEW.accepted_at)
          IS DISTINCT FROM (OLD.id, OLD.interest_id, OLD.profile_low, OLD.profile_high, OLD.accepted_at) THEN
      RAISE EXCEPTION 'a connection can only be ended, once' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END
  $$;
--> statement-breakpoint
CREATE TRIGGER connection_guard BEFORE UPDATE ON connection
  FOR EACH ROW EXECUTE FUNCTION app.connection_guard();
--> statement-breakpoint
-- Payments: the quote is fixed; the payer can only attach proof; only the owner decides, and a
-- rejected or refunded payment stays closed (approval itself is made idempotent by the unique grant).
CREATE FUNCTION app.payment_submission_guard() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF current_user <> 'fh_app' THEN RETURN NEW; END IF;
    IF (NEW.id, NEW.profile_id, NEW.payer_user_id, NEW.price_version_id, NEW.plan_id, NEW.currency,
        NEW.amount_minor, NEW.reference, NEW.channel, NEW.created_at)
       IS DISTINCT FROM (OLD.id, OLD.profile_id, OLD.payer_user_id, OLD.price_version_id, OLD.plan_id, OLD.currency,
        OLD.amount_minor, OLD.reference, OLD.channel, OLD.created_at) THEN
      RAISE EXCEPTION 'payment quote details are fixed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF app.is_owner() THEN
      IF OLD.status IN ('rejected', 'refunded') THEN
        RAISE EXCEPTION 'this payment is closed' USING ERRCODE = 'check_violation';
      END IF;
      IF OLD.status = 'approved' AND NEW.status NOT IN ('approved', 'refunded') THEN
        RAISE EXCEPTION 'an approved payment can only be refunded' USING ERRCODE = 'check_violation';
      END IF;
      IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved', 'rejected', 'refunded') THEN
        NEW.reviewed_by_user_id := app.user_id();
        NEW.reviewed_at := now();
      END IF;
      RETURN NEW;
    END IF;
    IF OLD.status <> 'awaiting_proof' OR NEW.status NOT IN ('awaiting_proof', 'pending_review')
       OR (NEW.settlement_ref, NEW.reviewed_by_user_id, NEW.reviewed_at, NEW.decision_note, NEW.refund_reason)
          IS DISTINCT FROM (OLD.settlement_ref, OLD.reviewed_by_user_id, OLD.reviewed_at, OLD.decision_note, OLD.refund_reason) THEN
      RAISE EXCEPTION 'only the owner reviews payments' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END
  $$;
--> statement-breakpoint
CREATE TRIGGER payment_submission_guard BEFORE UPDATE ON payment_submission
  FOR EACH ROW EXECUTE FUNCTION app.payment_submission_guard();
--> statement-breakpoint

-- ===== Grants: fh_app gets only what the policies below can use ======================================

GRANT SELECT, INSERT, UPDATE ON member_account, profile, profile_manager, invitation, verification_case,
  interest, connection, block, report, plan, price_version, payment_submission, staff_member TO fh_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON private_contact, photo TO fh_app;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON photo_original, shortlist TO fh_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON quota_ledger, disclosure_event, entitlement_event, audit_event TO fh_app;
--> statement-breakpoint
GRANT INSERT ON notification_outbox TO fh_app;
--> statement-breakpoint
GRANT SELECT, UPDATE ON operations_flag TO fh_app;
--> statement-breakpoint
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO fh_app;
--> statement-breakpoint

-- ===== Row-level security: deny by default, then allow ===============================================

ALTER TABLE member_account ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY member_account_select ON member_account FOR SELECT TO fh_app
  USING (user_id = app.user_id() OR app.is_staff());
--> statement-breakpoint
CREATE POLICY member_account_insert ON member_account FOR INSERT TO fh_app
  WITH CHECK (user_id = app.user_id() AND status = 'active' AND max_managed_profiles = 3
              AND NOT app.flag('signups_paused'));
--> statement-breakpoint
CREATE POLICY member_account_update ON member_account FOR UPDATE TO fh_app
  USING (user_id = app.user_id() OR app.is_staff())
  WITH CHECK (user_id = app.user_id() OR app.is_staff());
--> statement-breakpoint

ALTER TABLE profile ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY profile_select ON profile FOR SELECT TO fh_app
  USING (app.operates_profile(id) OR app.is_staff() OR app.can_browse(id));
--> statement-breakpoint
CREATE POLICY profile_insert ON profile FOR INSERT TO fh_app
  WITH CHECK (created_by_user_id = app.user_id() AND status = 'draft' AND app.is_active_member()
              AND ((management = 'self' AND candidate_user_id = app.user_id())
                OR (management = 'manager' AND candidate_user_id IS NULL)));
--> statement-breakpoint
CREATE POLICY profile_update_operator ON profile FOR UPDATE TO fh_app
  USING (app.operates_profile(id) AND status <> 'suspended')
  WITH CHECK (app.operates_profile(id) AND status <> 'suspended'
              AND (status <> 'published' OR app.publisher_verified(id)));
--> statement-breakpoint
CREATE POLICY profile_update_staff ON profile FOR UPDATE TO fh_app
  USING (app.is_staff()) WITH CHECK (app.is_staff());
--> statement-breakpoint

ALTER TABLE profile_manager ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY profile_manager_select ON profile_manager FOR SELECT TO fh_app
  USING (manager_user_id = app.user_id() OR app.operates_profile(profile_id) OR app.is_staff());
--> statement-breakpoint
CREATE POLICY profile_manager_insert ON profile_manager FOR INSERT TO fh_app
  WITH CHECK (manager_user_id = app.user_id() AND revoked_at IS NULL AND app.created_unclaimed_profile(profile_id));
--> statement-breakpoint
CREATE POLICY profile_manager_update ON profile_manager FOR UPDATE TO fh_app
  USING ((revoked_at IS NULL AND (manager_user_id = app.user_id() OR app.is_candidate_of(profile_id))) OR app.is_owner())
  WITH CHECK (manager_user_id = app.user_id() OR app.is_candidate_of(profile_id) OR app.is_owner());
--> statement-breakpoint

ALTER TABLE private_contact ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY private_contact_select ON private_contact FOR SELECT TO fh_app
  USING (app.operates_profile(profile_id) OR (share_with_connections AND app.can_view_private(profile_id)));
--> statement-breakpoint
CREATE POLICY private_contact_insert ON private_contact FOR INSERT TO fh_app
  WITH CHECK (app.operates_profile(profile_id));
--> statement-breakpoint
CREATE POLICY private_contact_update ON private_contact FOR UPDATE TO fh_app
  USING (app.operates_profile(profile_id)) WITH CHECK (app.operates_profile(profile_id));
--> statement-breakpoint
CREATE POLICY private_contact_delete ON private_contact FOR DELETE TO fh_app
  USING (app.operates_profile(profile_id));
--> statement-breakpoint

ALTER TABLE photo ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY photo_select ON photo FOR SELECT TO fh_app
  USING (app.operates_profile(profile_id) OR app.is_staff()
         OR (moderation_status = 'visible' AND app.can_browse(profile_id)));
--> statement-breakpoint
CREATE POLICY photo_insert ON photo FOR INSERT TO fh_app
  WITH CHECK (app.operates_profile(profile_id) AND moderation_status = 'visible');
--> statement-breakpoint
-- Operators cannot touch a photo staff have hidden, nor change its moderation status.
CREATE POLICY photo_update_operator ON photo FOR UPDATE TO fh_app
  USING (app.operates_profile(profile_id) AND moderation_status = 'visible')
  WITH CHECK (app.operates_profile(profile_id) AND moderation_status = 'visible');
--> statement-breakpoint
CREATE POLICY photo_update_staff ON photo FOR UPDATE TO fh_app
  USING (app.is_staff()) WITH CHECK (app.is_staff());
--> statement-breakpoint
CREATE POLICY photo_delete ON photo FOR DELETE TO fh_app
  USING (app.operates_profile(profile_id));
--> statement-breakpoint

ALTER TABLE photo_original ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY photo_original_select ON photo_original FOR SELECT TO fh_app
  USING (app.can_view_photo_original(photo_id));
--> statement-breakpoint
CREATE POLICY photo_original_insert ON photo_original FOR INSERT TO fh_app
  WITH CHECK (app.operates_photo(photo_id));
--> statement-breakpoint
CREATE POLICY photo_original_delete ON photo_original FOR DELETE TO fh_app
  USING (app.operates_photo(photo_id));
--> statement-breakpoint

ALTER TABLE invitation ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY invitation_select ON invitation FOR SELECT TO fh_app
  USING (app.operates_profile(profile_id));
--> statement-breakpoint
-- Only the active manager invites. Consuming an invitation (the candidate) is a Stage 2 function.
CREATE POLICY invitation_insert ON invitation FOR INSERT TO fh_app
  WITH CHECK (issued_by_user_id = app.user_id() AND app.is_active_manager_of(profile_id)
              AND consumed_at IS NULL AND superseded_at IS NULL);
--> statement-breakpoint
CREATE POLICY invitation_update ON invitation FOR UPDATE TO fh_app
  USING (app.is_active_manager_of(profile_id)) WITH CHECK (app.is_active_manager_of(profile_id) AND consumed_at IS NULL);
--> statement-breakpoint

ALTER TABLE verification_case ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY verification_case_select ON verification_case FOR SELECT TO fh_app
  USING (subject_user_id = app.user_id() OR app.is_staff());
--> statement-breakpoint
CREATE POLICY verification_case_insert ON verification_case FOR INSERT TO fh_app
  WITH CHECK (subject_user_id = app.user_id() AND status = 'pending' AND reviewed_by_user_id IS NULL
              AND reviewed_at IS NULL AND NOT app.flag('document_submissions_paused'));
--> statement-breakpoint
CREATE POLICY verification_case_review ON verification_case FOR UPDATE TO fh_app
  USING (app.is_staff()) WITH CHECK (app.is_staff());
--> statement-breakpoint

ALTER TABLE interest ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- The receiver sees a pending interest (and so the sender) only with an active plan.
CREATE POLICY interest_select ON interest FOR SELECT TO fh_app
  USING (app.operates_profile(sender_profile_id)
         OR (app.operates_profile(receiver_profile_id)
             AND (status = 'accepted' OR app.has_active_entitlement(receiver_profile_id))));
--> statement-breakpoint
-- OWNER-DECISIONS section 1: sending needs an active plan.
CREATE POLICY interest_insert ON interest FOR INSERT TO fh_app
  WITH CHECK (status = 'pending' AND sender_user_id = app.user_id() AND app.operates_profile(sender_profile_id)
              AND app.has_active_entitlement(sender_profile_id) AND app.can_browse(receiver_profile_id));
--> statement-breakpoint
CREATE POLICY interest_update ON interest FOR UPDATE TO fh_app
  USING (status = 'pending' AND (app.operates_profile(sender_profile_id)
         OR (app.operates_profile(receiver_profile_id) AND app.has_active_entitlement(receiver_profile_id))))
  WITH CHECK (status <> 'accepted' OR app.has_active_entitlement(receiver_profile_id));
--> statement-breakpoint

ALTER TABLE connection ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY connection_select ON connection FOR SELECT TO fh_app
  USING (app.operates_profile(profile_low) OR app.operates_profile(profile_high));
--> statement-breakpoint
CREATE POLICY connection_insert ON connection FOR INSERT TO fh_app
  WITH CHECK (ended_at IS NULL AND app.can_open_connection(interest_id, profile_low, profile_high));
--> statement-breakpoint
CREATE POLICY connection_update ON connection FOR UPDATE TO fh_app
  USING (ended_at IS NULL AND (app.operates_profile(profile_low) OR app.operates_profile(profile_high)))
  WITH CHECK (ended_at IS NOT NULL AND ended_by_user_id = app.user_id());
--> statement-breakpoint

ALTER TABLE shortlist ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY shortlist_select ON shortlist FOR SELECT TO fh_app
  USING (app.operates_profile(owner_profile_id));
--> statement-breakpoint
CREATE POLICY shortlist_insert ON shortlist FOR INSERT TO fh_app
  WITH CHECK (app.operates_profile(owner_profile_id) AND app.can_browse(target_profile_id));
--> statement-breakpoint
CREATE POLICY shortlist_delete ON shortlist FOR DELETE TO fh_app
  USING (app.operates_profile(owner_profile_id));
--> statement-breakpoint

ALTER TABLE block ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- The blocked side never sees the block.
CREATE POLICY block_select ON block FOR SELECT TO fh_app
  USING (app.operates_profile(blocker_profile_id) OR app.is_staff());
--> statement-breakpoint
CREATE POLICY block_insert ON block FOR INSERT TO fh_app
  WITH CHECK (app.operates_profile(blocker_profile_id) AND revoked_at IS NULL);
--> statement-breakpoint
CREATE POLICY block_update ON block FOR UPDATE TO fh_app
  USING (app.operates_profile(blocker_profile_id)) WITH CHECK (app.operates_profile(blocker_profile_id));
--> statement-breakpoint

ALTER TABLE quota_ledger ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY quota_ledger_select ON quota_ledger FOR SELECT TO fh_app
  USING (app.operates_profile(profile_id));
--> statement-breakpoint
CREATE POLICY quota_ledger_insert ON quota_ledger FOR INSERT TO fh_app
  WITH CHECK (app.operates_profile(profile_id));
--> statement-breakpoint

ALTER TABLE disclosure_event ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY disclosure_event_select ON disclosure_event FOR SELECT TO fh_app
  USING (app.operates_profile(subject_profile_id) OR app.is_owner());
--> statement-breakpoint
CREATE POLICY disclosure_event_insert ON disclosure_event FOR INSERT TO fh_app
  WITH CHECK (actor_user_id = app.user_id()
              AND (app.operates_profile(subject_profile_id) OR app.operates_profile(recipient_profile_id)));
--> statement-breakpoint

ALTER TABLE report ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- The reported member never sees reports; reporters see only their own.
CREATE POLICY report_select ON report FOR SELECT TO fh_app
  USING (reporter_user_id = app.user_id() OR app.is_staff());
--> statement-breakpoint
CREATE POLICY report_insert ON report FOR INSERT TO fh_app
  WITH CHECK (reporter_user_id = app.user_id() AND app.operates_profile(reporter_profile_id) AND status = 'open'
              AND reviewed_by_user_id IS NULL AND reviewed_at IS NULL AND staff_note IS NULL);
--> statement-breakpoint
CREATE POLICY report_review ON report FOR UPDATE TO fh_app
  USING (app.is_staff()) WITH CHECK (app.is_staff());
--> statement-breakpoint

ALTER TABLE plan ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY plan_select ON plan FOR SELECT TO fh_app USING (true);
--> statement-breakpoint
CREATE POLICY plan_insert ON plan FOR INSERT TO fh_app WITH CHECK (app.is_owner());
--> statement-breakpoint
CREATE POLICY plan_update ON plan FOR UPDATE TO fh_app USING (app.is_owner()) WITH CHECK (app.is_owner());
--> statement-breakpoint

ALTER TABLE price_version ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY price_version_select ON price_version FOR SELECT TO fh_app USING (true);
--> statement-breakpoint
CREATE POLICY price_version_insert ON price_version FOR INSERT TO fh_app
  WITH CHECK (app.is_owner() AND created_by_user_id = app.user_id());
--> statement-breakpoint
CREATE POLICY price_version_update ON price_version FOR UPDATE TO fh_app
  USING (app.is_owner()) WITH CHECK (app.is_owner());
--> statement-breakpoint

ALTER TABLE payment_submission ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- OWNER-DECISIONS section 9: the backup reviewer has no payment access at all; only the owner reviews.
-- Members see their own payments (not those of a former manager after a takeover, spec 6.3).
CREATE POLICY payment_submission_select ON payment_submission FOR SELECT TO fh_app
  USING (payer_user_id = app.user_id() OR app.is_owner());
--> statement-breakpoint
CREATE POLICY payment_submission_insert ON payment_submission FOR INSERT TO fh_app
  WITH CHECK (payer_user_id = app.user_id() AND app.operates_profile(profile_id)
              AND status IN ('awaiting_proof', 'pending_review') AND settlement_ref IS NULL
              AND reviewed_by_user_id IS NULL AND reviewed_at IS NULL AND refund_reason IS NULL
              AND app.is_current_price(price_version_id, plan_id, currency::text, amount_minor));
--> statement-breakpoint
CREATE POLICY payment_submission_update_payer ON payment_submission FOR UPDATE TO fh_app
  USING (payer_user_id = app.user_id() AND status = 'awaiting_proof')
  WITH CHECK (payer_user_id = app.user_id());
--> statement-breakpoint
CREATE POLICY payment_submission_update_owner ON payment_submission FOR UPDATE TO fh_app
  USING (app.is_owner()) WITH CHECK (app.is_owner());
--> statement-breakpoint

ALTER TABLE entitlement_event ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY entitlement_event_select ON entitlement_event FOR SELECT TO fh_app
  USING (app.operates_profile(profile_id) OR app.is_owner());
--> statement-breakpoint
-- Plans are granted, replaced, refunded or revoked by the owner only.
CREATE POLICY entitlement_event_insert_owner ON entitlement_event FOR INSERT TO fh_app
  WITH CHECK (app.is_owner() AND actor_user_id = app.user_id());
--> statement-breakpoint
-- OWNER-DECISIONS section 7: marking "engaged or married" ends the member's own plan.
CREATE POLICY entitlement_event_insert_forfeit ON entitlement_event FOR INSERT TO fh_app
  WITH CHECK (kind = 'forfeit' AND actor_user_id = app.user_id() AND app.operates_profile(profile_id));
--> statement-breakpoint

ALTER TABLE audit_event ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY audit_event_select ON audit_event FOR SELECT TO fh_app
  USING (app.is_owner()
         OR (app.is_staff() AND entity_type NOT IN ('payment_submission', 'entitlement_event', 'price_version', 'plan')));
--> statement-breakpoint
CREATE POLICY audit_event_insert ON audit_event FOR INSERT TO fh_app
  WITH CHECK (actor_user_id = app.user_id());
--> statement-breakpoint

ALTER TABLE notification_outbox ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Members' actions may queue notifications; only the job worker (not fh_app) reads or updates them.
CREATE POLICY notification_outbox_insert ON notification_outbox FOR INSERT TO fh_app
  WITH CHECK (app.user_id() IS NOT NULL AND status = 'queued' AND attempts = 0 AND sent_at IS NULL);
--> statement-breakpoint

ALTER TABLE operations_flag ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY operations_flag_select ON operations_flag FOR SELECT TO fh_app USING (true);
--> statement-breakpoint
CREATE POLICY operations_flag_update ON operations_flag FOR UPDATE TO fh_app
  USING (app.is_owner()) WITH CHECK (app.is_owner() AND updated_by_user_id = app.user_id());
--> statement-breakpoint

ALTER TABLE staff_member ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY staff_member_select ON staff_member FOR SELECT TO fh_app
  USING (user_id = app.user_id() OR app.is_owner());
--> statement-breakpoint
CREATE POLICY staff_member_insert ON staff_member FOR INSERT TO fh_app
  WITH CHECK (app.is_owner() AND granted_by = app.user_id());
--> statement-breakpoint
CREATE POLICY staff_member_update ON staff_member FOR UPDATE TO fh_app
  USING (app.is_owner()) WITH CHECK (app.is_owner());
--> statement-breakpoint

-- ===== Seed: plan catalogue and switches =================================================================

-- Provisional prices from OWNER-DECISIONS section 2, in minor units (LKR cents, US cents).
-- Change them by closing a version and inserting a new one, never by editing.
INSERT INTO plan (id, tier, term_months, daily_request_cap, monthly_request_cap) VALUES
  ('starter_1m', 'starter', 1, 5, 30),
  ('premium_3m', 'premium', 3, 30, NULL),
  ('premium_6m', 'premium', 6, 30, NULL);
--> statement-breakpoint
INSERT INTO price_version (plan_id, residence_band, currency, amount_minor) VALUES
  ('starter_1m', 'local', 'LKR', 300000),
  ('starter_1m', 'diaspora', 'USD', 2000),
  ('premium_3m', 'local', 'LKR', 850000),
  ('premium_3m', 'diaspora', 'USD', 5500),
  ('premium_6m', 'local', 'LKR', 1500000),
  ('premium_6m', 'diaspora', 'USD', 10000);
--> statement-breakpoint
INSERT INTO operations_flag (key, enabled) VALUES
  ('signups_paused', false),
  ('document_submissions_paused', false);
