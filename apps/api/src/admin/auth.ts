/**
 * The admin site's own sign-in (docs/ADMIN-PANEL-PLAN.md, layers 2 to 6): a second Better-Auth instance on the same
 * users table, separate from the member app's in everything that matters.
 *
 *  - Its own key (derived from the auth secret), cookie name (fha.*, SameSite=Strict, host-only on the admin site)
 *    and path (/api/admin/auth). A member cookie means nothing here, and an admin cookie nothing in the member app.
 *  - Staff only: an invitation link (admin/invites.ts) creates the account; nobody can sign up. The password is the
 *    person's own (12 characters or more), and before anything works they set up an authenticator app (TOTP, with
 *    backup codes) and, ideally, a passkey (decision A3).
 *  - A session is for staff work only when it was opened with a passkey, or a password plus a two-step or backup code
 *    (its `amr`). The short session an invitation opens can only set up two-step login and passkeys.
 *  - Sessions last 8 hours at most and end after 30 idle minutes (middleware/admin-session.ts). Risky actions need a
 *    passkey or code from the last 5 minutes ("step-up"): passkey and two-step settings here, and the admin routes
 *    marked so in admin/policy.ts.
 *  - Wrong codes: 5 in a row lock the account for 15 minutes (Better-Auth's own account lock-out) and email the owner.
 *    Wrong passwords: 5 for one address in 15 minutes lock it, as for members.
 *  - "Trust this device" is refused: every sign-in asks for the second factor.
 */
import { createHmac } from 'node:crypto';
import { passkey as passkeyPlugin } from '@better-auth/passkey';
import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware, getSessionFromCtx, isAPIError } from 'better-auth/api';
import { twoFactor } from 'better-auth/plugins';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { and, eq, isNull } from 'drizzle-orm';
import {
  ADMIN_FACTOR_FAILURE_LIMIT,
  ADMIN_FACTOR_LOCK_MINUTES,
  ADMIN_SESSION_HOURS,
  ADMIN_STEP_UP_MINUTES,
  ADMIN_STRONG_FACTORS,
  LOGIN_FAILURE_LIMIT,
  LOGIN_LOCK_MINUTES,
  MAX_PASSWORD_LENGTH,
  normalizeEmail,
  STAFF_MIN_PASSWORD_LENGTH,
  type AdminFactor,
} from '@fh/shared';
import type { Config } from '../config.ts';
import { account, passkey, session, twoFactor as twoFactorTable, user, verification } from '../db/schema/auth.ts';
import { staffDevice, staffMember } from '../db/schema/staff.ts';
import type { Db } from '../db/types.ts';
import { auditSystem, shortIp, shortUserAgent, type AuditOrigin } from '../lib/audit.ts';
import { hasherFor } from '../lib/identity-hash.ts';
import { authRateLimitStorage, clearCounter, consume, overLimit } from '../lib/rate-limit.ts';
import { securityAlert, type SecurityAlertKind } from '../lib/security-alerts.ts';
import { staffInvites } from './invites.ts';

export const ADMIN_AUTH_BASE_PATH = '/api/admin/auth';

/** The admin sign-in's own key: cookies and stored two-step secrets made by one instance mean nothing to the other. */
export const adminSecret = (authSecret: string) =>
  createHmac('sha256', authSecret).update('favorite-hearts/admin-auth/v1').digest('base64url');

/** Session fields both sign-ins declare (they share the table; the member app's sessions keep the defaults). */
export const SESSION_FIELDS = {
  realm: { type: 'string', required: false, defaultValue: 'member', input: false },
  amr: { type: 'string', required: false, input: false },
  stepUpAt: { type: 'date', required: false, input: false },
  lastActiveAt: { type: 'date', required: false, input: false },
} as const;

const HOUR = 3_600;
const ENROLMENT_SECONDS = HOUR;
const LOGIN_FAILURES = { window: LOGIN_LOCK_MINUTES * 60, max: LOGIN_FAILURE_LIMIT };

export const isStrongFactor = (amr: unknown): amr is (typeof ADMIN_STRONG_FACTORS)[number] =>
  (ADMIN_STRONG_FACTORS as readonly unknown[]).includes(amr);

export const stepUpFresh = (stepUpAt: Date | string | null | undefined, now = Date.now()) =>
  Boolean(stepUpAt) && now - new Date(stepUpAt!).getTime() <= ADMIN_STEP_UP_MINUTES * 60_000;

