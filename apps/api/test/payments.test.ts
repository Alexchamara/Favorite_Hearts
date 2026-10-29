/**
 * Stage 4 flows through the real HTTP API, as separate signed-in members, the owner and the backup reviewer:
 * the plan catalogue and the owner's control of it, the owner's own payment details, starting a payment (unique
 * reference, price by declared residence), receipt images, the owner's queue with the residence flag, approval
 * against a statement line (once, even when repeated or simultaneous), plan levels (upgrade, renewal window,
 * downgrade), the 3-day renewal grace, hold, rejection, refunds, manual grant and revoke, takeover carry-over,
 * expiry warnings and their emails, and the Turnstile bot check.
 */
import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { and, eq, inArray, sql } from 'drizzle-orm';
import sharp from 'sharp';
import { user } from '../src/db/schema/auth.ts';
import { entitlementEvent, paymentSubmission } from '../src/db/schema/billing.ts';
import { auditEvent, notificationOutbox } from '../src/db/schema/operations.ts';
import { sendNotifications } from '../src/jobs/notifications.ts';
import { queueExpiryWarnings } from '../src/jobs/plan-expiry.ts';
import { addStaff } from '../src/lib/staff-accounts.ts';
import type { EmailMessage, Messenger } from '../src/messaging/messenger.ts';
import { Client, createTestApp, latestCode, latestInvitationToken, totp, type Res } from './harness.ts';

let t: Awaited<ReturnType<typeof createTestApp>>;
let owner: Client;
let reviewer: Client;
let image: Buffer;

const PASSWORD = 'correct horse battery staple';
const ok = (res: Res, status = 200) => {
  assert.equal(res.status, status, JSON.stringify(res.body));
  return res.body;
};
const rejected = (res: Res, status: number, code: string) => {
  assert.equal(res.status, status, JSON.stringify(res.body));
  assert.equal(res.body.code, code, JSON.stringify(res.body));
};
const DAY = 86_400_000;
const days = (n: number) => new Date(Date.now() + n * DAY);
const scalar = async <T>(query: ReturnType<typeof sql>) => ((await t.db.execute(query)).rows[0] as { v: T }).v;

let phoneSeq = 100;
const nextPhone = () => `+9477555${String(phoneSeq++).padStart(4, '0')}`;

const base = {
  countryCode: 'LK',
  city: 'Colombo',
  occupation: 'Engineer',
  education: 'BSc',
  maritalStatus: 'never_married',
  bio: 'Kind, steady and close to family; looking for an honest shared future.',
};

type Member = { client: Client; profileId: string };

async function staffClient(email: string, role: 'owner' | 'backup_reviewer'): Promise<Client> {
  await addStaff(t.deps, { email, name: role === 'owner' ? 'Owner' : 'Reviewer', role, password: PASSWORD });
  const client = t.client();
  ok(await client.post('/api/auth/sign-in/email', { email, password: PASSWORD }));
  const { totpURI } = ok(await client.post('/api/auth/two-factor/enable', { password: PASSWORD }));
  ok(await client.post('/api/auth/two-factor/verify-totp', { code: totp(totpURI) }));
  return client;
}

function documentForm() {
  const form = new FormData();
  form.set('documentType', 'nic');
  form.set('file', new File([new Uint8Array(image)], 'nic.jpg', { type: 'image/jpeg' }));
  return form;
}

async function verifiedClient(email: string, name: string, phone = nextPhone()): Promise<Client> {
  const client = await t.client().signIn(email, name);
  ok(await client.verifyPhone(phone));
  const submitted = ok(await client.post('/api/v1/verification', documentForm()), 201);
  ok(await reviewer.post(`/api/v1/staff/verification/${submitted.id}/decision`, { decision: 'approved' }));
  return client;
}

async function publishedMember(email: string, name: string, fields: Record<string, unknown> = {}, phone?: string): Promise<Member> {
  const client = await verifiedClient(email, name, phone);
  const created = ok(await client.post('/api/v1/profiles', { management: 'self', adultDeclared: true }), 201);
  ok(
    await client.patch(`/api/v1/profiles/${created.id}`, {
      version: created.version,
      ...base,
      displayName: name,
      gender: 'woman',
      birthDate: '1995-03-03',
      heightCm: 160,
      ...fields,
    }),
  );
  ok(await client.post(`/api/v1/profiles/${created.id}/contacts`, { person: 'candidate', kind: 'phone', value: nextPhone() }), 201);
  ok(await client.post(`/api/v1/profiles/${created.id}/publish`));
  return { client, profileId: created.id };
}

function receiptForm(bytes: Buffer = image, name = 'receipt.jpg', type = 'image/jpeg') {
  const form = new FormData();
  form.set('file', new File([new Uint8Array(bytes)], name, { type }));
  return form;
}

const start = (m: Member, planId: string, extra: Record<string, unknown> = {}) =>
  m.client.post(`/api/v1/profiles/${m.profileId}/payments`, {
    planId,
    residenceCountry: 'LK',
    channel: 'lkr_bank_transfer',
    confirmRefundTerms: true,
    ...extra,
  });
const uploadReceipt = (m: Member | Client, paymentId: string, form = receiptForm()) =>
  ('client' in m ? m.client : m).post(`/api/v1/payments/${paymentId}/proof`, form);
/** Starts a payment and sends one receipt: it is then waiting for the owner. */
async function paid(m: Member, planId: string, extra: Record<string, unknown> = {}) {
  const payment = ok(await start(m, planId, extra), 201);
  ok(await uploadReceipt(m, payment.id), 201);
  return payment as { id: string; reference: string };
}
const approve = (paymentId: string, settlementRef: string) =>
  owner.post(`/api/v1/owner/payments/${paymentId}/approve`, { settlementRef });
const usage = async (m: Member) => ok(await m.client.get(`/api/v1/profiles/${m.profileId}/plan`));
const billing = async (m: Member) => ok(await m.client.get(`/api/v1/profiles/${m.profileId}/billing`));
const option = (overview: { options: { id: string; change: unknown }[] }, planId: string) =>
  overview.options.find((o) => o.id === planId)!.change as { kind: string; reason: string | null; lostDays: number; renewalOpensAt: string | null };
const sendRequest = (from: Member, to: Member) =>
  from.client.post(`/api/v1/profiles/${from.profileId}/interests`, { receiverProfileId: to.profileId, confirmSharing: true });
const auditActions = async (entityId: string) =>
  (await t.db.select({ action: auditEvent.action }).from(auditEvent).where(eq(auditEvent.entityId, entityId)).orderBy(auditEvent.seq)).map(
    (a) => a.action,
  );
