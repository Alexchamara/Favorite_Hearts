import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { AppEnv } from '../http.ts';

/** Liveness/readiness for Fly.io / Railway. Reports configuration, never secrets. */
export const health = new Hono<AppEnv>().get('/', async (c) => {
  const { db, messenger, storage } = c.var.deps;
  let database = false;
  try {
    await db.execute(sql`select 1`);
    database = true;
  } catch {
    database = false;
  }
  return c.json(
    { ok: database, database, email: true, sms: messenger.smsEnabled, storage: storage.configured },
    database ? 200 : 503,
  );
});
