/**
 * Identity document review (§5, §8). One case per submission; the evidence object key is
 * removed by the documents.purge job 90 days after the decision, the decision itself is kept.
 */
import { sql } from 'drizzle-orm';
import { check, index, pgEnum, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { DOCUMENT_TYPES, VERIFICATION_STATUSES } from '@fh/shared';
import { user } from './auth.ts';
import { at } from './columns.ts';
import { profile } from './members.ts';

export const documentType = pgEnum('document_type', DOCUMENT_TYPES);
export const verificationStatus = pgEnum('verification_status', VERIFICATION_STATUSES);

export const verificationCase = pgTable(
  'verification_case',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** The person whose document this is: the self-managed candidate or the manager (§5). */
    subjectUserId: text('subject_user_id').references(() => user.id, { onDelete: 'set null' }),
    profileId: uuid('profile_id').references(() => profile.id, { onDelete: 'set null' }),
    documentType: documentType('document_type').notNull(),
    status: verificationStatus('status').notNull().default('pending'),
    evidenceKey: text('evidence_key'),
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
    check('verification_case_purged_evidence', sql`${t.purgedAt} is null or ${t.evidenceKey} is null`),
  ],
);
