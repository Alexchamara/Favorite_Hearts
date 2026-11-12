/**
 * Stage 5a through the real HTTP API, as separate signed-in members, the owner and the backup reviewer: the API's
 * security headers; rate limits (ours and Better-Auth's, counted in Postgres); the owner's switches that pause new
 * sign-ups and document submissions; deleting a profile or an account with the 6-month retention list (owner decision
 * 30 Oct 2026: the candidate decides); banned addresses; the retention sweep; and the member's data export.
 */
import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { inflateRawSync } from 'node:zlib';
import { and, eq, sql } from 'drizzle-orm';
import sharp from 'sharp';
import { session, user } from '../src/db/schema/auth.ts';
import { entitlementEvent, paymentProof, paymentSubmission } from '../src/db/schema/billing.ts';
import { block, report } from '../src/db/schema/connections.ts';
import { memberAccount, privateContact, profile } from '../src/db/schema/members.ts';
import { auditEvent, notificationOutbox, rateLimitCounter, retainedIdentity, storageDeletion } from '../src/db/schema/operations.ts';
import { verificationCase } from '../src/db/schema/trust.ts';
import { sweepRetention } from '../src/jobs/retention.ts';
import { drainStorageDeletions } from '../src/lib/storage-cleanup.ts';
import { zip } from '../src/lib/zip.ts';
import { Client, createTestApp, latestCode, latestInvitationToken, staffBrowser, TEST_PASSWORD, type AdminClient, type Res } from './harness.ts';

type App = Awaited<ReturnType<typeof createTestApp>>;
let t: App;
let owner: AdminClient;
let reviewer: AdminClient;
let image: Buffer;

const DAY = 86_400_000;
const ok = (res: Res, status = 200) => {
  assert.equal(res.status, status, JSON.stringify(res.body));
  return res.body;
};
const rejected = (res: Res, status: number, code: string) => {
  assert.equal(res.status, status, JSON.stringify(res.body));
  assert.equal(res.body.code, code, JSON.stringify(res.body));
};

let phoneSeq = 100;
const nextPhone = () => `+9477666${String(phoneSeq++).padStart(4, '0')}`;

const base = {
  countryCode: 'LK',
  city: 'Kandy',
  occupation: 'Teacher',
  education: 'BA',
  maritalStatus: 'never_married',
  bio: 'Calm, curious and close to family; hoping to build a kind and honest home.',
};

type Member = { client: Client; profileId: string; userId: string; phone: string };

async function staffClient(app: App, email: string, role: 'owner' | 'backup_reviewer'): Promise<AdminClient> {
  return staffBrowser(app, email, role);
}

const file = (name: string, type = 'image/jpeg') => new File([new Uint8Array(image)], name, { type });
function imageForm(name = 'photo.jpg') {
  const form = new FormData();
  form.set('file', file(name));
  return form;
}

async function verifiedClient(email: string, name: string, phone = nextPhone()): Promise<Client> {
  const client = await t.client().signIn(email, name);
  ok(await client.verifyPhone(phone));
  const submitted = ok(await client.sendDocument(), 201);
  ok(await reviewer.post(`/api/admin/staff/verification/${submitted.id}/decision`, { decision: 'approved' }));
  return client;
}

async function publishedMember(email: string, name: string, fields: Record<string, unknown> = {}): Promise<Member> {
  const client = await verifiedClient(email, name);
  const created = ok(await client.post('/api/v1/profiles', { management: 'self', adultDeclared: true }), 201);
  ok(
    await client.patch(`/api/v1/profiles/${created.id}`, {
      version: created.version,
      ...base,
      displayName: name,
      gender: 'woman',
      birthDate: '1996-04-04',
      heightCm: 160,
      ...fields,
    }),
  );
  const phone = nextPhone();
  ok(await client.post(`/api/v1/profiles/${created.id}/contacts`, { person: 'candidate', kind: 'phone', value: phone }), 201);
  ok(await client.post(`/api/v1/profiles/${created.id}/publish`));
  const me = ok(await client.get('/api/v1/me'));
  return { client, profileId: created.id, userId: me.id, phone };
}

/** A profile a manager runs; with `candidateEmail` the invited candidate joins it. */
async function managedProfile(manager: Client, name: string, candidateEmail?: string) {
  const created = ok(await manager.post('/api/v1/profiles', { management: 'manager', relationship: 'mother', authorityDeclared: true }), 201);
  ok(await manager.patch(`/api/v1/profiles/${created.id}`, { version: created.version, ...base, displayName: name, gender: 'woman', birthDate: '1998-08-08', heightCm: 157 }));
  ok(await manager.post(`/api/v1/profiles/${created.id}/contacts`, { person: 'candidate', kind: 'phone', value: nextPhone() }), 201);
  ok(await manager.post(`/api/v1/profiles/${created.id}/contacts`, { person: 'manager', kind: 'phone', value: nextPhone() }), 201);
  ok(await manager.post(`/api/v1/profiles/${created.id}/publish`));
  if (!candidateEmail) return { profileId: created.id as string, candidate: null };
  ok(await manager.post(`/api/v1/profiles/${created.id}/invitations`, { channel: 'email', contact: candidateEmail }), 201);
  const token = latestInvitationToken(t.outbox, candidateEmail);
  ok(await t.client().post('/api/v1/invitations/code', { token }));
  const code = latestCode(t.outbox, candidateEmail);
  const candidate = await t.client().signIn(candidateEmail, name);
  ok(await candidate.post('/api/v1/invitations/accept', { token, code }));
  return { profileId: created.id as string, candidate };
}

