/**
 * The shortlist (owner, 6 Nov 2026, audit N03) through the real HTTP API: saving and removing published profiles,
 * who may save and see a shortlist, the limit of 20 without a plan and none with one, and saved profiles that are no
 * longer shown.
 */
import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { eq, inArray } from 'drizzle-orm';
import { SHORTLIST_LIMIT } from '@fh/shared';
import { entitlementEvent } from '../src/db/schema/billing.ts';
import { shortlist } from '../src/db/schema/connections.ts';
import { profile } from '../src/db/schema/members.ts';
import { addStaff } from '../src/lib/staff-accounts.ts';
import { Client, createTestApp, totp, type Res } from './harness.ts';

let t: Awaited<ReturnType<typeof createTestApp>>;
let reviewer: Client;

const PASSWORD = 'correct horse battery staple';
const ok = (res: Res, status = 200) => {
  assert.equal(res.status, status, JSON.stringify(res.body));
  return res.body;
};
const rejected = (res: Res, status: number, code: string) => {
  assert.equal(res.status, status, JSON.stringify(res.body));
  assert.equal(res.body.code, code);
};
let phoneSeq = 300;
const nextPhone = () => `+9477123${String(phoneSeq++).padStart(4, '0')}`;

type Member = { client: Client; profileId: string };

async function verifiedClient(email: string, name: string): Promise<Client> {
  const client = await t.client().signIn(email, name);
  ok(await client.verifyPhone(nextPhone()));
  const submitted = ok(await client.sendDocument(), 201);
  ok(await reviewer.post(`/api/v1/staff/verification/${submitted.id}/decision`, { decision: 'approved' }));
  return client;
}

async function publishedMember(email: string, name: string, gender: 'man' | 'woman'): Promise<Member> {
  const client = await verifiedClient(email, name);
  const created = ok(await client.post('/api/v1/profiles', { management: 'self', adultDeclared: true }), 201);
  ok(
    await client.patch(`/api/v1/profiles/${created.id}`, {
      version: created.version,
      displayName: name,
      gender,
      birthDate: '1994-04-04',
      heightCm: 165,
      countryCode: 'LK',
      city: 'Kandy',
      occupation: 'Teacher',
      education: 'BA',
      maritalStatus: 'never_married',
      bio: 'Warm, curious and close to family; hoping for an honest shared future.',
    }),
  );
  ok(await client.post(`/api/v1/profiles/${created.id}/contacts`, { person: 'candidate', kind: 'phone', value: nextPhone() }), 201);
  ok(await client.post(`/api/v1/profiles/${created.id}/publish`));
  return { client, profileId: created.id };
}

const list = async (who: Member) => ok(await who.client.get(`/api/v1/profiles/${who.profileId}/shortlist`));
const save = (who: Member, target: string) => who.client.post(`/api/v1/profiles/${who.profileId}/shortlist`, { profileId: target });
const unsave = (who: Member, target: string) => who.client.delete(`/api/v1/profiles/${who.profileId}/shortlist/${target}`);

let kasun: Member; // man, no plan
let nimmi: Member; // woman
let ruvi: Member; // woman
let dilan: Client; // signed in, never verified

before(async () => {
  t = await createTestApp();
  await addStaff(t.deps, { email: 'reviewer@favoritehearts.test', name: 'Reviewer', role: 'backup_reviewer', password: PASSWORD });
  reviewer = t.client();
  ok(await reviewer.post('/api/auth/sign-in/email', { email: 'reviewer@favoritehearts.test', password: PASSWORD }));
  const { totpURI } = ok(await reviewer.post('/api/auth/two-factor/enable', { password: PASSWORD }));
  ok(await reviewer.post('/api/auth/two-factor/verify-totp', { code: totp(totpURI) }));
  kasun = await publishedMember('kasun@example.test', 'Kasun', 'man');
  nimmi = await publishedMember('nimmi@example.test', 'Nimmi', 'woman');
  ruvi = await publishedMember('ruvi@example.test', 'Ruvi', 'woman');
  dilan = await t.client().signIn('dilan@example.test', 'Dilan');
});

