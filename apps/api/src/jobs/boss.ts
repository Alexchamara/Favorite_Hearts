/**
 * Background jobs with pg-boss (queue tables live in the `pgboss` schema of the same
 * Postgres database). Uses the DIRECT Neon connection, not the pooler.
 *
 * Queues:
 *   documents.purge       daily        – delete verification documents 90 days after decision (D8)    Stage 2
 *   retention.sweep       daily        – remove what was kept 6 months after a deletion (D8)          Stage 5
 *   storage.cleanup       every 10 min – retry file deletions that failed straight after a deletion   Stage 5
 *   notifications.send    every 2 min  – deliver queued email/SMS notifications (outbox)             Stage 3-4
 *   plans.expiry_warnings daily        – plan expiry emails (D3)                                       Stage 4
 *
 * Every run must log a run id, counts and failures, never document contents (spec 10.2).
 */
import PgBoss from 'pg-boss';
import type { Config } from '../config.ts';
import type { Db } from '../db/types.ts';
import { log } from '../lib/log.ts';
import { drainStorageDeletions } from '../lib/storage-cleanup.ts';
import type { Messenger } from '../messaging/messenger.ts';
import type { Storage } from '../storage/storage.ts';
import { sendNotifications } from './notifications.ts';
import { queueExpiryWarnings } from './plan-expiry.ts';
import { purgeDocuments } from './purge-documents.ts';
import { sweepRetention } from './retention.ts';

export const QUEUES = {
  documentsPurge: 'documents.purge',
  retentionSweep: 'retention.sweep',
  storageCleanup: 'storage.cleanup',
  notificationsSend: 'notifications.send',
  planExpiry: 'plans.expiry_warnings',
} as const;

type JobDeps = { db: Db; storage: Storage; messenger: Messenger; config: Config };

export async function startJobs(deps: JobDeps, connectionString: string): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString, schema: 'pgboss' });
  boss.on('error', (err) => log.error('jobs.error', { message: err.message }));
  await boss.start();
  for (const name of Object.values(QUEUES)) await boss.createQueue(name);

  // Times are UTC. 20:30 UTC = 02:00 Sri Lanka time.
  await boss.schedule(QUEUES.documentsPurge, '30 20 * * *');
  await boss.schedule(QUEUES.retentionSweep, '45 20 * * *');
  await boss.schedule(QUEUES.storageCleanup, '*/10 * * * *');
  // 03:30 UTC = 09:00 Sri Lanka time, so warnings arrive in the morning.
  await boss.schedule(QUEUES.planExpiry, '30 3 * * *');
  await boss.schedule(QUEUES.notificationsSend, '*/2 * * * *');

  await boss.work(QUEUES.documentsPurge, async () => {
    const result = await purgeDocuments(deps);
    // Failed items stay due and are retried on the next run; make the run visible as failed too.
    if (result.failed) throw new Error(`documents.purge: ${result.failed} file(s) not deleted (run ${result.runId})`);
  });
  await boss.work(QUEUES.retentionSweep, async () => {
    const result = await sweepRetention(deps);
    // Files that failed stay queued for storage.cleanup; make the run visible as failed too.
    if (result.files.failed) throw new Error(`retention.sweep: ${result.files.failed} file(s) not deleted (run ${result.runId})`);
  });
  await boss.work(QUEUES.storageCleanup, async () => {
    await drainStorageDeletions(deps);
  });
  await boss.work(QUEUES.planExpiry, async () => {
    await queueExpiryWarnings(deps);
  });
  await boss.work(QUEUES.notificationsSend, async () => {
    await sendNotifications(deps);
  });

  log.info('jobs.started', { queues: Object.values(QUEUES).join(',') });
  return boss;
}
