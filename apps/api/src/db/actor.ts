/**
 * The database side of every member or staff request (row-level security is the SECOND layer
 * under the API's own permission checks; rules in drizzle/0003_access_rules.sql).
 *
 * `runAsActor` opens a transaction, drops to the role `fh_app` (no BYPASSRLS, explicit grants
 * only) and sets two transaction-local settings that the policies read:
 *   app.user_id  – the authenticated Better-Auth user id ('' = anonymous)
 *   app.role     – 'member' | 'owner' | 'backup_reviewer'
 * Staff roles are re-checked by the policies (active staff_member row + two-step login), so a
 * wrong app.role alone grants nothing. Code outside runAsActor (Better-Auth, jobs, migrations)
 * runs as the connection's own role and is not subject to these policies: keep it minimal.
 *
 * Kept free of env/client imports so tests can run it against PGlite.
 */
import { sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

export type ActorRole = 'member' | 'owner' | 'backup_reviewer';
export type Actor = { userId: string; role: ActorRole };

type AnyDb = PgDatabase<PgQueryResultHKT, Record<string, unknown>>;
export type ActorTx<D extends AnyDb> = Parameters<Parameters<D['transaction']>[0]>[0];
type Executor = { execute: AnyDb['execute'] };

/** Points the current transaction at `actor` (null = anonymous visitor). */
export async function setActor(tx: Executor, actor: Actor | null): Promise<void> {
  await tx.execute(
    sql`select set_config('app.user_id', ${actor?.userId ?? ''}, true), set_config('app.role', ${actor?.role ?? ''}, true)`,
  );
}

export async function runAsActor<D extends AnyDb, T>(
  database: D,
  actor: Actor | null,
  fn: (tx: ActorTx<D>) => Promise<T>,
): Promise<T> {
  return database.transaction(async (tx) => {
    await tx.execute(sql`set local role fh_app`);
    await setActor(tx, actor);
    return fn(tx as ActorTx<D>);
  }) as Promise<T>;
}
