/**
 * The owner's plans and payments (OWNER-DECISIONS sections 2, 3, 9 and 10). Owner only: the backup reviewer has no
 * payment access, which the database enforces again (every function checks app.is_owner(); payment rows, receipts,
 * plan history and their audit entries are invisible to other staff). The owner adds, edits, re-prices, retires and
 * deletes plans, enters the real account details members pay into, matches each payment against the real statement
 * before approving it, and can hold, reject, refund, grant or revoke. The owner also pauses new sign-ups or document
 * submissions when the review queue is overwhelmed (section 10). Every change is written to the audit trail.
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  approvePaymentSchema,
  CHANNEL_CURRENCY,
  grantPlanSchema,
  holdPaymentSchema,
  operationsFlagKeySchema,
  operationsFlagSchema,
  ownerNoteSchema,
  PAYMENT_CHANNELS,
  PAYMENT_STATUSES,
  paymentSettingSchema,
  planCreateSchema,
  planUpdateSchema,
  priceChangeSchema,
  refundPaymentSchema,
  rejectPaymentSchema,
  revokePlanSchema,
  settlementCorrectionSchema,
  type ApprovalResult,
  type OperationsFlagView,
  type OwnerPaymentDetail,
  type OwnerPaymentItem,
  type OwnerPlanView,
  type OwnerProfilePlan,
  type PaymentSettingView,
  type PlanChange,
} from '@fh/shared';
import { entitlementEvent, paymentChannelSetting, paymentProof, plan } from '../db/schema/billing.ts';
import { auditEvent, operationsFlag } from '../db/schema/operations.ts';
import { fail, isoDate, parse, readJson, withActor, type AppEnv, type Tx } from '../http.ts';
import { audit } from '../lib/audit.ts';
import { currentPlan, entitlementHistory, planRows, planView } from '../lib/billing-view.ts';
import { rows } from '../lib/profile-view.ts';
import { requireStaff } from '../middleware/session.ts';

export const owner = new Hono<AppEnv>().use(requireStaff('owner'));

const idParam = (value: string | undefined) => parse(z.uuid({ error: 'api.notFound' }), value);
const planIdParam = (value: string | undefined) => parse(z.string().min(1).max(40), value);

// --- Plans and prices --------------------------------------------------------------------------------------

async function ownerPlans(tx: Tx): Promise<OwnerPlanView[]> {
  const { plans, prices } = await planRows(tx, false);
  const counts = rows<{ plan_id: string; payments: number; grants: number }>(
    await tx.execute(sql`
      select p.id as plan_id,
        (select count(*)::int from payment_submission s where s.plan_id = p.id) as payments,
        (select count(*)::int from entitlement_event e where e.plan_id = p.id) as grants
      from plan p`),
  );
  return plans.map((p) => {
    const usage = counts.find((c) => c.plan_id === p.id);
    return {
      ...planView(p, prices),
      active: p.active,
      sortOrder: p.sortOrder,
      createdAt: p.createdAt,
      priceHistory: prices
        .filter((v) => v.planId === p.id)
        .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime())
        .map((v) => ({ id: v.id, currency: v.currency, amountMinor: v.amountMinor, effectiveFrom: v.effectiveFrom, effectiveTo: v.effectiveTo })),
      usage: { payments: usage?.payments ?? 0, grants: usage?.grants ?? 0 },
    };
  });
}

const onePlan = async (tx: Tx, id: string) => {
  const found = (await ownerPlans(tx)).find((p) => p.id === id);
  if (!found) fail(404, 'NOT_FOUND', 'api.staff.planNotFound');
  return found;
};

owner.get('/plans', async (c) => c.json({ plans: await withActor(c, ownerPlans) }));

owner.post('/plans', async (c) => {
  const { prices, ...input } = parse(planCreateSchema, await readJson(c));
  const created = await withActor(c, async (tx) => {
    await tx.insert(plan).values(input);
    for (const currency of ['LKR', 'USD'] as const) {
      if (prices[currency] !== null) await tx.execute(sql`select app.set_price(${input.id}, ${currency}::currency, ${prices[currency]})`);
    }
    await audit(c, tx, { action: 'plan.created', entityType: 'plan', entityId: input.id, metadata: { ...input, prices } });
    return onePlan(tx, input.id);
  });
  return c.json(created, 201);
});

/** Edits apply to new payments only: a payment keeps the name, length and limits it was quoted. */
owner.patch('/plans/:id', async (c) => {
  const id = planIdParam(c.req.param('id'));
  const changes = parse(planUpdateSchema, await readJson(c));
  const updated = await withActor(c, async (tx) => {
    const [before] = await tx.select().from(plan).where(eq(plan.id, id));
    if (!before) fail(404, 'NOT_FOUND', 'api.staff.planNotFound');
    await tx.update(plan).set(changes).where(eq(plan.id, id));
    const keys = Object.keys(changes) as (keyof typeof changes)[];
    await audit(c, tx, {
      action: changes.active === false ? 'plan.retired' : changes.active === true ? 'plan.restored' : 'plan.updated',
      entityType: 'plan',
      entityId: id,
      metadata: { before: Object.fromEntries(keys.map((k) => [k, before[k]])), after: changes },
    });
    return onePlan(tx, id);
  });
  return c.json(updated);
});

