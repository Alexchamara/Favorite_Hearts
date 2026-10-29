/**
 * Local sandbox: the real API on an in-memory Postgres (PGlite) with every migration applied.
 * Emails and SMS (codes, invitation links) are printed to this console instead of being sent,
 * and files are kept in memory. It never reads apps/api/.env and never touches Neon, Resend,
 * an SMS provider or R2; everything is gone when it stops. For trying the screens only.
 *
 *   npm run dev:sandbox      → member app at http://localhost:5174/app/ (API on :8788)
 *
 * Two staff accounts are created at start-up with a random password printed below (it changes
 * on every start). Staff set up two-step login on first sign-in, as on a real environment.
 */
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { createApp } from '../src/app.ts';
import { createAuth } from '../src/auth.ts';
import type { Config } from '../src/config.ts';
import * as schema from '../src/db/schema/index.ts';
import type { Deps } from '../src/http.ts';
import { addStaff } from '../src/lib/staff-accounts.ts';
import type { Messenger } from '../src/messaging/messenger.ts';
import type { Storage } from '../src/storage/storage.ts';

const API_PORT = 8788;
const MEMBER_ORIGIN = 'http://localhost:5174';

const db = drizzle({ client: new PGlite(), schema });
await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });

const line = '─'.repeat(72);
const messenger: Messenger = {
  smsEnabled: true,
  async sendEmail({ to, subject, text }) {
    console.log(`\n${line}\n[sandbox email] to ${to}\nSubject: ${subject}\n\n${text}\n${line}`);
  },
  async sendSms({ to, body }) {
    console.log(`\n${line}\n[sandbox sms] to ${to}\n${body}\n${line}`);
  },
};

// Files stay in memory; staff get a data: URL instead of a signed storage link.
const files = new Map<string, Buffer>();
const storage: Storage = {
  configured: true,
  async put(bucket, key, body) {
    files.set(`${bucket}/${key}`, body);
  },
  async delete(bucket, key) {
    files.delete(`${bucket}/${key}`);
  },
  async signedGetUrl(bucket, key) {
    const body = files.get(`${bucket}/${key}`);
    return body ? `data:image/jpeg;base64,${body.toString('base64')}` : 'data:,';
  },
};

const config: Config = {
  nodeEnv: 'development',
  apiUrl: `http://localhost:${API_PORT}`,
  memberAppUrl: `${MEMBER_ORIGIN}/app`,
  allowedOrigins: [MEMBER_ORIGIN],
  authSecret: randomBytes(32).toString('base64'),
  rateLimit: true,
  signedUrlTtlSeconds: 120,
};
const auth = createAuth({ db, config, messenger });
const deps: Deps = { config, db, auth, storage, messenger };

const staffPassword = randomBytes(12).toString('base64url');
await addStaff(deps, { email: 'owner@sandbox.test', name: 'Sandbox Owner', role: 'owner', password: staffPassword });
await addStaff(deps, { email: 'reviewer@sandbox.test', name: 'Sandbox Reviewer', role: 'backup_reviewer', password: staffPassword });

// Loopback only: the sandbox prints codes and the staff password, so keep it off the local network.
serve({ fetch: createApp(deps).fetch, port: API_PORT, hostname: '127.0.0.1' }, () => {
  console.log(`${line}
Favorite Hearts sandbox (in-memory, nothing is sent or stored for real)
  Member app : ${MEMBER_ORIGIN}/app/      Staff: ${MEMBER_ORIGIN}/app/staff
  Staff      : owner@sandbox.test, reviewer@sandbox.test
  Password   : ${staffPassword}   (both staff accounts; new on every start)
Sign-in codes, phone codes and invitation links appear below.
${line}`);
});
