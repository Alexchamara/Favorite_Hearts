/**
 * Invitations to the admin site (docs/ADMIN-PANEL-PLAN.md, layer 4). The owner (or, for the very first owner, the
 * developer with scripts/staff.ts) invites a person by email and role; they get a link that works once, for 24 hours.
 * On it they choose their own password and set up two-step login before their account can do anything. Only a hash
 * of the link's token is stored, and the token sits after "#" in the link, so it never reaches a server log.
 *
 * As a Better-Auth plugin of the admin sign-in (admin/auth.ts), so the enrolment session is made by Better-Auth:
 *   POST /api/admin/auth/staff-invite/preview  { token }            → who the invitation is for
 *   POST /api/admin/auth/staff-invite/accept   { token, password }  → the account and an enrolment-only session
 */
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthEndpoint } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { MAX_PASSWORD_LENGTH, normalizeEmail, STAFF_INVITE_HOURS, STAFF_MIN_PASSWORD_LENGTH, type StaffRole } from '@fh/shared';
import type { Config } from '../config.ts';
import { session, twoFactor, user } from '../db/schema/auth.ts';
import { passkey } from '../db/schema/auth.ts';
import { staffInvite, staffMember } from '../db/schema/staff.ts';
import type { Db } from '../db/types.ts';
import { auditSystem } from '../lib/audit.ts';
import { newInvitationToken, tokenDigest } from '../lib/invitation-tokens.ts';
import { securityAlert } from '../lib/security-alerts.ts';

export const inviteLink = (adminOrigin: string, token: string) => `${adminOrigin}/invite#${token}`;

/**
 * A new invitation; any earlier open one for the same email stops working. `invitedBy` is the owner's account, or
 * null when the developer invites the first owner from the command line.
 */
export async function createStaffInvite(
  { db, config }: { db: Db; config: Pick<Config, 'adminOrigin' | 'securityAlertEmail'> },
  input: { email: string; name: string; role: StaffRole; invitedBy: { userId: string; role: string } | null },
): Promise<{ link: string; expiresAt: Date }> {
  if (!config.adminOrigin) throw new Error('ADMIN_URL is not set: there is no admin site to invite to.');
  const email = normalizeEmail(input.email);
  if (!email) throw new Error('Enter a valid email address.');
  const name = input.name.trim();
  if (!name) throw new Error('Enter the person’s name.');
  const [existing] = await db
    .select({ id: user.id, staff: staffMember.userId })
    .from(user)
    .leftJoin(staffMember, eq(staffMember.userId, user.id))
    .where(eq(user.email, email));
  if (existing && !existing.staff) {
    throw new Error('A member account already uses this email. Staff accounts are kept separate: use another address.');
  }
  const token = newInvitationToken();
  const expiresAt = new Date(Date.now() + STAFF_INVITE_HOURS * 3_600_000);
  await db.transaction(async (tx) => {
    await tx
      .update(staffInvite)
      .set({ revokedAt: new Date() })
      .where(and(eq(staffInvite.email, email), isNull(staffInvite.consumedAt), isNull(staffInvite.revokedAt)));
    const [created] = await tx
      .insert(staffInvite)
      .values({ email, name, role: input.role, tokenHash: tokenDigest(token), invitedByUserId: input.invitedBy?.userId ?? null, expiresAt })
      .returning({ id: staffInvite.id });
    await auditSystem(tx, {
      action: 'staff.invited',
      entityType: 'staff_invite',
      entityId: created!.id,
      actor: input.invitedBy,
      metadata: { role: input.role, byCommandLine: input.invitedBy === null },
    });
    await securityAlert(tx, config, { key: `invite:${created!.id}`, kind: 'staff_invited', staff: { name, email }, details: { role: input.role } });
  });
  return { link: inviteLink(config.adminOrigin, token), expiresAt };
}

const tokenSchema = z.object({ token: z.string().min(20).max(100) });
const acceptSchema = tokenSchema.extend({ password: z.string() });

async function openInvite(db: Db, token: string) {
  const [invite] = await db
    .select()
    .from(staffInvite)
    .where(and(eq(staffInvite.tokenHash, tokenDigest(token)), isNull(staffInvite.consumedAt), isNull(staffInvite.revokedAt), gt(staffInvite.expiresAt, new Date())));
  // One answer for unknown, used, replaced and expired links: the link itself is the only secret.
  if (!invite) throw new APIError('GONE', { code: 'INVITE_INVALID', message: 'This invitation link has expired or was already used. Ask the owner for a new one.' });
  return invite;
}