describe('the shortlist (N03, owner 6 Nov 2026)', () => {
  test('a member saves a profile, sees it newest first with its card, and removes it', async () => {
    assert.deepEqual(await list(kasun), { items: [], limit: SHORTLIST_LIMIT });
    ok(await save(kasun, nimmi.profileId), 204);
    ok(await save(kasun, ruvi.profileId), 204);
    // Saving again changes nothing.
    ok(await save(kasun, nimmi.profileId), 204);
    const saved = await list(kasun);
    assert.deepEqual(
      saved.items.map((item: { profileId: string }) => item.profileId),
      [ruvi.profileId, nimmi.profileId],
    );
    assert.equal(saved.items[1].profile.displayName, 'Nimmi');
    assert.equal(saved.limit, SHORTLIST_LIMIT);
    ok(await unsave(kasun, ruvi.profileId), 204);
    // Removing what is not there is not an error.
    ok(await unsave(kasun, ruvi.profileId), 204);
    assert.deepEqual(
      (await list(kasun)).items.map((item: { profileId: string }) => item.profileId),
      [nimmi.profileId],
    );
  });

  test('only for published profiles the member may browse, never their own', async () => {
    rejected(await save(kasun, kasun.profileId), 404, 'PROFILE_UNAVAILABLE');
    const draft = ok(await dilan.post('/api/v1/profiles', { management: 'self', adultDeclared: true }), 201);
    rejected(await save(kasun, draft.id), 404, 'PROFILE_UNAVAILABLE');
    // An unverified member may not browse, so may not save either.
    rejected(await save({ client: dilan, profileId: draft.id }, nimmi.profileId), 404, 'PROFILE_UNAVAILABLE');
    rejected(await kasun.client.post(`/api/v1/profiles/${kasun.profileId}/shortlist`, { profileId: 'not-an-id' }), 400, 'VALIDATION');
  });

  test('a shortlist is private to the people who operate the profile', async () => {
    const res = await nimmi.client.get(`/api/v1/profiles/${kasun.profileId}/shortlist`);
    assert.equal(res.status, 404, JSON.stringify(res.body));
    const add = await nimmi.client.post(`/api/v1/profiles/${kasun.profileId}/shortlist`, { profileId: ruvi.profileId });
    assert.equal(add.status, 404, JSON.stringify(add.body));
    const remove = await nimmi.client.delete(`/api/v1/profiles/${kasun.profileId}/shortlist/${nimmi.profileId}`);
    assert.equal(remove.status, 404, JSON.stringify(remove.body));
    assert.equal((await list(kasun)).items.length, 1);
  });

  test(`up to ${SHORTLIST_LIMIT} without a plan; no limit with one`, async () => {
    // Fill the shortlist directly with draft profiles (the limit counts every saved row).
    const fillers = await t.db
      .insert(profile)
      .values(Array.from({ length: SHORTLIST_LIMIT - 1 }, () => ({ management: 'self' as const })))
      .returning({ id: profile.id });
    await t.db.insert(shortlist).values(fillers.map((f) => ({ ownerProfileId: kasun.profileId, targetProfileId: f.id })));
    assert.equal((await list(kasun)).items.length, SHORTLIST_LIMIT);
    rejected(await save(kasun, ruvi.profileId), 409, 'SHORTLIST_FULL');
    // Already saved is still fine at the limit.
    ok(await save(kasun, nimmi.profileId), 204);

    await t.db.insert(entitlementEvent).values({
      profileId: kasun.profileId,
      kind: 'grant',
      planId: 'starter_1m',
      startsAt: new Date(Date.now() - 86_400_000),
      endsAt: new Date(Date.now() + 29 * 86_400_000),
    });
    ok(await save(kasun, ruvi.profileId), 204);
    const withPlan = await list(kasun);
    assert.equal(withPlan.limit, null);
    assert.equal(withPlan.items.length, SHORTLIST_LIMIT + 1);

    // Profiles no longer shown stay listed without a card, so they can be removed.
    const gone = withPlan.items.filter((item: { profile: unknown }) => item.profile === null);
    assert.equal(gone.length, SHORTLIST_LIMIT - 1);
    ok(await unsave(kasun, gone[0].profileId), 204);

    await t.db.delete(shortlist).where(inArray(shortlist.targetProfileId, fillers.map((f) => f.id)));
    await t.db.delete(profile).where(inArray(profile.id, fillers.map((f) => f.id)));
    await t.db.delete(entitlementEvent).where(eq(entitlementEvent.profileId, kasun.profileId));
  });

  test('a blocked profile stays saved but is no longer shown', async () => {
    ok(await save(kasun, nimmi.profileId), 204);
    ok(await nimmi.client.post(`/api/v1/profiles/${nimmi.profileId}/blocks`, { profileId: kasun.profileId }), 201);
    const item = (await list(kasun)).items.find((i: { profileId: string }) => i.profileId === nimmi.profileId);
    assert.equal(item.profile, null);
    rejected(await save(kasun, nimmi.profileId), 404, 'PROFILE_UNAVAILABLE');
    ok(await unsave(kasun, nimmi.profileId), 204);
  });
});
