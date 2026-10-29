/** Words for plans and payments, shared by the member and owner screens. English now; Sinhala in Stage 5. */
import type { PAYMENT_CHANNELS, PAYMENT_STATUSES, REFUND_REASONS } from '@fh/shared';
import { countries } from '@/features/profile/options';

export type PaymentChannel = (typeof PAYMENT_CHANNELS)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type RefundReason = (typeof REFUND_REASONS)[number];

export const channelLabels: Record<PaymentChannel, string> = {
  lkr_bank_transfer: 'Bank transfer in Sri Lanka',
  usd_swift: 'International bank transfer (SWIFT)',
  wise: 'Wise',
  paypal: 'PayPal',
};

/** Inside a sentence: "Send exactly LKR 3,000 by bank transfer in Sri Lanka to:". */
export const channelPhrases: Record<PaymentChannel, string> = {
  lkr_bank_transfer: 'bank transfer in Sri Lanka',
  usd_swift: 'international bank transfer (SWIFT)',
  wise: 'Wise',
  paypal: 'PayPal',
};

/** As the payer sees them. */
export const paymentStatusLabels: Record<PaymentStatus, string> = {
  awaiting_proof: 'Waiting for your receipt',
  pending_review: 'Receipt received, being checked',
  held: 'We need something more',
  approved: 'Approved',
  rejected: 'Not accepted',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
};

export const refundReasonLabels: Record<RefundReason, string> = {
  duplicate_payment: 'Duplicate payment',
  mistaken_payment: 'Payment made by mistake',
  our_failure: 'A failure on our side',
};

/**
 * OWNER-DECISIONS section 9, shown at the payment step and confirmed by the member (refund terms version
 * `refund-v1`). Draft wording until the lawyer reviews the terms in Stage 5.
 */
export const refundTerms = [
  'A plan starts only after we find your payment in our bank, Wise or PayPal statement. We aim to check payments within 48 hours.',
  'There are no refunds once a plan is active, except for a duplicate payment, a payment made by mistake, or a failure on our side.',
  'If the profile is suspended for breaking the rules, the remaining time is lost.',
  'If a payment is later reversed or disputed, the plan it paid for can be ended.',
];

export const countryName = (code: string | null | undefined) =>
  (code && countries.find((country) => country.code === code)?.name) || code || 'not given';

/** "5 requests a day, 30 a month", or Premium's "unlimited (fair use: up to 30 a day)" (section 2). */
export function limitsText(plan: { dailyRequestCap: number; monthlyRequestCap: number | null }): string {
  return plan.monthlyRequestCap === null
    ? `Unlimited requests (fair use applies: up to ${plan.dailyRequestCap} a day)`
    : `${plan.dailyRequestCap} requests a day, ${plan.monthlyRequestCap} a month`;
}

export const termText = (months: number) => `${months} month${months === 1 ? '' : 's'}`;
