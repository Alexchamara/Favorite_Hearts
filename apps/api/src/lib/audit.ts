import type { Context } from 'hono';
import { auditEvent } from '../db/schema/operations.ts';
import type { Db } from '../db/types.ts';
import type { AppEnv, Tx } from '../http.ts';
import { clientIp } from './rate-limit.ts';

export type AuditEvent = { action: string; entityType: string; entityId?: string; reason?: string; metadata?: Record<string, unknown> };

/** Where a request came from, as the audit trail keeps it: the session, a shortened address and the browser. */
export type AuditOrigin = { sessionId?: string | null; ip?: string | null; userAgent?: string | null; correlationId?: string | null };

/**
 * The address cut to its network, so the trail shows where a request came from without pinpointing a household:
 * IPv4 to /24 (203.0.113.x), IPv6 to /48.
 */
export function shortIp(ip: string | null | undefined): string | null {
  if (!ip || ip === 'unknown') return null;
  const v4 = ip.match(/^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0/24`;
  if (ip.includes(':')) {
    const groups = ip.split('::')[0]!.split(':').filter(Boolean);
    return `${groups.slice(0, 3).join(':') || '0'}::/48`;
  }
  return null;
}

export const shortUserAgent = (value: string | null | undefined) => (value ? value.slice(0, 200) : null);

/** The request's own origin (docs/ADMIN-PANEL-PLAN.md, layer 9). */
export function requestOrigin(c: Context<AppEnv>): AuditOrigin {
  return {
    sessionId: c.var.session?.id ?? null,
    ip: shortIp(clientIp(c)),
    userAgent: shortUserAgent(c.req.header('user-agent')),
    correlationId: c.var.requestId ?? null,
  };
}

/**
 * Staff and system actions are recorded with actor, role, object, time and reason (spec 10.1), plus the session,
 * a shortened address, the browser and the request id. A trigger chains every row to the one before it.
 * Never put document contents, codes or contact details in `metadata`.
 */
export async function audit(c: Context<AppEnv>, tx: Tx, event: AuditEvent): Promise<void> {
  const origin = requestOrigin(c);
  await tx.insert(auditEvent).values({
    actorUserId: c.var.actor?.userId ?? null,
    actorRole: c.var.actor?.role ?? null,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId ?? null,
    reason: event.reason ?? null,
    metadata: event.metadata ?? null,
    sessionId: origin.sessionId ?? null,
    ip: origin.ip ?? null,
    userAgent: origin.userAgent ?? null,
    correlationId: origin.correlationId ?? null,
  });
}

/**
 * The same record written by the server itself (sign-in events, the staff command line), outside a member or staff
 * transaction: `actor` is who it is about, when known.
 */
export async function auditSystem(
  db: Db | Tx,
  event: AuditEvent & { actor?: { userId: string; role: string } | null; origin?: AuditOrigin },
): Promise<void> {
  await db.insert(auditEvent).values({
    actorUserId: event.actor?.userId ?? null,
    actorRole: event.actor?.role ?? null,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId ?? null,
    reason: event.reason ?? null,
    metadata: event.metadata ?? null,
    sessionId: event.origin?.sessionId ?? null,
    ip: event.origin?.ip ?? null,
    userAgent: event.origin?.userAgent ?? null,
    correlationId: event.origin?.correlationId ?? null,
  });
}