owner.delete('/plans/:id', async (c) => {
  const id = planIdParam(c.req.param('id'));
  await withActor(c, async (tx) => {
    const found = await onePlan(tx, id);
    await tx.execute(sql`select app.delete_plan(${id})`);
    await audit(c, tx, { action: 'plan.deleted', entityType: 'plan', entityId: id, metadata: { name: found.name, prices: found.prices } });
  });
  return c.body(null, 204);
});

/** A new price version from now; payments already started keep the price they were quoted (spec M01). */
owner.post('/plans/:id/prices', async (c) => {
  const id = planIdParam(c.req.param('id'));
  const input = parse(priceChangeSchema, await readJson(c));
  const updated = await withActor(c, async (tx) => {
    const before = (await onePlan(tx, id)).prices.find((p) => p.currency === input.currency)?.amountMinor ?? null;
    await tx.execute(sql`select app.set_price(${id}, ${input.currency}::currency, ${input.amountMinor})`);
    if (before !== input.amountMinor) {
      await audit(c, tx, {
        action: 'price.changed',
        entityType: 'plan',
        entityId: id,
        metadata: { currency: input.currency, before, after: input.amountMinor },
      });
    }
    return onePlan(tx, id);
  });
  return c.json(updated);
});

// --- The owner's account details (section 9: real ones only, entered by the owner) ----------------------

const settingView = (row: typeof paymentChannelSetting.$inferSelect): PaymentSettingView => ({
  channel: row.channel,
  currency: CHANNEL_CURRENCY[row.channel],
  enabled: row.enabled,
  instructions: row.instructions,
  updatedAt: row.updatedAt,
});

owner.get('/payment-settings', async (c) => {
  const settings = await withActor(c, (tx) => tx.select().from(paymentChannelSetting));
  const ordered = PAYMENT_CHANNELS.map((channel) => settings.find((s) => s.channel === channel)).filter((s) => s !== undefined);
  return c.json({ settings: ordered.map(settingView) });
});

/** Changing where members send money is sensitive: the audit keeps the details before and after. */
owner.put('/payment-settings/:channel', async (c) => {
  const channel = parse(z.enum(PAYMENT_CHANNELS, { error: 'api.notFound' }), c.req.param('channel'));
  const input = parse(paymentSettingSchema, await readJson(c));
  const saved = await withActor(c, async (tx) => {
    const [before] = await tx.select().from(paymentChannelSetting).where(eq(paymentChannelSetting.channel, channel));
    const [row] = await tx
      .update(paymentChannelSetting)
      .set({ enabled: input.enabled, instructions: input.instructions, updatedByUserId: c.var.user!.id, updatedAt: new Date() })
      .where(eq(paymentChannelSetting.channel, channel))
      .returning();
    if (!row) fail(404, 'NOT_FOUND', 'api.staff.paymentMethodNotFound');
    await audit(c, tx, {
      action: 'payment_settings.updated',
      entityType: 'payment_channel_setting',
      entityId: channel,
      metadata: {
        before: { enabled: before?.enabled ?? null, instructions: before?.instructions ?? null },
        after: { enabled: row.enabled, instructions: row.instructions },
      },
    });
    return settingView(row);
  });
  return c.json(saved);
});

// --- Service switches (section 10) ------------------------------------------------------------------------