/** A plan event written straight into the database, to place a plan's end in the past or near future. */
const planEnding = (profileId: string, endsAt: Date, planId = 'starter_1m') =>
  t.db.insert(entitlementEvent).values({ profileId, kind: 'grant', planId, startsAt: new Date(endsAt.getTime() - 30 * DAY), endsAt, dailyRequestCap: 5, monthlyRequestCap: 30 });

let amal: Member; // receives requests
let chathu: Member; // Starter, then upgrades
let esha: Member; // simultaneous approval, then a refund
let gita: Member; // lives in the UK but declares Sri Lanka
let lahi: Member; // rejected, then starts again

before(async () => {
  t = await createTestApp();
  image = await sharp({ create: { width: 900, height: 700, channels: 3, background: '#d8c7b0' } }).jpeg().toBuffer();
  reviewer = await staffClient('reviewer@favoritehearts.test', 'backup_reviewer');
  owner = await staffClient('owner@favoritehearts.test', 'owner');
  amal = await publishedMember('amal@example.test', 'Amal', { gender: 'man', birthDate: '1992-01-01', heightCm: 175 });
  chathu = await publishedMember('chathu@example.test', 'Chathu');
  esha = await publishedMember('esha@example.test', 'Esha');
  gita = await publishedMember('gita@example.test', 'Gita', { countryCode: 'GB', city: 'London' }, '+447700900123');
  lahi = await publishedMember('lahi@example.test', 'Lahi');
});

describe('the plan catalogue (section 2)', () => {
  test('anyone can read the three plans with their LKR and USD prices', async () => {
    const { plans } = ok(await t.client().get('/api/v1/plans'));
    assert.deepEqual(
      plans.map((p: { id: string; name: string; level: number }) => [p.id, p.name, p.level]),
      [
        ['starter_1m', 'Starter', 1],
        ['premium_3m', 'Premium 3 months', 2],
        ['premium_6m', 'Premium 6 months', 3],
      ],
    );
    const prices = Object.fromEntries(
      plans.map((p: { id: string; prices: { currency: string; amountMinor: number }[] }) => [
        p.id,
        Object.fromEntries(p.prices.map((x) => [x.currency, x.amountMinor])),
      ]),
    );
    assert.deepEqual(prices, {
      starter_1m: { LKR: 300000, USD: 2000 },
      premium_3m: { LKR: 850000, USD: 5500 },
      premium_6m: { LKR: 1500000, USD: 10000 },
    });
    assert.deepEqual(
      plans.map((p: { dailyRequestCap: number; monthlyRequestCap: number | null }) => [p.dailyRequestCap, p.monthlyRequestCap]),
      [[5, 30], [30, null], [30, null]],
    );
  });
});

describe('payments are the owner’s alone (sections 9, 10)', () => {
  test('the backup reviewer, members and visitors are refused on every owner route', async () => {
    const routes: [string, string][] = [
      ['GET', '/api/v1/owner/plans'],
      ['POST', '/api/v1/owner/plans'],
      ['PATCH', '/api/v1/owner/plans/starter_1m'],
      ['DELETE', '/api/v1/owner/plans/starter_1m'],
      ['POST', '/api/v1/owner/plans/starter_1m/prices'],
      ['GET', '/api/v1/owner/payment-settings'],
      ['PUT', '/api/v1/owner/payment-settings/lkr_bank_transfer'],
      ['GET', '/api/v1/owner/payments'],
      ['GET', '/api/v1/owner/payments/00000000-0000-4000-8000-000000000000'],
      ['POST', '/api/v1/owner/payments/00000000-0000-4000-8000-000000000000/approve'],
      ['POST', '/api/v1/owner/payments/00000000-0000-4000-8000-000000000000/refund'],
      ['GET', `/api/v1/owner/profiles/${amal?.profileId}/plan`],
      ['POST', `/api/v1/owner/profiles/${amal?.profileId}/plan/grant`],
    ];
    for (const [method, path] of routes) {
      rejected(await reviewer.request(method, path, method === 'GET' || method === 'DELETE' ? undefined : {}), 403, 'FORBIDDEN');
      rejected(await amal.client.request(method, path, method === 'GET' || method === 'DELETE' ? undefined : {}), 403, 'FORBIDDEN');
      rejected(await t.client().request(method, path, method === 'GET' || method === 'DELETE' ? undefined : {}), 401, 'UNAUTHENTICATED');
    }
  });
});

describe('payment details come only from the owner (section 9: never invented)', () => {
  test('nothing is pre-filled, so members cannot pay until the owner enters real details', async () => {
    const { settings } = ok(await owner.get('/api/v1/owner/payment-settings'));
    assert.deepEqual(
      settings.map((s: { channel: string; currency: string; enabled: boolean; instructions: string | null }) => [s.channel, s.currency, s.enabled, s.instructions]),
      [
        ['lkr_bank_transfer', 'LKR', false, null],
        ['usd_swift', 'USD', false, null],
        ['wise', 'USD', false, null],
        ['paypal', 'USD', false, null],
      ],
    );
    const overview = await billing(chathu);
    assert.ok(overview.channels.every((c: { available: boolean }) => !c.available));
    rejected(await start(chathu, 'starter_1m'), 409, 'CHANNEL_UNAVAILABLE');
  });

  test('the owner enters the details and switches a channel on; every change is audited', async () => {
    rejected(await owner.put('/api/v1/owner/payment-settings/lkr_bank_transfer', { enabled: true, instructions: null }), 400, 'VALIDATION');
    const details = 'TEST ONLY - not a real account. Bank: Test Bank, Account: 0000000000, Name: Test Owner';
    const saved = ok(await owner.put('/api/v1/owner/payment-settings/lkr_bank_transfer', { enabled: true, instructions: details }));
    assert.equal(saved.enabled, true);
    ok(await owner.put('/api/v1/owner/payment-settings/wise', { enabled: true, instructions: 'TEST ONLY - Wise account test@example.test' }));
    const [logged] = await t.db.select().from(auditEvent).where(and(eq(auditEvent.action, 'payment_settings.updated'), eq(auditEvent.entityId, 'lkr_bank_transfer')));
    assert.deepEqual(logged?.metadata, { before: { enabled: false, instructions: null }, after: { enabled: true, instructions: details } });
    const overview = await billing(chathu);
    assert.deepEqual(
      overview.channels.filter((c: { available: boolean }) => c.available).map((c: { channel: string }) => c.channel),
      ['lkr_bank_transfer', 'wise'],
    );
  });
});

