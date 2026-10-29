/**
 * Stage 3 flows through the real HTTP API, as separate signed-in members: discovery for verified members,
 * requests with plan limits and the 7-day wait, the sender blur, connections and what they share (and the
 * log of it), blocks, reports with thresholds and staff review, photos with blurred copies, and "engaged or
 * married". Plans are granted directly in the database: buying one arrives in Stage 4.
 */
import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { and, eq, inArray } from 'drizzle-orm';
import sharp from 'sharp';
import { entitlementEvent } from '../src/db/schema/billing.ts';
import { connection, disclosureEvent, interest, quotaLedger } from '../src/db/schema/connections.ts';
import { auditEvent } from '../src/db/schema/operations.ts';
import { addStaff } from '../src/lib/staff-accounts.ts';
import { Client, createTestApp, totp, type Res } from './harness.ts';

let t: Awaited<ReturnType<typeof createTestApp>>;
let reviewer: Client;
let image: Buffer;

const PASSWORD = 'correct horse battery staple';
const ok = (res: Res, status = 200) => {
  assert.equal(res.status, status, JSON.stringify(res.body));
  return res.body;
};
const rejected = (res: Res, status: number, code: string) => {
  assert.equal(res.status, status, JSON.stringify(res.body));
  assert.equal(res.body.code, code);
};
const days = (n: number) => new Date(Date.now() + n * 86_400_000);

let phoneSeq = 100;
const nextPhone = () => `+9477123${String(phoneSeq++).padStart(4, '0')}`;

const base = {
  countryCode: 'LK',
  city: 'Colombo',
  occupation: 'Engineer',
  education: 'BSc',
  maritalStatus: 'never_married',
  bio: 'Kind, steady and close to family; looking for an honest shared future.',
};

type Member = { client: Client; profileId: string };

async function verifiedClient(email: string, name: string): Promise<Client> {
  const client = await t.client().signIn(email, name);
  ok(await client.verifyPhone(nextPhone()));
  const form = new FormData();
  form.set('documentType', 'nic');
  form.set('file', new File([new Uint8Array(image)], 'nic.jpg', { type: 'image/jpeg' }));
  const submitted = ok(await client.post('/api/v1/verification', form), 201);
  ok(await reviewer.post(`/api/v1/staff/verification/${submitted.id}/decision`, { decision: 'approved' }));
  return client;
}

async function publishedMember(email: string, name: string, fields: Record<string, unknown>): Promise<Member> {
  const client = await verifiedClient(email, name);
  const created = ok(await client.post('/api/v1/profiles', { management: 'self', adultDeclared: true }), 201);
  ok(await client.patch(`/api/v1/profiles/${created.id}`, { version: created.version, ...base, displayName: name, ...fields }));
  ok(await client.post(`/api/v1/profiles/${created.id}/contacts`, { person: 'candidate', kind: 'phone', value: nextPhone() }), 201);
  ok(await client.post(`/api/v1/profiles/${created.id}/publish`));
  return { client, profileId: created.id };
}

/** Plans are bought in Stage 4; here the owner's grant is written directly. */
async function grant(profileId: string, planId = 'starter_1m', startsAt = days(-1)) {
  await t.db.insert(entitlementEvent).values({ profileId, kind: 'grant', planId, startsAt, endsAt: days(29) });
}

const send = (from: Member, to: Member, key?: string) =>
  from.client.post(`/api/v1/profiles/${from.profileId}/interests`, {
    receiverProfileId: to.profileId,
    confirmSharing: true,
    ...(key ? { idempotencyKey: key } : {}),
  });

const discoverIds = async (who: Member, query = '') => (ok(await who.client.get(`/api/v1/discover${query}`)).profiles as { id: string }[]).map((p) => p.id);

