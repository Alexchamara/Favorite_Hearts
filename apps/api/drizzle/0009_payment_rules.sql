-- Stage 4: plans the owner manages, manual payments and plan changes (OWNER-DECISIONS sections 2, 3 and 9).
-- Hand-written; builds on 0003_access_rules.sql (fh_app, helpers) and 0007 (app.lock_profiles), one statement
-- per breakpoint. Every payment action is one SECURITY DEFINER function that checks its actor: members start a
-- payment, add receipts, or cancel before sending one; only the owner reviews, refunds, grants and revokes (the
-- backup reviewer has no payment access at all, section 10). Direct writes to payments and plan history are closed.
-- Owner decisions of 29 Oct 2026: plan levels decide upgrades, renewals and downgrades; access continues for up to
-- 3 days after the end while a renewal receipt sent in time waits for review; receipts are images only.
-- 'cancelled' (payment_status) is new in 0008 and so is only named inside plpgsql bodies, which Postgres checks
-- when they first run, after this migration has committed.

-- ===== Plan access with the renewal grace (section 3) ==================================================

-- The latest event decides. A plan that has ended still counts for up to 3 days while a receipt sent before the
-- end waits for the owner (in review or held); a rejection ends it at once.
CREATE OR REPLACE FUNCTION app.has_active_entitlement(target uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT coalesce((
      SELECT e.kind IN ('grant', 'replace') AND e.starts_at <= now()
         AND (now() < e.ends_at
              OR (now() < e.ends_at + interval '3 days'
                  AND EXISTS (SELECT 1 FROM payment_submission s
                              WHERE s.profile_id = target AND s.status IN ('pending_review', 'held')
                                AND s.proof_submitted_at <= e.ends_at)))
      FROM entitlement_event e WHERE e.profile_id = target ORDER BY e.seq DESC LIMIT 1), false)
  $$;
--> statement-breakpoint
-- The plan in force right now, without the grace: the latest event, if it is a grant or replacement not yet ended.
CREATE FUNCTION app.active_entitlement(target uuid) RETURNS SETOF entitlement_event
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT e.* FROM (SELECT * FROM entitlement_event WHERE profile_id = target ORDER BY seq DESC LIMIT 1) e
    WHERE e.kind IN ('grant', 'replace') AND e.starts_at <= now() AND now() < e.ends_at
  $$;
--> statement-breakpoint
-- Whole calendar months on the Sri Lanka clock: 10:15 on 31 January plus one month is 10:15 on 28 February
-- (29 in a leap year), Sri Lanka time.
CREATE FUNCTION app.plan_term_end(starts timestamptz, months integer) RETURNS timestamptz
  LANGUAGE sql STABLE
  AS $$ SELECT ((starts AT TIME ZONE 'Asia/Colombo') + make_interval(months => months)) AT TIME ZONE 'Asia/Colombo' $$;
--> statement-breakpoint
-- What buying p_plan would do for the profile now (owner decision, 29 Oct 2026: by plan level). No plan in force:
-- a new term. A higher level: an upgrade that replaces the plan on approval (its remaining days are lost). The same
-- level: a renewal, only in the last 7 days, also from approval. A lower level: blocked while a plan is in force.
-- Retired plans are not sold; approval passes p_any_plan so a quote already paid for still counts.
CREATE FUNCTION app.plan_change(p_profile uuid, p_plan text, p_any_plan boolean DEFAULT false) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    wanted plan%ROWTYPE;
    cur entitlement_event%ROWTYPE;
    cur_level integer;
    lost integer;
    opens timestamptz;
  BEGIN
    IF NOT (app.operates_profile(p_profile) OR app.is_owner()) THEN
      RAISE EXCEPTION 'payment_not_allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT * INTO wanted FROM plan WHERE id = p_plan;
    IF NOT FOUND OR NOT (wanted.active OR p_any_plan) THEN
      RETURN jsonb_build_object('kind', 'blocked', 'reason', 'plan_unavailable', 'lostDays', 0, 'renewalOpensAt', NULL);
    END IF;
    SELECT * INTO cur FROM app.active_entitlement(p_profile);
    IF NOT FOUND THEN
      RETURN jsonb_build_object('kind', 'new', 'reason', NULL, 'lostDays', 0, 'renewalOpensAt', NULL);
    END IF;
    cur_level := coalesce((SELECT level FROM plan WHERE id = cur.plan_id), 0);
    lost := ceil(extract(epoch FROM cur.ends_at - now()) / 86400)::integer;
    opens := cur.ends_at - interval '7 days';
    IF wanted.level > cur_level THEN
      RETURN jsonb_build_object('kind', 'upgrade', 'reason', NULL, 'lostDays', lost, 'renewalOpensAt', NULL);
    ELSIF wanted.level < cur_level THEN
      RETURN jsonb_build_object('kind', 'blocked', 'reason', 'downgrade', 'lostDays', 0, 'renewalOpensAt', NULL);
    ELSIF now() < opens THEN
      RETURN jsonb_build_object('kind', 'blocked', 'reason', 'renewal_window', 'lostDays', 0, 'renewalOpensAt', opens);
    END IF;
    RETURN jsonb_build_object('kind', 'renewal', 'reason', NULL, 'lostDays', lost, 'renewalOpensAt', opens);
  END
  $$;
--> statement-breakpoint

-- ===== Small helpers =========================================================================================

-- The reference members put on their transfer (section 9): FH and 6 characters, without 0/O or 1/I/L.
CREATE FUNCTION app.new_payment_reference() RETURNS text
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    bytes bytea;
    ref text;
  BEGIN
    LOOP
      bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
      ref := 'FH';
      FOR i IN 0..5 LOOP
        ref := ref || substr(alphabet, 1 + get_byte(bytes, i) % 31, 1);
      END LOOP;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM payment_submission WHERE reference = ref);
    END LOOP;
    RETURN ref;
  END
  $$;
