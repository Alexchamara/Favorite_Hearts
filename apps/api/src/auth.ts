/**
 * Better-Auth, self-hosted: the ONLY authentication system.
 *  - Members: passwordless 6-digit codes by email (Resend) or SMS (provider adapter).
 *  - Staff (owner + backup reviewer): email + password + TOTP two-step login.
 *    Staff accounts are provisioned by the owner (scripts/staff.ts); public password sign-up is disabled.
 * Users and sessions live in our own Postgres (auth_* tables).
 */
import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { emailOTP, phoneNumber, twoFactor } from 'better-auth/plugins';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { eq } from 'drizzle-orm';
import { CODE_LENGTH, CODE_TTL_SECONDS, normalizePhone } from '@fh/shared';
import type { Config } from './config.ts';
import { account, session, twoFactor as twoFactorTable, user, verification } from './db/schema/auth.ts';
import { operationsFlag } from './db/schema/operations.ts';
import type { Db } from './db/types.ts';
import { hasherFor, isBannedAddress } from './lib/identity-hash.ts';
import { authRateLimitStorage, consume } from './lib/rate-limit.ts';
import { PHONE_ONLY_EMAIL_DOMAIN, type Messenger } from './messaging/messenger.ts';
import { codeEmail, codeSms } from './messaging/templates.ts';
import { headersLanguage, text } from './text.ts';

/** The endpoints that send a code, and where the address is in their body. */
const CODE_SENDS: Record<string, 'email' | 'phoneNumber'> = {
  '/email-otp/send-verification-otp': 'email',
  '/phone-number/send-otp': 'phoneNumber',
};
/** Codes sent to one address (proposed): a person sending to many addresses still meets the per-IP limit below. */
const CODES_PER_ADDRESS = { window: 60 * 60, max: 5 };

export function createAuth({ db, config, messenger }: { db: Db; config: Config; messenger: Messenger }) {
  const hash = hasherFor(config.authSecret);
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

    // Staff only: no public sign-up with a password.
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12 },

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
        const field = CODE_SENDS[ctx.path];
        const address = field ? (ctx.body as Record<string, unknown> | undefined)?.[field] : undefined;
        if (typeof address !== 'string' || !address.trim()) return;
        // Messages here are in the language the request asks for (text.ts), like the API's own answers.
        const language = headersLanguage(ctx.headers);
        if (await isBannedAddress(db, hash, address)) {
          throw new APIError('FORBIDDEN', { code: 'ADDRESS_BANNED', message: text(language, 'api.addressBanned') });
        }
        if (!config.rateLimit) return;
        const result = await consume(db, `code-to:${hash(address)}`, CODES_PER_ADDRESS);
        if (!result.allowed) {
          throw new APIError('TOO_MANY_REQUESTS', { code: 'CODES_PER_ADDRESS', message: text(language, 'api.codesPerAddress') });
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
        async sendOTP({ phoneNumber: to, code }, ctx) {
          await messenger.sendSms({ to, body: codeSms(headersLanguage(ctx?.headers), code) });
        },
        signUpOnVerification: {
          // Phone-only members get an undeliverable placeholder email (.invalid TLD) that is never emailed.
          getTempEmail: (value) => `${value.replace(/\D/g, '')}@${PHONE_ONLY_EMAIL_DOMAIN}`,
          getTempName: () => '',
        },
      }),
      twoFactor({ issuer: 'Favorite Hearts' }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = Auth['$Infer']['Session'];
