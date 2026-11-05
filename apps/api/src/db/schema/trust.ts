/**
 * Identity document review (§5, §8). One case per submission, with the front (a passport's photo page), the back and,
 * when the owner requires it, a selfie; the documents.purge job deletes the files 90 days after the decision (the
 * database queues the back and selfie with the front, 0014), and the decision itself is kept.
 */
import { sql } from 'drizzle-orm';
import { check, index, pgEnum, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { DOCUMENT_SIDES, DOCUMENT_TYPES, VERIFICATION_STATUSES } from '@fh/shared';
import { user } from './auth.ts';
import { at } from './columns.ts';
import { profile } from './members.ts';

export const documentType = pgEnum('document_type', DOCUMENT_TYPES);
export const verificationStatus = pgEnum('verification_status', VERIFICATION_STATUSES);
export const documentSide = pgEnum('document_side', DOCUMENT_SIDES);

export const verificationCase = pgTable(
  'verification_case',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** The person whose document this is: the self-managed candidate or the manager (§5). */
    subjectUserId: text('subject_user_id').references(() => user.id, { onDelete: 'set null' }),
    profileId: uuid('profile_id').references(() => profile.id, { onDelete: 'set null' }),
    documentType: documentType('document_type').notNull(),
    status: verificationStatus('status').notNull().default('pending'),
    /** The front, or a passport's photo page. */
    evidenceKey: text('evidence_key'),
    evidenceBackKey: text('evidence_back_key'),
    selfieKey: text('selfie_key'),
    submittedAt: at('submitted_at').notNull().defaultNow(),
    reviewedByUserId: text('reviewed_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    reviewedAt: at('reviewed_at'),
    decisionReason: text('decision_reason'),
    purgeAfter: at('purge_after'),
    purgedAt: at('purged_at'),
  },
  (t) => [
    index('verification_case_subject_idx').on(t.subjectUserId, t.status),
    uniqueIndex('verification_case_one_pending_idx').on(t.subjectUserId).where(sql`${t.status} = 'pending'`),
    check('verification_case_review_state', sql`(${t.status} = 'pending') = (${t.reviewedAt} is null)`),
    check('verification_case_rejection_reason', sql`${t.status} <> 'rejected' or ${t.decisionReason} is not null`),
    check(
      'verification_case_purged_evidence',
      sql`${t.purgedAt} is null or (${t.evidenceKey} is null and ${t.evidenceBackKey} is null and ${t.selfieKey} is null)`,
    ),
  ],
);

/**
 * A document photo chosen but not yet sent (owner, 5 Nov 2026): one per side and member, replaced when retaken, moved
 * into the case on submission, and deleted with its file after DOCUMENT_DRAFT_HOURS (app.purge_expired_drafts).
 */
export const verificationDraft = pgTable(
  'verification_draft',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    side: documentSide('side').notNull(),
    objectKey: text('object_key').notNull(),
    /** "phone" when it came through a phone link (QR code). */
    via: text('via').notNull().default('device'),
    createdAt: at('created_at').notNull().defaultNow(),
    expiresAt: at('expires_at').notNull(),
  },
  (t) => [
    uniqueIndex('verification_draft_side_idx').on(t.userId, t.side),
    index('verification_draft_expiry_idx').on(t.expiresAt),
    check('verification_draft_via', sql`${t.via} in ('device', 'phone')`),
  ],
);

/**
 * A phone link (QR code) that lets a phone add photos to its member's drafts without signing in (owner, 5 Nov 2026).
 * Only a hash of the token is stored; a new link revokes the old one, and it lasts UPLOAD_LINK_MINUTES.
 */
export const verificationUploadLink = pgTable(
  'verification_upload_link',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    createdAt: at('created_at').notNull().defaultNow(),
    expiresAt: at('expires_at').notNull(),
    revokedAt: at('revoked_at'),
  },
  (t) => [uniqueIndex('verification_upload_link_token_idx').on(t.tokenHash), index('verification_upload_link_user_idx').on(t.userId)],
);