/** What an invitation's enrolment session may call: set up two-step login and passkeys, look, sign out. */
const ENROLMENT_PATHS = new Set([
  '/get-session',
  '/sign-out',
  '/two-factor/enable',
  '/two-factor/verify-totp',
  '/passkey/generate-register-options',
  '/passkey/verify-registration',
  '/passkey/list-user-passkeys',
]);
/** Sign-in settings that change how the account is protected: a passkey or code from the last 5 minutes first. */
const STEP_UP_PATHS = new Set([
  '/two-factor/enable',
  '/two-factor/disable',
  '/two-factor/generate-backup-codes',
  '/passkey/generate-register-options',
  '/passkey/verify-registration',
  '/passkey/delete-passkey',
  '/passkey/update-passkey',
  '/change-password',
  '/revoke-sessions',
  '/revoke-other-sessions',
]);
/** Endpoints used before there is a session (or that make a new one); no session gate applies. */
const NO_SESSION_PATHS = new Set([
  '/sign-in/email',
  '/passkey/generate-authenticate-options',
  '/passkey/verify-authentication',
  '/two-factor/verify-backup-code',
  '/staff-invite/preview',
  '/staff-invite/accept',
  '/ok',
  '/error',
]);
/** Settings changes worth an alert to the owner, by endpoint. */
const CHANGE_ALERTS: Record<string, SecurityAlertKind> = {
  '/two-factor/verify-totp': 'two_factor_changed',
  '/two-factor/disable': 'two_factor_changed',
  '/two-factor/generate-backup-codes': 'backup_codes_regenerated',
  '/passkey/verify-registration': 'passkey_changed',
  '/passkey/delete-passkey': 'passkey_changed',
  '/change-password': 'password_changed',
};

const refuse = (status: 'UNAUTHORIZED' | 'FORBIDDEN', code: string, message: string) => new APIError(status, { code, message });
const WRONG_PASSWORD = () => refuse('UNAUTHORIZED', 'INVALID_EMAIL_OR_PASSWORD', 'Invalid email or password');

type SessionLike = { id: string; userId: string; amr?: string | null; stepUpAt?: Date | null; realm?: string | null };