describe('the owner manages plans (owner decision, 29 Oct 2026: full control)', () => {
  test('adds, renames, re-prices, retires and deletes a plan nobody bought', async () => {
    const created = ok(
      await owner.post('/api/v1/owner/plans', {
        id: 'trial_2m',
        name: 'Trial',
        tier: 'starter',
        level: 1,
        termMonths: 2,
        dailyRequestCap: 3,
        monthlyRequestCap: 20,
        prices: { LKR: 100000, USD: null },
      }),
      201,
    );
    assert.deepEqual(created.prices.map((p: { currency: string; amountMinor: number }) => [p.currency, p.amountMinor]), [['LKR', 100000]]);
    rejected(await owner.post('/api/v1/owner/plans', { ...created, id: 'trial_2m', prices: { LKR: 1 } }), 400, 'VALIDATION');
    rejected(
      await owner.post('/api/v1/owner/plans', { id: 'trial_2m', name: 'Again', tier: 'starter', level: 1, termMonths: 1, dailyRequestCap: 1, prices: { LKR: 1 } }),
      409,
      'PLAN_EXISTS',
    );
    assert.ok(ok(await t.client().get('/api/v1/plans')).plans.some((p: { id: string }) => p.id === 'trial_2m'));

    assert.equal(ok(await owner.patch('/api/v1/owner/plans/trial_2m', { name: 'Trial plus', description: 'Two months to try' })).name, 'Trial plus');
    const repriced = ok(await owner.post('/api/v1/owner/plans/trial_2m/prices', { currency: 'LKR', amountMinor: 120000 }));
    assert.equal(repriced.prices[0].amountMinor, 120000);
    assert.deepEqual(
      repriced.priceHistory.map((v: { amountMinor: number; effectiveTo: string | null }) => [v.amountMinor, v.effectiveTo === null]),
      [[120000, true], [100000, false]],
      'the old price is closed, never edited',
    );
    ok(await owner.patch('/api/v1/owner/plans/trial_2m', { active: false }));
    assert.ok(!ok(await t.client().get('/api/v1/plans')).plans.some((p: { id: string }) => p.id === 'trial_2m'), 'retired plans are not sold');

    assert.equal((await owner.delete('/api/v1/owner/plans/trial_2m')).status, 204);
    assert.ok(!ok(await owner.get('/api/v1/owner/plans')).plans.some((p: { id: string }) => p.id === 'trial_2m'));
    assert.deepEqual(await auditActions('trial_2m'), ['plan.created', 'plan.updated', 'price.changed', 'plan.retired', 'plan.deleted']);
  });

  test('a new price never changes a payment already started (spec M01); a used plan is retired, not deleted', async () => {
    ok(
      await owner.post('/api/v1/owner/plans', {
        id: 'quote_1m',
        name: 'Quote test',
        tier: 'starter',
        level: 1,
        termMonths: 1,
        dailyRequestCap: 5,
        prices: { LKR: 100000, USD: 1000 },
      }),
      201,
    );
    const payment = ok(await start(esha, 'quote_1m'), 201);
    assert.equal(payment.amountMinor, 100000);
    ok(await owner.post('/api/v1/owner/plans/quote_1m/prices', { currency: 'LKR', amountMinor: 150000 }));
    assert.equal(ok(await esha.client.get(`/api/v1/payments/${payment.id}`)).amountMinor, 100000, 'the quote keeps its price');
    rejected(await owner.delete('/api/v1/owner/plans/quote_1m'), 409, 'PLAN_IN_USE');

    // Cancelled before any receipt: the owner may delete that payment, and then the plan.
    assert.equal(ok(await esha.client.post(`/api/v1/payments/${payment.id}/cancel`)).status, 'cancelled');
    assert.equal((await owner.delete(`/api/v1/owner/payments/${payment.id}`)).status, 204);
    assert.equal((await owner.delete('/api/v1/owner/plans/quote_1m')).status, 204);
    assert.deepEqual(await auditActions(payment.id), ['payment.deleted']);
  });
});

describe('starting a payment (sections 2, 3, 9)', () => {
  test('the price follows the declared residence, and the channel must carry that currency', async () => {
    rejected(await start(chathu, 'starter_1m', { confirmRefundTerms: false }), 400, 'VALIDATION');
    rejected(await start(chathu, 'starter_1m', { residenceCountry: 'GB' }), 400, 'CHANNEL_CURRENCY');
    rejected(await start(chathu, 'starter_1m', { residenceCountry: 'GB', channel: 'usd_swift' }), 409, 'CHANNEL_UNAVAILABLE');
    const abroad = ok(await start(chathu, 'starter_1m', { residenceCountry: 'gb', channel: 'wise' }), 201);
    assert.deepEqual([abroad.currency, abroad.amountMinor, abroad.status], ['USD', 2000, 'awaiting_proof']);
    assert.match(abroad.reference, /^FH[2-9A-HJKMNP-Z]{6}$/);
    assert.match(abroad.instructions, /Wise account/);
    assert.equal((await billing(chathu)).residenceCountry, 'GB');

    // One open payment per profile: the same choice returns it; another plan must wait.
    assert.equal(ok(await start(chathu, 'starter_1m', { residenceCountry: 'GB', channel: 'wise' }), 201).id, abroad.id);
    rejected(await start(chathu, 'premium_3m', { residenceCountry: 'GB', channel: 'wise' }), 409, 'PAYMENT_OPEN');
    assert.equal(ok(await chathu.client.post(`/api/v1/payments/${abroad.id}/cancel`)).status, 'cancelled');
    rejected(await chathu.client.post(`/api/v1/payments/${abroad.id}/cancel`), 409, 'PAYMENT_NOT_CANCELLABLE');

    const local = ok(await start(chathu, 'starter_1m'), 201);
    assert.deepEqual([local.currency, local.amountMinor], ['LKR', 300000]);
    assert.notEqual(local.reference, abroad.reference);
    const overview = await billing(chathu);
    assert.equal(overview.openPayment.id, local.id);
    assert.deepEqual(overview.history.map((p: { status: string }) => p.status), ['awaiting_proof', 'cancelled']);
  });

  test('only someone running a published profile can pay for it, and only they see the payment', async () => {
    const dilan = await t.client().signIn('dilan@example.test', 'Dilan');
    const draft = ok(await dilan.post('/api/v1/profiles', { management: 'self', adultDeclared: true }), 201);
    rejected(
      await dilan.post(`/api/v1/profiles/${draft.id}/payments`, { planId: 'starter_1m', residenceCountry: 'LK', channel: 'lkr_bank_transfer', confirmRefundTerms: true }),
      409,
      'PROFILE_NOT_PUBLISHED',
    );
    rejected(await amal.client.post(`/api/v1/profiles/${chathu.profileId}/payments`, { planId: 'starter_1m', residenceCountry: 'LK', channel: 'lkr_bank_transfer', confirmRefundTerms: true }), 404, 'NOT_FOUND');
    const { openPayment } = await billing(chathu);
    rejected(await amal.client.get(`/api/v1/payments/${openPayment.id}`), 404, 'NOT_FOUND');
    rejected(await uploadReceipt(amal, openPayment.id), 404, 'NOT_FOUND');
    rejected(await amal.client.get(`/api/v1/profiles/${chathu.profileId}/billing`), 404, 'NOT_FOUND');
  });
});

