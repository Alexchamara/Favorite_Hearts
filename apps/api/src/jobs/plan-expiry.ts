/**
 * plans.expiry_warnings (OWNER-DECISIONS section 3: a clear warning before the plan ends, with the date and what will
 * be hidden). Daily: one email per stage (from 7 days before, on the last day, and once it has ended) to everyone who
 * runs the profile. Keyed by the plan event, so a renewal starts afresh and a second run the same day queues nothing.
 * Runs as the system (not fh_app); logs counts only.
 */
import { sql } from 'drizzle-orm';
import type { Db } from '../db/types.ts';
import { log } from '../lib/log.ts';
import { rows } from '../lib/profile-view.ts';

export async function queueExpiryWarnings({ db }: { db: Db }): Promise<{ queued: number }> {
  const queued = rows<{ id: string }>(
    await db.execute(sql`
      WITH latest AS (
        SELECT DISTINCT ON (profile_id) id, profile_id, kind, plan_id, ends_at
        FROM entitlement_event WHERE profile_id IS NOT NULL ORDER BY profile_id, seq DESC
      ), due AS (
        SELECT l.id, l.profile_id, l.ends_at, pl.name AS plan_name, p.display_name,
          CASE WHEN l.ends_at <= now() THEN 'ended' WHEN l.ends_at <= now() + interval '1 day' THEN 'last_day' ELSE 'week' END AS stage,
          EXISTS (SELECT 1 FROM payment_submission s
                  WHERE s.profile_id = l.profile_id AND s.status IN ('pending_review', 'held')) AS renewal_pending
        FROM latest l JOIN profile p ON p.id = l.profile_id LEFT JOIN plan pl ON pl.id = l.plan_id
        WHERE l.kind IN ('grant', 'replace') AND p.status IN ('published', 'paused')
          AND l.ends_at > now() - interval '2 days' AND l.ends_at <= now() + interval '7 days'
      ), recipients AS (
        SELECT d.*, p.candidate_user_id AS user_id FROM due d JOIN profile p ON p.id = d.profile_id
        WHERE p.candidate_user_id IS NOT NULL
        UNION
        SELECT d.*, m.manager_user_id FROM due d JOIN profile_manager m ON m.profile_id = d.profile_id AND m.revoked_at IS NULL
      )
      INSERT INTO notification_outbox (event_key, recipient_user_id, channel, template, payload)
      SELECT 'plan.' || stage || ':' || id || ':' || user_id, user_id, 'email',
             CASE stage WHEN 'ended' THEN 'plan_ended' ELSE 'plan_expiring' END,
             jsonb_build_object('planName', plan_name, 'profileName', display_name, 'endsAt', ends_at,
                                'stage', stage, 'renewalPending', renewal_pending)
      FROM recipients
      ON CONFLICT (event_key) DO NOTHING
      RETURNING id`),
  ).length;
  log.info('jobs.plan_expiry.done', { queued });
  return { queued };
}