export function staffInvites({ db, config }: { db: Db; config: Config }) {
  return {
    id: 'staff-invites',
    endpoints: {
      previewStaffInvite: createAuthEndpoint('/staff-invite/preview', { method: 'POST', body: tokenSchema }, async (ctx) => {
        const invite = await openInvite(db, ctx.body.token);
        return ctx.json({ name: invite.name, email: invite.email, role: invite.role, expiresAt: invite.expiresAt.toISOString() });
      }),

      acceptStaffInvite: createAuthEndpoint('/staff-invite/accept', { method: 'POST', body: acceptSchema }, async (ctx) => {
        const { token, password } = ctx.body;
        if (password.length < STAFF_MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
          throw new APIError('BAD_REQUEST', {
            code: 'VALIDATION',
            message: `The password must be ${STAFF_MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters.`,
          });
        }
        const invite = await openInvite(db, token);
        const passwordHash = await ctx.context.password.hash(password);
        // Taken first, so the same link cannot be used twice at once.
        const [taken] = await db
          .update(staffInvite)
          .set({ consumedAt: new Date() })
          .where(and(eq(staffInvite.id, invite.id), isNull(staffInvite.consumedAt)))
          .returning({ id: staffInvite.id });
        if (!taken) throw new APIError('GONE', { code: 'INVITE_INVALID', message: 'This invitation link was already used.' });

        const [existing] = await db.select().from(user).where(eq(user.email, invite.email));
        let userId: string;
        if (existing) {
          // A returning staff member (left and came back, or lost their devices): a fresh start. Their old password,
          // two-step login, passkeys and sessions all stop working.
          const [staff] = await db.select().from(staffMember).where(eq(staffMember.userId, existing.id));
          if (!staff) throw new APIError('CONFLICT', { code: 'STAFF_EMAIL_IN_USE', message: 'A member account already uses this email.' });
          userId = existing.id;
          await db.delete(session).where(eq(session.userId, userId));
          await db.delete(twoFactor).where(eq(twoFactor.userId, userId));
          await db.delete(passkey).where(eq(passkey.userId, userId));
          await db.update(user).set({ twoFactorEnabled: false, name: invite.name, emailVerified: true }).where(eq(user.id, userId));
          const accounts = await ctx.context.internalAdapter.findAccounts(userId);
          const credential = accounts.find((a) => a.providerId === 'credential');
          if (credential) await ctx.context.internalAdapter.updatePassword(userId, passwordHash);
          else await ctx.context.internalAdapter.linkAccount({ userId, providerId: 'credential', accountId: userId, password: passwordHash });
          await db
            .update(staffMember)
            .set({ role: invite.role, revokedAt: null, grantedBy: invite.invitedByUserId, grantedAt: new Date() })
            .where(eq(staffMember.userId, userId));
        } else {
          const created = await ctx.context.internalAdapter.createUser({ email: invite.email, name: invite.name, emailVerified: true }, { method: 'admin' });
          userId = created.id;
          await ctx.context.internalAdapter.linkAccount({ userId, providerId: 'credential', accountId: userId, password: passwordHash });
          await db.insert(staffMember).values({ userId, role: invite.role, grantedBy: invite.invitedByUserId });
        }
        await auditSystem(db, {
          action: 'staff.invite_accepted',
          entityType: 'staff_invite',
          entityId: invite.id,
          actor: { userId, role: invite.role },
          metadata: { returning: Boolean(existing) },
        });
        await securityAlert(db, config, {
          key: `joined:${invite.id}`,
          kind: 'staff_joined',
          staff: { name: invite.name, email: invite.email },
          details: { role: invite.role, next: 'They must set up two-step login before they can do anything.' },
        });

        // Enrolment only (admin/auth.ts): two-step login and passkeys can be set up; nothing else works until they
        // sign in again with them.
        const fresh = await ctx.context.internalAdapter.findUserById(userId);
        const created = await ctx.context.internalAdapter.createSession(userId, false);
        if (!created || !fresh) throw new APIError('INTERNAL_SERVER_ERROR', { message: 'Could not start the session.' });
        await setSessionCookie(ctx, { session: created, user: fresh });
        return ctx.json({ enrolment: true, role: invite.role });
      }),
    },
  } satisfies BetterAuthPlugin;
}
