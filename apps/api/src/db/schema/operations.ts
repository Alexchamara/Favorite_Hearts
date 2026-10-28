/**
 * Staff audit trail, notification outbox and owner-controlled switches (§10, spec 12.1).
 */
import { sql } from 'drizzle-orm';
import { bigint, boolean, index, jsonb, pgEnum, pgTable, smallint, text, uuid } from 'drizzle-orm/pg-core';
import { NOTIFICATION_CHANNELS, NOTIFICATION_STATUSES, OPERATIONS_FLAGS } from '@fh/shared';
import { user } from './auth.ts';
import { at, createdAt, updatedAt } from './columns.ts';

export const notificationChannel = pgEnum('notification_channel', NOTIFICATION_CHANNELS);
export const notificationStatus = pgEnum('notification_status', NOTIFICATION_STATUSES);
export const operationsFlagKey = pgEnum('operations_flag_key', OPERATIONS_FLAGS);

/** Append-only. Actor ids are plain text so the trail survives account deletion. */
export const auditEvent = pgTable(
  'audit_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seq: bigint('seq', { mode: 'number' }).generatedAlwaysAsIdentity(),
    actorUserId: text('actor_user_id'),
    actorRole: text('actor_role'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    reason: text('reason'),
    correlationId: text('correlation_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index('audit_event_entity_idx').on(t.entityType, t.entityId)],
);

/** Written in the same transaction as the event; delivered by the notifications.send job. */
export const notificationOutbox = pgTable(
  'notification_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Idempotency: one notification per event key. */
    eventKey: text('event_key').notNull().unique(),
    recipientUserId: text('recipient_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    channel: notificationChannel('channel').notNull(),
    template: text('template').notNull(),
    templateVersion: smallint('template_version').notNull().default(1),
    /** Never a private sender identity for an unpaid recipient (spec 12.3). */
    payload: jsonb('payload')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: notificationStatus('status').notNull().default('queued'),
    attempts: smallint('attempts').notNull().default(0),
    lastError: text('last_error'),
    createdAt: createdAt(),
    sentAt: at('sent_at'),
  },
  (t) => [index('notification_outbox_status_idx').on(t.status, t.createdAt)],
);

export const operationsFlag = pgTable('operations_flag', {
  key: operationsFlagKey('key').primaryKey(),
  enabled: boolean('enabled').notNull().default(false),
  reason: text('reason'),
  updatedByUserId: text('updated_by_user_id').references(() => user.id, { onDelete: 'set null' }),
  updatedAt: updatedAt(),
});
