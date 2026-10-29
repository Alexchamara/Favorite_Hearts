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
const optionalNote = z.string().trim().max(1000, 'Keep it to 1000 characters or fewer.').optional();
const whole = (min: number, max: number, message: string) => z.number({ error: message }).int(message).min(min, message).max(max, message);
const country = z
  .string({ error: 'Choose the country you live in.' })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, 'Choose the country you live in.');
/** Money in minor units (cents): LKR 3,000.00 is 300000. */
const amountMinor = whole(1, 1_000_000_000, 'Enter the price in cents, as a whole number above 0.');
const settlementRef = text(3, 100, 'Enter the transaction ID or line from the bank, Wise or PayPal statement (3–100 characters).');

// --- Members --------------------------------------------------------------------------------------------

export const startPaymentSchema = z
  .object({
    planId: z.string().min(1, 'Choose a plan.'),
    residenceCountry: country,
    channel: z.enum(PAYMENT_CHANNELS, { error: 'Choose how you will pay.' }),
    /** §9: no refunds once a plan is active, except duplicate or mistaken payments and failures on our side. */
    confirmRefundTerms: z.literal(true, { error: 'Confirm that you have read the refund terms.' }),
    /** §3: an upgrade or renewal starts on approval, so unused days on the current plan are lost. */
    confirmLostDays: z.boolean().optional(),
  })
  .strict();

// --- Owner: plans and prices -------------------------------------------------------------------------------

const planFields = {
  name: text(2, 40, 'Use 2 to 40 characters for the name.'),
  description: z.string().trim().max(200, 'Keep it to 200 characters or fewer.').nullable(),
  tier: z.enum(PLAN_TIERS, { error: 'Choose Starter or Premium.' }),
  /** Higher is better: buying a higher level is an upgrade, a lower one is blocked while a plan is active. */
  level: whole(1, 99, 'Use a level from 1 to 99.'),
  sortOrder: whole(0, 999, 'Use a position from 0 to 999.'),
  termMonths: whole(1, 24, 'Use a length of 1 to 24 months.'),
  dailyRequestCap: whole(1, 500, 'Use a daily limit of 1 to 500.'),
  monthlyRequestCap: whole(1, 10_000, 'Use a monthly limit of 1 to 10,000, or none.').nullable(),
};

export const planCreateSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z][a-z0-9_]{2,39}$/, 'Use 3–40 lowercase letters, digits or underscores, starting with a letter.'),
    ...planFields,
    description: planFields.description.default(null),
    sortOrder: planFields.sortOrder.default(0),
    monthlyRequestCap: planFields.monthlyRequestCap.default(null),
    prices: z
      .object({ LKR: amountMinor.nullable().default(null), USD: amountMinor.nullable().default(null) })
      .strict()
      .refine((p) => p.LKR !== null || p.USD !== null, 'Give the plan at least one price.'),
  })
  .strict();

export const planUpdateSchema = z
  .object({ ...planFields, active: z.boolean() })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Change at least one field.');

/** A new price replaces the current one from now; quotes already given keep theirs. `null` stops selling. */
export const priceChangeSchema = z
  .object({ currency: z.enum(CURRENCIES, { error: 'Choose LKR or USD.' }), amountMinor: amountMinor.nullable() })
  .strict();

/** The owner's own payment details, shown to members at the payment step (never invented: section 9). */
export const paymentSettingSchema = z
  .object({
    enabled: z.boolean(),
    instructions: z.string().trim().max(1500, 'Keep it to 1500 characters or fewer.').nullable(),
  })
  .strict()
  .refine((s) => !s.enabled || (s.instructions !== null && s.instructions.length >= 10), {
    path: ['instructions'],
    message: 'Enter the account details members should pay into before turning this on.',
  });

// --- Owner: payment decisions ----------------------------------------------------------------------------

export const approvePaymentSchema = z.object({ settlementRef, ownerNote: optionalNote }).strict();
/** The reason is shown to the payer, so they know what to correct. */
export const rejectPaymentSchema = z
  .object({ reason: text(5, 500, 'Tell the member why, in 5 to 500 characters.'), ownerNote: optionalNote })
  .strict();
export const holdPaymentSchema = z
  .object({ message: text(5, 500, 'Tell the member what you need, in 5 to 500 characters.'), ownerNote: optionalNote })
  .strict();
export const refundPaymentSchema = z
  .object({
    reason: z.enum(REFUND_REASONS, { error: 'Choose the refund reason.' }),
    consequence: z.enum(REFUND_CONSEQUENCES, { error: 'Choose what happens to the plan.' }),
    /** Needed when the payment was never approved: the statement line of the money being returned. */
    settlementRef: settlementRef.optional(),
    message: z.string().trim().max(500, 'Keep it to 500 characters or fewer.').optional(),
    ownerNote: optionalNote,
  })
  .strict();
export const ownerNoteSchema = z.object({ ownerNote: z.string().trim().max(1000, 'Keep it to 1000 characters or fewer.') }).strict();
export const settlementCorrectionSchema = z
  .object({ settlementRef, reason: text(5, 500, 'Say why the statement line is being corrected (5–500 characters).') })
  .strict();
export const grantPlanSchema = z
  .object({
    planId: z.string().min(1, 'Choose a plan.'),
    /** Omitted: the plan's own length from now. */
    days: whole(1, 400, 'Use 1 to 400 days.').optional(),
    reason: text(5, 500, 'Give the reason, in 5 to 500 characters.'),
  })
  .strict();
export const revokePlanSchema = z.object({ reason: text(5, 500, 'Give the reason, in 5 to 500 characters.') }).strict();