const flagView = (row: typeof operationsFlag.$inferSelect): OperationsFlagView => ({
  key: row.key,
  enabled: row.enabled,
  reason: row.reason,
  updatedAt: row.updatedAt,
});

owner.get('/operations', async (c) => {
  const flags = await withActor(c, (tx) => tx.select().from(operationsFlag).orderBy(operationsFlag.key));
  return c.json({ flags: flags.map(flagView) });
});

/** Pauses or resumes new sign-ups or document submissions; members already signed up keep using the app. */
owner.put('/operations/:key', async (c) => {
  const key = parse(operationsFlagKeySchema, c.req.param('key'));
  const input = parse(operationsFlagSchema, await readJson(c));
  const saved = await withActor(c, async (tx) => {
    const [before] = await tx.select().from(operationsFlag).where(eq(operationsFlag.key, key));
    const [row] = await tx
      .update(operationsFlag)
      .set({ enabled: input.enabled, reason: input.reason || null, updatedByUserId: c.var.user!.id, updatedAt: new Date() })
      .where(eq(operationsFlag.key, key))
      .returning();
    if (!row) fail(404, 'NOT_FOUND', 'api.staff.switchNotFound');
    await audit(c, tx, {
      action: row.enabled ? 'operations.paused' : 'operations.resumed',
      entityType: 'operations_flag',
      entityId: key,
      reason: row.reason ?? undefined,
      metadata: { before: before?.enabled ?? null, after: row.enabled },
    });
    return flagView(row);
  });
  return c.json(saved);
});

// --- Payments: queue, review and decisions -----------------------------------------------------------------

async function ownerPayments(tx: Tx, filter: { status?: string; query?: string; profileId?: string; paymentId?: string }) {
  const [row] = rows<{ items: OwnerPaymentItem[] }>(
    await tx.execute(sql`
      select app.owner_payments(${filter.status ?? null}, ${filter.query ?? null},
        ${filter.profileId ?? null}::uuid, ${filter.paymentId ?? null}::uuid) as items`),
  );
  return row!.items.map((item) => ({
    ...item,
    createdAt: isoDate(item.createdAt),
    proofSubmittedAt: isoDate(item.proofSubmittedAt),
    reviewedAt: isoDate(item.reviewedAt),
  }));
}

async function onePayment(tx: Tx, id: string): Promise<OwnerPaymentItem> {
  const [item] = await ownerPayments(tx, { paymentId: id });
  if (!item) fail(404, 'NOT_FOUND', 'api.payment.notFound');
  return item;
}

/**
 * ?status= one status, or `waiting` for everything that needs a decision (in review or held); default: all.
 * ?q= a reference or statement line, as written on the transfer.
 */
owner.get('/payments', async (c) => {
  const status = parse(z.enum([...PAYMENT_STATUSES, 'waiting']).optional(), c.req.query('status') || undefined);
  const query = parse(z.string().trim().max(100).optional(), c.req.query('q') || undefined);
  const payments = await withActor(c, (tx) => ownerPayments(tx, { status: status === 'waiting' ? undefined : status, query }));
  // Waiting payments come first in the queue, so the filter keeps all of them.
  return c.json({ payments: status === 'waiting' ? payments.filter((p) => p.status === 'pending_review' || p.status === 'held') : payments });
});

owner.get('/payments/:id', async (c) => {
  const id = idParam(c.req.param('id'));
  const detail = await withActor(c, async (tx): Promise<OwnerPaymentDetail> => {
    const item = await onePayment(tx, id);
    const proofs = await tx
      .select({ id: paymentProof.id, uploadedAt: paymentProof.uploadedAt })
      .from(paymentProof)
      .where(eq(paymentProof.paymentId, id))
      .orderBy(paymentProof.uploadedAt);
    let changeNow: PlanChange | null = null;
    if (item.profile.id && ['awaiting_proof', 'pending_review', 'held'].includes(item.status)) {
      const [row] = rows<{ change: PlanChange }>(
        await tx.execute(sql`select app.plan_change(${item.profile.id}, ${item.plan.id}, true) as change`),
      );
      changeNow = { ...row!.change, renewalOpensAt: isoDate(row!.change.renewalOpensAt) };
    }
    const history = await tx
      .select({ action: auditEvent.action, actorRole: auditEvent.actorRole, reason: auditEvent.reason, createdAt: auditEvent.createdAt })
      .from(auditEvent)
      .where(and(eq(auditEvent.entityType, 'payment_submission'), eq(auditEvent.entityId, id)))
      .orderBy(desc(auditEvent.seq));
    return {
      ...item,
      proofs,
      changeNow,
      entitlements: item.profile.id ? (await entitlementHistory(tx, item.profile.id)).filter((e) => e.paymentId === id) : [],
      history,
    };
  });
  return c.json(detail);
});