const grant = (profileId: string) =>
  owner.post(`/api/admin/owner/profiles/${profileId}/plan/grant`, { planId: 'starter_1m', days: 30, reason: 'Stage 5a test plan' });
async function connect(from: Member, to: Member) {
  const sent = ok(await from.client.post(`/api/v1/profiles/${from.profileId}/interests`, { receiverProfileId: to.profileId, confirmSharing: true }), 201);
  ok(await to.client.post(`/api/v1/interests/${sent.id}/accept`));
}
const enableBankTransfer = () =>
  owner.put('/api/admin/owner/payment-settings/lkr_bank_transfer', { enabled: true, instructions: 'TEST ONLY - not a real account' });
async function approvedPayment(m: Member, settlementRef: string) {
  const payment = ok(
    await m.client.post(`/api/v1/profiles/${m.profileId}/payments`, {
      planId: 'starter_1m',
      residenceCountry: 'LK',
      channel: 'lkr_bank_transfer',
      confirmRefundTerms: true,
    }),
    201,
  );
  ok(await m.client.post(`/api/v1/payments/${payment.id}/proof`, imageForm('receipt.jpg')), 201);
  ok(await owner.post(`/api/admin/owner/payments/${payment.id}/approve`, { settlementRef }));
  return payment.id as string;
}
const deleteAccount = (client: Client) => client.post('/api/v1/account/delete', { confirm: true });
const sendCode = (email: string, ip?: string) => {
  const visitor = t.client();
  if (ip) visitor.headers['x-forwarded-for'] = ip;
  return visitor.post('/api/auth/member/sign-up', { name: 'Visitor', email: email, password: TEST_PASSWORD, consent: true });
};
const outboxRow = async (eventKey: string) => (await t.db.select().from(notificationOutbox).where(eq(notificationOutbox.eventKey, eventKey)))[0];
const photoKeys = async (profileId: string) =>
  (
    await t.db.execute(sql`select ph.blurred_key as blurred, o.object_key as original
                           from photo ph join photo_original o on o.photo_id = ph.id where ph.profile_id = ${profileId}`)
  ).rows as { blurred: string; original: string }[];

/** Reads the export's ZIP back: local headers in order, stored or deflated. */
function unzip(buffer: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extra = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    const start = offset + 30 + nameLength + extra;
    const body = buffer.subarray(start, start + size);
    files.set(name, method === 8 ? inflateRawSync(body) : Buffer.from(body));
    offset = start + size;
  }
  return files;
}

before(async () => {
  t = await createTestApp();
  image = await sharp({ create: { width: 900, height: 700, channels: 3, background: '#c9b8a0' } }).jpeg().toBuffer();
  reviewer = await staffClient(t, 'reviewer@favoritehearts.test', 'backup_reviewer');
  owner = await staffClient(t, 'owner@favoritehearts.test', 'owner');
  ok(await enableBankTransfer());
});

describe('security headers on every API answer', () => {
  test('nothing the API sends can run, be framed, be indexed or be cached', async () => {
    for (const path of ['/health', '/api/v1/plans', '/api/v1/service-status']) {
      const res = await t.client().send('GET', path);
      assert.equal(res.status, 200, path);
      const policy = res.headers.get('content-security-policy') ?? '';
      assert.match(policy, /default-src 'none'/, path);
      assert.match(policy, /frame-ancestors 'none'/, path);
      assert.equal(res.headers.get('x-frame-options'), 'DENY', path);
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff', path);
      assert.equal(res.headers.get('referrer-policy'), 'no-referrer', path);
      assert.match(res.headers.get('strict-transport-security') ?? '', /max-age=31536000; includeSubDomains/, path);
    }
    const api = await t.client().send('GET', '/api/v1/plans');
    assert.equal(api.headers.get('cache-control'), 'no-store');
    assert.equal(api.headers.get('x-robots-tag'), 'noindex');
  });
});

