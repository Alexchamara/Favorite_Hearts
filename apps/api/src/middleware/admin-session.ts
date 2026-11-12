/**
 * The admin site's request pipeline (docs/ADMIN-PANEL-PLAN.md). Every request under /api/admin goes through, in order:
 *
 *  1. adminRequestGuard  layer 1 and 7: Cloudflare Access's signed token (when configured), the X-FH-Admin header,
 *                        the admin site's own Origin on every change, and JSON bodies only.
 *  2. loadAdminSession   layer 2 and 5: the admin sign-in's session (never a member one), still within 8 hours and
 *                        30 idle minutes, opened with a passkey or a two-step code, for an active staff member whose
 *                        email is the one Access signed in.
 *  3. adminPolicy        layer 6 and 8: the route's permission (default deny), step-up, viewing audit and alerts.
 *
 * It sets the same request variables as the member pipeline (user, session, staffRole, actor), so the staff and owner
 * routes and the database's row-level security work unchanged underneath.
 */
import { and, eq, isNull } from 'drizzle-orm';
import { createMiddleware } from 'hono/factory';
import { ADMIN_IDLE_MINUTES, ADMIN_REQUEST_HEADER, hasPermission, permissionsOf } from '@fh/shared';
import { ACCESS_HEADER } from '../admin/access.ts';
import { isStrongFactor, stepUpFresh, type AdminSession } from '../admin/auth.ts';
import { routePolicy } from '../admin/policy.ts';
import { session as sessionTable } from '../db/schema/auth.ts';
import { staffMember } from '../db/schema/staff.ts';
import { withActor, type AppEnv } from '../http.ts';
import { audit } from '../lib/audit.ts';
import { securityAlert } from '../lib/security-alerts.ts';

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** How often last-activity is written back (not on every request). */
const TOUCH_SECONDS = 60;

const deny = (status: 400 | 401 | 403 | 404 | 415, code: string, message: string) => Response.json({ code, message }, { status });

