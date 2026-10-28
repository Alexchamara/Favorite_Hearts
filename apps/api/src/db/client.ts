import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.ts';

/** Pooled Neon connection for request handling (production entry point, src/index.ts). */
export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 });
  return { pool, db: drizzle({ client: pool, schema }) };
}
