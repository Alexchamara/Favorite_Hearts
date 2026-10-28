/**
 * Row-level security as the SECOND layer under the API's own permission checks.
 *
 * Every data access for a signed-in person (or an anonymous visitor) runs inside `withActor`,
 * which runs as the database role fh_app with app.user_id / app.role set for that transaction
 * (see actor.ts). Tables have RLS enabled and deny by default; the policies, helper functions
 * and invariant triggers are in drizzle/0003_access_rules.sql and tested in test/access-rules.test.ts.
 */
import { db } from './client.ts';
import { runAsActor, type Actor, type ActorTx } from './actor.ts';

export type { Actor, ActorRole } from './actor.ts';
export type Tx = ActorTx<typeof db>;

export function withActor<T>(actor: Actor | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return runAsActor(db, actor, fn);
}
