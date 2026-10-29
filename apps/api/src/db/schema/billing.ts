/**
 * Plans, prices, manual payments and plan access (§2, §3, §9). The owner manages the plans.
 * Money is stored in minor units with its currency. Prices are versioned rows, never edited:
 * a change closes the current version and inserts a new one, so payments keep their quote.
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  CURRENCIES,
  ENTITLEMENT_KINDS,
  PAYMENT_CHANNELS,
  PAYMENT_STATUSES,
  PLAN_TIERS,
  REFUND_REASONS,
  RESIDENCE_BANDS,
} from '@fh/shared';
import { user } from './auth.ts';
import { at, createdAt, updatedAt } from './columns.ts';
import { profile } from './members.ts';

export const planTier = pgEnum('plan_tier', PLAN_TIERS);
export const residenceBand = pgEnum('residence_band', RESIDENCE_BANDS);
export const currency = pgEnum('currency', CURRENCIES);
export const paymentChannel = pgEnum('payment_channel', PAYMENT_CHANNELS);
export const paymentStatus = pgEnum('payment_status', PAYMENT_STATUSES);
export const refundReason = pgEnum('refund_reason', REFUND_REASONS);
export const entitlementKind = pgEnum('entitlement_kind', ENTITLEMENT_KINDS);

export const plan = pgTable(
  'plan',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    tier: planTier('tier').notNull(),
    /**
     * Owner decision (29 Oct 2026): a higher level is an upgrade (starts on approval), the same level
     * renews only in the last 7 days, and a lower level is blocked while a plan is active.
     */
    level: smallint('level').notNull(),
    sortOrder: smallint('sort_order').notNull().default(0),
    termMonths: smallint('term_months').notNull(),
    /** §2: Starter 5/day and 30/month; Premium fair-use 30/day. */
    dailyRequestCap: smallint('daily_request_cap').notNull(),
    monthlyRequestCap: smallint('monthly_request_cap'),
    /** Retired plans are no longer sold; a plan that was ever bought is retired, never deleted. */
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('plan_term_positive', sql`${t.termMonths} > 0`),
    check('plan_caps_positive', sql`${t.dailyRequestCap} > 0 and (${t.monthlyRequestCap} is null or ${t.monthlyRequestCap} > 0)`),
    check('plan_name_length', sql`char_length(${t.name}) between 2 and 40`),
    check('plan_level_range', sql`${t.level} between 1 and 99`),
  ],
);

export const priceVersion = pgTable(
  'price_version',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: text('plan_id')
      .notNull()
      .references(() => plan.id, { onDelete: 'restrict' }),
    residenceBand: residenceBand('residence_band').notNull(),
    currency: currency('currency').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    effectiveFrom: at('effective_from').notNull().defaultNow(),
    effectiveTo: at('effective_to'),
    createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('price_version_current_idx').on(t.planId, t.residenceBand).where(sql`${t.effectiveTo} is null`),
    check('price_version_amount_positive', sql`${t.amountMinor} > 0`),
    check(
      'price_version_band_currency',
      sql`(${t.residenceBand} = 'local' and ${t.currency} = 'LKR') or (${t.residenceBand} = 'diaspora' and ${t.currency} = 'USD')`,
    ),
    check('price_version_dates', sql`${t.effectiveTo} is null or ${t.effectiveTo} > ${t.effectiveFrom}`),
  ],
);

/**
 * A member's manual payment for one profile (§9). Only the owner approves; the matched bank
 * or Wise statement line (`settlement_ref`) can be used once, so a transfer never activates twice.
 */
