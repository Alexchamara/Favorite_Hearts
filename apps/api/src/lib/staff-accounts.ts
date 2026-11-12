/**
 * Staff accounts (OWNER-DECISIONS section 10): the owner and one backup reviewer, each a separate
 * account with a password and two-step login. There is no public staff sign-up.
 *
 * People join the admin site (docs/ADMIN-PANEL-PLAN.md) from an invitation link (admin/invites.ts) and choose their
 * own password; nobody else ever types it. scripts/staff.ts `invite` makes the first owner's link. Revoking and
 * resetting are audited and email the owner's security mailbox.
 */
import { and, eq, isNull } from 'drizzle-orm';
import { normalizeEmail } from '@fh/shared';
import type { Config } from '../config.ts';
import { passkey, session, twoFactor, user } from '../db/schema/auth.ts';
import { staffMember } from '../db/schema/staff.ts';
import type { Db } from '../db/types.ts';
import { auditSystem } from './audit.ts';
import { securityAlert } from './security-alerts.ts';

async function findUser(db: Db, email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new Error('Enter a valid email address.');
  const [row] = await db.select().from(user).where(eq(user.email, normalized));
  return { normalized, row };
}

type Recorded = { db: Db; config?: Pick<Config, 'securityAlertEmail'> };
/** Who did it: the owner's account on the admin site, or null for the developer's command line. */
type By = { userId: string; role: string } | null;

/** Immediate removal (spec S05): role revoked and every session ended. */
export async function revokeStaff({ db, config }: Recorded, email: string, by: By = null): Promise<void> {
  const { row } = await findUser(db, email);
  if (!row) throw new Error('No account with this email.');
  await db
    .update(staffMember)
    .set({ revokedAt: new Date() })
    .where(and(eq(staffMember.userId, row.id), isNull(staffMember.revokedAt)));
  await db.delete(session).where(eq(session.userId, row.id));
  await auditSystem(db, { action: 'staff.revoked', entityType: 'staff_member', entityId: row.id, actor: by, metadata: { byCommandLine: by === null } });
  if (config) await securityAlert(db, config, { key: `revoked:${row.id}:${Date.now()}`, kind: 'staff_revoked', staff: { name: row.name, email: row.email } });
}

/**
 * Lost authenticator (spec S05): first try a backup code. If those are lost too, the developer and
 * the owner run this together; it turns two-step login off and ends all sessions, and staff powers
 * stay blocked until the person sets it up again at their next sign-in.
 */
export async function resetTwoFactor({ db, config }: Recorded, email: string, by: By = null): Promise<void> {
  const { row } = await findUser(db, email);
  if (!row) throw new Error('No account with this email.');
  await db.delete(twoFactor).where(eq(twoFactor.userId, row.id));
  await db.delete(passkey).where(eq(passkey.userId, row.id));
  await db.update(user).set({ twoFactorEnabled: false }).where(eq(user.id, row.id));
  await db.delete(session).where(eq(session.userId, row.id));
  await auditSystem(db, { action: 'staff.two_factor_reset', entityType: 'staff_member', entityId: row.id, actor: by, metadata: { byCommandLine: by === null } });
  if (config) await securityAlert(db, config, { key: `reset:${row.id}:${Date.now()}`, kind: 'staff_two_factor_reset', staff: { name: row.name, email: row.email } });
}