describe('receipts (owner decision, 29 Oct 2026: photos and screenshots only)', () => {
  test('a PDF, a fake image or an oversize file is refused; images are re-encoded and kept privately', async () => {
    const { openPayment } = await billing(chathu);
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
    rejected(await uploadReceipt(chathu, openPayment.id, receiptForm(pdf, 'receipt.pdf', 'application/pdf')), 400, 'INVALID_RECEIPT');
    rejected(await uploadReceipt(chathu, openPayment.id, receiptForm(Buffer.from('not an image'), 'receipt.jpg')), 400, 'INVALID_RECEIPT');
    rejected(await uploadReceipt(chathu, openPayment.id, receiptForm(Buffer.alloc(5.5 * 1024 * 1024, 1), 'big.png', 'image/png')), 400, 'INVALID_RECEIPT');
    const before = new Set(t.files.keys());

    const photo = await sharp({ create: { width: 800, height: 1000, channels: 3, background: '#f4f1ea' } })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Copyright: 'secret-gps-and-device' } } })
      .toBuffer();
    assert.ok(photo.includes(Buffer.from('secret-gps-and-device')), 'the upload carries EXIF metadata');
    const sent = ok(await uploadReceipt(chathu, openPayment.id, receiptForm(photo, 'receipt-photo.jpg')), 201);
    assert.deepEqual([sent.status, sent.proofCount], ['pending_review', 1]);
    assert.ok(sent.proofSubmittedAt);
    const added = [...t.files.keys()].filter((k) => !before.has(k));
    assert.equal(added.length, 1);
    assert.match(added[0]!, /^private\/payment-proofs\/\d{4}\/\d{2}\//);
    const stored = t.files.get(added[0]!)!;
    assert.equal((await sharp(stored).metadata()).format, 'jpeg');
    assert.ok(!stored.includes(Buffer.from('secret-gps-and-device')), 'metadata is dropped');
  });

  test('screenshots are accepted too, and every receipt is kept, up to five', async () => {
    const { openPayment } = await billing(chathu);
    const screenshot = await sharp({ create: { width: 400, height: 800, channels: 4, background: '#ffffff' } }).png().toBuffer();
    assert.equal(ok(await uploadReceipt(chathu, openPayment.id, receiptForm(screenshot, 'screenshot.png', 'image/png')), 201).proofCount, 2);
    for (let n = 3; n <= 5; n += 1) assert.equal(ok(await uploadReceipt(chathu, openPayment.id), 201).proofCount, n);
    rejected(await uploadReceipt(chathu, openPayment.id), 409, 'PROOF_LIMIT');
  });
});

