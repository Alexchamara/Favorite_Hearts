import { and, eq, isNull } from 'drizzle-orm';
import { createMiddleware } from 'hono/factory';
import type { StaffRole } from '@fh/shared';
import { memberAccount } from '../db/schema/members.ts';
import { operationsFlag } from '../db/schema/operations.ts';
import { staffMember } from '../db/schema/staff.ts';
import { fail, withActor, type AppEnv } from '../http.ts';

/**
 * Loads the Better-Auth session (if any) and decides the actor that row-level security sees.
 * A staff role counts only with two-step login enabled; the database re-checks both.
 */
export const loadSession = createMiddleware<AppEnv>(async (c, next) => {
  const { auth, db } = c.var.deps;
  const result = await auth.api.getSession({ headers: c.req.raw.headers });
  const user = result?.user ?? null;
  let staffRole: StaffRole | null = null;
  if (user) {
    const [row] = await db
      .select({ role: staffMember.role })
      .from(staffMember)
      .where(and(eq(staffMember.userId, user.id), isNull(staffMember.revokedAt)))
      .limit(1);
    staffRole = row?.role ?? null;
  }
  c.set('user', user);
  c.set('session', result?.session ?? null);
  c.set('staffRole', staffRole);
  c.set('actor', user ? { userId: user.id, role: staffRole && user.twoFactorEnabled ? staffRole : 'member' } : null);
  await next();
});

/** 401 unless signed in. */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.var.user) fail(401, 'UNAUTHENTICATED', 'Please sign in.');
  await next();
});

/**
 * Signed-in member with an active account. The member account is created on first use, unless
 * the owner has paused new sign-ups (OWNER-DECISIONS section 10). Staff accounts are separate.
 */
export const requireMember = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.var.user;
  if (!user) fail(401, 'UNAUTHENTICATED', 'Please sign in.');
  if (c.var.staffRole) fail(403, 'STAFF_ACCOUNT', 'Staff accounts cannot use the member app.');
  const account = await withActor(c, async (tx) => {
    const [existing] = await tx.select().from(memberAccount).where(eq(memberAccount.userId, user.id));
    if (existing) return existing;
    const [paused] = await tx.select().from(operationsFlag).where(eq(operationsFlag.key, 'signups_paused'));
    if (paused?.enabled) fail(403, 'SIGNUPS_PAUSED', 'New sign-ups are paused for now. Please try again later.');
    await tx.insert(memberAccount).values({ userId: user.id });
    const [created] = await tx.select().from(memberAccount).where(eq(memberAccount.userId, user.id));
    return created!;
  });
  if (account.status !== 'active') fail(403, 'ACCOUNT_SUSPENDED', 'This account is not active. Please contact support.');
  await next();
});

/**
 * Staff gate, enforced on the server (D10): active staff role AND two-step login enabled.
 * Payment routes must use requireStaff('owner') only — the backup reviewer never qualifies.
 */
export function requireStaff(...roles: StaffRole[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.var.user;
    if (!user) fail(401, 'UNAUTHENTICATED', 'Please sign in.');
    if (!c.var.staffRole || !roles.includes(c.var.staffRole)) fail(403, 'FORBIDDEN', 'Not allowed.');
    if (!user.twoFactorEnabled) fail(403, 'TWO_FACTOR_REQUIRED', 'Two-step login is required for staff.');
    await next();
  });
}