--> statement-breakpoint
-- Statement lines are compared without case or extra spaces, so one transfer cannot be entered twice.
CREATE FUNCTION app.normalize_settlement(value text) RETURNS text
  LANGUAGE sql IMMUTABLE
  AS $$ SELECT nullif(upper(regexp_replace(btrim(value), '\s+', ' ', 'g')), '') $$;
--> statement-breakpoint
-- Queues an email in the same transaction as its event (spec 12.3), once per event key.
CREATE FUNCTION app.notify(p_user text, p_key text, p_template text, p_payload jsonb) RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    INSERT INTO notification_outbox (event_key, recipient_user_id, channel, template, payload)
    SELECT p_key, p_user, 'email', p_template, p_payload WHERE p_user IS NOT NULL
    ON CONFLICT (event_key) DO NOTHING
  $$;
--> statement-breakpoint

-- ===== Members: start a payment, add receipts, cancel ===========================================================

-- A member starts paying for one profile's plan (sections 2, 3, 9). The price is the current version for the payer's
-- declared residence (Sri Lanka: local, in LKR; elsewhere: diaspora, in USD); the channel must carry that currency and
-- have the owner's details; the plan change must be allowed; the member confirmed the refund terms and any days lost.
-- One open payment per profile: repeating the same choice returns the open one.
CREATE FUNCTION app.start_payment(p_profile uuid, p_plan text, p_country text, p_channel payment_channel,
                                  p_refund_terms text, p_lost_days_ok boolean) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    open_payment payment_submission%ROWTYPE;
    wanted plan%ROWTYPE;
    price price_version%ROWTYPE;
    change jsonb;
    lost integer;
    new_id uuid;
  BEGIN
    IF app.user_id() IS NULL OR NOT app.operates_profile(p_profile) THEN
      RAISE EXCEPTION 'payment_not_allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_refund_terms IS DISTINCT FROM 'refund-v1' THEN
      RAISE EXCEPTION 'payment_terms_unconfirmed' USING ERRCODE = 'check_violation';
    END IF;
    IF p_country IS NULL OR p_country !~ '^[A-Z]{2}$' THEN
      RAISE EXCEPTION 'payment_country_invalid' USING ERRCODE = 'check_violation';
    END IF;
    PERFORM app.lock_profiles(p_profile);
    IF NOT EXISTS (SELECT 1 FROM profile WHERE id = p_profile AND status IN ('published', 'paused')) THEN
      RAISE EXCEPTION 'payment_profile_not_published' USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO open_payment FROM payment_submission
      WHERE profile_id = p_profile AND status IN ('awaiting_proof', 'pending_review', 'held');
    IF FOUND THEN
      IF open_payment.status = 'awaiting_proof' AND open_payment.payer_user_id = app.user_id()
         AND open_payment.plan_id = p_plan AND open_payment.channel = p_channel
         AND open_payment.declared_residence_country = p_country THEN
        RETURN open_payment.id;
      END IF;
      RAISE EXCEPTION 'payment_already_open' USING ERRCODE = 'unique_violation';
    END IF;
    change := app.plan_change(p_profile, p_plan);
    IF change->>'kind' = 'blocked' THEN
      RAISE EXCEPTION '%', CASE change->>'reason' WHEN 'downgrade' THEN 'plan_change_downgrade'
                                                  WHEN 'renewal_window' THEN 'plan_change_too_early'
                                                  ELSE 'plan_unavailable' END
        USING ERRCODE = 'check_violation';
    END IF;
    lost := (change->>'lostDays')::integer;
    IF lost > 0 AND p_lost_days_ok IS NOT TRUE THEN
      RAISE EXCEPTION 'payment_lost_days_unconfirmed' USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO price FROM price_version
      WHERE plan_id = p_plan AND effective_to IS NULL AND effective_from <= now()
        AND residence_band = (CASE WHEN p_country = 'LK' THEN 'local' ELSE 'diaspora' END)::residence_band;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'payment_price_unavailable' USING ERRCODE = 'check_violation';
    END IF;
    IF (price.currency = 'LKR') <> (p_channel = 'lkr_bank_transfer') THEN
      RAISE EXCEPTION 'payment_channel_currency' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM payment_channel_setting WHERE channel = p_channel AND enabled) THEN
      RAISE EXCEPTION 'payment_channel_unavailable' USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO wanted FROM plan WHERE id = p_plan;
    INSERT INTO payment_submission (profile_id, payer_user_id, price_version_id, plan_id, currency, amount_minor, reference,
        channel, declared_residence_country, plan_name, plan_level, term_months, daily_request_cap, monthly_request_cap,
        change_kind, lost_days_ack, refund_terms_version)
      VALUES (p_profile, app.user_id(), price.id, p_plan, price.currency, price.amount_minor, app.new_payment_reference(),
        p_channel, p_country, wanted.name, wanted.level, wanted.term_months, wanted.daily_request_cap,
        wanted.monthly_request_cap, change->>'kind', nullif(lost, 0), p_refund_terms)
      RETURNING id INTO new_id;
    UPDATE member_account SET residence_country = p_country WHERE user_id = app.user_id();
    RETURN new_id;
  END
  $$;