describe('the owner’s queue (sections 2, 9)', () => {
  test('waiting payments come first, with signs that the declared residence may not match', async () => {
    // Gita lives in London with a UK phone but declares Sri Lanka, so she is quoted the local price.
    const payment = await paid(gita, 'starter_1m');
    const { payments } = ok(await owner.get('/api/v1/owner/payments?status=pending_review'));
    const flagged = payments.find((p: { id: string }) => p.id === payment.id);
    assert.deepEqual(flagged.residenceFlags, ['profile_country_differs', 'phone_country_differs']);
    assert.deepEqual([flagged.currency, flagged.amountMinor, flagged.residenceCountry, flagged.profile.countryCode], ['LKR', 300000, 'LK', 'GB']);
    assert.equal(flagged.status, 'pending_review', 'a flag is for review, never an automatic rejection');
    const chathuPayment = payments.find((p: { profile: { id: string } }) => p.profile.id === chathu.profileId);
    assert.deepEqual(chathuPayment.residenceFlags, []);
    assert.equal(payments[0].id, chathuPayment.id, 'the oldest receipt first');

    // The owner looks up the reference as written on the bank statement.
    const typed = `${payment.reference.slice(0, 2).toLowerCase()}-${payment.reference.slice(2)}`;
    const found = ok(await owner.get(`/api/v1/owner/payments?q=${encodeURIComponent(typed)}`)).payments;
    assert.deepEqual(found.map((p: { id: string }) => p.id), [payment.id]);
  });

  test('each receipt opens through a short-lived link, and every look is audited', async () => {
    const { openPayment } = await billing(chathu);
    const detail = ok(await owner.get(`/api/v1/owner/payments/${openPayment.id}`));
    assert.equal(detail.proofs.length, 5);
    assert.deepEqual(detail.changeNow, { kind: 'new', reason: null, lostDays: 0, renewalOpensAt: null });
    const link = ok(await owner.get(`/api/v1/owner/payments/${openPayment.id}/proofs/${detail.proofs[0].id}`));
    assert.match(link.url, /^https:\/\/storage\.test\/private\/payment-proofs\//);
    assert.deepEqual(await auditActions(openPayment.id), ['payment.proof_viewed']);
  });
});

describe('approval (section 9): matched in the statement, used once, never twice', () => {
  test('the owner records the statement line; the plan starts now for whole months on the Sri Lanka clock', async () => {
    const { openPayment } = await billing(chathu);
    rejected(await owner.post(`/api/v1/owner/payments/${openPayment.id}/approve`, {}), 400, 'VALIDATION');
    const result = ok(await approve(openPayment.id, 'BOC 2026-10-29 FT1001'));
    assert.deepEqual([result.status, result.kind, result.lostDays], ['approved', 'grant', 0]);
    assert.ok(Math.abs(new Date(result.startsAt).getTime() - Date.now()) < 60_000);
    const [grant] = await t.db.select().from(entitlementEvent).where(eq(entitlementEvent.id, result.entitlementId));
    const offBy = await scalar<number>(
      sql`select abs(extract(epoch from app.plan_term_end(${grant!.startsAt!.toISOString()}::timestamptz, 1) - ${grant!.endsAt!.toISOString()}::timestamptz)) as v`,
    );
    assert.ok(Number(offBy) < 0.001, 'one calendar month on the Sri Lanka clock');

    const plan = await usage(chathu);
    assert.deepEqual([plan.active, plan.planName, plan.inGrace, plan.daily.cap, plan.monthly.cap], [true, 'Starter', false, 5, 30]);
    ok(await sendRequest(chathu, amal), 201);
    const [email] = await t.db.select().from(notificationOutbox).where(eq(notificationOutbox.eventKey, `payment.approved:${openPayment.id}`));
    assert.equal(email?.template, 'payment_approved');
    assert.deepEqual(await auditActions(openPayment.id), ['payment.proof_viewed', 'payment.approved']);
  });

  test('simultaneous or repeated approvals give one plan term (spec M05)', async () => {
    const payment = await paid(esha, 'starter_1m');
    const results = await Promise.all([approve(payment.id, 'BOC 2026-10-29 FT2002'), approve(payment.id, 'BOC 2026-10-29 FT2002')]);
    assert.deepEqual(results.map((r) => r.status), [200, 200]);
    assert.deepEqual(results.map((r) => r.body.status).sort(), ['already_approved', 'approved']);
    assert.equal(results[0]!.body.entitlementId, results[1]!.body.entitlementId);
    assert.equal(ok(await approve(payment.id, ' boc 2026-10-29   ft2002 ')).status, 'already_approved');
    rejected(await approve(payment.id, 'BOC 2026-10-29 FT9999'), 409, 'ALREADY_DECIDED');
    const grants = await t.db.select().from(entitlementEvent).where(eq(entitlementEvent.paymentSubmissionId, payment.id));
    assert.equal(grants.length, 1);
    assert.deepEqual((await auditActions(payment.id)).filter((a) => a === 'payment.approved'), ['payment.approved']);
    // Underneath, the database refuses a second grant for the same payment even from its owner role.
    await assert.rejects(
      t.db.insert(entitlementEvent).values({ profileId: esha.profileId, kind: 'grant', planId: 'starter_1m', paymentSubmissionId: payment.id, startsAt: new Date(), endsAt: days(30) }),
      (err: { cause?: { constraint?: string } }) => err.cause?.constraint === 'entitlement_event_one_grant_per_payment_idx',
    );
  });

  test('one statement line pays for one payment only', async () => {
    const { openPayment } = await billing(gita);
    rejected(await approve(openPayment.id, 'boc 2026-10-29 ft1001'), 409, 'SETTLEMENT_USED');
    assert.equal(ok(await gita.client.get(`/api/v1/payments/${openPayment.id}`)).status, 'pending_review');
  });
});

describe('plan levels (owner decision, 29 Oct 2026)', () => {
  test('an upgrade replaces the plan on approval, after the member confirms the days lost (M07)', async () => {
    const overview = await billing(chathu);
    assert.equal(option(overview, 'starter_1m').reason, 'renewal_window');
    const upgrade = option(overview, 'premium_3m');
    assert.equal(upgrade.kind, 'upgrade');
    assert.ok(upgrade.lostDays >= 28 && upgrade.lostDays <= 31, String(upgrade.lostDays));
    rejected(await start(chathu, 'premium_3m'), 400, 'LOST_DAYS_UNCONFIRMED');
    const payment = await paid(chathu, 'premium_3m', { confirmLostDays: true });
    assert.equal(ok(await chathu.client.get(`/api/v1/payments/${payment.id}`)).lostDays, upgrade.lostDays);
    const result = ok(await approve(payment.id, 'BOC 2026-10-29 FT1002'));
    assert.equal(result.kind, 'replace');
    const plan = await usage(chathu);
    assert.deepEqual([plan.planName, plan.daily.cap, plan.monthly], ['Premium 3 months', 30, null]);
  });

  test('Premium 3 months to 6 months is an upgrade; a lower level is blocked while a plan is active (M08)', async () => {
    const overview = await billing(chathu);
    assert.equal(option(overview, 'premium_6m').kind, 'upgrade');
    assert.deepEqual([option(overview, 'starter_1m').kind, option(overview, 'starter_1m').reason], ['blocked', 'downgrade']);
    rejected(await start(chathu, 'starter_1m'), 409, 'PLAN_DOWNGRADE');
  });

  test('the same plan renews only in its last 7 days, and the new term counts from approval (M08)', async () => {
    const mala = await publishedMember('mala@example.test', 'Mala');
    await planEnding(mala.profileId, new Date(Date.now() + 7 * DAY + 60_000));
    const early = option(await billing(mala), 'starter_1m');
    assert.deepEqual([early.kind, early.reason], ['blocked', 'renewal_window']);
    assert.ok(Math.abs(new Date(early.renewalOpensAt!).getTime() - (Date.now() + 60_000)) < 30_000);
    rejected(await start(mala, 'starter_1m'), 409, 'RENEWAL_TOO_EARLY');

    await planEnding(mala.profileId, new Date(Date.now() + 7 * DAY - 60_000));
    const renewal = option(await billing(mala), 'starter_1m');
    assert.equal(renewal.kind, 'renewal');
    const payment = await paid(mala, 'starter_1m', { confirmLostDays: true });
    const result = ok(await approve(payment.id, 'BOC 2026-10-29 FT3003'));
    assert.equal(result.kind, 'replace');
    assert.ok(Math.abs(new Date(result.startsAt).getTime() - Date.now()) < 60_000, 'from the approval, not the old end');
  });

  test('a plan approved after the old one ended starts from the approval', async () => {
    const nala = await publishedMember('nala@example.test', 'Nala');
    await planEnding(nala.profileId, days(-10));
    assert.equal(option(await billing(nala), 'starter_1m').kind, 'new');
    const payment = await paid(nala, 'starter_1m');
    const result = ok(await approve(payment.id, 'BOC 2026-10-29 FT3004'));
    assert.equal(result.kind, 'grant');
    assert.ok(Math.abs(new Date(result.startsAt).getTime() - Date.now()) < 60_000);
  });

  test('terms are whole months on the Sri Lanka clock: short months and leap years clamp (M09)', async () => {
    const end = (starts: string, months: number) => scalar<string>(sql`select to_char(app.plan_term_end(${starts}::timestamptz, ${months}) at time zone 'Asia/Colombo', 'YYYY-MM-DD HH24:MI') as v`);
    assert.equal(await end('2027-01-31 10:15+05:30', 1), '2027-02-28 10:15');
    assert.equal(await end('2028-01-31 10:15+05:30', 1), '2028-02-29 10:15');
    assert.equal(await end('2026-11-30 09:00+05:30', 3), '2027-02-28 09:00');
    assert.equal(await end('2026-08-31 09:00+05:30', 6), '2027-02-28 09:00');
    // 02:00 on 1 March in Sri Lanka is still 28 February in UTC: the month is counted in Sri Lanka.
    assert.equal(await end('2027-03-01 02:00+05:30', 1), '2027-04-01 02:00');
  });
});

describe('renewal grace (owner decision, 29 Oct 2026: up to 3 days)', () => {
  /** A member whose plan ended `endedDaysAgo` days ago and whose renewal receipt arrived `sentBeforeEnd` hours before the end. */
  async function lapsed(email: string, name: string, endedDaysAgo: number, sentBeforeEnd: number | null) {
    const member = await publishedMember(email, name);
    const endsAt = days(-endedDaysAgo);
    await planEnding(member.profileId, endsAt);
    const payment = await paid(member, 'starter_1m');
    if (sentBeforeEnd !== null) {
      await t.db.update(paymentSubmission).set({ proofSubmittedAt: new Date(endsAt.getTime() - sentBeforeEnd * 3_600_000) }).where(eq(paymentSubmission.id, payment.id));
    }
    return { member, payment, endsAt };
  }

  test('access continues while a receipt sent before the end waits; a rejection ends it at once', async () => {
    const { member, payment, endsAt } = await lapsed('hasi@example.test', 'Hasi', 1, 2);
    const plan = await usage(member);
    assert.deepEqual([plan.active, plan.inGrace], [true, true]);
    assert.equal(new Date(plan.graceEndsAt).getTime(), endsAt.getTime() + 3 * DAY);
    ok(await sendRequest(member, amal), 201);

    rejected(await owner.post(`/api/v1/owner/payments/${payment.id}/reject`, { reason: 'no' }), 400, 'VALIDATION');
    ok(await owner.post(`/api/v1/owner/payments/${payment.id}/reject`, { reason: 'We could not find this transfer in our statement.' }));
    assert.equal((await usage(member)).active, false);
    rejected(await sendRequest(member, gita), 403, 'PLAN_REQUIRED');
  });

  test('no grace for a receipt sent after the end, or more than 3 days after it', async () => {
    const late = await lapsed('jaya@example.test', 'Jaya', 1, null);
    assert.equal((await usage(late.member)).active, false, 'sent after the end');
    const old = await lapsed('kumu@example.test', 'Kumu', 4, 2);
    assert.equal((await usage(old.member)).active, false, 'more than 3 days ago');
  });
});

describe('hold, correction and rejection (spec 9.3, M06)', () => {
  test('the owner can ask for a clearer receipt; the next one puts the payment back in review', async () => {
    const { openPayment } = await billing(gita);
    rejected(await owner.post(`/api/v1/owner/payments/${openPayment.id}/hold`, {}), 400, 'VALIDATION');
    const held = ok(await owner.post(`/api/v1/owner/payments/${openPayment.id}/hold`, { message: 'Please upload a receipt that shows the reference.' }));
    assert.equal(held.status, 'held');
    const seen = ok(await gita.client.get(`/api/v1/payments/${openPayment.id}`));
    assert.deepEqual([seen.status, seen.message], ['held', 'Please upload a receipt that shows the reference.']);
    assert.match(seen.instructions, /TEST ONLY/, 'the account details stay visible while it is open');
    assert.equal(ok(await uploadReceipt(gita, openPayment.id), 201).status, 'pending_review');
    const detail = ok(await owner.get(`/api/v1/owner/payments/${openPayment.id}`));
    assert.equal(detail.proofs.length, 2, 'the first receipt is kept');
    assert.equal(ok(await approve(openPayment.id, 'BOC 2026-10-29 FT4004')).status, 'approved');
    const keys = (await t.db.select({ key: notificationOutbox.eventKey }).from(notificationOutbox).where(eq(notificationOutbox.recipientUserId, held.payer.userId))).map((r) => r.key);
    assert.ok(keys.includes(`payment.held:${openPayment.id}:1`) && keys.includes(`payment.approved:${openPayment.id}`));
  });

  test('a rejection is final and tells the member why; they can start again', async () => {
    const payment = await paid(lahi, 'starter_1m');
    ok(await owner.post(`/api/v1/owner/payments/${payment.id}/reject`, { reason: 'The amount received was LKR 2,000, not LKR 3,000.' }));
    const seen = ok(await lahi.client.get(`/api/v1/payments/${payment.id}`));
    assert.deepEqual([seen.status, seen.message, seen.instructions], ['rejected', 'The amount received was LKR 2,000, not LKR 3,000.', null]);
    rejected(await uploadReceipt(lahi, payment.id), 409, 'PAYMENT_CLOSED');
    rejected(await approve(payment.id, 'BOC 2026-10-29 FT5005'), 409, 'ALREADY_DECIDED');
    const again = ok(await start(lahi, 'starter_1m'), 201);
    assert.notEqual(again.reference, payment.reference);
  });
});

describe('refunds (section 9: duplicate, mistaken or our failure only)', () => {
  test('refunding an approved payment can end its plan, with the reason on record', async () => {
    const [{ id }] = (await t.db.select({ id: paymentSubmission.id }).from(paymentSubmission).where(and(eq(paymentSubmission.profileId, esha.profileId), eq(paymentSubmission.status, 'approved')))) as [{ id: string }];
    rejected(await owner.post(`/api/v1/owner/payments/${id}/refund`, { reason: 'changed_mind', consequence: 'end_plan' }), 400, 'VALIDATION');
    const refunded = ok(await owner.post(`/api/v1/owner/payments/${id}/refund`, { reason: 'mistaken_payment', consequence: 'end_plan' }));
    assert.deepEqual([refunded.status, refunded.refundReason, refunded.planEnded], ['refunded', 'mistaken_payment', true]);
    assert.equal((await usage(esha)).active, false);
    rejected(await owner.post(`/api/v1/owner/payments/${id}/refund`, { reason: 'mistaken_payment', consequence: 'end_plan' }), 409, 'NOT_REFUNDABLE');
    assert.deepEqual((await auditActions(id)).slice(-1), ['payment.refunded']);
  });

  test('a duplicate payment that was never approved is refunded against its statement line; the plan stays', async () => {
    const duplicate = await paid(lahi, 'starter_1m');
    const first = await scalar<string>(sql`select id::text as v from payment_submission where profile_id = ${lahi.profileId} and status = 'pending_review'`);
    assert.equal(first, duplicate.id);
    rejected(await owner.post(`/api/v1/owner/payments/${duplicate.id}/refund`, { reason: 'duplicate_payment', consequence: 'keep_plan' }), 400, 'SETTLEMENT_REQUIRED');
    const refunded = ok(
      await owner.post(`/api/v1/owner/payments/${duplicate.id}/refund`, { reason: 'duplicate_payment', consequence: 'keep_plan', settlementRef: 'BOC 2026-10-29 FT6006' }),
    );
    assert.deepEqual([refunded.status, refunded.settlementRef, refunded.planEnded], ['refunded', 'BOC 2026-10-29 FT6006', false]);
  });
});

describe('manual grant and revoke (compensation, disputes, suspension)', () => {
  test('the owner can grant a plan without a payment and end one, always with a reason', async () => {
    const path = `/api/v1/owner/profiles/${esha.profileId}/plan`;
    rejected(await owner.post(`${path}/grant`, { planId: 'premium_3m' }), 400, 'VALIDATION');
    const granted = ok(await owner.post(`${path}/grant`, { planId: 'premium_3m', days: 10, reason: 'Our failure: the payment page was down for a day.' }), 201);
    assert.equal(granted.current.planName, 'Premium 3 months');
    assert.ok(Math.abs(new Date(granted.current.endsAt).getTime() - days(10).getTime()) < 60_000);
    assert.equal((await usage(esha)).active, true);
    ok(await owner.post(`${path}/revoke`, { reason: 'PayPal dispute opened by the payer.' }));
    assert.equal((await usage(esha)).active, false);
    rejected(await owner.post(`${path}/revoke`, { reason: 'PayPal dispute opened by the payer.' }), 409, 'PLAN_NOT_ACTIVE');
    const history = ok(await owner.get(path));
    assert.deepEqual(history.entitlements.slice(0, 3).map((e: { kind: string }) => e.kind), ['revoke', 'grant', 'refund']);
    assert.equal(history.entitlements[0].reason, 'PayPal dispute opened by the payer.');
    const actions = (
      await t.db.select({ action: auditEvent.action }).from(auditEvent).where(inArray(auditEvent.action, ['plan.granted', 'plan.revoked'])).orderBy(auditEvent.seq)
    ).map((a) => a.action);
    assert.deepEqual(actions, ['plan.granted', 'plan.revoked']);
  });
});

describe('owner record keeping', () => {
  test('notes and statement-line corrections are audited; a payment with a receipt cannot be deleted', async () => {
    const { history } = await billing(gita);
    const id = history[0].id;
    const noted = ok(await owner.patch(`/api/v1/owner/payments/${id}`, { ownerNote: 'Matched on the 29 Oct statement, line 14.' }));
    assert.equal(noted.ownerNote, 'Matched on the 29 Oct statement, line 14.');
    rejected(await owner.post(`/api/v1/owner/payments/${id}/settlement`, { settlementRef: 'BOC 2026-10-29 FT1001', reason: 'Typed the wrong line' }), 409, 'SETTLEMENT_USED');
    const corrected = ok(await owner.post(`/api/v1/owner/payments/${id}/settlement`, { settlementRef: 'BOC 2026-10-29 FT4005', reason: 'Typed the wrong line' }));
    assert.equal(corrected.settlementRef, 'BOC 2026-10-29 FT4005');
    const [logged] = await t.db.select().from(auditEvent).where(and(eq(auditEvent.entityId, id), eq(auditEvent.action, 'payment.settlement_corrected')));
    assert.deepEqual(logged?.metadata, { before: 'BOC 2026-10-29 FT4004', after: 'BOC 2026-10-29 FT4005' });
    rejected(await owner.delete(`/api/v1/owner/payments/${id}`), 409, 'PAYMENT_HAS_EVIDENCE');
    const fresh = ok(await start(lahi, 'starter_1m'), 201);
    rejected(await owner.post(`/api/v1/owner/payments/${fresh.id}/settlement`, { settlementRef: 'BOC X1', reason: 'Not approved yet' }), 409, 'NO_SETTLEMENT');
  });
});

describe('takeover keeps the paid plan (section 5)', () => {
  test('the candidate keeps the paid time; the manager loses access and their unsent payment stops', async () => {
    const manager = await verifiedClient('sunil@example.test', 'Sunil');
    const created = ok(await manager.post('/api/v1/profiles', { management: 'manager', relationship: 'father', authorityDeclared: true }), 201);
    ok(await manager.patch(`/api/v1/profiles/${created.id}`, { version: created.version, ...base, displayName: 'Nimali', gender: 'woman', birthDate: '1997-07-07', heightCm: 158 }));
    ok(await manager.post(`/api/v1/profiles/${created.id}/contacts`, { person: 'candidate', kind: 'phone', value: nextPhone() }), 201);
    ok(await manager.post(`/api/v1/profiles/${created.id}/publish`));
    const managed: Member = { client: manager, profileId: created.id };

    const payment = await paid(managed, 'starter_1m');
    const approved = ok(await approve(payment.id, 'BOC 2026-10-29 FT7007'));
    const unsent = ok(await start(managed, 'premium_3m', { confirmLostDays: true }), 201);

    ok(await manager.post(`/api/v1/profiles/${created.id}/invitations`, { channel: 'email', contact: 'nimali@example.test' }), 201);
    const token = latestInvitationToken(t.outbox, 'nimali@example.test');
    ok(await t.client().post('/api/v1/invitations/code', { token }));
    const code = latestCode(t.outbox, 'nimali@example.test');
    const candidate = await t.client().signIn('nimali@example.test', 'Nimali');
    ok(await candidate.post('/api/v1/invitations/accept', { token, code }));
    ok(await candidate.post(`/api/v1/profiles/${created.id}/take-over`));

    const own: Member = { client: candidate, profileId: created.id };
    const plan = await usage(own);
    assert.deepEqual([plan.active, plan.planName], [true, 'Starter']);
    assert.equal(new Date(plan.endsAt).getTime(), new Date(approved.endsAt).getTime(), 'the same end date');
    const overview = await billing(own);
    assert.deepEqual(overview.history, [], 'the manager’s payments stay with the manager');
    assert.equal(overview.openPayment, null);

    rejected(await manager.get(`/api/v1/profiles/${created.id}/billing`), 404, 'NOT_FOUND');
    const stopped = ok(await manager.get(`/api/v1/payments/${unsent.id}`));
    assert.equal(stopped.status, 'cancelled');
    rejected(await uploadReceipt(manager, unsent.id), 409, 'PAYMENT_CLOSED');
    ok(await start(own, 'premium_3m', { confirmLostDays: true }), 201);
  });
});

describe('expiry warnings and email (section 3, spec 12.3)', () => {
  let rina: Member;
  let sena: Member;
  let tara: Member;

  test('warnings are queued once per stage, for everyone running the profile', async () => {
    rina = await publishedMember('rina@example.test', 'Rina');
    sena = await publishedMember('sena@example.test', 'Sena');
    tara = await publishedMember('tara@example.test', 'Tara');
    await planEnding(rina.profileId, days(5));
    await planEnding(sena.profileId, new Date(Date.now() + 12 * 3_600_000));
    await planEnding(tara.profileId, days(-1));
    const first = await queueExpiryWarnings({ db: t.db });
    assert.ok(first.queued >= 3);
    assert.deepEqual(await queueExpiryWarnings({ db: t.db }), { queued: 0 }, 'a second run adds nothing');

    const rows = await t.db
      .select({ key: notificationOutbox.eventKey, template: notificationOutbox.template, payload: notificationOutbox.payload })
      .from(notificationOutbox)
      .where(sql`${notificationOutbox.eventKey} like 'plan.%'`);
    const stageOf = async (m: Member) => {
      const [e] = await t.db.select({ id: entitlementEvent.id }).from(entitlementEvent).where(eq(entitlementEvent.profileId, m.profileId));
      return rows.filter((r) => r.key.includes(e!.id)).map((r) => [r.key.split(':')[0], r.template]);
    };
    assert.deepEqual(await stageOf(rina), [['plan.week', 'plan_expiring']]);
    assert.deepEqual(await stageOf(sena), [['plan.last_day', 'plan_expiring']]);
    assert.deepEqual(await stageOf(tara), [['plan.ended', 'plan_ended']]);
  });

  test('queued emails are sent once, with the event key for idempotency; accounts without email are skipped', async () => {
    const [phoneOnly] = await t.db
      .insert(user)
      .values({ id: 'phone-only-user', name: '', email: '94770000999@phone.favoritehearts.invalid', emailVerified: false })
      .returning();
    await t.db.insert(notificationOutbox).values({ eventKey: 'test.phone-only', recipientUserId: phoneOnly!.id, channel: 'email', template: 'plan_ended', payload: { endsAt: new Date().toISOString() } });

    const sent: EmailMessage[] = [];
    const messenger: Messenger = { smsEnabled: false, sendEmail: async (m) => void sent.push(m), sendSms: async () => undefined };
    const result = await sendNotifications({ db: t.db, messenger, config: t.deps.config }, 500);
    assert.equal(result.failed, 0);
    assert.equal(result.skipped, 1);
    assert.equal(result.sent, sent.length);
    const warning = sent.find((m) => m.to === 'rina@example.test')!;
    assert.match(warning.subject, /^Your plan ends on /);
    assert.match(warning.text, /no longer see the contact details or social handles of anyone, including your connections/);
    assert.match(warning.text, /\(Sri Lanka time\)/);
    assert.ok(warning.idempotencyKey?.startsWith('plan.week:'));
    const approvals = sent.filter((m) => m.to === 'chathu@example.test' && m.subject === 'Your plan is active').map((m) => m.text);
    assert.equal(approvals.length, 2);
    assert.ok(approvals.some((text) => /Starter is now active for Chathu until /.test(text)));
    assert.ok(approvals.some((text) => /Premium 3 months is now active for Chathu until /.test(text)));
    const rejection = sent.find((m) => m.to === 'lahi@example.test' && m.subject === 'We could not confirm your payment')!;
    assert.match(rejection.text, /Reason: The amount received was LKR 2,000, not LKR 3,000\./);
    assert.ok(!sent.some((m) => m.to.endsWith('.invalid')));
    const [skipped] = await t.db.select().from(notificationOutbox).where(eq(notificationOutbox.eventKey, 'test.phone-only'));
    assert.equal(skipped?.status, 'cancelled');
    assert.deepEqual(await sendNotifications({ db: t.db, messenger, config: t.deps.config }, 500), { sent: 0, failed: 0, skipped: 0 });
  });

  test('a failed send is retried, and given up after five attempts', async () => {
    await t.db.insert(notificationOutbox).values({ eventKey: 'test.retry', recipientUserId: (await t.db.select().from(user).where(eq(user.email, 'rina@example.test')))[0]!.id, channel: 'email', template: 'plan_ended', payload: { endsAt: new Date().toISOString() } });
    const failing: Messenger = { smsEnabled: false, sendEmail: async () => { throw new Error('Resend is unreachable'); }, sendSms: async () => undefined };
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      assert.deepEqual(await sendNotifications({ db: t.db, messenger: failing, config: t.deps.config }), { sent: 0, failed: 1, skipped: 0 });
      const [row] = await t.db.select().from(notificationOutbox).where(eq(notificationOutbox.eventKey, 'test.retry'));
      assert.deepEqual([row?.attempts, row?.status], [attempt, attempt < 5 ? 'queued' : 'failed']);
    }
    assert.deepEqual(await sendNotifications({ db: t.db, messenger: failing, config: t.deps.config }), { sent: 0, failed: 0, skipped: 0 });
  });
});

