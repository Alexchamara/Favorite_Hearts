/**
 * Row-level security as the SECOND layer under the API's own permission checks.
 *
 * Every data access for a signed-in person runs inside `withActor`, which opens a
 * transaction and sets two transaction-local settings that RLS policies read:
 *   app.user_id  – the authenticated Better-Auth user id
 *   app.role     – 'member' | 'owner' | 'backup_reviewer'
 *
 * Policies (added with the domain tables in Stage 1) use helper functions such as
 *   create function app.user_id() returns text language sql stable
 *     as $$ select nullif(current_setting('app.user_id', true), '') $$;
 * and every table gets `alter table ... enable row level security; ... force row level security;`
 * so even the table owner cannot skip them. The API connects as a role WITHOUT BYPASSRLS;
 * migrations run as the owner role over the direct connection.
 */
import { sql } from 'drizzle-orm';
import { db } from './client.ts';

export type ActorRole = 'member' | 'owner' | 'backup_reviewer';
export type Actor = { userId: string; role: ActorRole };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function withActor<T>(actor: Actor, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.user_id', ${actor.userId}, true), set_config('app.role', ${actor.role}, true)`,
    );
    return fn(tx);
  });
}