export function createAdminAuth({ db, config }: { db: Db; config: Config }) {
  const origin = config.adminOrigin;
  if (!origin) throw new Error('createAdminAuth needs config.adminOrigin');
  const hash = hasherFor(config.authSecret);
  const deviceKey = hasherFor(`${config.authSecret}:staff-device`);
  const ipOf = (headers: Headers | undefined) =>
    (config.clientIpHeader ? headers?.get(config.clientIpHeader)?.split(',')[0]?.trim() : undefined) ?? null;
  const originOf = (headers: Headers | undefined, sessionId?: string | null): AuditOrigin => ({
    sessionId: sessionId ?? null,
    ip: shortIp(ipOf(headers)),
    userAgent: shortUserAgent(headers?.get('user-agent')),
    correlationId: headers?.get('x-request-id') ?? null,
  });

  /** The active staff row and account, or null (no account, not staff, or revoked). */
  async function activeStaff(userId: string) {
    const [row] = await db
      .select({ id: user.id, name: user.name, email: user.email, twoFactorEnabled: user.twoFactorEnabled, role: staffMember.role })
      .from(user)
      .innerJoin(staffMember, and(eq(staffMember.userId, user.id), isNull(staffMember.revokedAt)))
      .where(eq(user.id, userId));
    return row ?? null;
  }

  async function alert(kind: SecurityAlertKind, key: string, staff: { name: string; email: string } | null, details?: Record<string, string>) {
    await securityAlert(db, config, { key, kind, staff, details });
  }

  /** The user a two-step challenge belongs to (Better-Auth's signed two_factor cookie), for failure records. */
  async function challengeUser(ctx: Parameters<Parameters<typeof createAuthMiddleware>[0]>[0]): Promise<string | null> {
    try {
      const cookie = ctx.context.createAuthCookie('two_factor');
      const signed = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
      if (!signed) return null;
      const found = await ctx.context.internalAdapter.findVerificationValue(signed);
      return found?.value ?? null;
    } catch {
      return null;
    }
  }

  return betterAuth({
    appName: 'Favorite Hearts Admin',
    baseURL: origin,
    basePath: ADMIN_AUTH_BASE_PATH,
    secret: adminSecret(config.authSecret),
    trustedOrigins: [origin],
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user, session, account, verification, twoFactor: twoFactorTable, passkey },
    }),

    // Nothing on the admin site creates or changes an account except an invitation: no sign-up, no reset by email
    // (a lost password is a new invitation from the owner), no profile edits, no linked accounts.
    disabledPaths: [
      '/sign-up/email',
      '/request-password-reset',
      '/reset-password',
      '/forget-password',
      '/verify-email',
      '/send-verification-email',
      '/change-email',
      '/update-user',
      '/delete-user',
      '/delete-user/callback',
      '/link-social',
      '/unlink-account',
      '/list-accounts',
      '/account-info',
      '/refresh-token',
      '/get-access-token',
      '/update-session',
      '/two-factor/send-otp',
      '/two-factor/verify-otp',
      '/two-factor/get-totp-uri',
    ],

    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: STAFF_MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
    },

    // At most 8 hours, never extended (no sliding renewal); the 30-minute idle limit is checked per request.
    session: {
      expiresIn: ADMIN_SESSION_HOURS * HOUR,
      updateAge: ADMIN_SESSION_HOURS * HOUR,
      freshAge: ADMIN_SESSION_HOURS * HOUR,
      additionalFields: SESSION_FIELDS,
    },

    rateLimit: {
      enabled: config.rateLimit,
      window: 60,
      max: 60,
      customStorage: { consume: (key: string, rule: { window: number; max: number }) => authRateLimitStorage(db).consume(`admin:${key}`, rule) },
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/two-factor/verify-totp': { window: 60, max: 5 },
        '/two-factor/verify-backup-code': { window: 60, max: 5 },
        '/passkey/generate-authenticate-options': { window: 60, max: 10 },
        '/passkey/verify-authentication': { window: 60, max: 10 },
        '/staff-invite/preview': { window: 60, max: 10 },
        '/staff-invite/accept': { window: 60, max: 5 },
        '/change-password': { window: 60, max: 5 },
      },
    },

    advanced: {
      cookiePrefix: 'fha',
      useSecureCookies: origin.startsWith('https:'),
      defaultCookieAttributes: { sameSite: 'strict', httpOnly: true },
      ...(config.clientIpHeader ? { ipAddress: { ipAddressHeaders: [config.clientIpHeader] } } : {}),
    },

    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const body = (ctx.body ?? {}) as Record<string, unknown>;
        if (body.trustDevice) throw refuse('FORBIDDEN', 'TRUST_DEVICE_OFF', 'Every admin sign-in asks for the second step.');

        if (ctx.path === '/sign-in/email') {
          const email = typeof body.email === 'string' ? normalizeEmail(body.email) : null;
          if (!email) throw WRONG_PASSWORD();
          const key = `admin-login-fail:${hash(email)}`;
          const locked = await overLimit(db, key, LOGIN_FAILURES);
          if (!locked.allowed) {
            throw new APIError('TOO_MANY_REQUESTS', { code: 'LOGIN_LOCKED', message: 'Too many wrong passwords. Try again in 15 minutes.' });
          }
          // Only staff who have set up two-step login sign in here. Anyone else gets the wrong-password answer, so the
          // form tells nobody who is staff, and it counts against the address like a wrong password.
          const [found] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
          const staff = found ? await activeStaff(found.id) : null;
          if (!staff?.twoFactorEnabled) {
            await consume(db, key, LOGIN_FAILURES);
            throw WRONG_PASSWORD();
          }
          return;
        }
        if (NO_SESSION_PATHS.has(ctx.path)) return;

        const current = await getSessionFromCtx(ctx);
        if (!current) return; // Better-Auth refuses session endpoints itself
        const s = current.session as unknown as SessionLike;
        if (s.realm !== 'admin') throw refuse('UNAUTHORIZED', 'UNAUTHENTICATED', 'Sign in on the admin site.');
        if (s.amr === 'enrolment') {
          if (!ENROLMENT_PATHS.has(ctx.path)) {
            throw refuse('FORBIDDEN', 'ENROLMENT_INCOMPLETE', 'Finish setting up two-step login, then sign in again.');
          }
          const enabled = Boolean(current.user.twoFactorEnabled);
          // The authenticator app comes first, so every account has a fallback before it has a passkey.
          if (ctx.path.startsWith('/passkey/') && ctx.path !== '/passkey/list-user-passkeys' && !enabled) {
            throw refuse('FORBIDDEN', 'TOTP_FIRST', 'Set up the authenticator app first, then add a passkey.');
          }
          if (ctx.path === '/two-factor/enable' && enabled) {
            throw refuse('FORBIDDEN', 'ENROLMENT_INCOMPLETE', 'Two-step login is already set up. Sign in again to change it.');
          }
          return;
        }
        if (!isStrongFactor(s.amr)) throw refuse('UNAUTHORIZED', 'UNAUTHENTICATED', 'Sign in again.');
        if (STEP_UP_PATHS.has(ctx.path) && !stepUpFresh(s.stepUpAt)) {
          throw refuse('FORBIDDEN', 'STEP_UP_REQUIRED', 'Confirm it is you with your passkey or a two-step code first.');
        }
      }),

      after: createAuthMiddleware(async (ctx) => {
        const returned = ctx.context.returned;
        const failed = isAPIError(returned);
        const headers = ctx.headers;

        // Wrong passwords count against the address; a right one clears its count.
        if (ctx.path === '/sign-in/email') {
          const email = normalizeEmail(String((ctx.body as Record<string, unknown> | undefined)?.email ?? ''));
          if (!email) return;
          const key = `admin-login-fail:${hash(email)}`;
          if (failed && returned.statusCode === 401) {
            await consume(db, key, LOGIN_FAILURES);
            await auditSystem(db, { action: 'staff.sign_in_failed', entityType: 'auth', metadata: { step: 'password' }, origin: originOf(headers) });
          } else if (!failed) {
            await clearCounter(db, key);
          }
          return;
        }

        // Wrong two-step or backup codes: recorded, and a lock-out (5 in a row) emails the owner once.
        if ((ctx.path === '/two-factor/verify-totp' || ctx.path === '/two-factor/verify-backup-code') && failed) {
          const current = await getSessionFromCtx(ctx).catch(() => null);
          const userId = current?.user.id ?? (await challengeUser(ctx));
          const staff = userId ? await activeStaff(userId) : null;
          await auditSystem(db, {
            action: 'staff.code_failed',
            entityType: 'auth',
            entityId: userId ?? undefined,
            actor: staff ? { userId: staff.id, role: staff.role } : null,
            metadata: { step: ctx.path.endsWith('backup-code') ? 'backup_code' : 'totp', status: returned.statusCode },
            origin: originOf(headers, current?.session.id),
          });
          if (userId) {
            const [row] = await db.select({ lockedUntil: twoFactorTable.lockedUntil }).from(twoFactorTable).where(eq(twoFactorTable.userId, userId));
            if (row?.lockedUntil && row.lockedUntil.getTime() > Date.now()) {
              const lockKey = `lock:${userId}:${row.lockedUntil.toISOString()}`;
              await alert('account_locked', lockKey, staff, { until: row.lockedUntil.toISOString(), network: shortIp(ipOf(headers)) ?? 'unknown' });
            }
          }
          return;
        }
        if (failed) return;

        const created = ctx.context.newSession;
        const current = created ? null : await getSessionFromCtx(ctx).catch(() => null);

        // A right code with a session already open is a step-up: risky actions are allowed for the next 5 minutes.
        if ((ctx.path === '/two-factor/verify-totp' || ctx.path === '/two-factor/verify-backup-code') && current) {
          const s = current.session as unknown as SessionLike;
          if (isStrongFactor(s.amr)) {
            await db.update(session).set({ stepUpAt: new Date() }).where(eq(session.id, s.id));
            await auditSystem(db, {
              action: 'staff.step_up',
              entityType: 'auth',
              entityId: s.userId,
              actor: await actorOf(s.userId),
              metadata: { factor: ctx.path.endsWith('backup-code') ? 'backup_code' : 'totp' },
              origin: originOf(headers, s.id),
            });
          }
        }

        // A passkey used while signed in replaces the old session (the new one counts as the step-up).
        if (ctx.path === '/passkey/verify-authentication' && created) {
          const cookieName = ctx.context.authCookies.sessionToken.name;
          const previous = await ctx.getSignedCookie(cookieName, ctx.context.secret).catch(() => null);
          if (previous && previous !== created.session.token) await db.delete(session).where(eq(session.token, previous));
        }

        // Changes to how an account is protected: audited, and the owner is told.
        const changeKind = CHANGE_ALERTS[ctx.path];
        const who = created?.user ?? current?.user;
        if (changeKind && who) {
          // A right code during sign-in is not a change; one that turns two-step login on is.
          const changed = ctx.path !== '/two-factor/verify-totp' || (created && (created.session as unknown as SessionLike).amr === 'enrolment');
          if (changed) {
            const staff = await activeStaff(who.id);
            await auditSystem(db, {
              action: `staff.${changeKind}`,
              entityType: 'auth',
              entityId: who.id,
              actor: staff ? { userId: staff.id, role: staff.role } : null,
              metadata: { endpoint: ctx.path },
              origin: originOf(headers, (created?.session ?? current?.session)?.id),
            });
            await alert(changeKind, `${changeKind}:${who.id}:${Date.now()}`, staff, { change: ctx.path.replace(/^\//, '') });
          }
        }
      }),
    },

    databaseHooks: {
      user: {
        create: {
          // Accounts come only from invitations (admin/invites.ts).
          before: async (_newUser, ctx) => {
            if (ctx?.path !== '/staff-invite/accept') throw refuse('FORBIDDEN', 'SIGN_UP_CLOSED', 'Staff accounts come from an invitation.');
          },
        },
      },
      session: {
        create: {
          // Every admin session says how it was opened. Only passkey, two-step code and backup code sessions do
          // staff work; an invitation's session (and any session made from it) only sets up two-step login.
          before: async (newSession, ctx) => {
            const path = ctx?.path;
            const prior = ctx?.context.session?.session as unknown as SessionLike | undefined;
            let amr: AdminFactor = 'password';
            if (path === '/staff-invite/accept' || prior?.amr === 'enrolment') amr = 'enrolment';
            else if (path === '/two-factor/verify-totp') amr = 'totp';
            else if (path === '/two-factor/verify-backup-code') amr = 'backup_code';
            else if (path === '/passkey/verify-authentication') amr = 'passkey';
            const now = new Date();
            return {
              data: {
                ...newSession,
                realm: 'admin',
                amr,
                stepUpAt: isStrongFactor(amr) ? now : null,
                lastActiveAt: now,
                ...(amr === 'enrolment' ? { expiresAt: new Date(now.getTime() + ENROLMENT_SECONDS * 1000) } : {}),
              },
            };
          },
          // A staff sign-in is audited, and one from a device not seen before emails the owner.
          after: async (created, ctx) => {
            const s = created as unknown as SessionLike & { ipAddress?: string | null; userAgent?: string | null };
            if (!isStrongFactor(s.amr)) return;
            const staff = await activeStaff(s.userId);
            if (!staff) return;
            const headers = ctx?.headers;
            await auditSystem(db, {
              action: 'staff.signed_in',
              entityType: 'auth',
              entityId: staff.id,
              actor: { userId: staff.id, role: staff.role },
              metadata: { factor: s.amr },
              origin: originOf(headers, s.id),
            });
            const network = shortIp(s.ipAddress ?? ipOf(headers));
            const device = deviceKey(`${s.userAgent ?? ''}|${network ?? ''}`);
            const [seen] = await db
              .insert(staffDevice)
              .values({ userId: staff.id, deviceHash: device })
              .onConflictDoUpdate({ target: [staffDevice.userId, staffDevice.deviceHash], set: { lastSeenAt: new Date() } })
              .returning({ firstSeenAt: staffDevice.firstSeenAt, lastSeenAt: staffDevice.lastSeenAt });
            if (seen && seen.firstSeenAt.getTime() === seen.lastSeenAt.getTime()) {
              await alert('new_device_sign_in', `device:${staff.id}:${device}`, staff, {
                device: shortUserAgent(s.userAgent) ?? 'unknown browser',
                network: network ?? 'unknown',
                factor: String(s.amr),
              });
            }
          },
        },
      },
    },

    plugins: [
      twoFactor({
        issuer: 'Favorite Hearts Admin',
        accountLockout: { enabled: true, maxFailedAttempts: ADMIN_FACTOR_FAILURE_LIMIT, durationSeconds: ADMIN_FACTOR_LOCK_MINUTES * 60 },
      }),
      passkeyPlugin({
        rpID: new URL(origin).hostname,
        rpName: 'Favorite Hearts Admin',
        origin,
        authenticatorSelection: { userVerification: 'required', residentKey: 'preferred' },
        authentication: {
          // A passkey signs in only an active staff member who also has the authenticator app as a fallback.
          async afterVerification({ clientData }) {
            const [key] = await db.select({ userId: passkey.userId }).from(passkey).where(eq(passkey.credentialID, clientData.id));
            const staff = key ? await activeStaff(key.userId) : null;
            if (!staff?.twoFactorEnabled) throw refuse('UNAUTHORIZED', 'PASSKEY_NOT_ALLOWED', 'This passkey cannot sign in to the admin site.');
          },
        },
      }),
      staffInvites({ db, config }),
    ],
  });

  async function actorOf(userId: string) {
    const staff = await activeStaff(userId);
    return staff ? { userId: staff.id, role: staff.role } : null;
  }
}

export type AdminAuth = ReturnType<typeof createAdminAuth>;
export type AdminSession = AdminAuth['$Infer']['Session'];
