/**
 * retention.sweep (OWNER-DECISIONS section 8): 6 months after a profile or an account was deleted, the records kept
 * for it go (app.retention_purge, drizzle/0011_safety_rules.sql), then the receipt files. Old rate-limit counters are
 * cleared on the same run. Runs as the system (not fh_app); logs and audits counts only.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { RETENTION_MONTHS } from '@fh/shared';
import { auditEvent } from '../db/schema/operations.ts';
import type { Db } from '../db/types.ts';
import { log } from '../lib/log.ts';
import { rows } from '../lib/profile-view.ts';
import { deleteOldCounters } from '../lib/rate-limit.ts';
import { drainStorageDeletions } from '../lib/storage-cleanup.ts';
import type { Storage } from '../storage/storage.ts';

export type SweepResult = {
  runId: string;
  removed: { profiles: number; accounts: number; payments: number; receipts: number; reports: number; auditEvents: number };
  files: { deleted: number; failed: number };
  counters: number;
};

export async function sweepRetention(deps: { db: Db; storage: Storage }, months = RETENTION_MONTHS): Promise<SweepResult> {
  const runId = randomUUID();
  const [row] = rows<{ removed: SweepResult['removed'] }>(await deps.db.execute(sql`select app.retention_purge(${months}::integer) as removed`));
  const files = await drainStorageDeletions(deps);
  const counters = await deleteOldCounters(deps.db);
  const result = { runId, removed: row!.removed, files, counters };
  await deps.db.insert(auditEvent).values({ actorRole: 'system', action: 'retention.sweep', entityType: 'retention', metadata: result });
  log.info('jobs.retention_sweep.done', { runId, ...row!.removed, filesDeleted: files.deleted, filesFailed: files.failed, counters });
  return result;
}