--> statement-breakpoint
-- The payer adds a receipt image while the payment waits (section 9). Every receipt is kept for the owner, and a
-- payment the owner held for more goes back to review. The first receipt's time is when the member "paid on time"
-- for the renewal grace. A former manager can no longer add receipts after a takeover.
CREATE FUNCTION app.attach_payment_proof(p_payment uuid, p_key text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    pay payment_submission%ROWTYPE;
  BEGIN
    SELECT * INTO pay FROM payment_submission WHERE id = p_payment FOR UPDATE;
    IF NOT FOUND OR pay.payer_user_id IS DISTINCT FROM app.user_id() THEN
      RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'no_data_found';
    END IF;
    IF pay.profile_id IS NULL OR NOT app.operates_profile(pay.profile_id) THEN
      RAISE EXCEPTION 'payment_not_allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF pay.status NOT IN ('awaiting_proof', 'pending_review', 'held') THEN
      RAISE EXCEPTION 'payment_closed' USING ERRCODE = 'check_violation';
    END IF;
    IF (SELECT count(*) FROM payment_proof WHERE payment_id = p_payment) >= 5 THEN
      RAISE EXCEPTION 'payment_proof_limit' USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO payment_proof (payment_id, object_key, uploaded_by_user_id) VALUES (p_payment, p_key, app.user_id());
    UPDATE payment_submission
      SET proof_key = p_key, status = 'pending_review', proof_submitted_at = coalesce(proof_submitted_at, now()),
          updated_at = now()
      WHERE id = p_payment;
  END
  $$;
--> statement-breakpoint
-- The payer stops a payment before sending a receipt. It stays on record with its reference, so a transfer made
-- anyway can still be matched.
CREATE FUNCTION app.cancel_payment(p_payment uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    pay payment_submission%ROWTYPE;
  BEGIN
    SELECT * INTO pay FROM payment_submission WHERE id = p_payment FOR UPDATE;
    IF NOT FOUND OR pay.payer_user_id IS DISTINCT FROM app.user_id() THEN
      RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'no_data_found';
    END IF;
    IF pay.status <> 'awaiting_proof' THEN
      RAISE EXCEPTION 'payment_not_cancellable' USING ERRCODE = 'check_violation';
    END IF;
    UPDATE payment_submission SET status = 'cancelled', updated_at = now() WHERE id = p_payment;
  END
  $$;
--> statement-breakpoint

-- ===== Owner: payment decisions (section 9) =====================================================================

-- The owner has found the transfer in the real bank, Wise or PayPal statement and records that statement line, which
-- can be used once across all payments. In one transaction: lock the payment and the profile, check the plan rules
-- again (time may have passed), add exactly one grant or replacement that starts now, mark the payment approved and
-- queue the payer's email. Repeating the approval returns the first result instead of a second term.
CREATE FUNCTION app.approve_payment(p_payment uuid, p_settlement text, p_owner_note text) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    pay payment_submission%ROWTYPE;
    item plan%ROWTYPE;
    settlement text := app.normalize_settlement(p_settlement);
    change jsonb;
    ent entitlement_event%ROWTYPE;
  BEGIN
    IF NOT app.is_owner() THEN
      RAISE EXCEPTION 'payment_owner_only' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF settlement IS NULL OR char_length(settlement) < 3 THEN
      RAISE EXCEPTION 'payment_settlement_required' USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO pay FROM payment_submission WHERE id = p_payment FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'no_data_found';
    END IF;
    IF pay.status = 'approved' THEN
      IF pay.settlement_ref IS DISTINCT FROM settlement THEN
        RAISE EXCEPTION 'payment_already_decided' USING ERRCODE = 'check_violation';
      END IF;
      SELECT * INTO ent FROM entitlement_event WHERE payment_submission_id = p_payment AND kind IN ('grant', 'replace');
      RETURN jsonb_build_object('status', 'already_approved', 'entitlementId', ent.id, 'kind', ent.kind,
                                'startsAt', ent.starts_at, 'endsAt', ent.ends_at, 'lostDays', 0);
    END IF;
    IF pay.status NOT IN ('pending_review', 'held') THEN
      RAISE EXCEPTION '%', CASE WHEN pay.status = 'awaiting_proof' THEN 'payment_no_receipt' ELSE 'payment_already_decided' END
        USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM payment_submission WHERE settlement_ref = settlement AND id <> p_payment) THEN
      RAISE EXCEPTION 'payment_settlement_used' USING ERRCODE = 'unique_violation';
    END IF;
    IF pay.profile_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM profile WHERE id = pay.profile_id AND status IN ('published', 'paused')) THEN
      RAISE EXCEPTION 'payment_profile_unavailable' USING ERRCODE = 'check_violation';
    END IF;
    PERFORM app.lock_profiles(pay.profile_id);
    change := app.plan_change(pay.profile_id, pay.plan_id, true);
    IF change->>'kind' = 'blocked' THEN
      RAISE EXCEPTION '%', CASE change->>'reason' WHEN 'downgrade' THEN 'plan_change_downgrade' ELSE 'plan_change_too_early' END
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO item FROM plan WHERE id = pay.plan_id;
    INSERT INTO entitlement_event (profile_id, kind, plan_id, payment_submission_id, starts_at, ends_at,
                                   daily_request_cap, monthly_request_cap, actor_user_id, reason)
      VALUES (pay.profile_id, (CASE WHEN change->>'kind' = 'new' THEN 'grant' ELSE 'replace' END)::entitlement_kind,
              pay.plan_id, p_payment, now(), app.plan_term_end(now(), coalesce(pay.term_months, item.term_months)),
              CASE WHEN pay.term_months IS NULL THEN item.daily_request_cap ELSE pay.daily_request_cap END,
              CASE WHEN pay.term_months IS NULL THEN item.monthly_request_cap ELSE pay.monthly_request_cap END,
              app.user_id(), 'payment_approved')
      RETURNING * INTO ent;
    UPDATE payment_submission
      SET status = 'approved', settlement_ref = settlement, reviewed_by_user_id = app.user_id(), reviewed_at = now(),
          owner_note = coalesce(nullif(btrim(p_owner_note), ''), owner_note), updated_at = now()
      WHERE id = p_payment;
    PERFORM app.notify(pay.payer_user_id, 'payment.approved:' || p_payment, 'payment_approved',
      jsonb_build_object('reference', pay.reference, 'planName', coalesce(pay.plan_name, item.name),
                         'profileName', (SELECT display_name FROM profile WHERE id = pay.profile_id), 'endsAt', ent.ends_at));
    RETURN jsonb_build_object('status', 'approved', 'entitlementId', ent.id, 'kind', ent.kind, 'startsAt', ent.starts_at,
                              'endsAt', ent.ends_at, 'lostDays', (change->>'lostDays')::integer);
  END
  $$;
