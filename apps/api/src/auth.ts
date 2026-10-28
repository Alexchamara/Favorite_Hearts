/**
 * Better-Auth, self-hosted: the ONLY authentication system.
 *  - Members: passwordless 6-digit codes by email (Resend) or SMS (provider adapter).
 *  - Staff (owner + backup reviewer): email + password + TOTP two-step login.
 *    Staff accounts are provisioned by the owner (scripts/staff.ts); public password sign-up is disabled.
 * Users and sessions live in our own Postgres (auth_* tables).
 */
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { emailOTP, phoneNumber, twoFactor } from 'better-auth/plugins';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { eq } from 'drizzle-orm';
import { CODE_LENGTH, CODE_TTL_SECONDS, normalizePhone } from '@fh/shared';
import type { Config } from './config.ts';
import { account, session, twoFactor as twoFactorTable, user, verification } from './db/schema/auth.ts';
import { operationsFlag } from './db/schema/operations.ts';
import type { Db } from './db/types.ts';
import { PHONE_ONLY_EMAIL_DOMAIN, type Messenger } from './messaging/messenger.ts';
import { codeEmail, codeSms } from './messaging/templates.ts';

const minutes = Math.round(CODE_TTL_SECONDS / 60);

export function createAuth({ db, config, messenger }: { db: Db; config: Config; messenger: Messenger }) {
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

    // Code requests are the most abusable endpoints (D Part 2: rate limits on sign-in and codes).
    // In-memory store is fine for one instance; switch to `storage: 'database'` before scaling out.
    rateLimit: {
      enabled: config.rateLimit,
      window: 60,
      max: 60,
      customRules: {
        '/email-otp/send-verification-otp': { window: 60, max: 3 },
        '/phone-number/send-otp': { window: 60, max: 3 },
        '/sign-in/email': { window: 60, max: 5 },
      },
    },

    advanced: { cookiePrefix: 'fh' },

    databaseHooks: {
      user: {
        create: {
          // OWNER-DECISIONS section 10: the owner can pause new sign-ups. Staff provisioning runs
          // outside a request (no ctx) and is not affected.
          before: async (_user, ctx) => {
            if (!ctx) return;
            const [flag] = await db
              .select({ enabled: operationsFlag.enabled })
              .from(operationsFlag)
              .where(eq(operationsFlag.key, 'signups_paused'));
            if (flag?.enabled) {
              throw new APIError('FORBIDDEN', { message: 'New sign-ups are paused for now. Please try again later.' });
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
        async sendVerificationOTP({ email, otp, type }) {
          const { subject, html, text } = codeEmail(type, otp, minutes);
          await messenger.sendEmail({ to: email, subject, html, text });
        },
      }),
      phoneNumber({
        otpLength: CODE_LENGTH,
        expiresIn: CODE_TTL_SECONDS,
        allowedAttempts: 5,
        phoneNumberValidator: (value) => normalizePhone(value) === value,
        async sendOTP({ phoneNumber: to, code }) {
          await messenger.sendSms({ to, body: codeSms(code, minutes) });
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