/** Earlier sends, written directly: `count` closed requests charged at `chargedAt`. Returns a clean-up. */
async function pastSends(from: Member, to: Member, count: number, chargedAt: Date) {
  const made = await t.db
    .insert(interest)
    .values(
      Array.from({ length: count }, () => ({
        senderProfileId: from.profileId,
        receiverProfileId: to.profileId,
        status: 'declined' as const,
        shareConsentVersion: 'sharing-v1',
        createdAt: chargedAt,
        respondedAt: days(-60),
      })),
    )
    .returning({ id: interest.id });
  await t.db.insert(quotaLedger).values(made.map((m) => ({ profileId: from.profileId, interestId: m.id, chargedAt })));
  return () => t.db.delete(interest).where(inArray(interest.id, made.map((m) => m.id)));
}

let amal: Member; // man, Starter plan
let bina: Member; // woman, Premium plan, parents' names on the profile
let chathu: Member; // woman, no plan at first, caste shared with consent
let esha: Member; // woman, no plan at first
let fara: Member; // woman, reported in the threshold test
let dilan: Client; // signed in, never verified

before(async () => {
  t = await createTestApp();
  image = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#c9b8a6' } }).jpeg().toBuffer();
  await addStaff(t.deps, { email: 'reviewer@favoritehearts.test', name: 'Reviewer', role: 'backup_reviewer', password: PASSWORD });
  reviewer = t.client();
  ok(await reviewer.post('/api/auth/sign-in/email', { email: 'reviewer@favoritehearts.test', password: PASSWORD }));
  const { totpURI } = ok(await reviewer.post('/api/auth/two-factor/enable', { password: PASSWORD }));
  ok(await reviewer.post('/api/auth/two-factor/verify-totp', { code: totp(totpURI) }));

  amal = await publishedMember('amal@example.test', 'Amal', { gender: 'man', birthDate: '1993-05-10', heightCm: 175 });
  bina = await publishedMember('bina@example.test', 'Bina', {
    gender: 'woman',
    birthDate: '1996-08-21',
    heightCm: 160,
    motherName: 'Kamala',
    fatherName: 'Sunil',
    motherOccupation: 'Teacher',
    fatherOccupation: 'Doctor',
  });
  chathu = await publishedMember('chathu@example.test', 'Chathu', {
    gender: 'woman',
    birthDate: '1990-01-15',
    heightCm: 165,
    caste: { value: 'Govigama', consent: true },
  });
  esha = await publishedMember('esha@example.test', 'Esha', { gender: 'woman', birthDate: '1998-11-30', heightCm: 158 });
  fara = await publishedMember('fara@example.test', 'Fara', { gender: 'woman', birthDate: '1997-02-02', heightCm: 162 });
  await grant(amal.profileId);
  await grant(bina.profileId, 'premium_3m');
  dilan = await t.client().signIn('dilan@example.test', 'Dilan');
});

