import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import type { Db } from './types.ts';

/** How many migrations this code expects (drizzle/meta/_journal.json, written by `npm run db:generate`). */
export const EXPECTED_MIGRATIONS: number = JSON.parse(
  readFileSync(new URL('../../drizzle/meta/_journal.json', import.meta.url), 'utf8'),
).entries.length;

/**
 * How many migrations the database has (drizzle's own record), or null when it cannot tell. A database behind the
 * code fails on the newer tables (every /api request uses the rate-limit table from 0010), so start-up and /health
 * say so plainly instead of leaving a generic 500.
 */
export async function appliedMigrations(db: Db): Promise<number | null> {
  try {
    const result = await db.execute(sql`select count(*)::int as n from drizzle.__drizzle_migrations`);
    return Number((result as unknown as { rows: { n: number }[] }).rows[0]?.n ?? 0);
  } catch {
    return null;
  }
}