describe('rate limits (Part 2: sign-in, codes, requests, invitations, reports, uploads)', () => {
  let limited: App;
  before(async () => {
    limited = await createTestApp({ rateLimit: true });
  });
  const visitorOf = (ip: string) => {
    const client = limited.client();
    client.headers['x-forwarded-for'] = ip;
    return client;
  };
  const codeKeys = async () => (await limited.db.select({ key: rateLimitCounter.key }).from(rateLimitCounter)).map((r) => r.key);

  test('a burst past one of our limits gets 429 with Retry-After; another address is not affected', async () => {
    const visitor = visitorOf('203.0.113.10');
    for (let i = 0; i < 10; i += 1) {
      assert.notEqual((await visitor.post('/api/v1/invitations/code', { token: 'x'.repeat(43) })).status, 429, `attempt ${i + 1}`);
    }
    const eleventh = await visitor.send('POST', '/api/v1/invitations/code', { token: 'x'.repeat(43) });
    assert.equal(eleventh.status, 429);
    assert.equal(((await eleventh.json()) as { code: string }).code, 'RATE_LIMITED');
    assert.ok(Number(eleventh.headers.get('retry-after')) > 0);
    assert.notEqual((await visitorOf('203.0.113.11').post('/api/v1/invitations/code', { token: 'x'.repeat(43) })).status, 429);
  });

  test('simultaneous requests cannot slip past a limit together', async () => {
    const results = await Promise.all(
      Array.from({ length: 15 }, () => visitorOf('203.0.113.50').post('/api/v1/invitations/code', { token: 'y'.repeat(43) })),
    );
    assert.equal(results.filter((r) => r.status === 429).length, 5, 'exactly 10 of 15 pass');
  });

  test('per account: the data export, 5 a day', async () => {
    const member = await visitorOf('198.51.100.1').signIn('export-limit@example.test', 'Ira');
    for (let i = 0; i < 5; i += 1) assert.equal((await member.send('GET', '/api/v1/account/export')).status, 200);
    const sixth = await member.send('GET', '/api/v1/account/export');
    assert.equal(sixth.status, 429);
    assert.ok(Number(sixth.headers.get('retry-after')) > 23 * 3600);
  });

  test('sign-up codes: 3 a minute per IP address (Better-Auth), counted in the same Postgres table', async () => {
    const visitor = visitorOf('198.51.100.7');
    for (let i = 0; i < 3; i += 1) {
      ok(await visitor.post('/api/auth/member/sign-up', { name: 'Visitor', email: `ip-limit-${i}@example.test`, password: TEST_PASSWORD, consent: true }));
    }
    const fourth = await visitor.post('/api/auth/member/sign-up', { name: 'Visitor', email: 'ip-limit-3@example.test', password: TEST_PASSWORD, consent: true });
    assert.equal(fourth.status, 429, JSON.stringify(fourth.body));
    assert.ok((await codeKeys()).some((key) => key.startsWith('auth:')));
  });

  test('sign-up codes: at most 5 an hour to one address, whatever IP addresses ask; no address is stored', async () => {
    const email = 'inbox-flood@example.test';
    for (let i = 0; i < 5; i += 1) {
      ok(await visitorOf(`192.0.2.${i + 1}`).post('/api/auth/member/sign-up', { name: 'Visitor', email: email, password: TEST_PASSWORD, consent: true }));
    }
    const sixth = await visitorOf('192.0.2.99').post('/api/auth/member/sign-up', { name: 'Visitor', email: email, password: TEST_PASSWORD, consent: true });
    assert.equal(sixth.status, 429, JSON.stringify(sixth.body));
    assert.match(sixth.body.message, /this address/);
    const keys = await codeKeys();
    assert.ok(keys.some((key) => key.startsWith('code-to:')));
    assert.ok(!keys.some((key) => key.includes('@')), 'addresses are kept only as keyed hashes');
  });
});

describe('the owner pauses sign-ups and document submissions (section 10)', () => {
  test('only the owner switches them, each change is audited with its reason, and the app can read them', async () => {
    rejected(await reviewer.get('/api/admin/owner/operations'), 403, 'FORBIDDEN');
    rejected(await reviewer.put('/api/admin/owner/operations/signups_paused', { enabled: true }), 403, 'FORBIDDEN');
    const member = await t.client().signIn('switch-member@example.test', 'Mala');
    rejected(await member.put('/api/admin/owner/operations/signups_paused', { enabled: true }), 403, 'ADMIN_HEADER_REQUIRED');
    const { flags } = ok(await owner.get('/api/admin/owner/operations'));
    assert.deepEqual(
      flags.map((f: { key: string; enabled: boolean }) => [f.key, f.enabled]),
      [['signups_paused', false], ['document_submissions_paused', false], ['selfie_required', false]],
    );
    rejected(await owner.put('/api/admin/owner/operations/everything', { enabled: true }), 400, 'VALIDATION');

    const paused = ok(await owner.put('/api/admin/owner/operations/signups_paused', { enabled: true, reason: 'Review queue is full' }));
    assert.deepEqual([paused.enabled, paused.reason], [true, 'Review queue is full']);
    assert.deepEqual(ok(await t.client().get('/api/v1/service-status')), { signupsPaused: true, documentSubmissionsPaused: false, selfieRequired: false });
    const [entry] = await t.db
      .select()
      .from(auditEvent)
      .where(and(eq(auditEvent.entityType, 'operations_flag'), eq(auditEvent.entityId, 'signups_paused')));
    assert.deepEqual([entry!.action, entry!.reason, entry!.actorRole], ['operations.paused', 'Review queue is full', 'owner']);

    // The selfie switch has no row until the owner first sets it; setting it creates one, audited like the others.
    rejected(await reviewer.put('/api/admin/owner/operations/selfie_required', { enabled: true }), 403, 'FORBIDDEN');
    const selfie = ok(await owner.put('/api/admin/owner/operations/selfie_required', { enabled: true, reason: 'Fake profiles seen' }));
    assert.equal(selfie.enabled, true);
    assert.equal(ok(await t.client().get('/api/v1/service-status')).selfieRequired, true);
    const [turned] = await t.db
      .select()
      .from(auditEvent)
      .where(and(eq(auditEvent.entityType, 'operations_flag'), eq(auditEvent.entityId, 'selfie_required')));
    assert.equal(turned!.action, 'operations.selfie_required');
    ok(await owner.put('/api/admin/owner/operations/selfie_required', { enabled: false }));
    assert.equal(ok(await t.client().get('/api/v1/service-status')).selfieRequired, false);
  });

  test('while sign-ups are paused, members already signed up sign in, but no new account is made', async () => {
    await t.client().signIn('switch-member@example.test');
    const newcomer = t.client();
    const attempt = await newcomer.post('/api/auth/member/sign-up', { name: 'Visitor', email: 'newcomer@example.test', password: TEST_PASSWORD, consent: true });
    assert.equal(attempt.status, 403, JSON.stringify(attempt.body));
    assert.match(attempt.body.message, /paused/);
    assert.equal((await t.db.select().from(user).where(eq(user.email, 'newcomer@example.test'))).length, 0);

    ok(await owner.put('/api/admin/owner/operations/signups_paused', { enabled: false }));
    await t.client().signIn('newcomer@example.test', 'Nuwan');
  });

  test('while document submissions are paused, an upload is refused before anything is stored', async () => {
    ok(await owner.put('/api/admin/owner/operations/document_submissions_paused', { enabled: true }));
    assert.equal(ok(await t.client().get('/api/v1/service-status')).documentSubmissionsPaused, true);
    const member = await t.client().signIn('paused-docs@example.test', 'Dilu');
    const stored = t.files.size;
    rejected(await member.sendDocument(), 403, 'DOCUMENTS_PAUSED');
    assert.equal(t.files.size, stored);
    ok(await owner.put('/api/admin/owner/operations/document_submissions_paused', { enabled: false }));
    ok(await member.sendDocument(), 201);
  });
});

