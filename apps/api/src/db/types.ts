import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type * as schema from './schema/index.ts';

/** Any Drizzle Postgres database with our schema: node-postgres (Neon) in production, PGlite in tests. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
