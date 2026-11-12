import { serve } from '@hono/node-server';
import type PgBoss from 'pg-boss';
import { createAccessVerifier } from './admin/access.ts';
import { createAdminAuth } from './admin/auth.ts';
import { createApp } from './app.ts';
import { createAuth } from './auth.ts';
import { createDb } from './db/client.ts';
import { appliedMigrations, EXPECTED_MIGRATIONS } from './db/migrations.ts';
import { configFromEnv, env } from './env.ts';
import type { Deps } from './http.ts';
import { startJobs } from './jobs/boss.ts';
import { log } from './lib/log.ts';
import { createResendSender } from './messaging/email.ts';
import type { Messenger } from './messaging/messenger.ts';
import { createSmsSender } from './messaging/sms.ts';
import { createTurnstile } from './middleware/turnstile.ts';
import { createR2Storage } from './storage/r2.ts';

// Production wiring: real Neon, Resend, SMS adapter and R2 (tests build the app with fakes instead).
const config = configFromEnv();
const { db, pool } = createDb(env.DATABASE_URL);
const messenger: Messenger = {
  smsEnabled: env.SMS_PROVIDER !== 'none',
  sendEmail: createResendSender({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM, replyTo: env.EMAIL_REPLY_TO }),
  sendSms: createSmsSender(env.SMS_PROVIDER, {
    senderId: env.SMS_SENDER_ID,
    smslenz: { userId: env.SMSLENZ_USER_ID, apiKey: env.SMSLENZ_API_KEY, baseUrl: env.SMSLENZ_BASE_URL },
  }),
};
const storage = createR2Storage({
  accountId: env.R2_ACCOUNT_ID,
  accessKeyId: env.R2_ACCESS_KEY_ID,
  secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  privateBucket: env.R2_BUCKET_PRIVATE,
  derivedBucket: env.R2_BUCKET_DERIVED,
  signedUrlTtlSeconds: env.SIGNED_URL_TTL_SECONDS,
});
const turnstile = env.TURNSTILE_SECRET_KEY ? createTurnstile(env.TURNSTILE_SECRET_KEY) : null;
// The admin site (docs/ADMIN-PANEL-PLAN.md): its own sign-in, and Cloudflare Access's token checked on every request.
const deps: Deps = {
  config,
  db,
  auth: createAuth({ db, config, messenger }),
  adminAuth: config.adminOrigin ? createAdminAuth({ db, config }) : null,
  accessVerifier: config.cloudflareAccess ? createAccessVerifier(config.cloudflareAccess) : null,
  storage,
  messenger,
  turnstile,
};
const app = createApp(deps);

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  log.info('api.listening', { port: info.port, env: env.NODE_ENV });
});

// A database behind the code answers every /api request with a 500 (the newer tables are missing): say so at once.
void appliedMigrations(db).then((applied) => {
  if (applied !== null && applied < EXPECTED_MIGRATIONS) {
    log.error('db.migrations_behind', { applied, expected: EXPECTED_MIGRATIONS, fix: 'npm run db:migrate' });
  }
});

let boss: PgBoss | null = null;
if (env.RUN_JOBS) {
  startJobs({ db, storage, messenger, config }, env.DATABASE_URL_DIRECT)
    .then((started) => {
      boss = started;
    })
    .catch((err: Error) => log.error('jobs.start_failed', { message: err.message }));
}

async function shutdown(signal: string) {
  log.info('api.shutdown', { signal });
  server.close();
  await boss?.stop({ graceful: true }).catch(() => undefined);
  await pool.end().catch(() => undefined);
  process.exit(0);
}
// Anything that still escapes is written to the log with its reason before the process stops, so a crash is never
// silent (a stopped API shows only as 502s in the browser). A promise nobody awaited is logged and the API carries on.
process.on('unhandledRejection', (reason) => {
  log.error('api.unhandled_rejection', { message: reason instanceof Error ? reason.message : String(reason) });
});
process.on('uncaughtException', (err) => {
  log.error('api.crashed', { message: err.message, stack: err.stack?.split('\n').slice(0, 6).join(' | ') });
  process.exit(1);
});
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