describe('deleting a profile (section 8)', () => {
  test('it disappears at once for everyone; payments, reports and blocks stay for the retention period', async () => {
    const kamala = await publishedMember('kamala@example.test', 'Kamala');
    const lal = await publishedMember('lal@example.test', 'Lal', { gender: 'man', heightCm: 172 });
    ok(await grant(kamala.profileId), 201);
    ok(await grant(lal.profileId), 201);
    ok(await kamala.client.post(`/api/v1/profiles/${kamala.profileId}/photos`, imageForm()), 201);
    await connect(lal, kamala);
    const [keys] = await photoKeys(kamala.profileId);

    ok(await kamala.client.post(`/api/v1/profiles/${kamala.profileId}/delete`, { confirm: true }), 204);

    assert.deepEqual(ok(await kamala.client.get('/api/v1/profiles')).profiles, []);
    rejected(await kamala.client.get(`/api/v1/profiles/${kamala.profileId}`), 404, 'NOT_FOUND');
    assert.deepEqual(ok(await lal.client.get(`/api/v1/profiles/${lal.profileId}/connections`)).connections, []);
    assert.equal((await lal.client.get(`/api/v1/discover/${kamala.profileId}`)).status, 404);

    const [shell] = await t.db.select().from(profile).where(eq(profile.id, kamala.profileId));
    assert.deepEqual(
      [shell!.status, shell!.displayName, shell!.birthDate, shell!.bio, shell!.candidateUserId, Boolean(shell!.deletedAt)],
      ['deleted', null, null, null, null, true],
    );
    assert.equal((await t.db.select().from(privateContact).where(eq(privateContact.profileId, kamala.profileId))).length, 0);
    const [forfeit] = await t.db
      .select()
      .from(entitlementEvent)
      .where(and(eq(entitlementEvent.profileId, kamala.profileId), eq(entitlementEvent.kind, 'forfeit')));
    assert.equal(forfeit!.reason, 'profile_deleted', 'the time left on the plan is lost');
    assert.ok(!t.files.has(`private/${keys!.original}`) && !t.files.has(`derived/${keys!.blurred}`), 'both photo files are deleted');
    assert.equal((await t.db.select().from(storageDeletion)).length, 0);
    const [entry] = await t.db.select().from(auditEvent).where(and(eq(auditEvent.action, 'profile.deleted'), eq(auditEvent.entityId, kamala.profileId)));
    assert.deepEqual(entry!.metadata, { photos: 1, contacts: 1, requests: 1, connectionsEnded: 1, paymentsCancelled: 0, planForfeited: true });

    ok(await kamala.client.post('/api/v1/profiles', { management: 'self', adultDeclared: true }), 201);
  });

  test('deleting needs a confirmation and a sign-in within the last 15 minutes', async () => {
    const oshadi = await publishedMember('oshadi@example.test', 'Oshadi');
    rejected(await oshadi.client.post(`/api/v1/profiles/${oshadi.profileId}/delete`, {}), 400, 'VALIDATION');
    await t.db.update(session).set({ createdAt: new Date(Date.now() - 20 * 60_000) }).where(eq(session.userId, oshadi.userId));
    rejected(await oshadi.client.post(`/api/v1/profiles/${oshadi.profileId}/delete`, { confirm: true }), 403, 'RECENT_SIGN_IN_REQUIRED');
    rejected(await deleteAccount(oshadi.client), 403, 'RECENT_SIGN_IN_REQUIRED');
    assert.equal(ok(await oshadi.client.get('/api/v1/account/deletion')).recentSignIn, false);
    assert.equal(ok(await oshadi.client.get(`/api/v1/profiles/${oshadi.profileId}`)).status, 'published');
  });

  test('the candidate decides: a manager hands a joined candidate’s profile over, and deletes only one nobody joined', async () => {
    const sunil = await verifiedClient('sunil@example.test', 'Sunil');
    const joined = await managedProfile(sunil, 'Nimali', 'nimali@example.test');
    const unclaimed = await managedProfile(sunil, 'Tharu');

    rejected(await sunil.post(`/api/v1/profiles/${joined.profileId}/delete`, { confirm: true }), 403, 'CANDIDATE_DECIDES');
    rejected(await sunil.post(`/api/v1/profiles/${unclaimed.profileId}/hand-over`), 409, 'NO_CANDIDATE');
    ok(await sunil.post(`/api/v1/profiles/${unclaimed.profileId}/delete`, { confirm: true }), 204);

    ok(await sunil.post(`/api/v1/profiles/${joined.profileId}/hand-over`), 204);
    rejected(await sunil.get(`/api/v1/profiles/${joined.profileId}`), 404, 'NOT_FOUND');
    const view = ok(await joined.candidate!.get(`/api/v1/profiles/${joined.profileId}`));
    assert.deepEqual([view.management, view.status], ['self', 'paused'], 'paused until the candidate’s own checks are done');
    const left = await t.db.select().from(privateContact).where(eq(privateContact.profileId, joined.profileId));
    assert.ok(left.length > 0 && left.every((contact) => contact.person === 'candidate'), 'the manager’s own details left with them');
    const mail = await outboxRow(`profile.handed_over:${joined.profileId}`);
    assert.deepEqual([mail?.template, (mail?.payload as { managerDeleted: boolean }).managerDeleted], ['profile_handed_over', false]);
  });

  test('a candidate can delete the profile their manager runs, and the manager is told', async () => {
    const priya = await verifiedClient('priya@example.test', 'Priya');
    const managed = await managedProfile(priya, 'Sanduni', 'sanduni@example.test');
    ok(await managed.candidate!.post(`/api/v1/profiles/${managed.profileId}/delete`, { confirm: true }), 204);
    rejected(await priya.get(`/api/v1/profiles/${managed.profileId}`), 404, 'NOT_FOUND');
    const mail = await outboxRow(`profile.deleted:${managed.profileId}`);
    const priyaId = ok(await priya.get('/api/v1/me')).id;
    assert.deepEqual([mail?.template, mail?.recipientUserId], ['profile_deleted', priyaId]);
  });
});

