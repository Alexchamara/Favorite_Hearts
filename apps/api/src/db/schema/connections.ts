/**
 * Interests, connections and safety (§4, §7). An interest is one attempt; history is kept.
 * A connection exists only after both sides accept and is separate from plan access.
 */
import { sql } from 'drizzle-orm';
import { boolean, check, index, pgEnum, pgTable, primaryKey, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import {
  CONNECTION_END_REASONS,
  DISCLOSURE_ACTIONS,
  INTEREST_STATUSES,
  REPORT_CATEGORIES,
  REPORT_STATUSES,
} from '@fh/shared';
import { user } from './auth.ts';
import { at, createdAt } from './columns.ts';
import { photo, profile } from './members.ts';

export const interestStatus = pgEnum('interest_status', INTEREST_STATUSES);
export const connectionEndReason = pgEnum('connection_end_reason', CONNECTION_END_REASONS);
export const disclosureAction = pgEnum('disclosure_action', DISCLOSURE_ACTIONS);
export const reportCategory = pgEnum('report_category', REPORT_CATEGORIES);
export const reportStatus = pgEnum('report_status', REPORT_STATUSES);

export const interest = pgTable(
  'interest',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    senderProfileId: uuid('sender_profile_id')
      .notNull()
      .references(() => profile.id, { onDelete: 'cascade' }),
    receiverProfileId: uuid('receiver_profile_id')
      .notNull()
      .references(() => profile.id, { onDelete: 'cascade' }),
    senderUserId: text('sender_user_id').references(() => user.id, { onDelete: 'set null' }),
    pairLow: uuid('pair_low').generatedAlwaysAs(sql`least(sender_profile_id, receiver_profile_id)`),
    pairHigh: uuid('pair_high').generatedAlwaysAs(sql`greatest(sender_profile_id, receiver_profile_id)`),
    status: interestStatus('status').notNull().default('pending'),
    /** Version of the "what will be shared" confirmation the sender accepted (spec 12.2). */
    shareConsentVersion: text('share_consent_version').notNull(),
    idempotencyKey: text('idempotency_key').unique(),
    createdAt: createdAt(),
    respondedAt: at('responded_at'),
  },
  (t) => [
    uniqueIndex('interest_one_pending_pair_idx').on(t.pairLow, t.pairHigh).where(sql`${t.status} = 'pending'`),
    index('interest_receiver_idx').on(t.receiverProfileId, t.status),
    index('interest_sender_idx').on(t.senderProfileId, t.createdAt),
    check('interest_not_self', sql`${t.senderProfileId} <> ${t.receiverProfileId}`),
  ],
);

export const connection = pgTable(
  'connection',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    interestId: uuid('interest_id')
      .notNull()
      .unique()
      .references(() => interest.id, { onDelete: 'cascade' }),
    profileLow: uuid('profile_low')
      .notNull()
      .references(() => profile.id, { onDelete: 'cascade' }),
    profileHigh: uuid('profile_high')
      .notNull()
      .references(() => profile.id, { onDelete: 'cascade' }),
    acceptedAt: at('accepted_at').notNull().defaultNow(),
    endedAt: at('ended_at'),
    endedByUserId: text('ended_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    endReason: connectionEndReason('end_reason'),
  },
  (t) => [
    uniqueIndex('connection_one_active_pair_idx').on(t.profileLow, t.profileHigh).where(sql`${t.endedAt} is null`),
    index('connection_high_idx').on(t.profileHigh),
    check('connection_ordered_pair', sql`${t.profileLow} < ${t.profileHigh}`),
    check('connection_end_reason', sql`(${t.endedAt} is null) = (${t.endReason} is null)`),
  ],
);

export const shortlist = pgTable(
  'shortlist',
  {
    ownerProfileId: uuid('owner_profile_id')
      .notNull()
      .references(() => profile.id, { onDelete: 'cascade' }),
    targetProfileId: uuid('target_profile_id')
      .notNull()
      .references(() => profile.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.ownerProfileId, t.targetProfileId] }),
    check('shortlist_not_self', sql`${t.ownerProfileId} <> ${t.targetProfileId}`),
  ],
);

/** Kept (with profile links nulled) for the §8 retention period after a profile is deleted. */
export const block = pgTable(
  'block',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    blockerProfileId: uuid('blocker_profile_id').references(() => profile.id, { onDelete: 'set null' }),
    blockedProfileId: uuid('blocked_profile_id').references(() => profile.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    revokedAt: at('revoked_at'),
  },
  (t) => [
    uniqueIndex('block_one_active_idx')
      .on(t.blockerProfileId, t.blockedProfileId)
      .where(sql`${t.revokedAt} is null`),
    index('block_blocked_idx').on(t.blockedProfileId),
    check('block_not_self', sql`${t.blockerProfileId} <> ${t.blockedProfileId}`),
  ],
);

/** One charge per successful interest, so retries never count twice (spec 12.1). */
export const quotaLedger = pgTable(
  'quota_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profile.id, { onDelete: 'cascade' }),
    interestId: uuid('interest_id')
      .notNull()
      .unique()
      .references(() => interest.id, { onDelete: 'cascade' }),
    chargedAt: at('charged_at').notNull().defaultNow(),
  },
  (t) => [index('quota_ledger_profile_idx').on(t.profileId, t.chargedAt)],
);

/** Append-only record of which detail categories were shared with whom (§4). */
export const disclosureEvent = pgTable(
  'disclosure_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subjectProfileId: uuid('subject_profile_id').references(() => profile.id, { onDelete: 'set null' }),
    recipientProfileId: uuid('recipient_profile_id').references(() => profile.id, { onDelete: 'set null' }),
    connectionId: uuid('connection_id').references(() => connection.id, { onDelete: 'set null' }),
    actorUserId: text('actor_user_id'),
    action: disclosureAction('action').notNull(),
    /** e.g. manager_phone, candidate_email, socials, gallery: categories, never the values. */
    fieldCategories: text('field_categories').array().notNull(),
    policyVersion: text('policy_version').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('disclosure_event_subject_idx').on(t.subjectProfileId, t.createdAt)],
);

export const report = pgTable(
  'report',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reporterUserId: text('reporter_user_id').references(() => user.id, { onDelete: 'set null' }),
    reporterProfileId: uuid('reporter_profile_id').references(() => profile.id, { onDelete: 'set null' }),
    targetProfileId: uuid('target_profile_id').references(() => profile.id, { onDelete: 'set null' }),
    targetPhotoId: uuid('target_photo_id').references(() => photo.id, { onDelete: 'set null' }),
    category: reportCategory('category').notNull(),
    detail: text('detail'),
    /** Snapshot: was the reporter a verified member when reporting (§7 threshold counting). */
    reporterVerified: boolean('reporter_verified').notNull().default(false),
    status: reportStatus('status').notNull().default('open'),
    reviewedByUserId: text('reviewed_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    reviewedAt: at('reviewed_at'),
    staffNote: text('staff_note'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('report_one_open_idx')
      .on(t.reporterProfileId, t.targetProfileId, t.category)
      .where(sql`${t.status} = 'open'`),
    index('report_target_idx').on(t.targetProfileId, t.status),
    check('report_detail_length', sql`char_length(${t.detail}) <= 1000`),
    check('report_staff_note_length', sql`char_length(${t.staffNote}) <= 1000`),
  ],
);
