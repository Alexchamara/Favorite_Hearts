import type { Context } from 'hono';
import { auditEvent } from '../db/schema/operations.ts';
import type { AppEnv, Tx } from '../http.ts';

/**
 * Staff and system actions are recorded with actor, role, object, time and reason (spec 10.1).
 * Never put document contents, codes or contact details in `metadata`.
 */
export async function audit(
  c: Context<AppEnv>,
  tx: Tx,
  event: { action: string; entityType: string; entityId?: string; reason?: string; metadata?: Record<string, unknown> },
): Promise<void> {
  await tx.insert(auditEvent).values({
    actorUserId: c.var.actor?.userId ?? null,
    actorRole: c.var.actor?.role ?? null,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId ?? null,
    reason: event.reason ?? null,
    metadata: event.metadata ?? null,
  });
}
