import { serve } from '@hono/node-server';
import { app } from './app.ts';
import { pool } from './db/client.ts';
import { env } from './env.ts';
import { startJobs, stopJobs } from './jobs/boss.ts';
import { log } from './lib/log.ts';

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  log.info('api.listening', { port: info.port, env: env.NODE_ENV });
});

if (env.RUN_JOBS) {
  startJobs().catch((err: Error) => log.error('jobs.start_failed', { message: err.message }));
}

async function shutdown(signal: string) {
  log.info('api.shutdown', { signal });
  server.close();
  if (env.RUN_JOBS) await stopJobs().catch(() => undefined);
  await pool.end().catch(() => undefined);
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