--> statement-breakpoint
-- The transfer was not found or does not match. The reason is shown to the payer; the payment is closed and any
-- renewal grace it gave ends at once. The member can start a new payment.
CREATE FUNCTION app.reject_payment(p_payment uuid, p_reason text, p_owner_note text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    pay payment_submission%ROWTYPE;
  BEGIN
    IF NOT app.is_owner() THEN
      RAISE EXCEPTION 'payment_owner_only' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF nullif(btrim(p_reason), '') IS NULL THEN
      RAISE EXCEPTION 'payment_reason_required' USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO pay FROM payment_submission WHERE id = p_payment FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'no_data_found';
    END IF;
    IF pay.status NOT IN ('awaiting_proof', 'pending_review', 'held') THEN
      RAISE EXCEPTION 'payment_already_decided' USING ERRCODE = 'check_violation';
    END IF;
    UPDATE payment_submission
      SET status = 'rejected', decision_note = btrim(p_reason), reviewed_by_user_id = app.user_id(), reviewed_at = now(),
          owner_note = coalesce(nullif(btrim(p_owner_note), ''), owner_note), updated_at = now()
      WHERE id = p_payment;
    PERFORM app.notify(pay.payer_user_id, 'payment.rejected:' || p_payment, 'payment_rejected',
      jsonb_build_object('reference', pay.reference, 'planName', pay.plan_name, 'reason', btrim(p_reason)));
  END
  $$;
--> statement-breakpoint
-- The owner needs more before deciding (for example a clearer receipt). The message is shown to the payer, whose next
-- receipt puts the payment back in review. A held renewal still counts for the 3-day grace.
CREATE FUNCTION app.hold_payment(p_payment uuid, p_message text, p_owner_note text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    pay payment_submission%ROWTYPE;
  BEGIN
    IF NOT app.is_owner() THEN
      RAISE EXCEPTION 'payment_owner_only' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF nullif(btrim(p_message), '') IS NULL THEN
      RAISE EXCEPTION 'payment_reason_required' USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO pay FROM payment_submission WHERE id = p_payment FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'no_data_found';
    END IF;
    IF pay.status NOT IN ('pending_review', 'held') THEN
      RAISE EXCEPTION '%', CASE WHEN pay.status = 'awaiting_proof' THEN 'payment_no_receipt' ELSE 'payment_already_decided' END
        USING ERRCODE = 'check_violation';
    END IF;
    UPDATE payment_submission
      SET status = 'held', decision_note = btrim(p_message),
          owner_note = coalesce(nullif(btrim(p_owner_note), ''), owner_note), updated_at = now()
      WHERE id = p_payment;
    PERFORM app.notify(pay.payer_user_id,
      'payment.held:' || p_payment || ':' || (SELECT count(*) FROM payment_proof WHERE payment_id = p_payment), 'payment_held',
      jsonb_build_object('reference', pay.reference, 'planName', pay.plan_name, 'message', btrim(p_message)));
  END
  $$;
--> statement-breakpoint
-- Refunds are only for a duplicate payment, a mistaken payment or a failure on our side (section 9). The owner records
-- the reason and decides whether the plan this payment bought ends now (spec 9.3). A payment never approved needs the
-- statement line of the money received. A refunded payment is closed.
CREATE FUNCTION app.refund_payment(p_payment uuid, p_reason refund_reason, p_end_plan boolean, p_settlement text,
                                   p_message text, p_owner_note text) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    pay payment_submission%ROWTYPE;
    settlement text;
    ended boolean := false;
  BEGIN
    IF NOT app.is_owner() THEN
      RAISE EXCEPTION 'payment_owner_only' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_reason IS NULL THEN
      RAISE EXCEPTION 'payment_refund_reason_required' USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO pay FROM payment_submission WHERE id = p_payment FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'no_data_found';
    END IF;
    IF pay.status = 'approved' THEN
      settlement := pay.settlement_ref;
    ELSIF pay.status IN ('pending_review', 'held') THEN
      settlement := app.normalize_settlement(p_settlement);
      IF settlement IS NULL OR char_length(settlement) < 3 THEN
        RAISE EXCEPTION 'payment_settlement_required' USING ERRCODE = 'check_violation';
      END IF;
      IF EXISTS (SELECT 1 FROM payment_submission WHERE settlement_ref = settlement AND id <> p_payment) THEN
        RAISE EXCEPTION 'payment_settlement_used' USING ERRCODE = 'unique_violation';
      END IF;
    ELSE
      RAISE EXCEPTION 'payment_not_refundable' USING ERRCODE = 'check_violation';
    END IF;
    IF pay.status = 'approved' AND p_end_plan AND pay.profile_id IS NOT NULL THEN
      PERFORM app.lock_profiles(pay.profile_id);
      IF EXISTS (SELECT 1 FROM app.active_entitlement(pay.profile_id) e WHERE e.payment_submission_id = p_payment) THEN
        INSERT INTO entitlement_event (profile_id, kind, plan_id, payment_submission_id, actor_user_id, reason)
          VALUES (pay.profile_id, 'refund', pay.plan_id, p_payment, app.user_id(), p_reason::text);
        ended := true;
      END IF;
    END IF;
    UPDATE payment_submission
      SET status = 'refunded', refund_reason = p_reason, settlement_ref = settlement,
          decision_note = coalesce(nullif(btrim(p_message), ''), decision_note),
          reviewed_by_user_id = app.user_id(), reviewed_at = now(),
          owner_note = coalesce(nullif(btrim(p_owner_note), ''), owner_note), updated_at = now()
      WHERE id = p_payment;
    PERFORM app.notify(pay.payer_user_id, 'payment.refunded:' || p_payment, 'payment_refunded',
      jsonb_build_object('reference', pay.reference, 'planName', pay.plan_name, 'planEnded', ended));
    RETURN jsonb_build_object('planEnded', ended);
  END
  $$;
--> statement-breakpoint
-- A payment that never received a receipt (still waiting, or cancelled) can be deleted. Anything with evidence stays
-- on record (section 8 keeps payment records; spec 9.3 keeps every receipt and decision).
CREATE FUNCTION app.delete_payment(p_payment uuid) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    pay payment_submission%ROWTYPE;
  BEGIN
    IF NOT app.is_owner() THEN
      RAISE EXCEPTION 'payment_owner_only' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT * INTO pay FROM payment_submission WHERE id = p_payment FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'no_data_found';
    END IF;
    IF pay.status NOT IN ('awaiting_proof', 'cancelled') OR pay.proof_key IS NOT NULL
       OR EXISTS (SELECT 1 FROM payment_proof WHERE payment_id = p_payment) THEN
      RAISE EXCEPTION 'payment_has_evidence' USING ERRCODE = 'check_violation';
    END IF;
    DELETE FROM payment_submission WHERE id = p_payment;
    RETURN jsonb_build_object('reference', pay.reference, 'status', pay.status, 'profileId', pay.profile_id,
                              'currency', pay.currency, 'amountMinor', pay.amount_minor);
  END
  $$;
--> statement-breakpoint
-- The owner's own note (never shown to members). Returns the previous note for the audit trail.
CREATE FUNCTION app.set_payment_note(p_payment uuid, p_note text) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    pay payment_submission%ROWTYPE;
  BEGIN
    IF NOT app.is_owner() THEN
      RAISE EXCEPTION 'payment_owner_only' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT * INTO pay FROM payment_submission WHERE id = p_payment FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'no_data_found';
    END IF;
    UPDATE payment_submission SET owner_note = nullif(btrim(p_note), ''), updated_at = now() WHERE id = p_payment;
    RETURN pay.owner_note;
  END
  $$;
--> statement-breakpoint
-- Corrects a mistyped statement line on an approved or refunded payment, with a reason; still usable only once.
-- Returns the previous line for the audit trail.
CREATE FUNCTION app.correct_settlement(p_payment uuid, p_settlement text, p_reason text) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    pay payment_submission%ROWTYPE;
    settlement text := app.normalize_settlement(p_settlement);
  BEGIN
    IF NOT app.is_owner() THEN
      RAISE EXCEPTION 'payment_owner_only' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF nullif(btrim(p_reason), '') IS NULL THEN
      RAISE EXCEPTION 'payment_reason_required' USING ERRCODE = 'check_violation';
    END IF;
    IF settlement IS NULL OR char_length(settlement) < 3 THEN
      RAISE EXCEPTION 'payment_settlement_required' USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO pay FROM payment_submission WHERE id = p_payment FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'no_data_found';
    END IF;
    IF pay.status NOT IN ('approved', 'refunded') THEN
      RAISE EXCEPTION 'payment_no_settlement' USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM payment_submission WHERE settlement_ref = settlement AND id <> p_payment) THEN
      RAISE EXCEPTION 'payment_settlement_used' USING ERRCODE = 'unique_violation';
    END IF;
    UPDATE payment_submission SET settlement_ref = settlement, updated_at = now() WHERE id = p_payment;
    RETURN pay.settlement_ref;
  END
  $$;
--> statement-breakpoint

-- ===== Owner: plans without a payment ===========================================================================

-- A plan granted without a payment (for example to make up for a failure on our side). It starts now, lasts the
-- plan's term or p_days, and replaces any current plan. Always with a reason (plan history and audit trail).
CREATE FUNCTION app.grant_plan(p_profile uuid, p_plan text, p_days integer, p_reason text) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    item plan%ROWTYPE;
    new_id uuid;
  BEGIN
    IF NOT app.is_owner() THEN
      RAISE EXCEPTION 'payment_owner_only' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF nullif(btrim(p_reason), '') IS NULL THEN
      RAISE EXCEPTION 'payment_reason_required' USING ERRCODE = 'check_violation';
    END IF;
    IF p_days IS NOT NULL AND (p_days < 1 OR p_days > 400) THEN
      RAISE EXCEPTION 'plan_days_invalid' USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO item FROM plan WHERE id = p_plan;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'plan_not_found' USING ERRCODE = 'no_data_found';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM profile WHERE id = p_profile AND status NOT IN ('deleted', 'engaged_or_married')) THEN
      RAISE EXCEPTION 'payment_profile_unavailable' USING ERRCODE = 'check_violation';
    END IF;
    PERFORM app.lock_profiles(p_profile);
    INSERT INTO entitlement_event (profile_id, kind, plan_id, starts_at, ends_at, daily_request_cap, monthly_request_cap,
                                   actor_user_id, reason)
      VALUES (p_profile, (CASE WHEN app.has_active_entitlement(p_profile) THEN 'replace' ELSE 'grant' END)::entitlement_kind,
              p_plan, now(),
              CASE WHEN p_days IS NULL THEN app.plan_term_end(now(), item.term_months) ELSE now() + make_interval(days => p_days) END,
              item.daily_request_cap, item.monthly_request_cap, app.user_id(), btrim(p_reason))
      RETURNING id INTO new_id;
    RETURN new_id;
  END
  $$;