describe('deleting an account (section 8)', () => {
  test('everything personal goes at once; payment records, reports and blocks stay, and the person may join again', async () => {
    const ruwan = await publishedMember('ruwan@example.test', 'Ruwan', { gender: 'man', heightCm: 170 });
    const sara = await publishedMember('sara@example.test', 'Sara');
    ok(await ruwan.client.post(`/api/v1/profiles/${ruwan.profileId}/photos`, imageForm()), 201);
    const [photo] = await photoKeys(ruwan.profileId);
    const paymentId = await approvedPayment(ruwan, 'BOC 2026-10-30 RUWAN1');
    const unsent = ok(
      await ruwan.client.post(`/api/v1/profiles/${ruwan.profileId}/payments`, {
        planId: 'premium_3m',
        residenceCountry: 'LK',
        channel: 'lkr_bank_transfer',
        confirmRefundTerms: true,
        confirmLostDays: true,
      }),
      201,
    );
    const filed = ok(
      await ruwan.client.post('/api/v1/reports', { reporterProfileId: ruwan.profileId, profileId: sara.profileId, category: 'harassment', detail: 'Rude' }),
      201,
    );
    ok(await ruwan.client.post(`/api/v1/profiles/${ruwan.profileId}/blocks`, { profileId: sara.profileId }), 201);
    const documents = await t.db.select({ key: verificationCase.evidenceKey }).from(verificationCase).where(eq(verificationCase.subjectUserId, ruwan.userId));
    const receipts = await t.db.select({ key: paymentProof.objectKey }).from(paymentProof).where(eq(paymentProof.paymentId, paymentId));

    const preview = ok(await ruwan.client.get('/api/v1/account/deletion'));
    assert.deepEqual(
      preview.profiles.map((p: { displayName: string; outcome: string; planActive: boolean }) => [p.displayName, p.outcome, p.planActive]),
      [['Ruwan', 'deleted', true]],
    );
    assert.deepEqual([preview.paymentsUnderReview, preview.recentSignIn, preview.retentionMonths], [0, true, 6]);

    const res = await ruwan.client.send('POST', '/api/v1/account/delete', { confirm: true });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { profilesDeleted: 1, profilesHandedOver: 0 });
    assert.ok(res.headers.getSetCookie().some((cookie) => /session_token=;/.test(cookie)), 'this browser is signed out');
    rejected(await ruwan.client.get('/api/v1/me'), 401, 'UNAUTHENTICATED');

    const [identity] = await t.db.select().from(user).where(eq(user.id, ruwan.userId));
    assert.deepEqual(
      [identity!.name, identity!.phoneNumber, identity!.email.endsWith('@deleted.favoritehearts.invalid')],
      ['', null, true],
    );
    assert.equal((await t.db.select().from(session).where(eq(session.userId, ruwan.userId))).length, 0);
    const [account] = await t.db.select().from(memberAccount).where(eq(memberAccount.userId, ruwan.userId));
    assert.equal(account!.status, 'deleted');
    const [kept] = await t.db.select().from(retainedIdentity).where(eq(retainedIdentity.userId, ruwan.userId));
    assert.ok(kept!.emailHash && kept!.phoneHash && !kept!.banned);
    assert.ok(!JSON.stringify(kept).includes('ruwan@'), 'only a keyed hash of the address is kept');
    const months = (kept!.purgeAfter.getTime() - kept!.deletedAt.getTime()) / (30.44 * DAY);
    assert.ok(months > 5.9 && months < 6.1, `kept ${months.toFixed(2)} months`);

    const payments = await t.db.select().from(paymentSubmission).where(eq(paymentSubmission.payerUserId, ruwan.userId));
    assert.deepEqual(payments.map((p) => [p.id === unsent.id, p.status]).sort(), [[false, 'approved'], [true, 'cancelled']]);
    const detail = ok(await owner.get(`/api/admin/owner/payments/${paymentId}`));
    assert.deepEqual(
      [detail.profile.deleted, detail.payer.deleted, detail.payer.name, detail.payer.email, detail.payer.phone],
      [true, true, null, null, null],
    );
    assert.equal((await t.db.select().from(report).where(eq(report.id, filed.id))).length, 1, 'the report stays');
    assert.equal((await t.db.select().from(block).where(eq(block.blockerProfileId, ruwan.profileId))).length, 1, 'the block stays');
    const cases = await t.db.select().from(verificationCase).where(eq(verificationCase.subjectUserId, ruwan.userId));
    assert.ok(cases.length === 1 && cases[0]!.evidenceKey === null && cases[0]!.purgedAt && cases[0]!.status === 'approved');
    assert.ok(!t.files.has(`private/${documents[0]!.key}`), 'the identity document file is deleted');
    assert.ok(!t.files.has(`private/${photo!.original}`) && !t.files.has(`derived/${photo!.blurred}`), 'the photo files are deleted');
    assert.ok(t.files.has(`private/${receipts[0]!.key}`), 'the receipt stays with the payment record');

    const again = await t.client().signIn('ruwan@example.test', 'Ruwan');
    assert.notEqual(ok(await again.get('/api/v1/me')).id, ruwan.userId, 'a new, separate account');
  });

  test('a manager’s account: a profile its candidate joined passes to them with its plan, the others are deleted', async () => {
    const kumari = await verifiedClient('kumari@example.test', 'Kumari');
    const joined = await managedProfile(kumari, 'Dinithi', 'dinithi@example.test');
    const alone = await managedProfile(kumari, 'Hasini');
    ok(await grant(joined.profileId), 201);

    const preview = ok(await kumari.get('/api/v1/account/deletion'));
    assert.deepEqual(
      preview.profiles.map((p: { displayName: string; outcome: string; candidateName: string | null }) => [p.displayName, p.outcome, p.candidateName]),
      [['Dinithi', 'handed_over', 'Dinithi'], ['Hasini', 'deleted', null]],
    );
    assert.deepEqual(ok(await deleteAccount(kumari)), { profilesDeleted: 1, profilesHandedOver: 1 });

    const view = ok(await joined.candidate!.get(`/api/v1/profiles/${joined.profileId}`));
    assert.equal(view.management, 'self');
    assert.equal(ok(await joined.candidate!.get(`/api/v1/profiles/${joined.profileId}/plan`)).active, true, 'the paid time carries over');
    const [gone] = await t.db.select({ status: profile.status }).from(profile).where(eq(profile.id, alone.profileId));
    assert.equal(gone!.status, 'deleted');
    const mail = await outboxRow(`profile.handed_over:${joined.profileId}`);
    assert.equal((mail?.payload as { managerDeleted: boolean }).managerDeleted, true);
  });

  test('a candidate’s account: the profile their manager ran is deleted and the manager is told', async () => {
    const upali = await verifiedClient('upali@example.test', 'Upali');
    const managed = await managedProfile(upali, 'Ishara', 'ishara@example.test');
    assert.deepEqual(ok(await deleteAccount(managed.candidate!)), { profilesDeleted: 1, profilesHandedOver: 0 });
    rejected(await upali.get(`/api/v1/profiles/${managed.profileId}`), 404, 'NOT_FOUND');
    assert.equal((await outboxRow(`profile.deleted:${managed.profileId}`))?.template, 'profile_deleted');
  });

  test('staff accounts are not deleted here, nor from the admin site', async () => {
    // The admin cookie means nothing to the member API, and the admin sign-in has no delete endpoint.
    rejected(await owner.post('/api/v1/account/delete', { confirm: 'DELETE' }), 401, 'UNAUTHENTICATED');
    assert.equal((await owner.post('/auth/delete-user', {})).status, 404);
  });
});

