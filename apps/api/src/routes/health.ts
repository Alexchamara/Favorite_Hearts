import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db/client.ts';
import { smsEnabled } from '../messaging/sms.ts';
import { storageConfigured } from '../storage/r2.ts';

/** Liveness/readiness for Fly.io / Railway. Reports configuration, never secrets. */
export const health = new Hono().get('/', async (c) => {
  let database = false;
  try {
    await db.execute(sql`select 1`);
    database = true;
  } catch {
    database = false;
  }
  return c.json(
    { ok: database, database, email: true, sms: smsEnabled, storage: storageConfigured },
    database ? 200 : 503,
  );
});