export const adminRequestGuard = createMiddleware<AppEnv>(async (c, next) => {
  const { config, accessVerifier } = c.var.deps;
  if (!config.adminOrigin) return deny(404, 'NOT_FOUND', 'Not found.');

  // Layer 1: only requests Cloudflare Access let through (production; development has no Access).
  if (accessVerifier) {
    const identity = await accessVerifier(c.req.header(ACCESS_HEADER));
    if (!identity) return deny(403, 'ACCESS_REQUIRED', 'Open the admin site through its own address.');
    c.set('accessEmail', identity.email);
  }

  // Layer 7: the admin site's own requests only. A link or form on another site cannot add this header, and a
  // script on another site cannot send it without a CORS check the API never passes for admin paths.
  if (c.req.header(ADMIN_REQUEST_HEADER) !== '1') return deny(403, 'ADMIN_HEADER_REQUIRED', 'This request did not come from the admin site.');
  const fetchSite = c.req.header('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin') return deny(403, 'CROSS_SITE', 'This request did not come from the admin site.');
  if (UNSAFE.has(c.req.method)) {
    if (c.req.header('origin') !== config.adminOrigin) return deny(403, 'BAD_ORIGIN', 'This request did not come from the admin site.');
    const hasBody = c.req.raw.body !== null && c.req.header('content-length') !== '0';
    const type = (c.req.header('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
    if (hasBody && type !== 'application/json') return deny(415, 'JSON_ONLY', 'Admin requests send JSON only.');
  }
  await next();
});

export const loadAdminSession = createMiddleware<AppEnv>(async (c, next) => {
  const { adminAuth, db } = c.var.deps;
  c.set('user', null);
  c.set('session', null);
  c.set('staffRole', null);
  c.set('actor', null);
  if (!adminAuth) return deny(404, 'NOT_FOUND', 'Not found.');
  const result = (await adminAuth.api.getSession({ headers: c.req.raw.headers })) as AdminSession | null;
  if (!result || result.session.realm !== 'admin') return deny(401, 'UNAUTHENTICATED', 'Sign in on the admin site.');
  const { user, session } = result;

  // Layer 5: 30 idle minutes end the session (the 8-hour limit is the session's own expiry).
  const lastActive = new Date(session.lastActiveAt ?? session.createdAt).getTime();
  if (Date.now() - lastActive > ADMIN_IDLE_MINUTES * 60_000) {
    await db.delete(sessionTable).where(eq(sessionTable.id, session.id));
    return deny(401, 'SESSION_IDLE', 'You were signed out after 30 minutes without activity. Sign in again.');
  }

  const [staff] = await db
    .select({ role: staffMember.role })
    .from(staffMember)
    .where(and(eq(staffMember.userId, user.id), isNull(staffMember.revokedAt)));
  if (!staff) {
    await db.delete(sessionTable).where(eq(sessionTable.userId, user.id));
    return deny(401, 'UNAUTHENTICATED', 'This account no longer has staff access.');
  }
  // The person Cloudflare Access let in must be the person signing in.
  const accessEmail = c.var.accessEmail;
  if (accessEmail && accessEmail !== user.email.toLowerCase()) {
    return deny(403, 'ACCESS_MISMATCH', 'Sign in with the same email you used for the admin site’s door.');
  }

  if (Date.now() - lastActive > TOUCH_SECONDS * 1000) {
    await db.update(sessionTable).set({ lastActiveAt: new Date() }).where(eq(sessionTable.id, session.id));
  }

  const enrolment = session.amr === 'enrolment';
  if (!enrolment && !isStrongFactor(session.amr)) return deny(401, 'UNAUTHENTICATED', 'Sign in again.');
  // An invitation's session only sets up two-step login (admin/auth.ts); here it can only ask who it is.
  if (enrolment && !(c.req.method === 'GET' && c.req.path === '/api/admin/me')) {
    return deny(403, 'ENROLMENT_INCOMPLETE', 'Finish setting up two-step login, then sign in again.');
  }

  c.set('user', user as unknown as AppEnv['Variables']['user']);
  c.set('session', session as unknown as AppEnv['Variables']['session']);
  c.set('staffRole', staff.role);
  c.set('actor', { userId: user.id, role: user.twoFactorEnabled && !enrolment ? staff.role : 'member' });
  await next();
});

export const adminPolicy = createMiddleware<AppEnv>(async (c, next) => {
  const path = c.req.path.replace(/^\/api\/admin/, '') || '/';
  const policy = routePolicy(c.req.method, path);
  if (!policy) return deny(403, 'NO_POLICY', 'This admin action is not allowed.');
  if (!hasPermission(c.var.staffRole, policy.permission)) return deny(403, 'FORBIDDEN', 'Your role cannot do this.');
  const session = c.var.session as unknown as { stepUpAt?: Date | string | null } | null;
  if (policy.stepUp && !stepUpFresh(session?.stepUpAt)) {
    return deny(403, 'STEP_UP_REQUIRED', 'Confirm it is you with your passkey or a two-step code first.');
  }
  await next();
  if (c.res.status >= 400) return;
  if (policy.viewed && c.req.method === 'GET') {
    const entityId = path.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi)?.at(-1);
    await withActor(c, (tx) => audit(c, tx, { action: policy.viewed!.action, entityType: policy.viewed!.entityType, entityId }));
  }
  if (policy.alert) {
    const user = c.var.user!;
    await securityAlert(c.var.deps.db, c.var.deps.config, {
      key: `${policy.alert}:${c.var.requestId}`,
      kind: policy.alert,
      staff: { name: user.name, email: user.email },
      details: { change: `${c.req.method} ${path}` },
    });
  }
});

/** GET /api/admin/me: who is signed in, what they may do, and whether they still need to finish setting up. */
export function adminMe(c: Parameters<Parameters<typeof createMiddleware<AppEnv>>[0]>[0]) {
  const user = c.var.user!;
  const session = c.var.session as unknown as { amr?: string | null; stepUpAt?: Date | string | null; expiresAt: Date | string };
  const enrolment = session.amr === 'enrolment';
  return c.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: c.var.staffRole,
    enrolment,
    twoFactorEnabled: Boolean(user.twoFactorEnabled),
    factor: session.amr,
    stepUpFresh: stepUpFresh(session.stepUpAt),
    sessionExpiresAt: new Date(session.expiresAt).toISOString(),
    idleMinutes: ADMIN_IDLE_MINUTES,
    permissions: enrolment ? [] : permissionsOf(c.var.staffRole),
  });
}