describe('discovery (owner decision 29 Oct 2026: verified members only; sections 1, 6)', () => {
  test('anonymous and unverified members cannot browse', async () => {
    rejected(await t.client().get('/api/v1/discover'), 401, 'UNAUTHENTICATED');
    rejected(await dilan.get('/api/v1/discover'), 403, 'VERIFICATION_REQUIRED');
    rejected(await dilan.get(`/api/v1/discover/${bina.profileId}`), 403, 'VERIFICATION_REQUIRED');
    rejected(await t.client().get(`/api/v1/profiles/${amal.profileId}/interests`), 401, 'UNAUTHENTICATED');
  });

  test('verified members see published profiles, never their own; filters run on the server', async () => {
    const all = await discoverIds(amal);
    assert.deepEqual(all.sort(), [bina, chathu, esha, fara].map((m) => m.profileId).sort());
    assert.deepEqual(await discoverIds(amal, '?gender=woman&ageMax=30&heightMin=159&heightMax=161'), [bina.profileId]);
    assert.deepEqual(await discoverIds(amal, '?caste=govigama'), [chathu.profileId], 'caste filters match consenting profiles');
    rejected(await amal.client.get('/api/v1/discover?ageMin=40&ageMax=30'), 400, 'VALIDATION');
    rejected(await amal.client.get('/api/v1/discover?cursor=not-a-cursor'), 400, 'VALIDATION');
  });

  test('cards and profiles carry only the member allowlist; parents’ names wait for a connection', async () => {
    const [card] = ok(await amal.client.get('/api/v1/discover?caste=govigama')).profiles;
    assert.equal(card.age, 36);
    for (const hidden of ['birthDate', 'caste', 'contacts', 'motherName', 'candidateUserId', 'version']) {
      assert.equal(hidden in card, false, `cards never carry ${hidden}`);
    }
    const view = ok(await amal.client.get(`/api/v1/discover/${bina.profileId}?as=${amal.profileId}`));
    assert.equal(view.family.motherOccupation, 'Teacher');
    assert.equal(view.family.motherName, null);
    assert.equal(view.family.namesShown, false);
    assert.equal(view.contacts, null);
    assert.equal(view.contactsHidden, 'not_connected');
    assert.equal(view.relation.canSend, true);
    assert.equal(JSON.stringify(view).includes('Kamala'), false);
    assert.equal(ok(await amal.client.get(`/api/v1/discover/${chathu.profileId}`)).caste, 'Govigama');
    rejected(await amal.client.get(`/api/v1/discover/${amal.profileId}`), 404, 'NOT_FOUND');
  });
});

describe('requests: plan, limits and the 7-day wait (sections 1, 2, 4)', () => {
  test('sending needs a plan and a published profile, never to your own', async () => {
    rejected(await send(chathu, amal), 403, 'PLAN_REQUIRED');
    rejected(await send(amal, amal), 404, 'PROFILE_UNAVAILABLE');
    const draft = ok(await dilan.post('/api/v1/profiles', { management: 'self', adultDeclared: true }), 201);
    rejected(
      await dilan.post(`/api/v1/profiles/${draft.id}/interests`, { receiverProfileId: bina.profileId, confirmSharing: true }),
      409,
      'PROFILE_NOT_PUBLISHED',
    );
    rejected(await amal.client.post(`/api/v1/profiles/${amal.profileId}/interests`, { receiverProfileId: esha.profileId }), 400, 'VALIDATION');
  });

  test('a retry with the same key sends and charges once; a withdrawal starts the 7-day wait', async () => {
    const first = ok(await send(amal, esha, 'retry-key-amal-esha'), 201);
    const again = ok(await send(amal, esha, 'retry-key-amal-esha'), 201);
    assert.equal(again.id, first.id);
    const charges = await t.db.select().from(quotaLedger).where(eq(quotaLedger.interestId, first.id));
    assert.equal(charges.length, 1);
    rejected(await send(amal, esha), 409, 'REQUEST_PENDING');

    // Parallel sends to the same person: exactly one goes through.
    const parallel = await Promise.all([send(amal, chathu), send(amal, chathu), send(amal, chathu)]);
    assert.equal(parallel.filter((r) => r.status === 201).length, 1);
    assert.ok(parallel.filter((r) => r.status !== 201).every((r) => r.body.code === 'REQUEST_PENDING'));

    ok(await amal.client.post(`/api/v1/interests/${first.id}/withdraw`), 204);
    rejected(await amal.client.post(`/api/v1/interests/${first.id}/withdraw`), 409, 'REQUEST_CLOSED');
    rejected(await send(amal, esha), 409, 'REQUEST_COOLDOWN');
    const sent = ok(await amal.client.get(`/api/v1/profiles/${amal.profileId}/interests?box=sent`)).interests;
    const withdrawn = sent.find((i: { id: string }) => i.id === first.id);
    assert.equal(withdrawn.status, 'withdrawn');
    assert.ok(new Date(withdrawn.cooldownUntil).getTime() > Date.now() + 6 * 86_400_000);

    await t.db.update(interest).set({ respondedAt: days(-8) }).where(eq(interest.id, first.id));
    const resent = ok(await send(amal, esha), 201);
    ok(await amal.client.post(`/api/v1/interests/${resent.id}/withdraw`), 204);
    await t.db.update(interest).set({ respondedAt: days(-8) }).where(eq(interest.id, resent.id));
  });

  test('Starter allows 5 a day and 30 a month; Premium 30 a day', async () => {
    await grant(amal.profileId, 'starter_1m', days(-10)); // a fresh plan: its 30-day block began 10 days ago
    const usage = ok(await amal.client.get(`/api/v1/profiles/${amal.profileId}/plan`));
    assert.equal(usage.active, true);
    assert.equal(usage.daily.cap, 5);
    assert.equal(usage.monthly.cap, 30);

    const today = usage.daily.used as number;
    const cleanToday = await pastSends(amal, fara, 5 - today, new Date());
    rejected(await send(amal, fara), 429, 'DAILY_LIMIT');
    await cleanToday();

    const thisMonth = ok(await amal.client.get(`/api/v1/profiles/${amal.profileId}/plan`)).monthly.used as number;
    const cleanMonth = await pastSends(amal, fara, 30 - thisMonth, days(-2));
    rejected(await send(amal, fara), 429, 'MONTHLY_LIMIT');
    await cleanMonth();

    const premium = ok(await bina.client.get(`/api/v1/profiles/${bina.profileId}/plan`));
    assert.equal(premium.daily.cap, 30);
    assert.equal(premium.monthly, null, 'Premium has no monthly cap');
    const cleanPremium = await pastSends(bina, fara, 30 - (premium.daily.used as number), new Date());
    rejected(await send(bina, fara), 429, 'DAILY_LIMIT');
    await cleanPremium();
  });
});