describe('banned addresses cannot sign up again (section 8)', () => {
  test('a serious report upheld before deletion bans the hashed email and phone until the retention period ends', async () => {
    const scammer = await publishedMember('fake@example.test', 'Fake Name');
    const nadee = await publishedMember('nadee@example.test', 'Nadee', { gender: 'man', heightCm: 175 });
    const filed = ok(
      await nadee.client.post('/api/v1/reports', { reporterProfileId: nadee.profileId, profileId: scammer.profileId, category: 'scam', detail: 'Asked for money' }),
      201,
    );
    ok(await reviewer.post(`/api/admin/staff/reports/${filed.id}/decision`, { decision: 'upheld', note: 'Confirmed' }));
    const scammerPhone = ok(await scammer.client.get('/api/v1/me')).phoneNumber;
    ok(await deleteAccount(scammer.client));
    assert.equal((await t.db.select().from(retainedIdentity).where(eq(retainedIdentity.userId, scammer.userId)))[0]!.banned, true);

    const byEmail = await sendCode('fake@example.test');
    assert.equal(byEmail.status, 403, JSON.stringify(byEmail.body));
    assert.match(byEmail.body.message, /cannot be used for a new account/);
    const byPhone = await t.client().post('/api/auth/member/sign-up', { name: 'Visitor', phoneNumber: scammerPhone, password: TEST_PASSWORD, consent: true });
    assert.equal(byPhone.status, 403, JSON.stringify(byPhone.body));

    await t.db.update(retainedIdentity).set({ purgeAfter: new Date(Date.now() - 60_000) }).where(eq(retainedIdentity.userId, scammer.userId));
    ok(await sendCode('fake@example.test'));
  });

  test('a serious report upheld after the account was deleted still bans it', async () => {
    const gayan = await publishedMember('gayan@example.test', 'Gayan', { gender: 'man', heightCm: 171 });
    const witness = await publishedMember('witness@example.test', 'Witness');
    const filed = ok(
      await witness.client.post('/api/v1/reports', { reporterProfileId: witness.profileId, profileId: gayan.profileId, category: 'threat' }),
      201,
    );
    ok(await deleteAccount(gayan.client));
    ok(await sendCode('gayan@example.test'), 200);
    ok(await reviewer.post(`/api/admin/staff/reports/${filed.id}/decision`, { decision: 'upheld' }));
    assert.equal((await sendCode('gayan@example.test')).status, 403);
  });

  test('a profile handed to its candidate is theirs: a report upheld later does not ban the former manager', async () => {
    const ranjani = await verifiedClient('ranjani@example.test', 'Ranjani');
    const joined = await managedProfile(ranjani, 'Piumi', 'piumi@example.test');
    const witness = await publishedMember('witness-two@example.test', 'Witness Two', { gender: 'man', heightCm: 170 });
    const filed = ok(
      await witness.client.post('/api/v1/reports', { reporterProfileId: witness.profileId, profileId: joined.profileId, category: 'scam' }),
      201,
    );
    assert.deepEqual(ok(await deleteAccount(ranjani)), { profilesDeleted: 0, profilesHandedOver: 1 });
    ok(await reviewer.post(`/api/admin/staff/reports/${filed.id}/decision`, { decision: 'upheld' }));
    ok(await sendCode('ranjani@example.test'));
  });
});

