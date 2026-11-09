import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { log } from '../lib/log.ts';
import * as schema from './schema/index.ts';

/**
 * Pooled Neon connection for request handling (production entry point, src/index.ts).
 *
 * Neon closes idle connections on its own (the compute sleeps after a few quiet minutes, and connections are
 * recycled). The pool then reports the dropped connection as an 'error' event; with no listener, Node treats that as
 * an uncaught error and stops the whole API, and every request answers 502 until it is started again (6 Nov 2026).
 * The listener below logs it instead: the pool has already thrown that connection away and opens a new one for the
 * next query.
 */
export function createDb(connectionString: string) {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    // A waking Neon compute can take a few seconds; past this, the query fails with a clear error instead of hanging.
    connectionTimeoutMillis: 15_000,
    // TCP keep-alive, so connections silently dropped on the network are noticed sooner.
    keepAlive: true,
  });
  pool.on('error', (err) => log.warn('db.idle_connection_closed', { message: err.message }));
  return { pool, db: drizzle({ client: pool, schema }) };
}