describe('the sender blur and connections (sections 1, 3, 4)', () => {
  test('without a plan the receiver gets previews only; the sender never leaves the server', async () => {
    const received = ok(await chathu.client.get(`/api/v1/profiles/${chathu.profileId}/interests?box=received`));
    assert.equal(received.identified, false);
    assert.equal(received.previews.length, 1);
    assert.equal(received.previews[0].senderAge, 33);
    const text = JSON.stringify(received);
    assert.equal(text.includes(amal.profileId) || text.includes('Amal'), false, 'no sender identity in the response');
    rejected(await chathu.client.post(`/api/v1/interests/${received.previews[0].id}/accept`), 403, 'PLAN_REQUIRED');
    const relation = ok(await chathu.client.get(`/api/v1/discover/${amal.profileId}?as=${chathu.profileId}`)).relation;
    assert.deepEqual([relation.reason, relation.latestInterest, relation.cooldownUntil], ['no_plan', null, null]);

    await grant(chathu.profileId);
    const identified = ok(await chathu.client.get(`/api/v1/profiles/${chathu.profileId}/interests?box=received`));
    assert.equal(identified.identified, true);
    assert.equal(identified.interests[0].sender.id, amal.profileId);
    ok(await chathu.client.post(`/api/v1/interests/${identified.interests[0].id}/decline`), 204);
    rejected(await send(amal, chathu), 409, 'REQUEST_COOLDOWN');
  });

  test('accepting opens one connection, logs what each side shares, and shows contacts and names', async () => {
    const sent = ok(await send(amal, bina), 201);
    const [one, two] = await Promise.all([
      bina.client.post(`/api/v1/interests/${sent.id}/accept`),
      bina.client.post(`/api/v1/interests/${sent.id}/accept`),
    ]);
    assert.equal(ok(one!).connectionId, ok(two!).connectionId, 'a double click opens one connection');
    const connectionId = one!.body.connectionId as string;
    const logged = await t.db.select().from(disclosureEvent).where(eq(disclosureEvent.connectionId, connectionId));
    const fromBina = logged.find((e) => e.subjectProfileId === bina.profileId)!;
    assert.deepEqual(fromBina.fieldCategories, ['candidate_phone', 'family_names']);
    assert.equal(fromBina.action, 'shared');
    assert.equal(logged.length, 2);

    const view = ok(await amal.client.get(`/api/v1/discover/${bina.profileId}?as=${amal.profileId}`));
    assert.deepEqual([view.family.motherName, view.family.fatherName, view.family.namesShown], ['Kamala', 'Sunil', true]);
    assert.equal(view.contacts.length, 1);
    assert.equal(view.relation.reason, 'connected');
    const list = ok(await bina.client.get(`/api/v1/profiles/${bina.profileId}/connections`)).connections;
    assert.equal(list[0].profileId, amal.profileId);
    assert.equal(list[0].contacts.length, 1);

    // A contact added while connected is logged too.
    ok(await bina.client.post(`/api/v1/profiles/${bina.profileId}/contacts`, { person: 'candidate', kind: 'email', value: 'bina@private.test' }), 201);
    const later = await t.db
      .select()
      .from(disclosureEvent)
      .where(and(eq(disclosureEvent.connectionId, connectionId), eq(disclosureEvent.subjectProfileId, bina.profileId)));
    assert.ok(later.some((e) => e.action === 'shared' && e.fieldCategories.join() === 'candidate_email'));
  });

  test('when one plan ends only that member loses the details (owner decision 29 Oct 2026, O03)', async () => {
    await t.db.insert(entitlementEvent).values({ profileId: amal.profileId, kind: 'forfeit', reason: 'test: plan ended' });
    const amalView = ok(await amal.client.get(`/api/v1/discover/${bina.profileId}?as=${amal.profileId}`));
    assert.deepEqual([amalView.contacts, amalView.contactsHidden], [null, 'plan_needed']);
    const binaView = ok(await bina.client.get(`/api/v1/discover/${amal.profileId}?as=${bina.profileId}`));
    assert.equal(binaView.contacts.length, 1, 'the paying member still sees them');
    await grant(amal.profileId);
  });

  test('ending a connection hides details both ways, is logged, and starts the 7-day wait', async () => {
    const [active] = ok(await amal.client.get(`/api/v1/profiles/${amal.profileId}/connections`)).connections;
    ok(await amal.client.post(`/api/v1/connections/${active.id}/end`), 204);
    ok(await amal.client.post(`/api/v1/connections/${active.id}/end`), 204);
    const view = ok(await amal.client.get(`/api/v1/discover/${bina.profileId}?as=${amal.profileId}`));
    assert.deepEqual([view.contacts, view.contactsHidden, view.family.motherName], [null, 'not_connected', null]);
    const revoked = await t.db
      .select()
      .from(disclosureEvent)
      .where(and(eq(disclosureEvent.connectionId, active.id), eq(disclosureEvent.action, 'revoked')));
    assert.equal(revoked.length, 2);
    const [ended] = await t.db.select().from(connection).where(eq(connection.id, active.id));
    assert.equal(ended?.endReason, 'withdrawn');
    rejected(await send(amal, bina), 409, 'REQUEST_COOLDOWN');
    rejected(await send(bina, amal), 409, 'REQUEST_COOLDOWN');
  });
});