describe('the retention sweep (section 8)', () => {
  test('six months after a deletion everything kept for it goes; younger deletions stay', async () => {
    const asha = await publishedMember('asha@example.test', 'Asha');
    const malki = await publishedMember('malki@example.test', 'Malki', { gender: 'man', heightCm: 168 });
    const paymentId = await approvedPayment(asha, 'BOC 2026-10-30 ASHA1');
    const [receipt] = await t.db.select().from(paymentProof).where(eq(paymentProof.paymentId, paymentId));
    const filed = ok(
      await asha.client.post('/api/v1/reports', { reporterProfileId: asha.profileId, profileId: malki.profileId, category: 'other', detail: 'Test' }),
      201,
    );
    ok(await malki.client.post(`/api/v1/profiles/${malki.profileId}/blocks`, { profileId: asha.profileId }), 201);
    ok(await deleteAccount(asha.client));
    const fresh = await publishedMember('fresh@example.test', 'Fresh');
    ok(await deleteAccount(fresh.client));

    await sweepRetention({ db: t.db, storage: t.storage });
    assert.equal((await t.db.select().from(paymentSubmission).where(eq(paymentSubmission.id, paymentId))).length, 1, 'kept before 6 months');

    await t.db.execute(sql`update member_account set deleted_at = deleted_at - interval '6 months 1 day' where user_id = ${asha.userId}`);
    await t.db.execute(sql`update profile set deleted_at = deleted_at - interval '6 months 1 day' where id = ${asha.profileId}`);
    const result = await sweepRetention({ db: t.db, storage: t.storage });
    assert.deepEqual(
      [result.removed.accounts, result.removed.profiles, result.removed.payments, result.removed.receipts, result.removed.reports],
      [1, 1, 1, 1, 1],
    );
    assert.equal(result.files.failed, 0);

    assert.equal((await t.db.select().from(user).where(eq(user.id, asha.userId))).length, 0, 'the empty identity is gone');
    assert.equal((await t.db.select().from(retainedIdentity).where(eq(retainedIdentity.userId, asha.userId))).length, 0);
    assert.equal((await t.db.select().from(profile).where(eq(profile.id, asha.profileId))).length, 0);
    assert.equal((await t.db.select().from(paymentSubmission).where(eq(paymentSubmission.id, paymentId))).length, 0);
    assert.equal((await t.db.select().from(report).where(eq(report.id, filed.id))).length, 0);
    assert.equal((await t.db.select().from(block).where(eq(block.blockedProfileId, asha.profileId))).length, 0);
    assert.ok(!t.files.has(`private/${receipt!.objectKey}`), 'the receipt file is deleted');
    assert.equal((await t.db.select().from(auditEvent).where(eq(auditEvent.entityId, paymentId))).length, 0, 'and the audit trail about it');
    const [run] = await t.db.select().from(auditEvent).where(eq(auditEvent.action, 'retention.sweep')).orderBy(sql`${auditEvent.seq} desc`).limit(1);
    assert.equal((run!.metadata as { removed: { accounts: number } }).removed.accounts, 1);
    // The sweep is the only delete the audit trail allows, and it leaves tombstones, so the chain still checks.
    const checked = (await t.db.execute(sql`select app.audit_chain_check() as r, (select count(*)::int from audit_tombstone) as tombstones`)) as unknown as {
      rows: { r: { ok: boolean }; tombstones: number }[];
    };
    const chain = checked.rows[0];
    assert.equal(chain!.r.ok, true, JSON.stringify(chain!.r));
    assert.ok(chain!.tombstones > 0);

    assert.equal((await t.db.select().from(user).where(eq(user.id, fresh.userId))).length, 1, 'a younger deletion stays');
    assert.equal((await t.db.select().from(retainedIdentity).where(eq(retainedIdentity.userId, fresh.userId))).length, 1);
  });

  test('a file deletion that fails stays queued, the member’s request still succeeds, and the retry deletes it', async () => {
    const flaky = await publishedMember('flaky@example.test', 'Flaky');
    ok(await flaky.client.post(`/api/v1/profiles/${flaky.profileId}/photos`, imageForm()), 201);
    const [keys] = await photoKeys(flaky.profileId);
    t.storage.failDeletes = true;
    try {
      ok(await flaky.client.post(`/api/v1/profiles/${flaky.profileId}/delete`, { confirm: true }), 204);
      const queued = await t.db.select().from(storageDeletion);
      assert.equal(queued.length, 2);
      assert.ok(queued.every((item) => item.attempts === 1 && item.lastError === 'storage unreachable'));
    } finally {
      t.storage.failDeletes = false;
    }
    assert.deepEqual(await drainStorageDeletions({ db: t.db, storage: t.storage }), { deleted: 2, failed: 0 });
    assert.ok(!t.files.has(`private/${keys!.original}`) && !t.files.has(`derived/${keys!.blurred}`));
  });
});

