-- Stage 3: requests, connections and privacy. Hand-written; builds on 0003_access_rules.sql and
-- 0005_accounts_and_trust.sql (same fh_app role, helper style, and one statement per breakpoint).
-- Every multi-step action (send, accept, end, block, report, engaged) is one SECURITY DEFINER function
-- with its own permission checks and locks; members can no longer insert those rows directly.

-- ===== Who may browse (owner decision 29 Oct 2026, audit N04: verified members only) ===================

-- An account's own checks: phone verified by SMS code and an approved identity document (section 5).
CREATE FUNCTION app.account_verified(account text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT EXISTS (SELECT 1 FROM auth_user u WHERE u.id = account AND u.phone_number_verified IS TRUE
                   AND EXISTS (SELECT 1 FROM verification_case vc WHERE vc.subject_user_id = u.id AND vc.status = 'approved'))
  $$;
--> statement-breakpoint
-- A verified member: an active account that passed its own checks, or that operates a profile whose
-- publisher passed them (a candidate who joined through an invitation relies on the manager's checks).
CREATE FUNCTION app.is_verified_member() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT app.is_active_member()
       AND (app.account_verified(app.user_id())
            OR EXISTS (SELECT 1 FROM app.operated_profiles() AS v(id) WHERE app.publisher_verified(v.id)))
  $$;
--> statement-breakpoint
-- Discovery: a verified member sees a published profile that the report thresholds have not hidden, unless
-- a block exists either way between it and a profile the member operates.
CREATE OR REPLACE FUNCTION app.can_browse(target uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT app.is_verified_member()
       AND EXISTS (SELECT 1 FROM profile WHERE id = target AND status = 'published' AND moderation_hidden_at IS NULL)
       AND NOT EXISTS (SELECT 1 FROM app.operated_profiles() AS v(id) WHERE app.is_blocked(v.id, target))
  $$;
--> statement-breakpoint
-- An active connection between a profile the actor operates and the target, with no block either way.
CREATE FUNCTION app.connected_to(target uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT app.is_active_member() AND EXISTS (
      SELECT 1 FROM app.operated_profiles() AS v(id)
      JOIN connection c ON c.ended_at IS NULL
        AND c.profile_low = least(v.id, target) AND c.profile_high = greatest(v.id, target)
      WHERE NOT app.is_blocked(v.id, target))
  $$;
--> statement-breakpoint
-- Private contacts and original gallery photos (sections 3, 4, 7): only through an active connection, while
-- the viewer's own profile has an active plan, with no block either way. The other side's expired plan does
-- not hide them (owner decision 29 Oct 2026, spec O03). Suspended, deleted or report-hidden profiles neither
-- show nor see private details.
CREATE OR REPLACE FUNCTION app.can_view_private(target uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT app.is_active_member() AND EXISTS (
      SELECT 1
      FROM app.private_viewing_profiles() AS v(id)
      JOIN profile vp ON vp.id = v.id AND vp.status NOT IN ('suspended', 'deleted') AND vp.moderation_hidden_at IS NULL
      JOIN connection c ON c.ended_at IS NULL
        AND c.profile_low = least(v.id, target) AND c.profile_high = greatest(v.id, target)
      JOIN profile t ON t.id = target AND t.status NOT IN ('suspended', 'deleted') AND t.moderation_hidden_at IS NULL
      WHERE app.has_active_entitlement(v.id) AND NOT app.is_blocked(v.id, target))
  $$;
--> statement-breakpoint
-- Connected members still see each other's profile while it is paused (not when suspended, deleted or hidden).
DROP POLICY profile_select ON profile;
--> statement-breakpoint
CREATE POLICY profile_select ON profile FOR SELECT TO fh_app
  USING (app.operates_profile(id) OR app.is_staff() OR app.can_browse(id)
         OR (app.connected_to(id) AND status NOT IN ('suspended', 'deleted') AND moderation_hidden_at IS NULL));
--> statement-breakpoint
DROP POLICY photo_select ON photo;
--> statement-breakpoint
CREATE POLICY photo_select ON photo FOR SELECT TO fh_app
  USING (app.operates_profile(profile_id) OR app.is_staff()
         OR (moderation_status = 'visible' AND (app.can_browse(profile_id) OR app.connected_to(profile_id))));
--> statement-breakpoint
-- Photos are part of editing: like profile fields, only someone who may edit the profile changes them.
DROP POLICY photo_insert ON photo;
--> statement-breakpoint
CREATE POLICY photo_insert ON photo FOR INSERT TO fh_app
  WITH CHECK (app.can_edit_profile(profile_id) AND moderation_status = 'visible');
--> statement-breakpoint
DROP POLICY photo_update_operator ON photo;
--> statement-breakpoint
CREATE POLICY photo_update_operator ON photo FOR UPDATE TO fh_app
  USING (app.can_edit_profile(profile_id) AND moderation_status = 'visible')
  WITH CHECK (app.can_edit_profile(profile_id) AND moderation_status = 'visible');
--> statement-breakpoint
DROP POLICY photo_delete ON photo;
--> statement-breakpoint
CREATE POLICY photo_delete ON photo FOR DELETE TO fh_app
  USING (app.can_edit_profile(profile_id));
--> statement-breakpoint

-- Badges for any profile the actor may see, now including a connection whose profile is paused.
CREATE OR REPLACE FUNCTION app.profile_badges(target uuid)
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
    WHERE p.id = target
      AND (app.operates_profile(p.id) OR app.is_staff() OR app.can_browse(p.id) OR app.connected_to(p.id))
  $$;
--> statement-breakpoint
-- What a member card adds to the profile row, for profiles the actor may see: the manager's relationship
-- (never who the manager is) and the three badges.
CREATE FUNCTION app.member_cards(ids uuid[])
  RETURNS TABLE (profile_id uuid, manager_relationship manager_relationship, manager_verified boolean,
                 candidate_confirmed boolean, candidate_identity_verified boolean)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT p.id, pm.relationship, b.manager_verified, b.candidate_confirmed, b.candidate_identity_verified
    FROM profile p
    LEFT JOIN profile_manager pm ON pm.profile_id = p.id AND pm.revoked_at IS NULL
    CROSS JOIN LATERAL app.profile_badges(p.id) AS b
    WHERE p.id = ANY(ids)
  $$;
--> statement-breakpoint

-- ===== Members never set the moderation state ==========================================================

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
        NEW.moderation_hidden_at := NULL;
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
    IF current_user = 'fh_app' AND NOT app.is_staff()
       AND NEW.moderation_hidden_at IS DISTINCT FROM OLD.moderation_hidden_at THEN
      RAISE EXCEPTION 'only staff change moderation' USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.first_published_at := coalesce(OLD.first_published_at,
                                       CASE WHEN NEW.status = 'published' THEN now() END);
    NEW.version := OLD.version + 1;
    RETURN NEW;
  END
  $$;
--> statement-breakpoint

-- ===== Helpers for the actions below (not callable by members) =========================================

-- Serialises work on one profile (its request limits) or one pair (accept, end, block), in a fixed order.
CREATE FUNCTION app.lock_profiles(a uuid, b uuid DEFAULT NULL) RETURNS void
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF b IS NULL OR a = b THEN
      PERFORM pg_advisory_xact_lock(hashtextextended(a::text, 0));
    ELSE
      PERFORM pg_advisory_xact_lock(hashtextextended(least(a, b)::text, 0));
      PERFORM pg_advisory_xact_lock(hashtextextended(greatest(a, b)::text, 0));
    END IF;
  END
  $$;
--> statement-breakpoint
-- What a profile shares with its connections, as categories (never the values): each shared contact as
-- person_kind (e.g. manager_phone), the gallery, and the parents' names (owner decision 29 Oct 2026).
CREATE FUNCTION app.shared_categories(target uuid) RETURNS text[]
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT coalesce(array_agg(DISTINCT category ORDER BY category), '{}') FROM (
      SELECT person::text || '_' || kind::text FROM private_contact WHERE profile_id = target AND share_with_connections
      UNION ALL SELECT 'gallery' FROM photo WHERE profile_id = target AND moderation_status = 'visible'
      UNION ALL SELECT 'family_names' FROM profile WHERE id = target AND (mother_name IS NOT NULL OR father_name IS NOT NULL)
    ) AS shared(category)
  $$;
--> statement-breakpoint
-- §4: "the log must record exactly what was shared and when": both directions of one connection.
CREATE FUNCTION app.log_disclosure(conn uuid, act disclosure_action) RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    INSERT INTO disclosure_event (subject_profile_id, recipient_profile_id, connection_id, actor_user_id, action,
                                  field_categories, policy_version)
    SELECT pair.subject, pair.recipient, c.id, app.user_id(), act, app.shared_categories(pair.subject),
           i.share_consent_version
    FROM connection c
    JOIN interest i ON i.id = c.interest_id
    CROSS JOIN LATERAL (VALUES (c.profile_low, c.profile_high), (c.profile_high, c.profile_low)) AS pair(subject, recipient)
    WHERE c.id = conn
  $$;
--> statement-breakpoint
-- Sharing changes during an active connection are logged too: a contact added, changed, shared or
-- unshared is recorded for every connection that can see it.
CREATE FUNCTION app.private_contact_disclosure() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    subject uuid;
    category text;
    act disclosure_action;
  BEGIN
    IF TG_OP = 'INSERT' THEN
      IF NOT NEW.share_with_connections THEN RETURN NULL; END IF;
      subject := NEW.profile_id;
      category := NEW.person::text || '_' || NEW.kind::text;
      act := 'shared';
    ELSIF TG_OP = 'DELETE' THEN
      IF NOT OLD.share_with_connections THEN RETURN NULL; END IF;
      subject := OLD.profile_id;
      category := OLD.person::text || '_' || OLD.kind::text;
      act := 'revoked';
    ELSE
      IF NEW.share_with_connections = OLD.share_with_connections
         AND (NOT NEW.share_with_connections OR NEW.value = OLD.value) THEN
        RETURN NULL;
      END IF;
      subject := NEW.profile_id;
      category := NEW.person::text || '_' || NEW.kind::text;
      act := CASE WHEN NEW.share_with_connections THEN 'shared' ELSE 'revoked' END;
    END IF;
    INSERT INTO disclosure_event (subject_profile_id, recipient_profile_id, connection_id, actor_user_id, action,
                                  field_categories, policy_version)
    SELECT subject, CASE WHEN c.profile_low = subject THEN c.profile_high ELSE c.profile_low END, c.id, app.user_id(),
           act, ARRAY[category], i.share_consent_version
    FROM connection c JOIN interest i ON i.id = c.interest_id
    WHERE c.ended_at IS NULL AND (c.profile_low = subject OR c.profile_high = subject);
    RETURN NULL;
  END
  $$;
--> statement-breakpoint
CREATE TRIGGER private_contact_disclosure AFTER INSERT OR UPDATE OR DELETE ON private_contact
  FOR EACH ROW EXECUTE FUNCTION app.private_contact_disclosure();
--> statement-breakpoint

-- ===== Requests (sections 1, 2, 4) =========================================================================

-- §4: after a decline or a withdrawal (of a request or a connection), a new request between the same two
-- profiles waits 7 days, in either direction (spec O05, proposed). Only for pairs the actor is part of.
CREATE FUNCTION app.pair_cooldown_until(a uuid, b uuid) RETURNS timestamptz
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT CASE WHEN app.operates_profile(a) OR app.operates_profile(b) THEN (
      SELECT max(ended_at) + interval '7 days' FROM (
        SELECT responded_at FROM interest
          WHERE pair_low = least(a, b) AND pair_high = greatest(a, b) AND status IN ('declined', 'withdrawn')
        UNION ALL
        SELECT ended_at FROM connection
          WHERE profile_low = least(a, b) AND profile_high = greatest(a, b) AND ended_at IS NOT NULL
      ) AS ended(ended_at)) END
  $$;
--> statement-breakpoint
-- Sending (sections 1, 2, 4): a published profile with an active plan, to a profile its operator may browse,
-- with no open request or connection between them, after any cooldown, within the plan's limits: daily from
-- midnight Sri Lanka time, monthly within each 30-day block of the plan (spec O05, proposed). One ledger row
-- per request, never refunded. A repeated idempotency key returns the first request instead of charging twice.
CREATE FUNCTION app.send_interest(p_sender uuid, p_receiver uuid, p_consent text, p_key text) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    existing interest%ROWTYPE;
    ent record;
    day_start timestamptz;
    block_start timestamptz;
    new_id uuid;
  BEGIN
    IF NOT app.can_manage_interests(p_sender) THEN
      RAISE EXCEPTION 'interest_not_allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    PERFORM app.lock_profiles(p_sender, p_receiver);
    IF p_key IS NOT NULL THEN
      SELECT * INTO existing FROM interest WHERE idempotency_key = p_key;
      IF FOUND THEN
        IF existing.sender_profile_id = p_sender AND existing.receiver_profile_id = p_receiver THEN
          RETURN existing.id;
        END IF;
        RAISE EXCEPTION 'interest_key_reused' USING ERRCODE = 'unique_violation';
      END IF;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM profile WHERE id = p_sender AND status = 'published' AND moderation_hidden_at IS NULL) THEN
      RAISE EXCEPTION 'interest_sender_not_published' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT app.has_active_entitlement(p_sender) THEN
      RAISE EXCEPTION 'interest_needs_plan' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF app.operates_profile(p_receiver) OR NOT app.can_browse(p_receiver) THEN
      RAISE EXCEPTION 'interest_receiver_unavailable' USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM connection WHERE ended_at IS NULL
               AND profile_low = least(p_sender, p_receiver) AND profile_high = greatest(p_sender, p_receiver)) THEN
      RAISE EXCEPTION 'interest_already_connected' USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM interest WHERE status = 'pending'
               AND pair_low = least(p_sender, p_receiver) AND pair_high = greatest(p_sender, p_receiver)) THEN
      RAISE EXCEPTION 'interest_already_pending' USING ERRCODE = 'check_violation';
    END IF;
    IF app.pair_cooldown_until(p_sender, p_receiver) > now() THEN
      RAISE EXCEPTION 'interest_cooldown' USING ERRCODE = 'check_violation';
    END IF;
    SELECT e.starts_at, coalesce(e.daily_request_cap, p.daily_request_cap) AS daily,
           coalesce(e.monthly_request_cap, p.monthly_request_cap) AS monthly
      INTO ent
      FROM entitlement_event e LEFT JOIN plan p ON p.id = e.plan_id
      WHERE e.profile_id = p_sender ORDER BY e.seq DESC LIMIT 1;
    day_start := date_trunc('day', now() AT TIME ZONE 'Asia/Colombo') AT TIME ZONE 'Asia/Colombo';
    IF (SELECT count(*) FROM quota_ledger WHERE profile_id = p_sender AND charged_at >= day_start) >= ent.daily THEN
      RAISE EXCEPTION 'interest_daily_limit' USING ERRCODE = 'check_violation';
    END IF;
    IF ent.monthly IS NOT NULL THEN
      block_start := ent.starts_at + floor(extract(epoch FROM now() - ent.starts_at) / 2592000) * interval '30 days';
      IF (SELECT count(*) FROM quota_ledger WHERE profile_id = p_sender AND charged_at >= block_start) >= ent.monthly THEN
        RAISE EXCEPTION 'interest_monthly_limit' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    INSERT INTO interest (sender_profile_id, receiver_profile_id, sender_user_id, share_consent_version, idempotency_key)
      VALUES (p_sender, p_receiver, app.user_id(), p_consent, p_key)
      RETURNING id INTO new_id;
    INSERT INTO quota_ledger (profile_id, interest_id) VALUES (p_sender, new_id);
    RETURN new_id;
  END
  $$;
--> statement-breakpoint
-- Accepting (sections 1, 4): the receiver, with an active plan, while both profiles are published and not
-- blocked. Opens the connection and logs what each side now shares. A repeat returns the same connection.
CREATE FUNCTION app.accept_interest(p_interest uuid) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    i interest%ROWTYPE;
    conn uuid;
  BEGIN
    SELECT * INTO i FROM interest WHERE id = p_interest;
    IF NOT FOUND OR NOT app.can_manage_interests(i.receiver_profile_id) THEN
      RAISE EXCEPTION 'interest_not_found' USING ERRCODE = 'no_data_found';
    END IF;
    PERFORM app.lock_profiles(i.sender_profile_id, i.receiver_profile_id);
    SELECT * INTO i FROM interest WHERE id = p_interest;
    IF i.status = 'accepted' THEN
      SELECT id INTO conn FROM connection WHERE interest_id = i.id;
      RETURN conn;
    END IF;
    IF i.status <> 'pending' THEN
      RAISE EXCEPTION 'interest_closed' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT app.has_active_entitlement(i.receiver_profile_id) THEN
      RAISE EXCEPTION 'interest_needs_plan' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF app.is_blocked(i.sender_profile_id, i.receiver_profile_id)
       OR (SELECT count(*) FROM profile WHERE id IN (i.sender_profile_id, i.receiver_profile_id)
           AND status = 'published' AND moderation_hidden_at IS NULL) < 2 THEN
      RAISE EXCEPTION 'interest_unavailable' USING ERRCODE = 'check_violation';
    END IF;
    UPDATE interest SET status = 'accepted', responded_at = now() WHERE id = i.id;
    INSERT INTO connection (interest_id, profile_low, profile_high)
      VALUES (i.id, least(i.sender_profile_id, i.receiver_profile_id), greatest(i.sender_profile_id, i.receiver_profile_id))
      RETURNING id INTO conn;
    PERFORM app.log_disclosure(conn, 'shared');
    RETURN conn;
  END
  $$;
--> statement-breakpoint
-- §4: a connected member can withdraw at any time; both sides lose access to each other's details from
-- then on, and the withdrawal is logged. The candidate of a managed profile may always withdraw.
CREATE FUNCTION app.end_connection(p_connection uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    c connection%ROWTYPE;
  BEGIN
    SELECT * INTO c FROM connection WHERE id = p_connection;
    IF NOT FOUND OR NOT (app.can_manage_interests(c.profile_low) OR app.can_manage_interests(c.profile_high)
                         OR app.is_candidate_of(c.profile_low) OR app.is_candidate_of(c.profile_high)) THEN
      RAISE EXCEPTION 'connection_not_found' USING ERRCODE = 'no_data_found';
    END IF;
    PERFORM app.lock_profiles(c.profile_low, c.profile_high);
    UPDATE connection SET ended_at = now(), ended_by_user_id = app.user_id(), end_reason = 'withdrawn'
      WHERE id = p_connection AND ended_at IS NULL;
    IF FOUND THEN
      PERFORM app.log_disclosure(p_connection, 'revoked');
    END IF;
  END
  $$;
--> statement-breakpoint
-- Blocking (sections 4, 7): any operator of the blocking profile. Ends a connection between the two (logged)
-- and closes open requests; each profile disappears from the other's discovery. Repeating is harmless.
CREATE FUNCTION app.block_profile(p_blocker uuid, p_blocked uuid) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    block_id uuid;
    conn uuid;
  BEGIN
    IF NOT app.operates_profile(p_blocker) OR app.operates_profile(p_blocked)
       OR NOT EXISTS (SELECT 1 FROM profile WHERE id = p_blocked AND status <> 'deleted') THEN
      RAISE EXCEPTION 'block_not_allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    PERFORM app.lock_profiles(p_blocker, p_blocked);
    SELECT id INTO block_id FROM block
      WHERE blocker_profile_id = p_blocker AND blocked_profile_id = p_blocked AND revoked_at IS NULL;
    IF FOUND THEN
      RETURN block_id;
    END IF;
    INSERT INTO block (blocker_profile_id, blocked_profile_id) VALUES (p_blocker, p_blocked) RETURNING id INTO block_id;
    UPDATE connection SET ended_at = now(), ended_by_user_id = app.user_id(), end_reason = 'blocked'
      WHERE ended_at IS NULL AND profile_low = least(p_blocker, p_blocked) AND profile_high = greatest(p_blocker, p_blocked)
      RETURNING id INTO conn;
    IF conn IS NOT NULL THEN
      PERFORM app.log_disclosure(conn, 'revoked');
    END IF;
    UPDATE interest
      SET status = CASE WHEN receiver_profile_id = p_blocker THEN 'declined'::interest_status ELSE 'withdrawn'::interest_status END,
          responded_at = now()
      WHERE status = 'pending' AND pair_low = least(p_blocker, p_blocked) AND pair_high = greatest(p_blocker, p_blocked);
    RETURN block_id;
  END
  $$;
--> statement-breakpoint
-- The blocking profile's own list (the blocked side never sees a block).
CREATE FUNCTION app.blocked_profiles(p_blocker uuid)
  RETURNS TABLE (block_id uuid, profile_id uuid, display_name text, blocked_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT b.id, b.blocked_profile_id, p.display_name, b.created_at
    FROM block b LEFT JOIN profile p ON p.id = b.blocked_profile_id
    WHERE b.blocker_profile_id = p_blocker AND b.revoked_at IS NULL AND app.operates_profile(p_blocker)
    ORDER BY b.created_at DESC
  $$;
--> statement-breakpoint
-- §7: marking "engaged or married" hides the profile and ends its plan (the member was warned that the
-- remaining time is forfeited). Open requests close: sent ones withdrawn, received ones declined (spec O12,
-- proposed). Connections stay on record.
CREATE FUNCTION app.mark_engaged(p_profile uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  BEGIN
    IF NOT (app.can_edit_profile(p_profile) OR app.is_candidate_of(p_profile)) THEN
      RAISE EXCEPTION 'profile_not_allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    PERFORM app.lock_profiles(p_profile);
    IF NOT EXISTS (SELECT 1 FROM profile WHERE id = p_profile AND status IN ('published', 'paused')) THEN
      RAISE EXCEPTION 'profile_not_engageable' USING ERRCODE = 'check_violation';
    END IF;
    UPDATE profile SET status = 'engaged_or_married' WHERE id = p_profile;
    IF app.has_active_entitlement(p_profile) THEN
      INSERT INTO entitlement_event (profile_id, kind, actor_user_id, reason)
        VALUES (p_profile, 'forfeit', app.user_id(), 'engaged_or_married');
    END IF;
    UPDATE interest
      SET status = CASE WHEN sender_profile_id = p_profile THEN 'withdrawn'::interest_status ELSE 'declined'::interest_status END,
          responded_at = now()
      WHERE status = 'pending' AND (sender_profile_id = p_profile OR receiver_profile_id = p_profile);
  END
  $$;
--> statement-breakpoint

-- ===== Reports (section 7) ===================================================================================

-- Serious categories hide the content after 1 open report; all others after open reports from 3 different
-- verified members. Only open reports count, so content restored by staff starts again from zero.
CREATE FUNCTION app.report_threshold_met(p_profile uuid, p_photo uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT EXISTS (SELECT 1 FROM report WHERE status = 'open' AND target_profile_id = p_profile
                   AND target_photo_id IS NOT DISTINCT FROM p_photo
                   AND category IN ('explicit_content', 'minor_safety', 'threat', 'scam'))
        OR (SELECT count(DISTINCT reporter_user_id) FROM report
            WHERE status = 'open' AND reporter_verified
              AND target_profile_id = p_profile AND target_photo_id IS NOT DISTINCT FROM p_photo) >= 3
  $$;
--> statement-breakpoint
-- Content stays hidden while a threshold is met or after staff upheld a report; otherwise it is shown.
-- Returns whether it is hidden now. A profile report hides the profile; a photo report only that photo.
CREATE FUNCTION app.apply_moderation(p_profile uuid, p_photo uuid) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    hide boolean := app.report_threshold_met(p_profile, p_photo)
      OR EXISTS (SELECT 1 FROM report WHERE status = 'upheld' AND target_profile_id = p_profile
                 AND target_photo_id IS NOT DISTINCT FROM p_photo);
  BEGIN
    IF p_photo IS NOT NULL THEN
      UPDATE photo SET moderation_status = CASE WHEN hide THEN 'hidden'::photo_moderation_status
                                                ELSE 'visible'::photo_moderation_status END
        WHERE id = p_photo;
    ELSE
      UPDATE profile SET moderation_hidden_at = CASE WHEN hide THEN now() END
        WHERE id = p_profile AND (moderation_hidden_at IS NULL) = hide;
    END IF;
    RETURN hide;
  END
  $$;
--> statement-breakpoint
-- Filing a report: a verified member, about a profile (or one of its photos) they can see through discovery,
-- a connection or a request between them. One open report per reporter, target and category.
CREATE FUNCTION app.file_report(p_reporter uuid, p_target uuid, p_photo uuid, p_category report_category, p_detail text)
  RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    new_id uuid;
  BEGIN
    IF NOT app.operates_profile(p_reporter) OR app.operates_profile(p_target) THEN
      RAISE EXCEPTION 'report_not_allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT app.is_verified_member() THEN
      RAISE EXCEPTION 'report_needs_verification' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT (app.can_browse(p_target) OR app.connected_to(p_target)
            OR EXISTS (SELECT 1 FROM interest WHERE pair_low = least(p_reporter, p_target)
                       AND pair_high = greatest(p_reporter, p_target)))
       OR (p_photo IS NOT NULL AND NOT EXISTS (SELECT 1 FROM photo WHERE id = p_photo AND profile_id = p_target)) THEN
      RAISE EXCEPTION 'report_target_unavailable' USING ERRCODE = 'check_violation';
    END IF;
    PERFORM app.lock_profiles(p_target);
    INSERT INTO report (reporter_user_id, reporter_profile_id, target_profile_id, target_photo_id, category, detail,
                        reporter_verified)
      VALUES (app.user_id(), p_reporter, p_target, p_photo, p_category, nullif(btrim(p_detail), ''), true)
      RETURNING id INTO new_id;
    PERFORM app.apply_moderation(p_target, p_photo);
    RETURN new_id;
  END
  $$;
--> statement-breakpoint
-- Staff decide every report: upheld keeps the content hidden; dismissed restores it unless the remaining
-- reports still meet a threshold. Returns whether the content is hidden afterwards.
CREATE FUNCTION app.review_report(p_report uuid, p_decision report_status, p_note text) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    r report%ROWTYPE;
  BEGIN
    IF NOT app.is_staff() THEN
      RAISE EXCEPTION 'report_staff_only' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_decision NOT IN ('upheld', 'dismissed') THEN
      RAISE EXCEPTION 'report_decision_invalid' USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO r FROM report WHERE id = p_report;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'report_not_found' USING ERRCODE = 'no_data_found';
    END IF;
    IF r.target_profile_id IS NOT NULL THEN
      PERFORM app.lock_profiles(r.target_profile_id);
    END IF;
    UPDATE report SET status = p_decision, reviewed_by_user_id = app.user_id(), reviewed_at = now(),
                      staff_note = nullif(btrim(p_note), '')
      WHERE id = p_report AND status = 'open';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'report_already_decided' USING ERRCODE = 'check_violation';
    END IF;
    IF r.target_profile_id IS NULL THEN
      RETURN false;
    END IF;
    RETURN app.apply_moderation(r.target_profile_id, r.target_photo_id);
  END
  $$;
--> statement-breakpoint

-- ===== Direct writes closed: these rows come only from the functions above ================================

DROP POLICY interest_insert ON interest;
--> statement-breakpoint
DROP POLICY connection_insert ON connection;
--> statement-breakpoint
DROP POLICY quota_ledger_insert ON quota_ledger;
--> statement-breakpoint
DROP POLICY disclosure_event_insert ON disclosure_event;
--> statement-breakpoint
DROP POLICY report_insert ON report;
--> statement-breakpoint
DROP POLICY block_insert ON block;
--> statement-breakpoint

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO fh_app;
--> statement-breakpoint
-- Internal helpers: members could learn about other profiles' reports or sharing, or write the log.
REVOKE EXECUTE ON FUNCTION app.lock_profiles(uuid, uuid), app.shared_categories(uuid),
  app.log_disclosure(uuid, disclosure_action), app.report_threshold_met(uuid, uuid), app.apply_moderation(uuid, uuid)
  FROM fh_app;