describe('blocks (sections 4, 7)', () => {
  test('a block hides both profiles from each other and closes open requests; lifting it restores no connection', async () => {
    await grant(esha.profileId);
    const pending = ok(await send(bina, esha), 201);
    const blocked = ok(await esha.client.post(`/api/v1/profiles/${esha.profileId}/blocks`, { profileId: bina.profileId }), 201);
    const [closed] = await t.db.select().from(interest).where(eq(interest.id, pending.id));
    assert.equal(closed?.status, 'declined');
    assert.equal((await discoverIds(bina)).includes(esha.profileId), false);
    assert.equal((await discoverIds(esha)).includes(bina.profileId), false);
    rejected(await bina.client.get(`/api/v1/discover/${esha.profileId}`), 404, 'NOT_FOUND');
    rejected(await send(bina, esha), 404, 'PROFILE_UNAVAILABLE');
    const list = ok(await esha.client.get(`/api/v1/profiles/${esha.profileId}/blocks`)).blocks;
    assert.deepEqual(list.map((b: { displayName: string }) => b.displayName), ['Bina']);
    ok(await esha.client.delete(`/api/v1/profiles/${esha.profileId}/blocks/${blocked.id}`), 204);
    assert.equal((await discoverIds(bina)).includes(esha.profileId), true);
    rejected(await send(bina, esha), 409, 'REQUEST_COOLDOWN');
  });
});

