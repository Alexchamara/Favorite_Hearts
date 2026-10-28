/**
 * documents.purge (OWNER-DECISIONS section 8): identity document files are deleted 90 days after
 * the decision (approved or rejected); the case keeps only type, reviewer, date and decision.
 *
 * Runs as the system (not fh_app). Each file is deleted before its key is cleared, so a failure
 * leaves the case due and the next run retries it (spec X01). Logs and audits counts only —
 * never document contents or object keys.
 */
import { randomUUID } from 'node:crypto';
import { and, eq, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { auditEvent } from '../db/schema/operations.ts';
import { verificationCase } from '../db/schema/trust.ts';
import type { Db } from '../db/types.ts';
import { log } from '../lib/log.ts';
import type { Storage } from '../storage/storage.ts';

export type PurgeResult = { runId: string; due: number; purged: number; failed: number };

export async function purgeDocuments({ db, storage }: { db: Db; storage: Storage }, batchSize = 200): Promise<PurgeResult> {
  const runId = randomUUID();
  const due = await db
    .select({ id: verificationCase.id, key: verificationCase.evidenceKey })
    .from(verificationCase)
    .where(and(isNotNull(verificationCase.evidenceKey), isNull(verificationCase.purgedAt), lte(verificationCase.purgeAfter, sql`now()`)))
    .limit(batchSize);

  let purged = 0;
  let failed = 0;
  for (const item of due) {
    try {
      await storage.delete('private', item.key!);
      await db
        .update(verificationCase)
        .set({ evidenceKey: null, purgedAt: sql`now()` })
        .where(eq(verificationCase.id, item.id));
      purged += 1;
    } catch (err) {
      failed += 1;
      log.error('jobs.documents_purge.item_failed', { runId, caseId: item.id, message: (err as Error).message });
    }
  }

  const result = { runId, due: due.length, purged, failed };
  await db.insert(auditEvent).values({
    actorRole: 'system',
    action: 'documents.purge',
    entityType: 'verification_case',
    metadata: result,
  });
  log.info('jobs.documents_purge.done', result);
  return result;
}
