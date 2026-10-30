/**
 * Public: whether the owner has paused new sign-ups or document submissions (OWNER-DECISIONS section 10), so the app
 * can say so before anyone fills in a form. The pauses themselves are enforced where the work happens (auth.ts,
 * middleware/session.ts, routes/verification.ts).
 */
import { Hono } from 'hono';
import type { ServiceStatus } from '@fh/shared';
import { operationsFlag } from '../db/schema/operations.ts';
import { withActor, type AppEnv } from '../http.ts';

export const serviceStatus = new Hono<AppEnv>().get('/', async (c) => {
  const flags = await withActor(c, (tx) => tx.select({ key: operationsFlag.key, enabled: operationsFlag.enabled }).from(operationsFlag));
  const on = (key: (typeof flags)[number]['key']) => flags.some((flag) => flag.key === key && flag.enabled);
  return c.json<ServiceStatus>({ signupsPaused: on('signups_paused'), documentSubmissionsPaused: on('document_submissions_paused') });
});
