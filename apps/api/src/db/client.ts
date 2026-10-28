import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../env.ts';
import * as schema from './schema/index.ts';

/** Pooled Neon connection for request handling. */
export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
});

export const db = drizzle({ client: pool, schema });
export type Db = typeof db;