/** A short-lived link to one receipt; every look is audited. */
owner.get('/payments/:id/proofs/:proofId', async (c) => {
  const id = idParam(c.req.param('id'));
  const proofId = idParam(c.req.param('proofId'));
  const { storage, config } = c.var.deps;
  const key = await withActor(c, async (tx) => {
    const [proof] = await tx
      .select()
      .from(paymentProof)
      .where(and(eq(paymentProof.id, proofId), eq(paymentProof.paymentId, id)));
    if (!proof) fail(404, 'NOT_FOUND', 'api.staff.receiptNotFound');
    await audit(c, tx, { action: 'payment.proof_viewed', entityType: 'payment_submission', entityId: id, metadata: { proofId } });
    return proof.objectKey;
  });
  return c.json({ url: await storage.signedGetUrl('private', key), expiresInSeconds: config.signedUrlTtlSeconds });
});

/**
 * Approve only after finding the transfer in the real statement (section 9: the receipt image alone is not enough).
 * Two clicks, a retry after a timeout or two owner tabs all end with one plan term (app.approve_payment).
 */
owner.post('/payments/:id/approve', async (c) => {
  const id = idParam(c.req.param('id'));
  const input = parse(approvePaymentSchema, await readJson(c));
  const result = await withActor(c, async (tx) => {
    const [row] = rows<{ result: ApprovalResult }>(
      await tx.execute(sql`select app.approve_payment(${id}, ${input.settlementRef}, ${input.ownerNote ?? null}) as result`),
    );
    const outcome = row!.result;
    if (outcome.status === 'approved') {
      await audit(c, tx, {
        action: 'payment.approved',
        entityType: 'payment_submission',
        entityId: id,
        metadata: { settlementRef: input.settlementRef, entitlementId: outcome.entitlementId, kind: outcome.kind, endsAt: outcome.endsAt, lostDays: outcome.lostDays },
      });
    }
    return { ...outcome, startsAt: isoDate(outcome.startsAt), endsAt: isoDate(outcome.endsAt) };
  });
  return c.json(result);
});

owner.post('/payments/:id/reject', async (c) => {
  const id = idParam(c.req.param('id'));
  const input = parse(rejectPaymentSchema, await readJson(c));
  const item = await withActor(c, async (tx) => {
    await tx.execute(sql`select app.reject_payment(${id}, ${input.reason}, ${input.ownerNote ?? null})`);
    await audit(c, tx, { action: 'payment.rejected', entityType: 'payment_submission', entityId: id, reason: input.reason });
    return onePayment(tx, id);
  });
  return c.json(item);
});

owner.post('/payments/:id/hold', async (c) => {
  const id = idParam(c.req.param('id'));
  const input = parse(holdPaymentSchema, await readJson(c));
  const item = await withActor(c, async (tx) => {
    await tx.execute(sql`select app.hold_payment(${id}, ${input.message}, ${input.ownerNote ?? null})`);
    await audit(c, tx, { action: 'payment.held', entityType: 'payment_submission', entityId: id, reason: input.message });
    return onePayment(tx, id);
  });
  return c.json(item);
});

/** Section 9: only a duplicate payment, a mistaken payment or a failure on our side. The owner decides the plan's fate. */
owner.post('/payments/:id/refund', async (c) => {
  const id = idParam(c.req.param('id'));
  const input = parse(refundPaymentSchema, await readJson(c));
  const item = await withActor(c, async (tx) => {
    const [row] = rows<{ result: { planEnded: boolean } }>(
      await tx.execute(sql`
        select app.refund_payment(${id}, ${input.reason}::refund_reason, ${input.consequence === 'end_plan'},
          ${input.settlementRef ?? null}, ${input.message ?? null}, ${input.ownerNote ?? null}) as result`),
    );
    const ended = row!.result.planEnded;
    await audit(c, tx, {
      action: 'payment.refunded',
      entityType: 'payment_submission',
      entityId: id,
      reason: input.reason,
      metadata: { consequence: input.consequence, planEnded: ended },
    });
    return { ...(await onePayment(tx, id)), planEnded: ended };
  });
  return c.json(item);
});

