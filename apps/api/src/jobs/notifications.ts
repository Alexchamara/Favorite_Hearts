/**
 * notifications.send (spec 12.3): delivers queued emails from notification_outbox through the messenger (Resend in
 * production). A row is claimed before sending, so two workers never take the same one, and Resend gets the event
 * key as its idempotency key, so a retry after a crash does not send twice. Failures are retried up to 5 times.
 * Accounts without a real email address (phone-only sign-in) are skipped until an SMS provider exists.
 * Runs as the system (not fh_app); logs counts and template names, never addresses or contents.
 */
import { eq, sql } from 'drizzle-orm';
import type { Config } from '../config.ts';
import { user } from '../db/schema/auth.ts';
import { memberAccount } from '../db/schema/members.ts';
import { notificationOutbox } from '../db/schema/operations.ts';
import type { Db } from '../db/types.ts';
import { log } from '../lib/log.ts';
import { rows } from '../lib/profile-view.ts';
import { PHONE_ONLY_EMAIL_DOMAIN, type Messenger } from '../messaging/messenger.ts';
import { notificationEmail, securityAlertEmail } from '../messaging/templates.ts';

const MAX_ATTEMPTS = 5;

type Claimed = {
  id: string;
  event_key: string;
  recipient_user_id: string | null;
  recipient_address: string | null;
  template: string;
  payload: Record<string, unknown>;
  attempts: number;
  created_at: string | Date;
};
export type SendResult = { sent: number; failed: number; skipped: number };

export async function sendNotifications(
  { db, messenger, config }: { db: Db; messenger: Messenger; config: Config },
  batchSize = 25,
): Promise<SendResult> {
  // A send that died mid-way (claimed long ago, never finished) is retried, or given up after the last attempt.
  await db.execute(sql`
    UPDATE notification_outbox SET status = 'failed', last_error = ${`gave up after ${MAX_ATTEMPTS} attempts`}
    WHERE status = 'sending' AND claimed_at < now() - interval '15 minutes' AND attempts >= ${MAX_ATTEMPTS}`);
  const claimed = rows<Claimed>(
    await db.execute(sql`
      UPDATE notification_outbox SET status = 'sending', attempts = attempts + 1, claimed_at = now()
      WHERE id IN (
        SELECT id FROM notification_outbox
        WHERE channel = 'email' AND attempts < ${MAX_ATTEMPTS}
          AND (status = 'queued' OR (status = 'sending' AND claimed_at < now() - interval '15 minutes'))
        ORDER BY created_at LIMIT ${batchSize} FOR UPDATE SKIP LOCKED)
      RETURNING id, event_key, recipient_user_id, recipient_address, template, payload, attempts, created_at`),
  ).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const result: SendResult = { sent: 0, failed: 0, skipped: 0 };
  const finish = (id: string, values: Partial<typeof notificationOutbox.$inferInsert>) =>
    db.update(notificationOutbox).set(values).where(eq(notificationOutbox.id, id));
  for (const item of claimed) {
    // Security alerts go to the owner's dedicated mailbox, not to an account (lib/security-alerts.ts).
    if (item.recipient_address) {
      try {
        const message = securityAlertEmail(item.payload, config.adminOrigin);
        await messenger.sendEmail({ to: item.recipient_address, ...message, idempotencyKey: item.event_key });
        await finish(item.id, { status: 'sent', sentAt: new Date(), lastError: null });
        result.sent += 1;
      } catch (err) {
        await finish(item.id, { status: item.attempts >= MAX_ATTEMPTS ? 'failed' : 'queued', lastError: (err as Error).message.slice(0, 300) });
        result.failed += 1;
        log.warn('jobs.notifications.send_failed', { template: item.template, attempt: item.attempts });
      }
      continue;
    }
    // Sent in the language the member chose in the app (member_account.locale), English otherwise.
    const [recipient] = await db
      .select({ email: user.email, locale: memberAccount.locale })
      .from(user)
      .leftJoin(memberAccount, eq(memberAccount.userId, user.id))
      .where(eq(user.id, item.recipient_user_id!));
    if (!recipient || recipient.email.endsWith(`@${PHONE_ONLY_EMAIL_DOMAIN}`)) {
      await finish(item.id, { status: 'cancelled', lastError: 'no email address (SMS not available yet)' });
      result.skipped += 1;
      continue;
    }
    const message = notificationEmail(recipient.locale ?? 'en', item.template, item.payload, config.memberAppUrl);
    if (!message) {
      await finish(item.id, { status: 'failed', lastError: `unknown template ${item.template}` });
      result.failed += 1;
      continue;
    }
    try {
      await messenger.sendEmail({ to: recipient.email, ...message, idempotencyKey: item.event_key });
      await finish(item.id, { status: 'sent', sentAt: new Date(), lastError: null });
      result.sent += 1;
    } catch (err) {
      await finish(item.id, {
        status: item.attempts >= MAX_ATTEMPTS ? 'failed' : 'queued',
        lastError: (err as Error).message.slice(0, 300),
      });
      result.failed += 1;
      log.warn('jobs.notifications.send_failed', { template: item.template, attempt: item.attempts });
    }
  }
  if (claimed.length) log.info('jobs.notifications.done', result);
  return result;
}
