/**
 * Deletes the files queued in `storage_deletion` by profile and account deletion and by the retention sweep
 * (OWNER-DECISIONS section 8). The API calls it straight after a deletion; the storage.cleanup job retries whatever
 * failed. Runs as the system (not fh_app). Logs counts only, never object keys.
 */
import { asc, eq, sql } from 'drizzle-orm';
import { storageDeletion } from '../db/schema/operations.ts';
import type { Db } from '../db/types.ts';
import type { Bucket, Storage } from '../storage/storage.ts';
import { log } from './log.ts';
import { rows } from './profile-view.ts';

export type CleanupResult = { deleted: number; failed: number };

export async function drainStorageDeletions({ db, storage }: { db: Db; storage: Storage }, limit = 500): Promise<CleanupResult> {
  const queued = await db.select().from(storageDeletion).orderBy(asc(storageDeletion.createdAt)).limit(limit);
  let deleted = 0;
  let failed = 0;
  for (const item of queued) {
    try {
      await storage.delete(item.bucket as Bucket, item.objectKey);
      await db.delete(storageDeletion).where(eq(storageDeletion.id, item.id));
      deleted += 1;
    } catch (err) {
      failed += 1;
      await db
        .update(storageDeletion)
        .set({ attempts: sql`${storageDeletion.attempts} + 1`, lastError: (err as Error).message.slice(0, 300) })
        .where(eq(storageDeletion.id, item.id));
    }
  }
  if (queued.length) log.info('storage.cleanup', { deleted, failed });
  return { deleted, failed };
}

/**
 * Document photos chosen but never sent are deleted after DOCUMENT_DRAFT_HOURS (owner, 5 Nov 2026): the database queues
 * their files (app.purge_expired_drafts), then the queue is drained. Run by storage.cleanup every 10 minutes.
 */
export async function purgeExpiredDrafts(deps: { db: Db; storage: Storage }): Promise<number> {
  const purged = Number(rows<{ purged: number }>(await deps.db.execute(sql`select app.purge_expired_drafts() as purged`))[0]?.purged ?? 0);
  if (purged) log.info('documents.drafts_expired', { purged });
  return purged;
}

/** After a deletion has committed: a failure here never fails the member's request, the job retries it. */
export async function cleanUpSoon(deps: { db: Db; storage: Storage }): Promise<void> {
  try {
    await drainStorageDeletions(deps);
  } catch (err) {
    log.error('storage.cleanup_failed', { message: (err as Error).message });
  }
}