--> statement-breakpoint
-- Ends the profile's plan now, with a reason: for example a disputed PayPal payment, or a suspension (section 9:
-- remaining time is lost). Ends a renewal grace too.
CREATE FUNCTION app.revoke_plan(p_profile uuid, p_reason text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  BEGIN
    IF NOT app.is_owner() THEN
      RAISE EXCEPTION 'payment_owner_only' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF nullif(btrim(p_reason), '') IS NULL THEN
      RAISE EXCEPTION 'payment_reason_required' USING ERRCODE = 'check_violation';
    END IF;
    PERFORM app.lock_profiles(p_profile);
    IF NOT app.has_active_entitlement(p_profile) THEN
      RAISE EXCEPTION 'plan_not_active' USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO entitlement_event (profile_id, kind, plan_id, actor_user_id, reason)
      VALUES (p_profile, 'revoke',
              (SELECT plan_id FROM entitlement_event WHERE profile_id = p_profile ORDER BY seq DESC LIMIT 1),
              app.user_id(), btrim(p_reason));
  END
  $$;
--> statement-breakpoint

-- ===== Owner: plans and prices (owner decision: the owner adds, edits, re-prices, retires and deletes plans) ==

-- A new price for one currency replaces the current one from now. Versions are never edited, so a quote already
-- given keeps its price (spec M01). NULL stops selling the plan in that currency.
CREATE FUNCTION app.set_price(p_plan text, p_currency currency, p_amount integer) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    band residence_band := (CASE WHEN p_currency = 'LKR' THEN 'local' ELSE 'diaspora' END)::residence_band;
    cur_price price_version%ROWTYPE;
    new_id uuid;
  BEGIN
    IF NOT app.is_owner() THEN
      RAISE EXCEPTION 'payment_owner_only' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_amount IS NOT NULL AND p_amount <= 0 THEN
      RAISE EXCEPTION 'price_invalid' USING ERRCODE = 'check_violation';
    END IF;
    PERFORM 1 FROM plan WHERE id = p_plan FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'plan_not_found' USING ERRCODE = 'no_data_found';
    END IF;
    SELECT * INTO cur_price FROM price_version WHERE plan_id = p_plan AND residence_band = band AND effective_to IS NULL;
    IF FOUND AND cur_price.amount_minor = p_amount THEN
      RETURN cur_price.id;
    END IF;
    IF FOUND THEN
      UPDATE price_version SET effective_to = now() WHERE id = cur_price.id;
    END IF;
    IF p_amount IS NULL THEN
      RETURN NULL;
    END IF;
    INSERT INTO price_version (plan_id, residence_band, currency, amount_minor, effective_from, created_by_user_id)
      VALUES (p_plan, band, p_currency, p_amount, now(), app.user_id())
      RETURNING id INTO new_id;
    RETURN new_id;
  END
  $$;
--> statement-breakpoint
-- A plan nobody ever bought or was granted can be deleted with its prices; any other is retired instead, so payment
-- and plan history keep pointing at it.
CREATE FUNCTION app.delete_plan(p_plan text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  BEGIN
    IF NOT app.is_owner() THEN
      RAISE EXCEPTION 'payment_owner_only' USING ERRCODE = 'insufficient_privilege';
    END IF;
    PERFORM 1 FROM plan WHERE id = p_plan FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'plan_not_found' USING ERRCODE = 'no_data_found';
    END IF;
    IF EXISTS (SELECT 1 FROM payment_submission WHERE plan_id = p_plan)
       OR EXISTS (SELECT 1 FROM entitlement_event WHERE plan_id = p_plan) THEN
      RAISE EXCEPTION 'plan_in_use' USING ERRCODE = 'check_violation';
    END IF;
    PERFORM set_config('app.deleting_plan', p_plan, true);
    DELETE FROM price_version WHERE plan_id = p_plan;
    DELETE FROM plan WHERE id = p_plan;
  END
  $$;
--> statement-breakpoint
-- Price versions stay immutable: only app.delete_plan removes them, for the unused plan it is deleting.
CREATE OR REPLACE FUNCTION app.price_version_guard() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF TG_OP = 'DELETE' THEN
      IF OLD.plan_id IS DISTINCT FROM nullif(current_setting('app.deleting_plan', true), '') THEN
        RAISE EXCEPTION 'price versions are never deleted' USING ERRCODE = 'insufficient_privilege';
      END IF;
      RETURN OLD;
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

-- ===== Owner: the payment queue (the backup reviewer gets nothing) =============================================

-- Waiting payments first, oldest receipt first, then the rest newest first. Each row carries the signs that the
-- declared residence, and so the price band, may not match (section 2: flags for review, never automatic
-- rejections; a Sri Lankan NIC does not show residence). p_query finds a payment by reference or statement line.
CREATE FUNCTION app.owner_payments(p_status text, p_query text, p_profile uuid DEFAULT NULL, p_payment uuid DEFAULT NULL)
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
                 'profile', jsonb_build_object('id', s.profile_id, 'displayName', p.display_name, 'countryCode', p.country_code),
                 'payer', jsonb_build_object('userId', s.payer_user_id, 'name', nullif(u.name, ''),
                                             'email', CASE WHEN u.email LIKE '%@phone.favoritehearts.invalid' THEN NULL ELSE u.email END,
                                             'phone', u.phone_number),
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

-- ===== Takeover keeps the plan (section 5); the former manager's unsent payments stop ===========================

-- As in 0005: the manager loses access at once, the profile becomes self-managed and keeps its plan (plans belong
-- to the profile), and a published profile pauses until the candidate's own document and phone are verified.
-- New: the former manager's payments for the profile that never got a receipt are cancelled, so they neither block
-- the candidate's own payment nor stay open for someone without access. Receipts already sent stay with the owner,
-- and an approval still goes to the profile. The candidate never sees the manager's payments (they are the payer's).
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
    UPDATE profile_manager SET revoked_at = now(), revoked_reason = 'candidate_removed'
      WHERE profile_id = target AND revoked_at IS NULL;
    UPDATE payment_submission SET status = 'cancelled', updated_at = now()
      WHERE profile_id = target AND status = 'awaiting_proof' AND payer_user_id IS DISTINCT FROM app.user_id();
    UPDATE profile
      SET management = 'self',
          status = CASE WHEN status = 'published' AND NOT app.publisher_verified(target)
                        THEN 'paused'::profile_status ELSE status END
      WHERE id = target;
    RETURN jsonb_build_object('status', 'taken_over', 'profileStatus', (SELECT status FROM profile WHERE id = target));
  END
  $$;
--> statement-breakpoint

-- ===== New tables ===============================================================================================

ALTER TABLE payment_proof ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT ON payment_proof TO fh_app;
--> statement-breakpoint
-- The payer and the owner only; receipts are added through app.attach_payment_proof.
CREATE POLICY payment_proof_select ON payment_proof FOR SELECT TO fh_app
  USING (app.is_owner()
         OR EXISTS (SELECT 1 FROM payment_submission s WHERE s.id = payment_id AND s.payer_user_id = app.user_id()));
--> statement-breakpoint
ALTER TABLE payment_channel_setting ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, UPDATE ON payment_channel_setting TO fh_app;
--> statement-breakpoint
-- Members see a channel's details only once the owner has switched it on.
CREATE POLICY payment_channel_setting_select ON payment_channel_setting FOR SELECT TO fh_app
  USING (app.is_owner() OR (enabled AND app.is_active_member()));
--> statement-breakpoint
CREATE POLICY payment_channel_setting_update ON payment_channel_setting FOR UPDATE TO fh_app
  USING (app.is_owner()) WITH CHECK (app.is_owner() AND updated_by_user_id = app.user_id());
--> statement-breakpoint
-- No account details are invented (section 9): every channel starts off and empty until the owner fills it in.
INSERT INTO payment_channel_setting (channel) VALUES ('lkr_bank_transfer'), ('usd_swift'), ('wise'), ('paypal');
--> statement-breakpoint
-- The backup reviewer reads no payment, receipt, payment-detail, plan or price history in the audit trail either.
DROP POLICY audit_event_select ON audit_event;
--> statement-breakpoint
CREATE POLICY audit_event_select ON audit_event FOR SELECT TO fh_app
  USING (app.is_owner()
         OR (app.is_staff() AND entity_type NOT IN ('payment_submission', 'payment_proof', 'payment_channel_setting',
                                                    'entitlement_event', 'price_version', 'plan')));
--> statement-breakpoint

-- ===== Direct writes closed: payments and plan history come only from the functions above ======================

DROP POLICY payment_submission_insert ON payment_submission;
--> statement-breakpoint
DROP POLICY payment_submission_update_payer ON payment_submission;
--> statement-breakpoint
DROP POLICY payment_submission_update_owner ON payment_submission;
--> statement-breakpoint
DROP POLICY entitlement_event_insert_owner ON entitlement_event;
--> statement-breakpoint
DROP POLICY entitlement_event_insert_forfeit ON entitlement_event;
--> statement-breakpoint

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO fh_app;
--> statement-breakpoint
-- Internal helpers stay closed (0007's again, since the grant above reopened them): members could learn about other
-- profiles' plans, reports or sharing, or write the log and the outbox.
REVOKE EXECUTE ON FUNCTION app.lock_profiles(uuid, uuid), app.shared_categories(uuid),
  app.log_disclosure(uuid, disclosure_action), app.report_threshold_met(uuid, uuid), app.apply_moderation(uuid, uuid),
  app.active_entitlement(uuid), app.new_payment_reference(), app.notify(text, text, text, jsonb)
  FROM fh_app;
