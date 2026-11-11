/**
 * Better-Auth, self-hosted: the ONLY authentication system.
 *  - Members (owner decision, 11 Nov 2026): sign up with an email address or phone number and a password, confirmed
 *    once with a code (lib/member-access.ts); log in with the address and password, no code. A forgotten password is
 *    reset by an email link; phone-only accounts go through support. Five wrong passwords for one address in 15
 *    minutes lock it until those minutes pass. The email-code sign-in stays until the invitation page stops using it.
 *  - Staff (owner + backup reviewer): email + password (12 characters or more) + TOTP two-step login.
 *    Staff accounts are provisioned by the owner (scripts/staff.ts); Better-Auth's own sign-up stays disabled.
 * Users and sessions live in our own Postgres (auth_* tables).
 */
import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware, getSessionFromCtx, isAPIError } from 'better-auth/api';
import { emailOTP, phoneNumber, twoFactor } from 'better-auth/plugins';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { eq } from 'drizzle-orm';
import {
  CODE_LENGTH,
  CODE_TTL_SECONDS,
  LOGIN_FAILURE_LIMIT,
  LOGIN_LOCK_MINUTES,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  normalizeEmail,
  normalizePhone,
  PASSWORD_RESET_MINUTES,
  passwordProblem,
} from '@fh/shared';
import type { Config } from './config.ts';
import { account, session, twoFactor as twoFactorTable, user, verification } from './db/schema/auth.ts';
import { operationsFlag } from './db/schema/operations.ts';
import { staffMember } from './db/schema/staff.ts';
import type { Db } from './db/types.ts';
import { hasherFor, isBannedAddress } from './lib/identity-hash.ts';
import { memberAccess } from './lib/member-access.ts';
import { authRateLimitStorage, clearCounter, consume, overLimit } from './lib/rate-limit.ts';
import { PHONE_ONLY_EMAIL_DOMAIN, type Messenger } from './messaging/messenger.ts';
import { codeEmail, codeSms, resetEmail } from './messaging/templates.ts';
import { headersLanguage, render, text } from './text.ts';

/** The endpoints that send a code or a link, and where the address is in their body. */
const CODE_SENDS: Record<string, readonly ('email' | 'phoneNumber')[]> = {
  '/email-otp/send-verification-otp': ['email'],
  '/phone-number/send-otp': ['phoneNumber'],
  '/member/sign-up': ['email', 'phoneNumber'],
  '/request-password-reset': ['email'],
};
/** Password log-ins, and where the address is: each address is locked after LOGIN_FAILURE_LIMIT wrong passwords. */
const PASSWORD_LOGINS: Record<string, 'email' | 'phoneNumber'> = {
  '/sign-in/email': 'email',
  '/sign-in/phone-number': 'phoneNumber',
};
const LOGIN_FAILURES = { window: LOGIN_LOCK_MINUTES * 60, max: LOGIN_FAILURE_LIMIT };
/** Staff passwords are longer than members' (lib/staff-accounts.ts). */
const STAFF_MIN_PASSWORD_LENGTH = 12;

/** The address as stored (lowercased email, E.164 phone), so "077…" and "+9477…" count as one. */
const normalAddress = (value: string) => normalizeEmail(value) ?? normalizePhone(value) ?? value.trim().toLowerCase();
/** Codes sent to one address (proposed): a person sending to many addresses still meets the per-IP limit below. */
const CODES_PER_ADDRESS = { window: 60 * 60, max: 5 };

