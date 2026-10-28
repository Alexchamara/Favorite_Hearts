/**
 * Better-Auth, self-hosted: the ONLY authentication system.
 *  - Members: passwordless 6-digit codes by email (Resend) or SMS (provider adapter).
 *  - Staff (owner + backup reviewer): email + password + TOTP two-step login.
 *    Staff accounts are provisioned by the owner; public password sign-up is disabled.
 * Users and sessions live in our own Postgres (auth_* tables).
 */
import { betterAuth } from 'better-auth';
import { emailOTP, phoneNumber, twoFactor } from 'better-auth/plugins';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { CODE_LENGTH, CODE_TTL_SECONDS, normalizePhone } from '@fh/shared';
import { db } from './db/client.ts';
import { account, session, twoFactor as twoFactorTable, user, verification } from './db/schema/auth.ts';
import { env } from './env.ts';
import { PHONE_ONLY_EMAIL_DOMAIN, sendEmail } from './messaging/email.ts';
import { sendSms } from './messaging/sms.ts';
import { codeEmail, codeSms } from './messaging/templates.ts';

const minutes = Math.round(CODE_TTL_SECONDS / 60);

export const auth = betterAuth({
  appName: 'Favorite Hearts',
  baseURL: env.API_URL,
  basePath: '/api/auth',
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: env.ALLOWED_ORIGINS,
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
    enabled: true,
    window: 60,
    max: 60,
    customRules: {
      '/email-otp/send-verification-otp': { window: 60, max: 3 },
      '/phone-number/send-otp': { window: 60, max: 3 },
      '/sign-in/email': { window: 60, max: 5 },
    },
  },

  advanced: { cookiePrefix: 'fh' },

  plugins: [
    emailOTP({
      otpLength: CODE_LENGTH,
      expiresIn: CODE_TTL_SECONDS,
      allowedAttempts: 5,
      async sendVerificationOTP({ email, otp, type }) {
        const { subject, html, text } = codeEmail(type, otp, minutes);
        await sendEmail({ to: email, subject, html, text });
      },
    }),
    phoneNumber({
      otpLength: CODE_LENGTH,
      expiresIn: CODE_TTL_SECONDS,
      allowedAttempts: 5,
      phoneNumberValidator: (value) => normalizePhone(value) === value,
      async sendOTP({ phoneNumber: to, code }) {
        await sendSms({ to, body: codeSms(code, minutes) });
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

export type AuthSession = typeof auth.$Infer.Session;