owner.patch('/payments/:id', async (c) => {
  const id = idParam(c.req.param('id'));
  const input = parse(ownerNoteSchema, await readJson(c));
  const item = await withActor(c, async (tx) => {
    const [row] = rows<{ before: string | null }>(await tx.execute(sql`select app.set_payment_note(${id}, ${input.ownerNote}) as before`));
    await audit(c, tx, {
      action: 'payment.note_changed',
      entityType: 'payment_submission',
      entityId: id,
      metadata: { before: row!.before, after: input.ownerNote || null },
    });
    return onePayment(tx, id);
  });
  return c.json(item);
});

owner.post('/payments/:id/settlement', async (c) => {
  const id = idParam(c.req.param('id'));
  const input = parse(settlementCorrectionSchema, await readJson(c));
  const item = await withActor(c, async (tx) => {
    const [row] = rows<{ before: string | null }>(
      await tx.execute(sql`select app.correct_settlement(${id}, ${input.settlementRef}, ${input.reason}) as before`),
    );
    const corrected = await onePayment(tx, id);
    await audit(c, tx, {
      action: 'payment.settlement_corrected',
      entityType: 'payment_submission',
      entityId: id,
      reason: input.reason,
      metadata: { before: row!.before, after: corrected.settlementRef },
    });
    return corrected;
  });
  return c.json(item);
});

/** Only a payment that never received a receipt; anything with evidence stays on record (sections 8, 9). */
owner.delete('/payments/:id', async (c) => {
  const id = idParam(c.req.param('id'));
  await withActor(c, async (tx) => {
    const [row] = rows<{ deleted: Record<string, unknown> }>(await tx.execute(sql`select app.delete_payment(${id}) as deleted`));
    await audit(c, tx, { action: 'payment.deleted', entityType: 'payment_submission', entityId: id, metadata: row!.deleted });
  });
  return c.body(null, 204);
});

// --- A profile's plan: history, manual grant and revoke --------------------------------------------------

owner.get('/profiles/:id/plan', async (c) => {
  const id = idParam(c.req.param('id'));
  const view = await withActor(c, async (tx): Promise<OwnerProfilePlan> => ({
    profileId: id,
    current: await currentPlan(tx, id),
    entitlements: await entitlementHistory(tx, id),
    payments: await ownerPayments(tx, { profileId: id }),
  }));
  return c.json(view);
});

owner.post('/profiles/:id/plan/grant', async (c) => {
  const id = idParam(c.req.param('id'));
  const input = parse(grantPlanSchema, await readJson(c));
  const current = await withActor(c, async (tx) => {
    const [row] = rows<{ id: string }>(
      await tx.execute(sql`select app.grant_plan(${id}, ${input.planId}, ${input.days ?? null}::integer, ${input.reason}) as id`),
    );
    await audit(c, tx, {
      action: 'plan.granted',
      entityType: 'entitlement_event',
      entityId: row!.id,
      reason: input.reason,
      metadata: { profileId: id, planId: input.planId, days: input.days ?? null },
    });
    return currentPlan(tx, id);
  });
  return c.json({ current }, 201);
});

/** For example a disputed PayPal payment, or a suspension (section 9: the remaining time is lost). */
owner.post('/profiles/:id/plan/revoke', async (c) => {
  const id = idParam(c.req.param('id'));
  const input = parse(revokePlanSchema, await readJson(c));
  await withActor(c, async (tx) => {
    await tx.execute(sql`select app.revoke_plan(${id}, ${input.reason})`);
    const [latest] = await tx
      .select({ id: entitlementEvent.id })
      .from(entitlementEvent)
      .where(eq(entitlementEvent.profileId, id))
      .orderBy(desc(entitlementEvent.seq))
      .limit(1);
    await audit(c, tx, { action: 'plan.revoked', entityType: 'entitlement_event', entityId: latest?.id, reason: input.reason, metadata: { profileId: id } });
  });
  return c.json({ current: null });
});