export function createAuth({ db, config, messenger }: { db: Db; config: Config; messenger: Messenger }) {
  const hash = hasherFor(config.authSecret);

  /**
   * A new password through Better-Auth's own endpoints (reset link, change while signed in) meets the same rules as at
   * sign-up: members passwordProblem (password.ts), staff 12 characters or more.
   */
  async function passwordRules(path: string, body: Record<string, unknown>, language: ReturnType<typeof headersLanguage>, ctx: Parameters<typeof getSessionFromCtx>[0]) {
    if (path !== '/reset-password' && path !== '/change-password') return;
    const password = body.newPassword;
    if (typeof password !== 'string') return;
    let userId: string | null = null;
    if (path === '/reset-password' && typeof body.token === 'string') {
      const found = await (await ctx.context).internalAdapter.findVerificationValue(`reset-password:${body.token}`);
      userId = found?.value ?? null;
    } else if (path === '/change-password') {
      userId = (await getSessionFromCtx(ctx))?.user.id ?? null;
    }
    if (!userId) return; // Better-Auth refuses the request itself (bad token, no session)
    const [owner] = await db.select().from(user).where(eq(user.id, userId));
    if (!owner) return;
    const [staff] = await db.select({ userId: staffMember.userId }).from(staffMember).where(eq(staffMember.userId, userId));
    const problem = staff
      ? password.length < STAFF_MIN_PASSWORD_LENGTH
        ? 'tooShort'
        : null
      : passwordProblem(password, { name: owner.name, email: owner.email, phone: owner.phoneNumber });
    if (!problem) return;
    const message = staff ? 'The password must be at least 12 characters.' : render(language, { key: `validation.password.${problem}` });
    throw new APIError('BAD_REQUEST', { code: 'VALIDATION', message: text(language, 'api.validation'), fields: { newPassword: message } });
  }

  return betterAuth({
    appName: 'Favorite Hearts',
    baseURL: config.apiUrl,
    basePath: '/api/auth',
    secret: config.authSecret,
    trustedOrigins: config.allowedOrigins,
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user, session, account, verification, twoFactor: twoFactorTable },
    }),

    // Better-Auth's own sign-up stays off: members sign up through member-access (a code first), staff are provisioned.
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      requireEmailVerification: true,
      resetPasswordTokenExpiresIn: PASSWORD_RESET_MINUTES * 60,
      revokeSessionsOnPasswordReset: true,
      // Email accounts only. Staff reset with the developer (scripts/staff.ts); phone-only accounts go through support.
      // Better-Auth answers the same whether or not a link went out, so the form tells nobody who is a member.
      async sendResetPassword({ user: target, token }, request) {
        if (target.email.endsWith(`@${PHONE_ONLY_EMAIL_DOMAIN}`)) return;
        const [staff] = await db.select({ userId: staffMember.userId }).from(staffMember).where(eq(staffMember.userId, target.id));
        if (staff) return;
        const link = `${config.memberAppUrl}/reset-password#${new URLSearchParams({ token })}`;
        await messenger.sendEmail({ to: target.email, ...resetEmail(headersLanguage(request?.headers), link) });
      },
      // A new password ends any lockout on the account's addresses.
      async onPasswordReset({ user: target }) {
        const phone = (target as { phoneNumber?: string | null }).phoneNumber;
        for (const address of [target.email, phone]) if (address) await clearCounter(db, `login-fail:${hash(normalAddress(address))}`);
      },
    },

    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },

    // Code requests are the most abusable endpoints (D Part 2: rate limits on sign-in and codes). Counted per IP
    // address in Postgres (lib/rate-limit.ts), so the limits hold across restarts and API instances.
    rateLimit: {
      enabled: config.rateLimit,
      window: 60,
      max: 60,
      customStorage: authRateLimitStorage(db),
      customRules: {
        '/email-otp/send-verification-otp': { window: 60, max: 3 },
        '/phone-number/send-otp': { window: 60, max: 3 },
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-in/phone-number': { window: 60, max: 5 },
        '/member/sign-up': { window: 60, max: 3 },
        '/member/sign-up/verify': { window: 60, max: 10 },
        '/request-password-reset': { window: 60, max: 3 },
        '/reset-password': { window: 60, max: 5 },
        '/change-password': { window: 60, max: 5 },
        '/sign-in/email-otp': { window: 60, max: 10 },
        '/phone-number/verify': { window: 60, max: 10 },
        '/two-factor/verify-totp': { window: 60, max: 5 },
      },
    },

    // Behind a proxy only the header the host sets can be trusted for the visitor's address (CLIENT_IP_HEADER).
    advanced: {
      cookiePrefix: 'fh',
      ...(config.clientIpHeader ? { ipAddress: { ipAddressHeaders: [config.clientIpHeader] } } : {}),
    },

    hooks: {
      // Before a code is sent: a banned address (kept hashed after its account was deleted, section 8) gets none, and
      // one address gets at most CODES_PER_ADDRESS, whichever IP addresses ask.
      before: createAuthMiddleware(async (ctx) => {
        const body = (ctx.body ?? {}) as Record<string, unknown>;
        // Messages here are in the language the request asks for (text.ts), like the API's own answers.
        const language = headersLanguage(ctx.headers);
        await passwordRules(ctx.path, body, language, ctx);
        const loginField = PASSWORD_LOGINS[ctx.path];
        const login = loginField ? body[loginField] : undefined;
        if (typeof login === 'string' && login.trim()) {
          const locked = await overLimit(db, `login-fail:${hash(normalAddress(login))}`, LOGIN_FAILURES);
          if (!locked.allowed) throw new APIError('TOO_MANY_REQUESTS', { code: 'LOGIN_LOCKED', message: text(language, 'api.loginLocked') });
        }
        const fields = CODE_SENDS[ctx.path] ?? [];
        const address = fields.map((field) => body[field]).find((value) => typeof value === 'string' && value.trim());
        if (typeof address !== 'string') return;
        if (await isBannedAddress(db, hash, address)) {
          throw new APIError('FORBIDDEN', { code: 'ADDRESS_BANNED', message: text(language, 'api.addressBanned') });
        }
        if (!config.rateLimit) return;
        const result = await consume(db, `code-to:${hash(normalAddress(address))}`, CODES_PER_ADDRESS);
        if (!result.allowed) {
          throw new APIError('TOO_MANY_REQUESTS', { code: 'CODES_PER_ADDRESS', message: text(language, 'api.codesPerAddress') });
        }
      }),
      // After a password log-in: a wrong password counts against the address, a right one clears its count.
      after: createAuthMiddleware(async (ctx) => {
        const field = PASSWORD_LOGINS[ctx.path];
        const login = field ? (ctx.body as Record<string, unknown> | undefined)?.[field] : undefined;
        if (typeof login !== 'string' || !login.trim()) return;
        const key = `login-fail:${hash(normalAddress(login))}`;
        const returned = ctx.context.returned;
        if (isAPIError(returned)) {
          if (returned.statusCode === 401) await consume(db, key, LOGIN_FAILURES);
        } else {
          await clearCounter(db, key);
        }
      }),
    },

    databaseHooks: {
      user: {
        create: {
          // OWNER-DECISIONS section 10: the owner can pause new sign-ups. Staff provisioning runs
          // outside a request (no ctx) and is not affected.
          before: async (newUser, ctx) => {
            if (!ctx) return;
            const phone = (newUser as { phoneNumber?: string | null }).phoneNumber;
            const addresses = [newUser.email.endsWith(`@${PHONE_ONLY_EMAIL_DOMAIN}`) ? null : newUser.email, phone ?? null];
            const language = headersLanguage(ctx.headers);
            for (const address of addresses) {
              if (address && (await isBannedAddress(db, hash, address))) {
                throw new APIError('FORBIDDEN', { code: 'ADDRESS_BANNED', message: text(language, 'api.addressBanned') });
              }
            }
            const [flag] = await db
              .select({ enabled: operationsFlag.enabled })
              .from(operationsFlag)
              .where(eq(operationsFlag.key, 'signups_paused'));
            if (flag?.enabled) {
              throw new APIError('FORBIDDEN', { code: 'SIGNUPS_PAUSED', message: text(language, 'api.signupsPaused') });
            }
          },
        },
      },
    },

    plugins: [
      emailOTP({
        otpLength: CODE_LENGTH,
        expiresIn: CODE_TTL_SECONDS,
        allowedAttempts: 5,
        // The code goes out in the language of the screen that asked for it (no account may exist yet).
        async sendVerificationOTP({ email, otp, type }, ctx) {
          await messenger.sendEmail({ to: email, ...codeEmail(headersLanguage(ctx?.headers), type, otp) });
        },
      }),
      phoneNumber({
        otpLength: CODE_LENGTH,
        expiresIn: CODE_TTL_SECONDS,
        allowedAttempts: 5,
        phoneNumberValidator: (value) => normalizePhone(value) === value,
        // Logging in with a number needs that number confirmed (at sign-up, or later on the Trust page).
        requireVerification: true,
        async sendOTP({ phoneNumber: to, code }, ctx) {
          await messenger.sendSms({ to, body: codeSms(headersLanguage(ctx?.headers), code, undefined, config.memberAppUrl) });
        },
        signUpOnVerification: {
          // Phone-only members get an undeliverable placeholder email (.invalid TLD) that is never emailed.
          getTempEmail: (value) => `${value.replace(/\D/g, '')}@${PHONE_ONLY_EMAIL_DOMAIN}`,
          getTempName: () => '',
        },
      }),
      twoFactor({ issuer: 'Favorite Hearts' }),
      memberAccess({ db, config, messenger, hash }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = Auth['$Infer']['Session'];
