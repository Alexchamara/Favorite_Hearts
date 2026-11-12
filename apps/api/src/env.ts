import { z } from 'zod';
import { SMS_PROVIDERS } from '@fh/shared';
import type { Config } from './config.ts';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),
  API_URL: z.url(),
  MEMBER_APP_URL: z.url().default('http://localhost:4321/app'),
  ALLOWED_ORIGINS: z
    .string()
    .transform((v) => v.split(',').map((o) => o.trim()).filter(Boolean)),

  DATABASE_URL: z.string().min(1),
  DATABASE_URL_DIRECT: z.string().min(1),

  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),

  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(3),
  EMAIL_REPLY_TO: z.string().optional().transform((v) => v || undefined),

  /** Cloudflare Turnstile secret key. Empty = no bot check (development); required in production. */
  TURNSTILE_SECRET_KEY: z.string().optional().transform((v) => v || undefined),

  /** Header the host sets to the visitor's IP address, for rate limits (e.g. cf-connecting-ip, fly-client-ip). */
  CLIENT_IP_HEADER: z
    .string()
    .optional()
    .transform((v) => v?.trim().toLowerCase() || undefined),

  SMS_PROVIDER: z.enum(SMS_PROVIDERS).default('none'),
  /** The sender name SMSlenz approved for the account, exactly (case sensitive). */
  SMS_SENDER_ID: z.string().default('FavHearts'),
  /** SMSlenz (https://smslenz.lk/developers/api): the account's User ID and API key, from its settings page. */
  SMSLENZ_USER_ID: z.string().default(''),
  SMSLENZ_API_KEY: z.string().default(''),
  SMSLENZ_BASE_URL: z.url().default('https://smslenz.lk/api'),

  R2_ACCOUNT_ID: z.string().default(''),
  R2_ACCESS_KEY_ID: z.string().default(''),
  R2_SECRET_ACCESS_KEY: z.string().default(''),
  R2_BUCKET_PRIVATE: z.string().default(''),
  R2_BUCKET_DERIVED: z.string().default(''),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(900).default(120),

  RUN_JOBS: bool.default(true),

  /** The admin site (docs/ADMIN-PANEL-PLAN.md), e.g. https://admin.favoritehearts.com. Empty = no admin site. */
  ADMIN_URL: z.url().optional().or(z.literal('').transform(() => undefined)),
  /** Cloudflare Access for the admin site: team domain and application audience tag. Required with ADMIN_URL in production. */
  CF_ACCESS_TEAM_DOMAIN: z.string().optional().transform((v) => v?.trim().replace(/^https?:\/\//, '').replace(/\/$/, '') || undefined),
  CF_ACCESS_AUD: z.string().optional().transform((v) => v?.trim() || undefined),
  /** Security alerts (decision A7), e.g. security@favoritehearts.com. */
  SECURITY_ALERT_EMAIL: z.email().optional().or(z.literal('').transform(() => undefined)),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid API environment:\n' + z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
export const isLocal = env.NODE_ENV === 'development' || env.NODE_ENV === 'test';

if (env.SMS_PROVIDER === 'log' && !isLocal) {
  console.error('SMS_PROVIDER=log is only allowed in development.');
  process.exit(1);
}

if (env.SMS_PROVIDER === 'smslenz' && (!env.SMSLENZ_USER_ID || !env.SMSLENZ_API_KEY)) {
  console.error('SMS_PROVIDER=smslenz needs SMSLENZ_USER_ID and SMSLENZ_API_KEY (SMSlenz settings page).');
  process.exit(1);
}

if (isProduction && !env.TURNSTILE_SECRET_KEY) {
  console.error('TURNSTILE_SECRET_KEY is required in production (bot check on sign-in and code requests).');
  process.exit(1);
}

// Rate limits count per visitor address; behind a proxy only the header that proxy sets is trustworthy.
if (isProduction && !env.CLIENT_IP_HEADER) {
  console.error('CLIENT_IP_HEADER is required in production, e.g. cf-connecting-ip (Cloudflare) or fly-client-ip (Fly.io).');
  process.exit(1);
}

// Better-Auth refuses requests from untrusted origins, so without this every sign-in and invitation
// from the member app fails with "Invalid origin".
const memberOrigin = new URL(env.MEMBER_APP_URL).origin;
if (!env.ALLOWED_ORIGINS.includes(memberOrigin)) {
  console.error(`ALLOWED_ORIGINS must include ${memberOrigin}, the origin of MEMBER_APP_URL.`);
  process.exit(1);
}

// The admin site sits behind Cloudflare Access in production (layer 1): without it the API would take admin requests
// from anyone who finds the proxy.
if (isProduction && env.ADMIN_URL && !(env.CF_ACCESS_TEAM_DOMAIN && env.CF_ACCESS_AUD)) {
  console.error('ADMIN_URL in production needs CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD (Cloudflare Access for the admin site).');
  process.exit(1);
}
if (env.ADMIN_URL && env.ALLOWED_ORIGINS.includes(new URL(env.ADMIN_URL).origin)) {
  console.error('ALLOWED_ORIGINS must not include the admin site: it reaches the API through its own proxy, never by CORS.');
  process.exit(1);
}

export function configFromEnv(): Config {
  return {
    nodeEnv: env.NODE_ENV,
    apiUrl: env.API_URL,
    memberAppUrl: env.MEMBER_APP_URL.replace(/\/$/, ''),
    allowedOrigins: env.ALLOWED_ORIGINS,
    authSecret: env.BETTER_AUTH_SECRET,
    rateLimit: true,
    clientIpHeader: env.CLIENT_IP_HEADER ?? null,
    signedUrlTtlSeconds: env.SIGNED_URL_TTL_SECONDS,
    adminOrigin: env.ADMIN_URL ? new URL(env.ADMIN_URL).origin : null,
    cloudflareAccess:
      env.CF_ACCESS_TEAM_DOMAIN && env.CF_ACCESS_AUD ? { teamDomain: env.CF_ACCESS_TEAM_DOMAIN, audience: env.CF_ACCESS_AUD } : null,
    securityAlertEmail: env.SECURITY_ALERT_EMAIL ?? null,
  };
}
