/**
 * Plans the owner manages and manual payments (OWNER-DECISIONS sections 2, 3 and 9). The database
 * enforces every rule again (drizzle/0009_payment_rules.sql); these schemas give readable answers first.
 */
import { z } from 'zod';
import { CURRENCIES, PAYMENT_CHANNELS, PLAN_TIERS, REFUND_REASONS } from './domain.ts';

/** §3: renewing at the same level opens this many days before the plan ends. */
export const RENEWAL_WINDOW_DAYS = 7;
/** §3 (owner decision, 29 Oct 2026): access continues this long after the end while a renewal receipt waits. */
export const RENEWAL_GRACE_DAYS = 3;
/** Version of the refund terms a payer confirms at the payment step (§9). */
export const REFUND_TERMS_VERSION = 'refund-v1';
/** Receipts kept per payment: a replacement never deletes the earlier one. */
export const MAX_PAYMENT_PROOFS = 5;

/** §9: LKR arrives by local bank transfer; USD by SWIFT, Wise or PayPal. */
export const CHANNEL_CURRENCY = {
  lkr_bank_transfer: 'LKR',
  usd_swift: 'USD',
  wise: 'USD',
  paypal: 'USD',
} as const satisfies Record<(typeof PAYMENT_CHANNELS)[number], (typeof CURRENCIES)[number]>;

/** What buying a plan does now (owner decision, 29 Oct 2026: by plan level). */
export const PLAN_CHANGE_KINDS = ['new', 'upgrade', 'renewal', 'blocked'] as const;
export const PLAN_BLOCK_REASONS = ['downgrade', 'renewal_window', 'plan_unavailable'] as const;
/** After a refund the owner decides whether the plan that payment bought ends now (spec 9.3). */
export const REFUND_CONSEQUENCES = ['end_plan', 'keep_plan'] as const;

/** Sri Lanka pays the local price in LKR; everywhere else the diaspora price in USD (§2). */
export const bandForCountry = (country: string) => (country === 'LK' ? 'local' : 'diaspora');

const text = (min: number, max: number, message: string) => z.string().trim().min(min, message).max(max, message);
const optionalNote = z.string().trim().max(1000).optional();
const whole = (min: number, max: number, message: string) => z.number({ error: message }).int(message).min(min, message).max(max, message);
const country = z
  .string({ error: 'validation.residenceCountry' })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, 'validation.residenceCountry');
/** Money in minor units (cents): LKR 3,000.00 is 300000. */
const amountMinor = whole(1, 1_000_000_000, 'validation.staff.priceMinor');
const settlementRef = text(3, 100, 'validation.staff.statementLine');

// --- Members --------------------------------------------------------------------------------------------

export const startPaymentSchema = z
  .object({
    planId: z.string().min(1, 'validation.choosePlan'),
    residenceCountry: country,
    channel: z.enum(PAYMENT_CHANNELS, { error: 'validation.paymentChannel' }),
    /** §9: no refunds once a plan is active, except duplicate or mistaken payments and failures on our side. */
    confirmRefundTerms: z.literal(true, { error: 'validation.confirmRefundTerms' }),
    /** §3: an upgrade or renewal starts on approval, so unused days on the current plan are lost. */
    confirmLostDays: z.boolean().optional(),
  })
  .strict();

// --- Owner: plans and prices -------------------------------------------------------------------------------

const planFields = {
  name: text(2, 40, 'validation.staff.planName'),
  description: z.string().trim().max(200).nullable(),
  tier: z.enum(PLAN_TIERS, { error: 'validation.staff.planTier' }),
  /** Higher is better: buying a higher level is an upgrade, a lower one is blocked while a plan is active. */
  level: whole(1, 99, 'validation.staff.planLevel'),
  sortOrder: whole(0, 999, 'validation.staff.planPosition'),
  termMonths: whole(1, 24, 'validation.staff.planTerm'),
  dailyRequestCap: whole(1, 500, 'validation.staff.planDailyCap'),
  monthlyRequestCap: whole(1, 10_000, 'validation.staff.planMonthlyCap').nullable(),
};

export const planCreateSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z][a-z0-9_]{2,39}$/, 'validation.staff.planId'),
    ...planFields,
    description: planFields.description.default(null),
    sortOrder: planFields.sortOrder.default(0),
    monthlyRequestCap: planFields.monthlyRequestCap.default(null),
    prices: z
      .object({ LKR: amountMinor.nullable().default(null), USD: amountMinor.nullable().default(null) })
      .strict()
      .refine((p) => p.LKR !== null || p.USD !== null, 'validation.staff.planPrice'),
  })
  .strict();

export const planUpdateSchema = z
  .object({ ...planFields, active: z.boolean() })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'validation.staff.planChange');

/** A new price replaces the current one from now; quotes already given keep theirs. `null` stops selling. */
export const priceChangeSchema = z
  .object({ currency: z.enum(CURRENCIES, { error: 'validation.staff.currency' }), amountMinor: amountMinor.nullable() })
  .strict();

/** The owner's own payment details, shown to members at the payment step (never invented: section 9). */
export const paymentSettingSchema = z
  .object({
    enabled: z.boolean(),
    instructions: z.string().trim().max(1500).nullable(),
  })
  .strict()
  .refine((s) => !s.enabled || (s.instructions !== null && s.instructions.length >= 10), {
    path: ['instructions'],
    message: 'validation.staff.paymentInstructions',
  });

// --- Owner: payment decisions ----------------------------------------------------------------------------

export const approvePaymentSchema = z.object({ settlementRef, ownerNote: optionalNote }).strict();
/** The reason is shown to the payer, so they know what to correct. */
export const rejectPaymentSchema = z
  .object({ reason: text(5, 500, 'validation.staff.rejectReason'), ownerNote: optionalNote })
  .strict();
export const holdPaymentSchema = z
  .object({ message: text(5, 500, 'validation.staff.holdMessage'), ownerNote: optionalNote })
  .strict();
export const refundPaymentSchema = z
  .object({
    reason: z.enum(REFUND_REASONS, { error: 'validation.staff.refundReason' }),
    consequence: z.enum(REFUND_CONSEQUENCES, { error: 'validation.staff.refundConsequence' }),
    /** Needed when the payment was never approved: the statement line of the money being returned. */
    settlementRef: settlementRef.optional(),
    message: z.string().trim().max(500).optional(),
    ownerNote: optionalNote,
  })
  .strict();
export const ownerNoteSchema = z.object({ ownerNote: z.string().trim().max(1000) }).strict();
export const settlementCorrectionSchema = z
  .object({ settlementRef, reason: text(5, 500, 'validation.staff.correctionReason') })
  .strict();
export const grantPlanSchema = z
  .object({
    planId: z.string().min(1, 'validation.choosePlan'),
    /** Omitted: the plan's own length from now. */
    days: whole(1, 400, 'validation.staff.grantDays').optional(),
    reason: text(5, 500, 'validation.staff.planReason'),
  })
  .strict();
export const revokePlanSchema = z.object({ reason: text(5, 500, 'validation.staff.planReason') }).strict();
