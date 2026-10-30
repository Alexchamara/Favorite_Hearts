-- Stage 5a: deleting a profile or an account with the 6-month retention list, handing a profile over to its
-- candidate, and the retention sweep (OWNER-DECISIONS sections 5 and 8; owner decision 30 Oct 2026: "the candidate
-- decides"). Each action is one function, so a deletion happens completely or not at all.

-- ===== New tables: closed to the app role =====================================================================

-- Hashed sign-in details, the file-deletion queue and the rate-limit counters are used only by the API's system
-- connection and by the functions below. fh_app has no grant on them; row-level security is on as a second lock.
ALTER TABLE retained_identity ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE storage_deletion ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE rate_limit_counter ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- ===== Append-only history may lose links to deleted records ===================================================

-- Plan history, the audit trail and the sharing log stay append-only for the app. When the retention sweep removes a
-- payment, a profile or an account, the database clears the links that pointed to it (ON DELETE SET NULL), which is an
-- UPDATE; outside the app role an update may only clear values, never change them.
CREATE OR REPLACE FUNCTION app.forbid_update() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF current_user <> 'fh_app' AND NOT EXISTS (
         SELECT 1 FROM jsonb_each(to_jsonb(NEW)) AS n(key, value)
         WHERE n.value IS DISTINCT FROM to_jsonb(OLD) -> n.key AND n.value <> 'null'::jsonb) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
  END
  $$;
--> statement-breakpoint

-- ===== Moving a profile to its candidate ========================================================================

-- One way to move a managed profile to its candidate, used by the candidate's takeover, the manager's hand-over and a
-- manager's account deletion: the manager loses access at once and their own contact details leave the profile; the
-- profile becomes self-managed and keeps its plan (plans belong to the profile); the former manager's payments that
-- never got a receipt are cancelled; a published profile pauses until the candidate's own document and phone are
-- verified. Returns the profile's new status.
CREATE FUNCTION app.move_to_candidate(target uuid, reason manager_revoke_reason) RETURNS profile_status
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    candidate text;
    result profile_status;
  BEGIN
    SELECT candidate_user_id INTO candidate FROM profile WHERE id = target FOR UPDATE;
    UPDATE profile_manager SET revoked_at = now(), revoked_reason = reason
      WHERE profile_id = target AND revoked_at IS NULL;
    DELETE FROM private_contact WHERE profile_id = target AND person = 'manager';
    UPDATE payment_submission SET status = 'cancelled', updated_at = now()
      WHERE profile_id = target AND status = 'awaiting_proof' AND payer_user_id IS DISTINCT FROM candidate;
    UPDATE profile
      SET management = 'self',
          status = CASE WHEN status = 'published' AND NOT app.publisher_verified(target)
                        THEN 'paused'::profile_status ELSE status END
      WHERE id = target
      RETURNING status INTO result;
    RETURN result;
  END
  $$;
--> statement-breakpoint
-- The candidate removes the manager (0005, 0009): unchanged rules, now through app.move_to_candidate.
CREATE OR REPLACE FUNCTION app.candidate_take_over(target uuid) RETURNS jsonb
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
    RETURN jsonb_build_object('status', 'taken_over', 'profileStatus', app.move_to_candidate(target, 'candidate_removed'));
  END
  $$;
--> statement-breakpoint
-- The manager steps away from a profile whose candidate has joined: the candidate then runs it alone, exactly as
-- after a takeover, and is told by email.
CREATE FUNCTION app.hand_over_profile(target uuid) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    prof profile%ROWTYPE;
    new_status profile_status;
  BEGIN
    SELECT * INTO prof FROM profile WHERE id = target FOR UPDATE;
    IF NOT FOUND OR prof.status = 'deleted' OR NOT app.is_active_manager_of(target) THEN
      RAISE EXCEPTION 'profile_not_allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF prof.candidate_user_id IS NULL THEN
      RAISE EXCEPTION 'hand_over_needs_candidate' USING ERRCODE = 'check_violation';
    END IF;
    new_status := app.move_to_candidate(target, 'manager_left');
    PERFORM app.notify(prof.candidate_user_id, 'profile.handed_over:' || target, 'profile_handed_over',
      jsonb_build_object('profileId', target, 'profileName', prof.display_name, 'managerDeleted', false,
                         'paused', prof.status = 'published' AND new_status = 'paused'));
    RETURN jsonb_build_object('status', 'handed_over', 'profileStatus', new_status);
  END
  $$;
--> statement-breakpoint

-- ===== Deleting a profile ========================================================================================

-- Section 8: a deleted profile disappears at once. Its text, photos, contact details and social handles go, with its
-- requests, connections, shortlists, invitations, managers and sharing log; its plan ends (the time left is lost) and
-- payments without a receipt stop. Payment records, plan history, reports and blocks stay for the retention period,
-- pointing to an empty shell that nobody operates or sees; the retention sweep removes them. Files are queued for
-- deletion. Returns counts for the audit trail. Not callable by members: see app.delete_profile and
-- app.delete_account.
CREATE FUNCTION app.erase_profile(target uuid, reason text) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    photos integer;
    contacts integer;
    requests integer;
    connections integer;
    payments integer;
    forfeited boolean := false;
  BEGIN
    PERFORM 1 FROM profile WHERE id = target AND status <> 'deleted' FOR UPDATE;
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;
    PERFORM app.lock_profiles(target);
    IF app.has_active_entitlement(target) THEN
      INSERT INTO entitlement_event (profile_id, kind, actor_user_id, reason) VALUES (target, 'forfeit', app.user_id(), reason);
      forfeited := true;
    END IF;
    UPDATE payment_submission SET status = 'cancelled', updated_at = now()
      WHERE profile_id = target AND status = 'awaiting_proof';
    GET DIAGNOSTICS payments = ROW_COUNT;
    SELECT count(*) INTO connections FROM connection WHERE ended_at IS NULL AND target IN (profile_low, profile_high);
    -- Requests and connections go before the contacts, so removing the contacts logs no "revoked" sharing.
    DELETE FROM disclosure_event WHERE subject_profile_id = target OR recipient_profile_id = target;
    DELETE FROM interest WHERE sender_profile_id = target OR receiver_profile_id = target;
    GET DIAGNOSTICS requests = ROW_COUNT;
    DELETE FROM shortlist WHERE owner_profile_id = target OR target_profile_id = target;
    DELETE FROM quota_ledger WHERE profile_id = target;
    DELETE FROM private_contact WHERE profile_id = target;
    GET DIAGNOSTICS contacts = ROW_COUNT;
    INSERT INTO storage_deletion (bucket, object_key)
      SELECT 'derived', ph.blurred_key FROM photo ph WHERE ph.profile_id = target
      UNION
      SELECT 'private', o.object_key FROM photo_original o JOIN photo ph ON ph.id = o.photo_id WHERE ph.profile_id = target
      ON CONFLICT DO NOTHING;
    DELETE FROM photo WHERE profile_id = target;
    GET DIAGNOSTICS photos = ROW_COUNT;
    DELETE FROM invitation WHERE profile_id = target;
    DELETE FROM profile_manager WHERE profile_id = target;
    UPDATE verification_case SET profile_id = NULL WHERE profile_id = target;
    DELETE FROM notification_outbox WHERE status IN ('queued', 'failed') AND payload->>'profileId' = target::text;
    UPDATE profile
      SET status = 'deleted', deleted_at = now(), candidate_user_id = NULL, created_by_user_id = NULL,
          display_name = NULL, gender = NULL, birth_date = NULL, country_code = NULL, region = NULL, city = NULL,
          occupation = NULL, education = NULL, height_cm = NULL, marital_status = NULL, religion = DEFAULT,
          languages = DEFAULT, mother_tongue = NULL, bio = NULL, family_story = NULL, "values" = DEFAULT,
          hobbies = DEFAULT, timeline = DEFAULT, relocation = DEFAULT, mother_name = NULL, mother_occupation = NULL,
          father_name = NULL, father_occupation = NULL, sisters = DEFAULT, brothers = DEFAULT, income_range = DEFAULT,
          caste = NULL, caste_consented_at = NULL, community_openness = NULL, diet = NULL, smoking = NULL,
          drinking = NULL, children_plan = NULL, family_involvement = NULL, horoscope_importance = DEFAULT,
          cover_public = false, adult_declared_at = NULL, candidate_confirmed_at = NULL, candidate_objection_at = NULL,
          updated_at = now()
      WHERE id = target;
    RETURN jsonb_build_object('photos', photos, 'contacts', contacts, 'requests', requests,
                              'connectionsEnded', connections, 'paymentsCancelled', payments, 'planForfeited', forfeited);
  END
  $$;
--> statement-breakpoint
-- Who may delete one profile (the candidate decides): its candidate always; its manager only while no candidate has
-- joined. The manager of a joined candidate hands the profile over instead. A manager is told when the candidate
-- deletes the profile they ran.
CREATE FUNCTION app.delete_profile(target uuid) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    prof profile%ROWTYPE;
    manager text;
    removed jsonb;
  BEGIN
    SELECT * INTO prof FROM profile WHERE id = target FOR UPDATE;
    IF NOT FOUND OR prof.status = 'deleted' OR NOT app.operates_profile(target) THEN
      RAISE EXCEPTION 'profile_not_allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF prof.candidate_user_id IS NOT NULL AND prof.candidate_user_id <> app.user_id() THEN
      RAISE EXCEPTION 'profile_delete_candidate_only' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT manager_user_id INTO manager FROM profile_manager WHERE profile_id = target AND revoked_at IS NULL;
    removed := app.erase_profile(target, 'profile_deleted');
    IF manager IS DISTINCT FROM app.user_id() THEN
      PERFORM app.notify(manager, 'profile.deleted:' || target, 'profile_deleted',
        jsonb_build_object('profileName', prof.display_name));
    END IF;
    RETURN removed;
  END
  $$;
--> statement-breakpoint

-- ===== Deleting an account ===========================================================================================

-- What deleting an account does to each profile it runs (owner decision 30 Oct 2026, "the candidate decides"): the
-- member's own profile, as its candidate, is deleted; a profile they manage passes to its candidate when one has
-- joined, and is deleted otherwise. Not callable by members (it names other people's accounts).
CREATE FUNCTION app.account_profile_outcomes(p_user text)
  RETURNS TABLE (profile_id uuid, display_name text, outcome text, candidate_user_id text, candidate_name text,
                 manager_user_id text, plan_active boolean, plan_ends_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT p.id, p.display_name,
           CASE WHEN p.candidate_user_id IS NULL OR p.candidate_user_id = p_user THEN 'deleted' ELSE 'handed_over' END,
           p.candidate_user_id,
           CASE WHEN p.candidate_user_id <> p_user THEN nullif(cu.name, '') END,
           m.manager_user_id,
           app.has_active_entitlement(p.id),
           (SELECT e.ends_at FROM app.active_entitlement(p.id) e)
    FROM profile p
    LEFT JOIN profile_manager m ON m.profile_id = p.id AND m.revoked_at IS NULL
    LEFT JOIN auth_user cu ON cu.id = p.candidate_user_id
    WHERE p.status <> 'deleted' AND (p.candidate_user_id = p_user OR m.manager_user_id = p_user)
    ORDER BY p.created_at
  $$;
--> statement-breakpoint
-- The signed-in member's own preview of the outcomes above.
CREATE FUNCTION app.deletion_outcomes()
  RETURNS TABLE (profile_id uuid, display_name text, outcome text, candidate_name text, plan_active boolean,
                 plan_ends_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT o.profile_id, o.display_name, o.outcome, o.candidate_name, o.plan_active, o.plan_ends_at
    FROM app.account_profile_outcomes(app.user_id()) o
  $$;
--> statement-breakpoint
-- Section 8 account deletion, in one transaction for the signed-in member. Each profile follows
-- app.account_profile_outcomes. Then the member's own records go: payments without a receipt stop, identity document
-- files are queued for deletion (an undecided case goes, a decided one keeps only type, reviewer, date and decision),
-- notifications, sessions and sign-in methods are removed, and the sign-in identity is emptied (no name, email or
-- phone). Kept for p_months: payment records with their receipts, plan history, reports and blocks, the staff audit
-- trail, and keyed hashes of the sign-in email and phone (made by the API) that stop a banned person signing up again.
CREATE FUNCTION app.delete_account(p_email_hash text, p_phone_hash text, p_months integer) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    me text := app.user_id();
    acct member_account%ROWTYPE;
    item record;
    run_profiles uuid[];
    deleted_profiles uuid[];
    is_banned boolean;
    deleted_count integer := 0;
    handed_count integer := 0;
    old_email text;
    old_phone text;
  BEGIN
    SELECT * INTO acct FROM member_account WHERE user_id = me FOR UPDATE;
    IF me IS NULL OR NOT FOUND OR acct.status = 'deleted' THEN
      RAISE EXCEPTION 'account_not_found' USING ERRCODE = 'no_data_found';
    END IF;
    IF EXISTS (SELECT 1 FROM staff_member WHERE user_id = me AND revoked_at IS NULL) THEN
      RAISE EXCEPTION 'account_is_staff' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT coalesce(array_agg(o.profile_id), '{}'), coalesce(array_agg(o.profile_id) FILTER (WHERE o.outcome = 'deleted'), '{}')
      INTO run_profiles, deleted_profiles FROM app.account_profile_outcomes(me) o;
    -- "Banned" (proposed): the account or one of its profiles is suspended, or a serious report against one of its
    -- profiles was upheld. A serious report upheld later against a profile deleted with the account bans it too
    -- (app.review_report); a profile handed to its candidate is the candidate's from now on, so it is not remembered.
    is_banned := acct.status = 'suspended' OR EXISTS (
      SELECT 1 FROM profile p WHERE p.id = ANY (run_profiles)
        AND (p.status = 'suspended' OR EXISTS (
          SELECT 1 FROM report r WHERE r.target_profile_id = p.id AND r.status = 'upheld'
            AND r.category IN ('explicit_content', 'minor_safety', 'threat', 'scam'))));
    FOR item IN SELECT * FROM app.account_profile_outcomes(me) LOOP
      IF item.outcome = 'handed_over' THEN
        PERFORM app.move_to_candidate(item.profile_id, 'manager_left');
        PERFORM app.notify(item.candidate_user_id, 'profile.handed_over:' || item.profile_id, 'profile_handed_over',
          jsonb_build_object('profileId', item.profile_id, 'profileName', item.display_name, 'managerDeleted', true,
                             'paused', (SELECT status = 'paused' FROM profile WHERE id = item.profile_id)));
        handed_count := handed_count + 1;
      ELSE
        IF item.manager_user_id IS DISTINCT FROM me THEN
          PERFORM app.notify(item.manager_user_id, 'profile.deleted:' || item.profile_id, 'profile_deleted',
            jsonb_build_object('profileName', item.display_name));
        END IF;
        PERFORM app.erase_profile(item.profile_id, 'account_deleted');
        deleted_count := deleted_count + 1;
      END IF;
    END LOOP;
    UPDATE payment_submission SET status = 'cancelled', updated_at = now()
      WHERE payer_user_id = me AND status = 'awaiting_proof';
    INSERT INTO storage_deletion (bucket, object_key)
      SELECT 'private', evidence_key FROM verification_case WHERE subject_user_id = me AND evidence_key IS NOT NULL
      ON CONFLICT DO NOTHING;
    DELETE FROM verification_case WHERE subject_user_id = me AND status = 'pending';
    UPDATE verification_case SET evidence_key = NULL, purged_at = now()
      WHERE subject_user_id = me AND evidence_key IS NOT NULL;
    DELETE FROM notification_outbox WHERE recipient_user_id = me;
    INSERT INTO retained_identity (user_id, email_hash, phone_hash, profile_ids, banned, purge_after)
      VALUES (me, p_email_hash, p_phone_hash, deleted_profiles, is_banned, now() + make_interval(months => p_months));
    UPDATE member_account SET status = 'deleted', deleted_at = now(), residence_country = NULL, updated_at = now()
      WHERE user_id = me;
    SELECT email, phone_number INTO old_email, old_phone FROM auth_user WHERE id = me;
    DELETE FROM auth_session WHERE user_id = me;
    DELETE FROM auth_account WHERE user_id = me;
    DELETE FROM auth_two_factor WHERE user_id = me;
    DELETE FROM auth_verification
      WHERE identifier = old_phone OR right(identifier, char_length(old_email) + 5) = '-otp-' || old_email;
    UPDATE auth_user
      SET name = '', email = 'deleted-' || id || '@deleted.favoritehearts.invalid', email_verified = false, image = NULL,
          phone_number = NULL, phone_number_verified = false, two_factor_enabled = false, updated_at = now()
      WHERE id = me;
    RETURN jsonb_build_object('profilesDeleted', deleted_count, 'profilesHandedOver', handed_count, 'banned', is_banned);
  END
  $$;
--> statement-breakpoint

-- ===== The retention sweep ===========================================================================================

-- Section 8: p_months after a profile or an account was deleted, everything kept for it goes: payment records and
-- their receipts (files queued for deletion), plan history, reports, blocks, document decisions, the audit trail about
-- them, the hashed sign-in details, and the empty profile and account shells. Runs as the system
-- (jobs/retention.ts); not callable by fh_app. Returns counts.
CREATE FUNCTION app.retention_purge(p_months integer) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    cutoff timestamptz := now() - make_interval(months => p_months);
    gone_profiles uuid[];
    gone_users text[];
    gone_payments uuid[];
    gone_proofs uuid[];
    gone_reports uuid[];
    gone_entitlements uuid[];
    gone_cases uuid[];
    files integer;
    audits integer;
  BEGIN
    SELECT coalesce(array_agg(id), '{}') INTO gone_profiles FROM profile WHERE status = 'deleted' AND deleted_at <= cutoff;
    SELECT coalesce(array_agg(user_id), '{}') INTO gone_users FROM member_account
      WHERE status = 'deleted' AND deleted_at <= cutoff;
    SELECT coalesce(array_agg(id), '{}') INTO gone_payments FROM payment_submission
      WHERE profile_id = ANY (gone_profiles) OR payer_user_id = ANY (gone_users);
    SELECT coalesce(array_agg(id), '{}') INTO gone_proofs FROM payment_proof WHERE payment_id = ANY (gone_payments);
    SELECT coalesce(array_agg(id), '{}') INTO gone_reports FROM report
      WHERE reporter_profile_id = ANY (gone_profiles) OR target_profile_id = ANY (gone_profiles)
         OR reporter_user_id = ANY (gone_users);
    SELECT coalesce(array_agg(id), '{}') INTO gone_entitlements FROM entitlement_event WHERE profile_id = ANY (gone_profiles);
    SELECT coalesce(array_agg(id), '{}') INTO gone_cases FROM verification_case WHERE subject_user_id = ANY (gone_users);
    INSERT INTO storage_deletion (bucket, object_key)
      SELECT 'private', object_key FROM payment_proof WHERE id = ANY (gone_proofs)
      ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS files = ROW_COUNT;
    DELETE FROM audit_event
      WHERE (entity_type = 'payment_submission' AND entity_id = ANY (gone_payments::text[]))
         OR (entity_type = 'payment_proof' AND entity_id = ANY (gone_proofs::text[]))
         OR (entity_type = 'report' AND entity_id = ANY (gone_reports::text[]))
         OR (entity_type = 'entitlement_event' AND entity_id = ANY (gone_entitlements::text[]))
         OR (entity_type = 'verification_case' AND entity_id = ANY (gone_cases::text[]))
         OR (entity_type = 'profile' AND entity_id = ANY (gone_profiles::text[]))
         OR (entity_type = 'account' AND entity_id = ANY (gone_users))
         OR metadata->>'profileId' = ANY (gone_profiles::text[])
         OR (actor_role = 'member' AND actor_user_id = ANY (gone_users));
    GET DIAGNOSTICS audits = ROW_COUNT;
    DELETE FROM payment_submission WHERE id = ANY (gone_payments);
    DELETE FROM entitlement_event WHERE id = ANY (gone_entitlements);
    DELETE FROM report WHERE id = ANY (gone_reports);
    DELETE FROM block WHERE blocker_profile_id = ANY (gone_profiles) OR blocked_profile_id = ANY (gone_profiles);
    DELETE FROM verification_case WHERE id = ANY (gone_cases);
    DELETE FROM profile WHERE id = ANY (gone_profiles);
    DELETE FROM auth_user WHERE id = ANY (gone_users);
    RETURN jsonb_build_object('profiles', cardinality(gone_profiles), 'accounts', cardinality(gone_users),
                              'payments', cardinality(gone_payments), 'receipts', files,
                              'reports', cardinality(gone_reports), 'auditEvents', audits);
  END
  $$;
--> statement-breakpoint

-- ===== Existing views and decisions that meet deleted records =====================================================

-- A serious report upheld against a profile whose account was since deleted still bans that account's hashed
-- sign-in details (section 8: "to stop banned users re-registering"). Otherwise unchanged from 0007.
CREATE OR REPLACE FUNCTION app.review_report(p_report uuid, p_decision report_status, p_note text) RETURNS boolean
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
    IF p_decision = 'upheld' AND r.category IN ('explicit_content', 'minor_safety', 'threat', 'scam') THEN
      UPDATE retained_identity SET banned = true WHERE r.target_profile_id = ANY (profile_ids) AND NOT banned;
    END IF;
    RETURN app.apply_moderation(r.target_profile_id, r.target_photo_id);
  END
  $$;
--> statement-breakpoint
-- The blocking profile's own list leaves out profiles that were deleted since (the block itself is kept).
CREATE OR REPLACE FUNCTION app.blocked_profiles(p_blocker uuid)
  RETURNS TABLE (block_id uuid, profile_id uuid, display_name text, blocked_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT b.id, b.blocked_profile_id, p.display_name, b.created_at
    FROM block b LEFT JOIN profile p ON p.id = b.blocked_profile_id
    WHERE b.blocker_profile_id = p_blocker AND b.revoked_at IS NULL AND app.operates_profile(p_blocker)
      AND p.status IS DISTINCT FROM 'deleted'
    ORDER BY b.created_at DESC
  $$;
--> statement-breakpoint
-- The owner's payment list (0009) also says when the profile or the payer's account was deleted, and never shows a
-- placeholder address (phone-only or deleted accounts).
CREATE OR REPLACE FUNCTION app.owner_payments(p_status text, p_query text, p_profile uuid DEFAULT NULL, p_payment uuid DEFAULT NULL)
  RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    q text := nullif(upper(regexp_replace(coalesce(p_query, ''), '[^A-Za-z0-9]', '', 'g')), '');
  BEGIN
    IF NOT app.is_owner() THEN
      RAISE EXCEPTION 'payment_owner_only' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN coalesce((
      SELECT jsonb_agg(x.item ORDER BY x.waiting DESC, x.waiting_since, x.created_at DESC)
      FROM (
        SELECT s.status::text IN ('pending_review', 'held') AS waiting,
               CASE WHEN s.status::text IN ('pending_review', 'held') THEN coalesce(s.proof_submitted_at, s.created_at) END AS waiting_since,
               s.created_at,
               jsonb_build_object(
                 'id', s.id, 'reference', s.reference, 'status', s.status, 'createdAt', s.created_at,
                 'proofSubmittedAt', s.proof_submitted_at, 'reviewedAt', s.reviewed_at,
                 'profile', jsonb_build_object('id', s.profile_id, 'displayName', p.display_name, 'countryCode', p.country_code,
                                               'deleted', coalesce(p.status = 'deleted', false)),
                 'payer', jsonb_build_object('userId', s.payer_user_id, 'name', nullif(u.name, ''),
                                             'email', CASE WHEN u.email LIKE '%.favoritehearts.invalid' THEN NULL ELSE u.email END,
                                             'phone', u.phone_number, 'deleted', coalesce(ma.status = 'deleted', false)),
                 'plan', jsonb_build_object('id', s.plan_id, 'name', coalesce(s.plan_name, pl.name),
                                            'level', coalesce(s.plan_level, pl.level), 'termMonths', coalesce(s.term_months, pl.term_months)),
                 'currency', s.currency, 'amountMinor', s.amount_minor, 'channel', s.channel,
                 'residenceCountry', s.declared_residence_country,
                 'residenceFlags', to_jsonb(array_remove(ARRAY[
                   CASE WHEN s.declared_residence_country IS NULL THEN 'no_country_declared' END,
                   CASE WHEN p.country_code IS NOT NULL AND p.country_code <> s.declared_residence_country
                        THEN 'profile_country_differs' END,
                   CASE WHEN u.phone_number IS NOT NULL AND (u.phone_number LIKE '+94%') <> (s.declared_residence_country = 'LK')
                        THEN 'phone_country_differs' END
                 ]::text[], NULL)),
                 'changeKind', s.change_kind, 'lostDays', s.lost_days_ack,
                 'proofCount', (SELECT count(*) FROM payment_proof pp WHERE pp.payment_id = s.id),
                 'settlementRef', s.settlement_ref, 'message', s.decision_note, 'ownerNote', s.owner_note,
                 'refundReason', s.refund_reason) AS item
        FROM payment_submission s
        LEFT JOIN profile p ON p.id = s.profile_id
        LEFT JOIN auth_user u ON u.id = s.payer_user_id
        LEFT JOIN member_account ma ON ma.user_id = s.payer_user_id
        LEFT JOIN plan pl ON pl.id = s.plan_id
        WHERE (p_payment IS NULL OR s.id = p_payment)
          AND (p_profile IS NULL OR s.profile_id = p_profile)
          AND (p_status IS NULL OR s.status::text = p_status)
          AND (q IS NULL OR upper(regexp_replace(s.reference, '[^A-Za-z0-9]', '', 'g')) = q
               OR upper(regexp_replace(coalesce(s.settlement_ref, ''), '[^A-Za-z0-9]', '', 'g')) = q)
        ORDER BY 1 DESC, 2, 3 DESC
        LIMIT 200
      ) x), '[]'::jsonb);
  END
  $$;
--> statement-breakpoint
-- The document queue (0005) never shows a placeholder address and says when the member deleted the account.
CREATE OR REPLACE FUNCTION app.staff_verification_queue(p_status text) RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', vc.id, 'documentType', vc.document_type, 'status', vc.status,
             'submittedAt', vc.submitted_at, 'reviewedAt', vc.reviewed_at, 'decisionReason', vc.decision_reason,
             'evidenceAvailable', vc.evidence_key IS NOT NULL,
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

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO fh_app;
--> statement-breakpoint
-- Internal helpers stay closed (0009's list again, since the grant above reopened them, plus this stage's): members
-- could learn about other profiles or accounts, write the log and the outbox, or erase without the checks.
REVOKE EXECUTE ON FUNCTION app.lock_profiles(uuid, uuid), app.shared_categories(uuid),
  app.log_disclosure(uuid, disclosure_action), app.report_threshold_met(uuid, uuid), app.apply_moderation(uuid, uuid),
  app.active_entitlement(uuid), app.new_payment_reference(), app.notify(text, text, text, jsonb),
  app.move_to_candidate(uuid, manager_revoke_reason), app.erase_profile(uuid, text), app.account_profile_outcomes(text),
  app.retention_purge(integer)
  FROM fh_app;