describe('photos (sections 6, 7)', () => {
  const upload = (who: Member, file = image) => {
    const form = new FormData();
    form.set('file', new File([new Uint8Array(file)], 'photo.jpg', { type: 'image/jpeg' }));
    return who.client.post(`/api/v1/profiles/${who.profileId}/photos`, form);
  };

  test('the original stays private and members get a separate blurred copy; at most 5', async () => {
    const mine = ok(await upload(fara), 201).photos;
    assert.equal(mine.length, 1);
    assert.equal(mine[0].isCover, true);
    assert.match(mine[0].url, /\/private\/photos\//, 'the owner sees the original');
    assert.equal([...t.files.keys()].filter((k) => k.startsWith('private/photos/') || k.startsWith('derived/photos/')).length, 2);
    const seen = ok(await amal.client.get(`/api/v1/discover/${fara.profileId}`));
    assert.match(seen.photos[0].url, /\/derived\/photos\/.+-blurred/);
    assert.equal(seen.photos[0].blurred, true);
    assert.equal(seen.cover.blurred, true);

    ok(await fara.client.post(`/api/v1/profiles/${fara.profileId}/cover-visibility`, { coverPublic: true }));
    const cover = ok(await amal.client.get(`/api/v1/discover/${fara.profileId}`)).cover;
    assert.match(cover.url, /\/private\/photos\//, 'a cover shown publicly is the original');

    for (let i = 0; i < 4; i += 1) ok(await upload(fara), 201);
    rejected(await upload(fara), 409, 'PHOTO_LIMIT');
    rejected(await upload(amal, Buffer.from('not an image at all')), 400, 'INVALID_PHOTO');

    const five = ok(await fara.client.get(`/api/v1/profiles/${fara.profileId}/photos`)).photos;
    const second = five.find((p: { slot: number }) => p.slot === 1);
    ok(await fara.client.post(`/api/v1/profiles/${fara.profileId}/photos/${second.id}/cover`));
    ok(await fara.client.delete(`/api/v1/profiles/${fara.profileId}/photos/${second.id}`), 204);
    const after = ok(await fara.client.get(`/api/v1/profiles/${fara.profileId}/photos`)).photos;
    assert.equal(after.length, 4);
    assert.equal(after.filter((p: { isCover: boolean }) => p.isCover).length, 1, 'the next photo becomes the cover');
    rejected(await amal.client.delete(`/api/v1/profiles/${fara.profileId}/photos/${after[0].id}`), 404, 'NOT_FOUND');
  });
});

describe('reports and moderation (section 7)', () => {
  const report = (who: Member, target: Member, category: string, photoId?: string) =>
    who.client.post('/api/v1/reports', { reporterProfileId: who.profileId, profileId: target.profileId, category, ...(photoId ? { photoId } : {}) });

  test('a serious category hides the profile at once; staff dismissing it restores it', async () => {
    ok(await report(amal, chathu, 'scam'), 201);
    assert.equal((await discoverIds(esha)).includes(chathu.profileId), false);
    const queue = ok(await reviewer.get('/api/v1/staff/reports')).reports;
    const item = queue.find((r: { target: { profileId: string } }) => r.target.profileId === chathu.profileId);
    assert.deepEqual([item.target.hidden, item.reporter.displayName], [true, 'Amal']);
    const decided = ok(await reviewer.post(`/api/v1/staff/reports/${item.id}/decision`, { decision: 'dismissed', note: 'No sign of a scam.' }));
    assert.equal(decided.contentHidden, false);
    assert.equal((await discoverIds(esha)).includes(chathu.profileId), true);
    const [audited] = await t.db.select().from(auditEvent).where(eq(auditEvent.entityId, item.id));
    assert.equal(audited?.action, 'report.dismissed');
    rejected(await reviewer.post(`/api/v1/staff/reports/${item.id}/decision`, { decision: 'upheld' }), 409, 'ALREADY_DECIDED');
    rejected(await amal.client.get('/api/v1/staff/reports'), 403, 'FORBIDDEN');
  });

  test('other categories need 3 different verified members; an upheld report keeps it hidden', async () => {
    ok(await report(amal, fara, 'harassment'), 201);
    ok(await report(bina, fara, 'harassment'), 201);
    rejected(await report(amal, fara, 'harassment'), 409, 'REPORT_EXISTS');
    assert.equal((await discoverIds(esha)).includes(fara.profileId), true, 'two reports are not enough');
    ok(await report(chathu, fara, 'other'), 201);
    assert.equal((await discoverIds(esha)).includes(fara.profileId), false, 'three different verified members hide it');

    const queue = ok(await reviewer.get('/api/v1/staff/reports')).reports.filter(
      (r: { target: { profileId: string } }) => r.target.profileId === fara.profileId,
    );
    ok(await reviewer.post(`/api/v1/staff/reports/${queue[0].id}/decision`, { decision: 'upheld' }));
    for (const item of queue.slice(1)) ok(await reviewer.post(`/api/v1/staff/reports/${item.id}/decision`, { decision: 'dismissed' }));
    assert.equal((await discoverIds(esha)).includes(fara.profileId), false, 'upheld stays hidden');

    const draft = ok(await dilan.get('/api/v1/profiles')).profiles[0];
    rejected(
      await dilan.post('/api/v1/reports', { reporterProfileId: draft.id, profileId: amal.profileId, category: 'other' }),
      403,
      'VERIFICATION_REQUIRED',
    );
  });

  test('a photo report hides only that photo', async () => {
    const photoId = ok(await bina.client.post(`/api/v1/profiles/${bina.profileId}/photos`, (() => {
      const form = new FormData();
      form.set('file', new File([new Uint8Array(image)], 'photo.jpg', { type: 'image/jpeg' }));
      return form;
    })()), 201).photos[0].id;
    ok(await report(esha, bina, 'explicit_content', photoId), 201);
    const seen = ok(await esha.client.get(`/api/v1/discover/${bina.profileId}`));
    assert.equal(seen.photos.length, 0);
    assert.equal(seen.id, bina.profileId, 'the profile itself stays visible');
    const own = ok(await bina.client.get(`/api/v1/profiles/${bina.profileId}/photos`)).photos;
    assert.equal(own[0].hidden, true, 'the owner sees it marked hidden');
  });
});

describe('engaged or married (section 7)', () => {
  test('needs the forfeit confirmation; hides the profile, ends the plan and closes open requests', async () => {
    const pending = ok(await send(amal, esha), 201);
    rejected(await esha.client.post(`/api/v1/profiles/${esha.profileId}/engaged`, {}), 400, 'VALIDATION');
    const done = ok(await esha.client.post(`/api/v1/profiles/${esha.profileId}/engaged`, { confirmForfeit: true }));
    assert.equal(done.status, 'engaged_or_married');
    assert.equal(ok(await esha.client.get(`/api/v1/profiles/${esha.profileId}/plan`)).active, false);
    const [closed] = await t.db.select().from(interest).where(eq(interest.id, pending.id));
    assert.equal(closed?.status, 'declined');
    assert.equal((await discoverIds(amal)).includes(esha.profileId), false);
    const [forfeit] = await t.db
      .select()
      .from(entitlementEvent)
      .where(and(eq(entitlementEvent.profileId, esha.profileId), eq(entitlementEvent.kind, 'forfeit')));
    assert.equal(forfeit?.reason, 'engaged_or_married');
  });
});