export const paymentSubmission = pgTable(
  'payment_submission',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id').references(() => profile.id, { onDelete: 'set null' }),
    payerUserId: text('payer_user_id').references(() => user.id, { onDelete: 'set null' }),
    priceVersionId: uuid('price_version_id')
      .notNull()
      .references(() => priceVersion.id, { onDelete: 'restrict' }),
    planId: text('plan_id')
      .notNull()
      .references(() => plan.id, { onDelete: 'restrict' }),
    currency: currency('currency').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    /** §9: unique reference the member includes in the transfer. */
    reference: text('reference').notNull().unique(),
    channel: paymentChannel('channel').notNull(),
    declaredResidenceCountry: varchar('declared_residence_country', { length: 2 }),
    /** The quote as the member saw it, so later plan edits never change what they paid for. */
    planName: text('plan_name'),
    planLevel: smallint('plan_level'),
    termMonths: smallint('term_months'),
    dailyRequestCap: smallint('daily_request_cap'),
    monthlyRequestCap: smallint('monthly_request_cap'),
    /** new | upgrade | renewal, when the payment was started; approval checks again. */
    changeKind: text('change_kind'),
    /** §3: days the member confirmed losing on the current plan (upgrade or early renewal). */
    lostDaysAck: smallint('lost_days_ack'),
    /** §9: the refund terms version the member confirmed. */
    refundTermsVersion: text('refund_terms_version'),
    /** Latest receipt (every receipt is kept in payment_proof). */
    proofKey: text('proof_key'),
    /** First receipt: a renewal sent before the plan ended keeps access for up to 3 days (§3). */
    proofSubmittedAt: at('proof_submitted_at'),
    status: paymentStatus('status').notNull().default('awaiting_proof'),
    /** The matched statement line (bank, Wise or PayPal transaction): usable once across all payments. */
    settlementRef: text('settlement_ref').unique(),
    reviewedByUserId: text('reviewed_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    reviewedAt: at('reviewed_at'),
    /** Shown to the payer: why it was rejected, or what the owner needs. */
    decisionNote: text('decision_note'),
    /** The owner's own note; never shown to members. */
    ownerNote: text('owner_note'),
    refundReason: refundReason('refund_reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('payment_submission_profile_idx').on(t.profileId),
    index('payment_submission_status_idx').on(t.status),
    /** One open payment per profile, so a transfer can only be meant for one of them. */
    uniqueIndex('payment_submission_one_open_idx')
      .on(t.profileId)
      .where(sql`${t.status} in ('awaiting_proof', 'pending_review', 'held')`),
    check('payment_submission_amount_positive', sql`${t.amountMinor} > 0`),
    check('payment_submission_proof_before_review', sql`${t.status} <> 'pending_review' or ${t.proofKey} is not null`),
    check(
      'payment_submission_approval_evidence',
      sql`${t.status} not in ('approved', 'refunded') or (${t.settlementRef} is not null and ${t.reviewedAt} is not null)`,
    ),
    check('payment_submission_refund_reason', sql`(${t.status} = 'refunded') = (${t.refundReason} is not null)`),
  ],
);

/** Every receipt a payer uploaded (spec 9.3: resubmission keeps the earlier evidence). Private bucket. */
export const paymentProof = pgTable(
  'payment_proof',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => paymentSubmission.id, { onDelete: 'cascade' }),
    objectKey: text('object_key').notNull(),
    uploadedByUserId: text('uploaded_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    uploadedAt: at('uploaded_at').notNull().defaultNow(),
  },
  (t) => [index('payment_proof_payment_idx').on(t.paymentId)],
);

/**
 * The owner's real payment details per channel (§9: never invented). Members see a channel only once
 * the owner has entered its details and switched it on.
 */
export const paymentChannelSetting = pgTable(
  'payment_channel_setting',
  {
    channel: paymentChannel('channel').primaryKey(),
    enabled: boolean('enabled').notNull().default(false),
    instructions: text('instructions'),
    updatedByUserId: text('updated_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    updatedAt: at('updated_at'),
  },
  (t) => [
    check('payment_channel_setting_ready', sql`not ${t.enabled} or char_length(${t.instructions}) >= 10`),
    check('payment_channel_setting_length', sql`char_length(${t.instructions}) <= 1500`),
  ],
);

/**
 * Append-only plan history per profile (spec 12.1). The latest event (highest seq) decides
 * whether a profile has an active plan; one grant per approved payment.
 */
export const entitlementEvent = pgTable(
  'entitlement_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seq: bigint('seq', { mode: 'number' }).generatedAlwaysAsIdentity(),
    profileId: uuid('profile_id').references(() => profile.id, { onDelete: 'set null' }),
    kind: entitlementKind('kind').notNull(),
    planId: text('plan_id').references(() => plan.id, { onDelete: 'restrict' }),
    paymentSubmissionId: uuid('payment_submission_id').references(() => paymentSubmission.id, {
      onDelete: 'set null',
    }),
    startsAt: at('starts_at'),
    endsAt: at('ends_at'),
    dailyRequestCap: smallint('daily_request_cap'),
    monthlyRequestCap: smallint('monthly_request_cap'),
    actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    reason: text('reason'),
    createdAt: createdAt(),
  },
  (t) => [
    index('entitlement_event_profile_idx').on(t.profileId, t.seq),
    uniqueIndex('entitlement_event_one_grant_per_payment_idx')
      .on(t.paymentSubmissionId)
      .where(sql`${t.kind} in ('grant', 'replace')`),
    check(
      'entitlement_event_grant_period',
      sql`${t.kind} not in ('grant', 'replace') or (${t.planId} is not null and ${t.startsAt} is not null and ${t.endsAt} > ${t.startsAt})`,
    ),
  ],
);
