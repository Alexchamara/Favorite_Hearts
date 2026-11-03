/** Words for plans and payments, shared by the member and owner screens, in the reader's language (lib/i18n.tsx). */
import { useMemo } from 'react';
import { PAYMENT_CHANNELS, PAYMENT_STATUSES, REFUND_REASONS } from '@fh/shared';
import { countriesIn, countryNameIn, useCountries } from '@/features/profile/options';
import { englishText, useI18n, type AppTextKey, type Translate } from '@/lib/i18n';

export type PaymentChannel = (typeof PAYMENT_CHANNELS)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type RefundReason = (typeof REFUND_REASONS)[number];

const each = <T extends string>(t: Translate, group: string, values: readonly T[]) =>
  Object.fromEntries(values.map((value) => [value, t(`${group}.${value}` as AppTextKey)])) as Record<T, string>;

/**
 * OWNER-DECISIONS section 9, shown at the payment step and confirmed by the member (refund terms version `refund-v1`).
 * Draft wording until the lawyer reviews the terms (docs/LEGAL-REVIEW.md); the Sinhala goes to the lawyer as well.
 */
const REFUND_TERMS = ['billing.refundTerm.1', 'billing.refundTerm.2', 'billing.refundTerm.3', 'billing.refundTerm.4'] as const;

export function billingLabelsFor(t: Translate, countries: { code: string; name: string }[]) {
  return {
    channelLabels: each(t, 'billing.channel', PAYMENT_CHANNELS),
    /** Inside a sentence: "Send exactly LKR 3,000 by bank transfer in Sri Lanka to:". */
    channelPhrases: each(t, 'billing.channelPhrase', PAYMENT_CHANNELS),
    /** As the payer sees them. */
    paymentStatusLabels: each(t, 'billing.paymentStatus', PAYMENT_STATUSES),
    refundReasonLabels: each(t, 'billing.refundReason', REFUND_REASONS),
    refundTerms: REFUND_TERMS.map((key) => t(key)),
    countryName: (code: string | null | undefined) => countryNameIn(countries, code) || t('billing.countryNotGiven'),
    /** "5 requests a day, 30 a month", or Premium's "unlimited (fair use: up to 30 a day)" (section 2). */
    limitsText: (plan: { dailyRequestCap: number; monthlyRequestCap: number | null }) =>
      plan.monthlyRequestCap === null
        ? t('billing.limits.unlimited', { daily: plan.dailyRequestCap })
        : t('billing.limits.capped', { daily: plan.dailyRequestCap, monthly: plan.monthlyRequestCap }),
    termText: (months: number) => t('billing.term', { count: months }),
  };
}

/** Staff screens only: the same words, always in English (owner, 3 Nov 2026). Members use useBillingLabels(). */
export const ENGLISH_BILLING = billingLabelsFor(englishText, countriesIn('en'));

export function useBillingLabels() {
  const { t } = useI18n();
  const countries = useCountries();
  return useMemo(() => billingLabelsFor(t, countries), [t, countries]);
}
