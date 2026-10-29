/**
 * Plan and payment views shared by the member, owner and public routes (OWNER-DECISIONS sections 2, 3, 9).
 * Reads go through row-level security as the request's actor: members see their own payments only.
 */
import { asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  RENEWAL_GRACE_DAYS,
  type CurrentPlan,
  type EntitlementView,
  type PaymentView,
  type PlanChange,
  type PlanView,
} from '@fh/shared';
import { entitlementEvent, paymentChannelSetting, paymentProof, paymentSubmission, plan, priceVersion } from '../db/schema/billing.ts';
import { isoDate, type Tx } from '../http.ts';
import { rows } from './profile-view.ts';

type PlanRow = typeof plan.$inferSelect;
type PriceRow = typeof priceVersion.$inferSelect;
type PaymentRow = typeof paymentSubmission.$inferSelect;

export function planView(row: PlanRow, prices: PriceRow[]): PlanView {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    tier: row.tier,
    level: row.level,
    termMonths: row.termMonths,
    dailyRequestCap: row.dailyRequestCap,
    monthlyRequestCap: row.monthlyRequestCap,
    prices: prices
      .filter((p) => p.planId === row.id && p.effectiveTo === null)
      .sort((a, b) => a.currency.localeCompare(b.currency))
      .map((p) => ({ currency: p.currency, amountMinor: p.amountMinor, priceVersionId: p.id })),
  };
}

/** The catalogue in the owner's order: position, then level and length. */
export async function planRows(tx: Tx, activeOnly: boolean): Promise<{ plans: PlanRow[]; prices: PriceRow[] }> {
  const plans = await tx
    .select()
    .from(plan)
    .where(activeOnly ? eq(plan.active, true) : undefined)
    .orderBy(asc(plan.sortOrder), asc(plan.level), asc(plan.termMonths), asc(plan.name));
  const prices = await tx.select().from(priceVersion).where(activeOnly ? isNull(priceVersion.effectiveTo) : undefined);
  return { plans, prices };
}

export async function planChange(tx: Tx, profileId: string, planId: string): Promise<PlanChange> {
  const [row] = rows<{ change: PlanChange }>(await tx.execute(sql`select app.plan_change(${profileId}, ${planId}) as change`));
  const change = row!.change;
  return { ...change, renewalOpensAt: change.renewalOpensAt === null ? null : isoDate(change.renewalOpensAt) };
}

/** The plan giving access now, including the up-to-3-day grace while a renewal receipt waits (section 3). */
export async function currentPlan(tx: Tx, profileId: string): Promise<CurrentPlan | null> {
  const [row] = rows<{
    kind: string;
    plan_id: string | null;
    plan_name: string | null;
    level: number | null;
    starts_at: string | Date;
    ends_at: string | Date;
    active: boolean;
    ended: boolean;
  }>(
    await tx.execute(sql`
      select e.kind, e.plan_id, p.name as plan_name, p.level, e.starts_at, e.ends_at,
        app.has_active_entitlement(${profileId}) as active, e.ends_at <= now() as ended
      from entitlement_event e left join plan p on p.id = e.plan_id
      where e.profile_id = ${profileId} order by e.seq desc limit 1`),
  );
  if (!row?.active) return null;
  const endsAt = new Date(row.ends_at);
  return {
    planId: row.plan_id,
    planName: row.plan_name,
    level: row.level,
    startsAt: isoDate(row.starts_at),
    endsAt: endsAt.toISOString(),
    inGrace: row.ended,
    graceEndsAt: row.ended ? new Date(endsAt.getTime() + RENEWAL_GRACE_DAYS * 86_400_000).toISOString() : null,
  };
}

const OPEN = new Set<PaymentRow['status']>(['awaiting_proof', 'pending_review', 'held']);

/** Payments with their receipt counts and, while open, the owner's details for their channel. */
export async function paymentViews(tx: Tx, payments: PaymentRow[]): Promise<PaymentView[]> {
  if (payments.length === 0) return [];
  const ids = payments.map((p) => p.id);
  const counts = await tx
    .select({ paymentId: paymentProof.paymentId, count: sql<number>`count(*)::int` })
    .from(paymentProof)
    .where(inArray(paymentProof.paymentId, ids))
    .groupBy(paymentProof.paymentId);
  const settings = await tx.select().from(paymentChannelSetting).where(eq(paymentChannelSetting.enabled, true));
  return payments.map((p) => ({
    id: p.id,
    profileId: p.profileId,
    reference: p.reference,
    status: p.status,
    planId: p.planId,
    planName: p.planName,
    termMonths: p.termMonths,
    currency: p.currency,
    amountMinor: p.amountMinor,
    channel: p.channel,
    residenceCountry: p.declaredResidenceCountry,
    changeKind: p.changeKind,
    lostDays: p.lostDaysAck,
    message: p.decisionNote,
    refundReason: p.refundReason,
    proofCount: counts.find((c) => c.paymentId === p.id)?.count ?? 0,
    createdAt: p.createdAt,
    proofSubmittedAt: p.proofSubmittedAt,
    reviewedAt: p.reviewedAt,
    instructions: OPEN.has(p.status) ? (settings.find((s) => s.channel === p.channel)?.instructions ?? null) : null,
  }));
}

export async function entitlementHistory(tx: Tx, profileId: string): Promise<EntitlementView[]> {
  const events = await tx
    .select()
    .from(entitlementEvent)
    .where(eq(entitlementEvent.profileId, profileId))
    .orderBy(sql`${entitlementEvent.seq} desc`)
    .limit(100);
  return events.map((e) => ({
    id: e.id,
    kind: e.kind,
    planId: e.planId,
    paymentId: e.paymentSubmissionId,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    reason: e.reason,
    createdAt: e.createdAt,
  }));
}
