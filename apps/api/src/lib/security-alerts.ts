/**
 * Security alerts to the owner's dedicated mailbox (docs/ADMIN-PANEL-PLAN.md, layer 10; decision A7). Queued in
 * notification_outbox, so the notifications.send job delivers them with retries like every other email. One alert per
 * `key`: the same event never sends twice. Alerts name the staff member and what happened, never a code, password,
 * document or member contact detail. Without a mailbox (development) they are logged instead; the audit trail has the
 * event either way.
 */
import type { Config } from '../config.ts';
import { notificationOutbox } from '../db/schema/operations.ts';
import type { Db } from '../db/types.ts';
import type { Tx } from '../http.ts';
import { log } from './log.ts';

export const SECURITY_ALERT_KINDS = [
  'new_device_sign_in',
  'account_locked',
  'two_factor_changed',
  'passkey_changed',
  'backup_codes_regenerated',
  'password_changed',
  'staff_invited',
  'staff_joined',
  'staff_revoked',
  'staff_two_factor_reset',
  'payment_details_changed',
] as const;
export type SecurityAlertKind = (typeof SECURITY_ALERT_KINDS)[number];

export type SecurityAlert = {
  /** Unique per event, e.g. `lock:<user>:<until>`. */
  key: string;
  kind: SecurityAlertKind;
  /** Who it is about (a staff member's name and email: the owner's own mailbox may see them). */
  staff?: { name: string; email: string } | null;
  /** Plain facts for the email, e.g. { device: 'Chrome on macOS', network: '203.0.113.0/24' }. */
  details?: Record<string, string>;
};

export async function securityAlert(db: Db | Tx, config: Pick<Config, 'securityAlertEmail'>, alert: SecurityAlert): Promise<void> {
  if (!config.securityAlertEmail) {
    log.warn('security_alert.not_sent', { kind: alert.kind, reason: 'SECURITY_ALERT_EMAIL is not set' });
    return;
  }
  await db
    .insert(notificationOutbox)
    .values({
      eventKey: `security:${alert.key}`,
      recipientAddress: config.securityAlertEmail,
      channel: 'email',
      template: 'security_alert',
      payload: { kind: alert.kind, staff: alert.staff ?? null, details: alert.details ?? {}, at: new Date().toISOString() },
    })
    .onConflictDoNothing();
}
