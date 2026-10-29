/**
 * Background jobs with pg-boss (queue tables live in the `pgboss` schema of the same
 * Postgres database). Uses the DIRECT Neon connection, not the pooler.
 *
 * Queues (handlers are filled in by the stage that owns them):
 *   documents.purge     daily  – delete verification documents 90 days after decision (D8)   Stage 2
 *   retention.sweep     daily  – 6-month retention limits after account deletion (D8)          Stage 5
 *   notifications.send  on demand – deliver queued email/SMS notifications (outbox)            Stage 3-4
 *
 * Every run must log a run id, counts and failures, never document contents (spec 10.2).
 */
import PgBoss from 'pg-boss';
import type { Config } from '../config.ts';
import type { Db } from '../db/types.ts';
import { log } from '../lib/log.ts';
import type { Messenger } from '../messaging/messenger.ts';
import type { Storage } from '../storage/storage.ts';
import { sendNotifications } from './notifications.ts';
import { queueExpiryWarnings } from './plan-expiry.ts';
import { purgeDocuments } from './purge-documents.ts';

export const QUEUES = {
  documentsPurge: 'documents.purge',
  retentionSweep: 'retention.sweep',
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
  // 03:30 UTC = 09:00 Sri Lanka time, so warnings arrive in the morning.
  await boss.schedule(QUEUES.planExpiry, '30 3 * * *');
  await boss.schedule(QUEUES.notificationsSend, '*/2 * * * *');

  await boss.work(QUEUES.documentsPurge, async () => {
    const result = await purgeDocuments(deps);
    // Failed items stay due and are retried on the next run; make the run visible as failed too.
    if (result.failed) throw new Error(`documents.purge: ${result.failed} file(s) not deleted (run ${result.runId})`);
  });
  await boss.work(QUEUES.retentionSweep, async ([job]) => {
    log.info('jobs.retention_sweep.noop', { jobId: job?.id, note: 'implemented in Stage 5' });
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