describe('Turnstile bot check on the server (D7)', () => {
  test('once a secret is set, code and password endpoints need a valid token', async () => {
    const checked: string[] = [];
    const guarded = await createTestApp({ turnstile: { verify: async (token) => (checked.push(token), token === 'valid-token') } });
    const client = guarded.client();
    const sendCode = () => client.post('/api/auth/email-otp/send-verification-otp', { email: 'tina@example.test', type: 'sign-in' });
    rejected(await sendCode(), 403, 'CAPTCHA_REQUIRED');
    client.headers['x-captcha-response'] = 'forged';
    rejected(await sendCode(), 403, 'CAPTCHA_FAILED');
    assert.equal(guarded.outbox.emails.length, 0, 'no code was sent');
    client.headers['x-captcha-response'] = 'valid-token';
    ok(await sendCode());
    assert.equal(guarded.outbox.emails.length, 1);
    assert.deepEqual(checked, ['forged', 'valid-token']);

    const bare = guarded.client();
    rejected(await bare.post('/api/auth/sign-in/email', { email: 'owner@example.test', password: 'x'.repeat(12) }), 403, 'CAPTCHA_REQUIRED');
    rejected(await bare.post('/api/auth/phone-number/send-otp', { phoneNumber: '+94771234567' }), 403, 'CAPTCHA_REQUIRED');
    rejected(await bare.post('/api/v1/invitations/code', { token: 'x'.repeat(43) }), 403, 'CAPTCHA_REQUIRED');
    // Everything else works without a token.
    ok(await bare.get('/api/v1/plans'));
  });
});
