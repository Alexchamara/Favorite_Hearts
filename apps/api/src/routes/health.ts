import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { appliedMigrations, EXPECTED_MIGRATIONS } from '../db/migrations.ts';
import type { AppEnv } from '../http.ts';

/**
 * Liveness/readiness for Fly.io / Railway. Reports configuration, never secrets. A database that is reachable but
 * behind the code's migrations is not ready: the newer routes would fail (fix: `npm run db:migrate`).
 */
export const health = new Hono<AppEnv>().get('/', async (c) => {
  const { db, messenger, storage } = c.var.deps;
  let database = false;
  try {
    await db.execute(sql`select 1`);
    database = true;
  } catch {
    database = false;
  }
  const applied = database ? await appliedMigrations(db) : null;
  const migrationsCurrent = applied === null || applied >= EXPECTED_MIGRATIONS;
  const ok = database && migrationsCurrent;
  return c.json(
    { ok, database, migrations: { applied, expected: EXPECTED_MIGRATIONS }, email: true, sms: messenger.smsEnabled, storage: storage.configured },
    ok ? 200 : 503,
  );
});
