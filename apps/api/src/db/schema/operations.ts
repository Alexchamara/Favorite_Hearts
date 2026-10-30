/**
 * Staff audit trail, notification outbox and owner-controlled switches (§10, spec 12.1).
 */
import { sql } from 'drizzle-orm';
import { bigint, boolean, check, index, integer, jsonb, pgEnum, pgTable, smallint, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
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
    /** When a sender took it; a send that died is retried after a while (jobs/notifications.ts). */
    claimedAt: at('claimed_at'),
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

/**
 * §8: after an account is deleted only a scrambled form of its sign-in email and phone is kept (a keyed hash,
 * lib/identity-hash.ts), for 6 months, so that a banned person cannot sign up again. `profileIds` are the profiles
 * deleted with the account: a serious report upheld against one of them later still bans it.
 */
export const retainedIdentity = pgTable(
  'retained_identity',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    emailHash: text('email_hash'),
    phoneHash: text('phone_hash'),
    profileIds: uuid('profile_ids').array().notNull().default(sql`'{}'::uuid[]`),
    banned: boolean('banned').notNull().default(false),
    deletedAt: at('deleted_at').notNull().defaultNow(),
    purgeAfter: at('purge_after').notNull(),
  },
  (t) => [index('retained_identity_email_idx').on(t.emailHash), index('retained_identity_phone_idx').on(t.phoneHash)],
);

/**
 * Files whose rows are already gone (profile and account deletion, the retention sweep). The API deletes them
 * straight after the change and the storage.cleanup job retries any that failed (lib/storage-cleanup.ts).
 */
export const storageDeletion = pgTable(
  'storage_deletion',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bucket: text('bucket').notNull(),
    objectKey: text('object_key').notNull(),
    attempts: smallint('attempts').notNull().default(0),
    lastError: text('last_error'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('storage_deletion_object_idx').on(t.bucket, t.objectKey),
    check('storage_deletion_bucket', sql`${t.bucket} in ('private', 'derived')`),
  ],
);

/** Request counters for the rate limits (lib/rate-limit.ts): one row per key, its window restarts once passed. */
export const rateLimitCounter = pgTable('rate_limit_counter', {
  key: text('key').primaryKey(),
  windowStartedAt: at('window_started_at').notNull(),
  hits: integer('hits').notNull(),
});
