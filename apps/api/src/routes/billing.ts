/**
 * Plans and manual payments for members (OWNER-DECISIONS sections 2, 3 and 9): the catalogue, what each plan
 * would do for a profile now, starting a payment (unique reference and the owner's own account details), adding
 * receipt images, and cancelling before a receipt. Only the owner approves (routes/owner.ts), and the database
 * checks every rule again (drizzle/0009_payment_rules.sql).
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  CHANNEL_CURRENCY,
  MAX_PAYMENT_PROOFS,
  PAYMENT_CHANNELS,
  REFUND_TERMS_VERSION,
  startPaymentSchema,
  type BillingOverview,
  type PaymentView,
} from '@fh/shared';
import { memberAccount } from '../db/schema/members.ts';
import { paymentChannelSetting, paymentSubmission } from '../db/schema/billing.ts';
import { fail, parse, readJson, withActor, type AppEnv, type Tx } from '../http.ts';
import { currentPlan, paymentViews, planChange, planRows, planView } from '../lib/billing-view.ts';
import { operatedProfile, rows } from '../lib/profile-view.ts';
import { requireMember } from '../middleware/session.ts';
import { InvalidImageError, processReceipt } from '../storage/images.ts';
import { newObjectKey } from '../storage/storage.ts';

const idParam = (value: string | undefined) => parse(z.uuid({ error: 'api.notFound' }), value);

/** Public: the plans on sale with their current prices (the pricing page reads the same values). */
export const plans = new Hono<AppEnv>();

plans.get('/', async (c) => {
  const catalogue = await withActor(c, async (tx) => {
    const { plans: list, prices } = await planRows(tx, true);
    return list.map((p) => planView(p, prices)).filter((p) => p.prices.length > 0);
  });
  return c.json({ plans: catalogue });
});

/** Mounted under /profiles, whose requireMember guard covers these routes. */
export const profileBilling = new Hono<AppEnv>();

profileBilling.get('/:id/billing', async (c) => {
  const id = idParam(c.req.param('id'));
  const userId = c.var.user!.id;
  const overview = await withActor(c, async (tx): Promise<BillingOverview> => {
    await operatedProfile(tx, id);
    const { plans: list, prices } = await planRows(tx, true);
    const options = [];
    for (const row of list) {
      const view = planView(row, prices);
      if (view.prices.length > 0) options.push({ ...view, change: await planChange(tx, id, row.id) });
    }
    const mine = await tx
      .select()
      .from(paymentSubmission)
      .where(and(eq(paymentSubmission.profileId, id), eq(paymentSubmission.payerUserId, userId)))
      .orderBy(desc(paymentSubmission.createdAt))
      .limit(50);
    const history = await paymentViews(tx, mine);
    // Row-level security shows members only the channels the owner has switched on.
    const enabled = await tx.select({ channel: paymentChannelSetting.channel }).from(paymentChannelSetting);
    const [account] = await tx
      .select({ residenceCountry: memberAccount.residenceCountry })
      .from(memberAccount)
      .where(eq(memberAccount.userId, userId));
    return {
      profileId: id,
      current: await currentPlan(tx, id),
      openPayment: history.find((p) => ['awaiting_proof', 'pending_review', 'held'].includes(p.status)) ?? null,
      options,
      channels: PAYMENT_CHANNELS.map((channel) => ({
        channel,
        currency: CHANNEL_CURRENCY[channel],
        available: enabled.some((s) => s.channel === channel),
      })),
      history,
      residenceCountry: account?.residenceCountry ?? null,
      refundTermsVersion: REFUND_TERMS_VERSION,
    };
  });
  return c.json(overview);
});

/** Starts a payment, or returns the open one when the same choice is repeated (double clicks are harmless). */
profileBilling.post('/:id/payments', async (c) => {
  const id = idParam(c.req.param('id'));
  const input = parse(startPaymentSchema, await readJson(c));
  const payment = await withActor(c, async (tx) => {
    await operatedProfile(tx, id);
    const [row] = rows<{ id: string }>(
      await tx.execute(sql`
        select app.start_payment(${id}, ${input.planId}, ${input.residenceCountry}, ${input.channel}::payment_channel,
          ${REFUND_TERMS_VERSION}, ${input.confirmLostDays ?? false}) as id`),
    );
    return ownPayment(tx, row!.id);
  });
  return c.json(payment, 201);
});

async function ownPayment(tx: Tx, id: string): Promise<PaymentView> {
  // Row-level security: the payer (and the owner) only.
  const [row] = await tx.select().from(paymentSubmission).where(eq(paymentSubmission.id, id));
  if (!row) fail(404, 'NOT_FOUND', 'api.payment.notFound');
  return (await paymentViews(tx, [row]))[0]!;
}

export const payments = new Hono<AppEnv>().use(requireMember);

payments.get('/:id', async (c) => {
  const id = idParam(c.req.param('id'));
  return c.json(await withActor(c, (tx) => ownPayment(tx, id)));
});

/** A receipt image (photo or screenshot; no PDF): re-encoded, kept in the private bucket, never shown to other members. */
payments.post('/:id/proof', async (c) => {
  const id = idParam(c.req.param('id'));
  const { storage } = c.var.deps;
  const form = await c.req.parseBody().catch(() => fail(400, 'BAD_FORM', 'api.upload.receiptForm'));
  const file = form.file;
  if (!(file instanceof File)) fail(400, 'VALIDATION', 'api.payment.chooseReceipt', { file: 'validation.required' });

  // Friendly answers before the upload; app.attach_payment_proof checks all of it again.
  await withActor(c, async (tx) => {
    const payment = await ownPayment(tx, id);
    if (!['awaiting_proof', 'pending_review', 'held'].includes(payment.status)) {
      fail(409, 'PAYMENT_CLOSED', 'api.payment.closed');
    }
    if (payment.proofCount >= MAX_PAYMENT_PROOFS) {
      fail(409, 'PROOF_LIMIT', 'api.payment.proofLimit');
    }
  });
  if (!storage.configured) fail(503, 'STORAGE_UNAVAILABLE', 'api.payment.uploadUnavailable');

  let image: Buffer;
  try {
    image = (await processReceipt(Buffer.from(await file.arrayBuffer()))).image;
  } catch (err) {
    if (err instanceof InvalidImageError) fail(400, 'INVALID_RECEIPT', err.key);
    throw err;
  }
  const key = newObjectKey('payment-proofs');
  await storage.put('private', key, image, 'image/jpeg');
  try {
    const view = await withActor(c, async (tx) => {
      await tx.execute(sql`select app.attach_payment_proof(${id}, ${key})`);
      return ownPayment(tx, id);
    });
    return c.json(view, 201);
  } catch (err) {
    // Never keep a receipt the database does not know about.
    await storage.delete('private', key).catch(() => undefined);
    throw err;
  }
});

payments.post('/:id/cancel', async (c) => {
  const id = idParam(c.req.param('id'));
  const view = await withActor(c, async (tx) => {
    await tx.execute(sql`select app.cancel_payment(${id})`);
    return ownPayment(tx, id);
  });
  return c.json(view);
});

