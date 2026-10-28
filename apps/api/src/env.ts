import { z } from 'zod';
import { SMS_PROVIDERS } from '@fh/shared';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),
  API_URL: z.url(),
  ALLOWED_ORIGINS: z
    .string()
    .transform((v) => v.split(',').map((o) => o.trim()).filter(Boolean)),

  DATABASE_URL: z.string().min(1),
  DATABASE_URL_DIRECT: z.string().min(1),

  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),

  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(3),
  EMAIL_REPLY_TO: z.string().optional().transform((v) => v || undefined),

  SMS_PROVIDER: z.enum(SMS_PROVIDERS).default('none'),
  SMS_SENDER_ID: z.string().default('FavHearts'),

  R2_ACCOUNT_ID: z.string().default(''),
  R2_ACCESS_KEY_ID: z.string().default(''),
  R2_SECRET_ACCESS_KEY: z.string().default(''),
  R2_BUCKET_PRIVATE: z.string().default(''),
  R2_BUCKET_DERIVED: z.string().default(''),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(900).default(120),

  RUN_JOBS: bool.default(true),
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
