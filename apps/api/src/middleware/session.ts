import { and, eq, isNull } from 'drizzle-orm';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import type { StaffRole } from '@fh/shared';
import { auth, type AuthSession } from '../auth.ts';
import { db } from '../db/client.ts';
import { staffMember } from '../db/schema/staff.ts';

export type AppEnv = {
  Variables: {
    session: AuthSession['session'] | null;
    user: AuthSession['user'] | null;
  };
};

/** Loads the Better-Auth session (if any) for every request. */
export const loadSession = createMiddleware<AppEnv>(async (c, next) => {
  const result = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set('session', result?.session ?? null);
  c.set('user', result?.user ?? null);
  await next();
});

/** 401 unless signed in. */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get('user')) throw new HTTPException(401, { message: 'Please sign in.' });
  await next();
});

/**
 * Staff gate, enforced on the server (D10): active staff role AND two-step login enabled.
 * Payment routes must use requireStaff('owner') only — the backup reviewer never qualifies.
 */
export function requireStaff(...roles: StaffRole[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get('user');
    if (!user) throw new HTTPException(401, { message: 'Please sign in.' });
    const [row] = await db
      .select({ role: staffMember.role })
      .from(staffMember)
      .where(and(eq(staffMember.userId, user.id), isNull(staffMember.revokedAt)))
      .limit(1);
    if (!row || !roles.includes(row.role)) throw new HTTPException(403, { message: 'Not allowed.' });
    if (!user.twoFactorEnabled) throw new HTTPException(403, { message: 'Two-step login is required for staff.' });
    await next();
  });
}