describe('the data export', () => {
  let dilini: Member;
  let sender: Member;

  test('one ZIP with the account, profiles, contacts and original photos, exactly as the app shows them', async () => {
    dilini = await publishedMember('dilini@example.test', 'Dilini');
    sender = await publishedMember('sender@example.test', 'Secret Sender', { gender: 'man', heightCm: 180 });
    ok(await grant(sender.profileId), 201);
    ok(await dilini.client.post(`/api/v1/profiles/${dilini.profileId}/photos`, imageForm()), 201);
    ok(await sender.client.post(`/api/v1/profiles/${sender.profileId}/interests`, { receiverProfileId: dilini.profileId, confirmSharing: true }), 201);

    const res = await dilini.client.send('GET', '/api/v1/account/export');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/zip');
    assert.match(res.headers.get('content-disposition') ?? '', /^attachment; filename="favorite-hearts-data-\d{4}-\d{2}-\d{2}\.zip"$/);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const files = unzip(Buffer.from(await res.arrayBuffer()));
    assert.deepEqual([...files.keys()].sort(), ['README.txt', 'data.json', 'photos/profile-1/photo-1-cover.jpg']);

    const raw = files.get('data.json')!.toString('utf8');
    const data = JSON.parse(raw);
    assert.equal(data.account.email, 'dilini@example.test');
    const [mine] = data.profiles;
    assert.deepEqual([mine.yourRole, mine.details.displayName, mine.contacts[0].value], ['candidate', 'Dilini', dilini.phone]);
    const [keys] = await photoKeys(dilini.profileId);
    assert.ok(files.get('photos/profile-1/photo-1-cover.jpg')!.equals(t.files.get(`private/${keys!.original}`)!), 'the original photo');
    assert.equal(mine.requestsReceived.length, 1);
    assert.equal(mine.requestsReceived[0].from.hidden, true, 'without a plan the sender stays hidden');
    assert.ok(!raw.includes('Secret Sender') && !raw.includes(sender.profileId), 'the sender is nowhere in the file');

    const [entry] = await t.db.select().from(auditEvent).where(and(eq(auditEvent.action, 'account.exported'), eq(auditEvent.entityId, dilini.userId)));
    assert.deepEqual(entry!.metadata, { profiles: 1, photos: 1 });
  });

  test('another member’s export holds none of the first member’s private details', async () => {
    const res = await sender.client.send('GET', '/api/v1/account/export');
    const raw = unzip(Buffer.from(await res.arrayBuffer())).get('data.json')!.toString('utf8');
    assert.ok(!raw.includes(dilini.phone), 'not connected: no contact details');
    assert.equal(JSON.parse(raw).profiles[0].requestsSent[0].to.name, 'Dilini', 'only the name the app shows');
  });

  test('the ZIP writer round-trips stored and deflated entries with UTF-8 names', () => {
    const entries = [
      { name: 'නම.txt', data: Buffer.from('සිංහල text', 'utf8'), compress: true },
      { name: 'empty.bin', data: Buffer.alloc(0) },
      { name: 'raw.bin', data: Buffer.from([0, 1, 2, 250, 251, 252]) },
    ];
    const files = unzip(zip(entries));
    for (const entry of entries) assert.ok(files.get(entry.name)!.equals(entry.data), entry.name);
  });
});
