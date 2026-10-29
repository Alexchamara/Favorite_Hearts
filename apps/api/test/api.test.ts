/**
 * Stage 2 server flows through the real HTTP API, as separate signed-in people: accounts, profiles,
 * documents and staff review, invitations, the candidate's controls and the 90-day purge.
 * IDs (A01, I03, ...) are the acceptance scenarios in docs/Favorite-Hearts.pdf chapter 16.
 */
import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { eq, sql } from 'drizzle-orm';
import sharp from 'sharp';
import { operationsFlag } from '../src/db/schema/operations.ts';
import { verificationCase } from '../src/db/schema/trust.ts';
import { auditEvent } from '../src/db/schema/operations.ts';
import { entitlementEvent } from '../src/db/schema/billing.ts';
import { purgeDocuments } from '../src/jobs/purge-documents.ts';
import { addStaff, revokeStaff } from '../src/lib/staff-accounts.ts';
import { Client, createTestApp, latestCode, latestInvitationToken, totp, type Res } from './harness.ts';

let t: Awaited<ReturnType<typeof createTestApp>>;
let owner: Client;
let reviewer: Client;
let documentImage: Buffer;

const STAFF_PASSWORD = 'correct horse battery staple';

const ok = (res: Res, status = 200) => {
  assert.equal(res.status, status, JSON.stringify(res.body));
  return res.body;
};
const rejected = (res: Res, status: number, code: string) => {
  assert.equal(res.status, status, JSON.stringify(res.body));
  assert.equal(res.body.code, code);
};

const completeFields = {
  displayName: 'Ishara',
  gender: 'woman',
  birthDate: '1996-04-12',
  countryCode: 'lk',
  city: 'Colombo',
  occupation: 'Architect',
  education: 'B.Arch',
  heightCm: 163,
  maritalStatus: 'never_married',
  bio: 'Calm, curious and close to family. I like long walks and honest conversations.',
};

async function newProfile(client: Client, body: object = { management: 'self', adultDeclared: true }) {
  return ok(await client.post('/api/v1/profiles', body), 201);
}

async function completeProfile(client: Client, profile: { id: string; version: number }, phone: string) {
  const updated = ok(await client.patch(`/api/v1/profiles/${profile.id}`, { version: profile.version, ...completeFields }));
  ok(await client.post(`/api/v1/profiles/${profile.id}/contacts`, { person: 'candidate', kind: 'phone', value: phone }), 201);
  return updated;
}

function documentForm(documentType = 'nic', file: Blob = new Blob([new Uint8Array(documentImage)], { type: 'image/jpeg' })) {
  const form = new FormData();
  form.set('documentType', documentType);
  form.set('file', new File([file], 'document.jpg', { type: 'image/jpeg' }));
  return form;
}

/** Uploads a document for the signed-in member and has the backup reviewer approve it. */
async function verifyIdentity(client: Client) {
  const submitted = ok(await client.post('/api/v1/verification', documentForm()), 201);
  ok(await reviewer.post(`/api/v1/staff/verification/${submitted.id}/decision`, { decision: 'approved' }));
}

async function staffClient(email: string, role: 'owner' | 'backup_reviewer') {
  await addStaff(t.deps, { email, name: role === 'owner' ? 'Owner' : 'Reviewer', role, password: STAFF_PASSWORD });
  const client = t.client();
  ok(await client.post('/api/auth/sign-in/email', { email, password: STAFF_PASSWORD }));
  return client;
}

async function enableTwoFactor(client: Client) {
  const { totpURI } = ok(await client.post('/api/auth/two-factor/enable', { password: STAFF_PASSWORD }));
  ok(await client.post('/api/auth/two-factor/verify-totp', { code: totp(totpURI) }));
}

before(async () => {
  t = await createTestApp();
  documentImage = await sharp({ create: { width: 900, height: 560, channels: 3, background: '#d8d2c4' } }).jpeg().toBuffer();
  owner = await staffClient('owner@favoritehearts.test', 'owner');
  reviewer = await staffClient('reviewer@favoritehearts.test', 'backup_reviewer');
  await enableTwoFactor(owner);
  await enableTwoFactor(reviewer);
});

describe('accounts (A01, A02, S06)', () => {
  test('sign up and sign in with an email code; wrong and reused codes fail', async () => {
    const browser = t.client();
    const email = 'asha@example.test';
    ok(await browser.post('/api/auth/email-otp/send-verification-otp', { email, type: 'sign-in' }));
    const code = latestCode(t.outbox, email);
    const wrong = await browser.post('/api/auth/sign-in/email-otp', { email, otp: code === '000000' ? '111111' : '000000' });
    assert.notEqual(wrong.status, 200);
    ok(await browser.post('/api/auth/sign-in/email-otp', { email, otp: code }));
    const me = ok(await browser.get('/api/v1/me'));
    assert.equal(me.email, email);
    assert.equal(me.memberAccount, null, 'the member account is created on first use');
    assert.deepEqual(ok(await browser.get('/api/v1/profiles')).profiles, []);
    assert.equal(ok(await browser.get('/api/v1/me')).memberAccount.status, 'active');
    const reused = await t.client().post('/api/auth/sign-in/email-otp', { email, otp: code });
    assert.notEqual(reused.status, 200, 'a used code cannot sign in again');
  });

  test('anonymous visitors get nothing', async () => {
    const anonymous = t.client();
    rejected(await anonymous.get('/api/v1/me'), 401, 'UNAUTHENTICATED');
    rejected(await anonymous.get('/api/v1/profiles'), 401, 'UNAUTHENTICATED');
    rejected(await anonymous.post('/api/v1/profiles', { management: 'self', adultDeclared: true }), 401, 'UNAUTHENTICATED');
  });

  test('the owner can pause new sign-ups; existing members keep working (S06)', async () => {
    const existing = await t.client().signIn('existing@example.test');
    ok(await existing.get('/api/v1/profiles'));
    await t.db.update(operationsFlag).set({ enabled: true }).where(eq(operationsFlag.key, 'signups_paused'));
    try {
      const newcomer = t.client();
      ok(await newcomer.post('/api/auth/email-otp/send-verification-otp', { email: 'late@example.test', type: 'sign-in' }));
      const blocked = await newcomer.post('/api/auth/sign-in/email-otp', { email: 'late@example.test', otp: latestCode(t.outbox, 'late@example.test') });
      assert.equal(blocked.status, 403);
      ok(await existing.get('/api/v1/profiles'));
    } finally {
      await t.db.update(operationsFlag).set({ enabled: false }).where(eq(operationsFlag.key, 'signups_paused'));
    }
  });
});

describe('profiles (P01, A04, A05)', () => {
  test('one own profile per person; fields are validated on the server (P01)', async () => {
    const member = await t.client().signIn('ruvini@example.test');
    const profile = await newProfile(member);
    assert.equal(profile.status, 'draft');
    assert.equal(profile.me.role, 'candidate');
    rejected(await member.post('/api/v1/profiles', { management: 'self', adultDeclared: true }), 409, 'PROFILE_EXISTS');

    const tooYoung = await member.patch(`/api/v1/profiles/${profile.id}`, { version: profile.version, birthDate: '2015-01-01' });
    rejected(tooYoung, 400, 'VALIDATION');
    assert.ok(tooYoung.body.fields.birthDate);
    const longBio = await member.patch(`/api/v1/profiles/${profile.id}`, { version: profile.version, bio: 'x'.repeat(601) });
    assert.ok(longBio.body.fields.bio);
    rejected(await member.patch(`/api/v1/profiles/${profile.id}`, { version: profile.version, heightCm: 300 }), 400, 'VALIDATION');
    rejected(await member.patch(`/api/v1/profiles/${profile.id}`, { version: profile.version, caste: { value: 'x' } }), 400, 'VALIDATION');
    rejected(await member.post(`/api/v1/profiles/${profile.id}/contacts`, { person: 'candidate', kind: 'phone', value: '12' }), 400, 'VALIDATION');
  });

  test('a stale edit is refused instead of overwriting (A05)', async () => {
    const member = await t.client().signIn('dilani@example.test');
    const profile = await newProfile(member);
    ok(await member.patch(`/api/v1/profiles/${profile.id}`, { version: profile.version, city: 'Kandy' }));
    rejected(await member.patch(`/api/v1/profiles/${profile.id}`, { version: profile.version, city: 'Galle' }), 409, 'VERSION_CONFLICT');
  });

  test('a manager runs up to 3 profiles (A04)', async () => {
    const manager = await t.client().signIn('malini@example.test', 'Malini');
    for (let i = 0; i < 3; i += 1) await newProfile(manager, { management: 'manager', relationship: 'mother', authorityDeclared: true });
    rejected(await manager.post('/api/v1/profiles', { management: 'manager', relationship: 'mother', authorityDeclared: true }), 409, 'MANAGER_LIMIT');
    assert.equal(ok(await manager.get('/api/v1/profiles')).profiles.length, 3);
  });
});

describe('documents, staff review and publishing (P02, P05, P09, S04)', () => {
  test('staff powers need two-step login, checked by the server (S04)', async () => {
    const newStaff = await staffClient('second@favoritehearts.test', 'backup_reviewer');
    rejected(await newStaff.get('/api/v1/staff/verification'), 403, 'TWO_FACTOR_REQUIRED');
    const member = await t.client().signIn('curious@example.test');
    rejected(await member.get('/api/v1/staff/verification'), 403, 'FORBIDDEN');
    ok(await reviewer.get('/api/v1/staff/verification'));
    rejected(await reviewer.get('/api/v1/profiles'), 403, 'STAFF_ACCOUNT');
  });

  test('a fake image is refused and nothing is stored (P09)', async () => {
    const member = await t.client().signIn('sameera@example.test');
    const before = t.files.size;
    const fake = documentForm('passport', new Blob(['%PDF-1.7 not really a photo'], { type: 'image/jpeg' }));
    rejected(await member.post('/api/v1/verification', fake), 400, 'INVALID_DOCUMENT');
    rejected(await member.post('/api/v1/verification', documentForm('national_id')), 400, 'VALIDATION');
    assert.equal(t.files.size, before);
  });

  test('publishing needs a complete profile, a verified phone and an approved document (P02, P05)', async () => {
    const member = await t.client().signIn('nadeesha@example.test');
    let profile = await newProfile(member);
    const incomplete = await member.post(`/api/v1/profiles/${profile.id}/publish`);
    rejected(incomplete, 400, 'PROFILE_INCOMPLETE');
    assert.ok(incomplete.body.fields.contactPhone && incomplete.body.fields.bio);

    profile = await completeProfile(member, profile, '+94771234501');
    const unverified = await member.post(`/api/v1/profiles/${profile.id}/publish`);
    rejected(unverified, 403, 'VERIFICATION_REQUIRED');
    assert.match(unverified.body.message, /phone number verified by SMS code and an approved identity document/);

    ok(await member.verifyPhone('+94771234501'));
    const first = ok(await member.post('/api/v1/verification', documentForm('passport')), 201);
    assert.equal(first.status, 'pending');
    rejected(await member.post('/api/v1/verification', documentForm()), 409, 'VERIFICATION_PENDING');
    rejected(await member.post(`/api/v1/profiles/${profile.id}/publish`), 403, 'VERIFICATION_REQUIRED');

    const queue = ok(await reviewer.get('/api/v1/staff/verification')).cases;
    const item = queue.find((c: { id: string }) => c.id === first.id);
    assert.equal(item.subject.phoneVerified, true);
    assert.equal(JSON.stringify(item).includes('documents/'), false, 'the queue never carries file keys');
    rejected(await reviewer.post(`/api/v1/staff/verification/${first.id}/decision`, { decision: 'rejected' }), 400, 'VALIDATION');
    ok(await reviewer.post(`/api/v1/staff/verification/${first.id}/decision`, { decision: 'rejected', reason: 'The photo is blurred.' }));
    rejected(await owner.post(`/api/v1/staff/verification/${first.id}/decision`, { decision: 'approved' }), 409, 'ALREADY_DECIDED');
    const mine = ok(await member.get('/api/v1/verification')).cases;
    assert.equal(mine[0].decisionReason, 'The photo is blurred.');

    const second = ok(await member.post('/api/v1/verification', documentForm('driving_licence')), 201);
    ok(await reviewer.post(`/api/v1/staff/verification/${second.id}/decision`, { decision: 'approved' }));
    const published = ok(await member.post(`/api/v1/profiles/${profile.id}/publish`));
    assert.equal(published.status, 'published');
    assert.ok(published.firstPublishedAt);
    assert.equal(published.badges.candidateIdentityVerified, true);
    assert.equal(published.contacts[0].notVerifiedByCandidate, false, 'the label is for guardian-managed profiles only (section 4)');
    assert.equal(ok(await member.post(`/api/v1/profiles/${profile.id}/pause`)).status, 'paused');
  });

  test('viewing a document is audited and gives a short-lived link', async () => {
    const member = await t.client().signIn('kasun@example.test');
    const submitted = ok(await member.post('/api/v1/verification', documentForm()), 201);
    const view = ok(await owner.get(`/api/v1/staff/verification/${submitted.id}/document`));
    assert.match(view.url, /^https:\/\/storage\.test\/private\/documents\//);
    assert.equal(view.expiresInSeconds, 120);
    const [logged] = await t.db.select().from(auditEvent).where(eq(auditEvent.entityId, submitted.id));
    assert.equal(logged?.action, 'verification.document_viewed');
  });
});

describe('invitations and the candidate (I01–I09)', () => {
  let manager: Client;
  let candidate: Client;
  let profileId: string;
  let token: string;
  const candidateEmail = 'nimali@example.test';

  test('a manager prepares a profile and invites the candidate; own contact is refused (I01)', async () => {
    manager = await t.client().signIn('sunil@example.test', 'Sunil');
    await manager.verifyPhone('+94771234560');
    await verifyIdentity(manager);
    const profile = await newProfile(manager, { management: 'manager', relationship: 'father', authorityDeclared: true });
    profileId = profile.id;
    await completeProfile(manager, profile, '+94771234561');
    const published = ok(await manager.post(`/api/v1/profiles/${profileId}/publish`));
    assert.deepEqual(published.badges, { managerVerified: true, candidateConfirmed: false, candidateIdentityVerified: false });
    const candidatePhone = published.contacts.find((c: { person: string }) => c.person === 'candidate');
    assert.equal(candidatePhone.notVerifiedByCandidate, true);

    rejected(await manager.post(`/api/v1/profiles/${profileId}/invitations`, { channel: 'email', contact: '  SUNIL@Example.test ' }), 400, 'INVITE_CONTACT_IS_MANAGER');
    ok(await manager.post(`/api/v1/profiles/${profileId}/invitations`, { channel: 'email', contact: candidateEmail }), 201);
    const firstToken = latestInvitationToken(t.outbox, candidateEmail);
    ok(await manager.post(`/api/v1/profiles/${profileId}/invitations`, { channel: 'email', contact: candidateEmail }), 201);
    token = latestInvitationToken(t.outbox, candidateEmail);
    rejected(await t.client().post('/api/v1/invitations/preview', { token: firstToken }), 404, 'INVITATION_INVALID');
    ok(await manager.post(`/api/v1/profiles/${profileId}/invitations`, { channel: 'email', contact: candidateEmail }), 201);
    token = latestInvitationToken(t.outbox, candidateEmail);
    rejected(await manager.post(`/api/v1/profiles/${profileId}/invitations`, { channel: 'email', contact: candidateEmail }), 429, 'INVITATION_LIMIT');
  });

  test('the link shows only who invited whom; the code goes to the nominated address (I02, I04)', async () => {
    const anonymous = t.client();
    const preview = ok(await anonymous.post('/api/v1/invitations/preview', { token }));
    assert.deepEqual(Object.keys(preview).sort(), ['candidateName', 'channel', 'contactHint', 'expiresAt', 'managerName', 'relationship']);
    assert.equal(preview.managerName, 'Sunil');
    assert.equal(preview.contactHint, 'n•••@example.test');
    rejected(await anonymous.post('/api/v1/invitations/preview', { token: 'x'.repeat(43) }), 404, 'INVITATION_INVALID');
    ok(await anonymous.post('/api/v1/invitations/code', { token }));
    assert.ok(latestCode(t.outbox, candidateEmail));
  });

  test('the manager cannot accept; a wrong code is counted; the candidate accepts once (I03, I05)', async () => {
    const code = latestCode(t.outbox, candidateEmail);
    rejected(await manager.post('/api/v1/invitations/accept', { token, code }), 409, 'IS_MANAGER');
    candidate = await t.client().signIn(candidateEmail, 'Nimali');
    rejected(await candidate.post('/api/v1/invitations/accept', { token, code: code === '000000' ? '111111' : '000000' }), 400, 'WRONG_CODE');
    const accepted = ok(await candidate.post('/api/v1/invitations/accept', { token, code }));
    assert.equal(accepted.profileId, profileId);
    rejected(await candidate.post('/api/v1/invitations/accept', { token, code }), 404, 'INVITATION_INVALID');

    const view = ok(await candidate.get(`/api/v1/profiles/${profileId}`));
    assert.equal(view.me.role, 'candidate');
    assert.equal(view.me.canEdit, false, 'the candidate edits only after taking over');
    assert.deepEqual(view.badges, { managerVerified: true, candidateConfirmed: true, candidateIdentityVerified: false });
    assert.ok(view.contacts.some((c: { kind: string; verified: boolean }) => c.kind === 'email' && c.verified));
    assert.equal(ok(await manager.get(`/api/v1/profiles/${profileId}`)).candidate.joined, true);
    rejected(await manager.post(`/api/v1/profiles/${profileId}/invitations`, { channel: 'email', contact: 'other@example.test' }), 409, 'CANDIDATE_JOINED');
  });

  test('the candidate controls the manager’s permissions and sharing (I07)', async () => {
    const managerView = ok(await manager.get(`/api/v1/profiles/${profileId}`));
    rejected(await manager.patch(`/api/v1/profiles/${profileId}/manager`, { canEdit: true }), 403, 'CANDIDATE_ONLY');
    ok(await candidate.patch(`/api/v1/profiles/${profileId}/manager`, { canEdit: false }));
    rejected(await manager.patch(`/api/v1/profiles/${profileId}`, { version: managerView.version, city: 'Galle' }), 403, 'CANNOT_EDIT');
    ok(await candidate.patch(`/api/v1/profiles/${profileId}/manager`, { canEdit: true }));
    const contact = managerView.contacts[0];
    rejected(await manager.patch(`/api/v1/profiles/${profileId}/contacts/${contact.id}`, { shareWithConnections: false }), 403, 'FORBIDDEN');
    assert.equal(ok(await candidate.patch(`/api/v1/profiles/${profileId}/contacts/${contact.id}`, { shareWithConnections: false })).shareWithConnections, false);
  });

  test('withdrawing consent takes the profile down; the manager cannot override (I06, I09)', async () => {
    assert.equal(ok(await candidate.post(`/api/v1/profiles/${profileId}/withdraw-consent`)).status, 'paused');
    rejected(await manager.post(`/api/v1/profiles/${profileId}/publish`), 409, 'CANDIDATE_OBJECTED');
    const restored = ok(await candidate.post(`/api/v1/profiles/${profileId}/restore-consent`));
    assert.equal(restored.status, 'paused', 'restoring consent does not republish');
    assert.equal(ok(await manager.post(`/api/v1/profiles/${profileId}/publish`)).status, 'published');
  });

  test('takeover: the manager loses access at once and the plan carries over (I08)', async () => {
    await t.db.insert(entitlementEvent).values({
      profileId,
      kind: 'grant',
      planId: 'premium_3m',
      startsAt: new Date(Date.now() - 86_400_000),
      endsAt: new Date(Date.now() + 80 * 86_400_000),
      dailyRequestCap: 30,
    });
    const taken = ok(await candidate.post(`/api/v1/profiles/${profileId}/take-over`));
    assert.equal(taken.management, 'self');
    assert.equal(taken.status, 'paused', 'paused until the candidate’s own identity is verified');
    assert.equal(taken.me.canEdit, true);
    rejected(await manager.get(`/api/v1/profiles/${profileId}`), 404, 'NOT_FOUND');
    assert.equal(ok(await manager.get('/api/v1/profiles')).profiles.length, 0);
    const [plan] = (await t.db.execute(sql`select app.has_active_entitlement(${profileId}) as active`)).rows as { active: boolean }[];
    assert.equal(plan?.active, true);
  });

  test('declining with the code needs no account and takes the profile down (I06)', async () => {
    const parent = await t.client().signIn('kamala@example.test', 'Kamala');
    const profile = await newProfile(parent, { management: 'manager', relationship: 'mother', authorityDeclared: true });
    ok(await parent.post(`/api/v1/profiles/${profile.id}/invitations`, { channel: 'email', contact: 'tharu@example.test' }), 201);
    const declineToken = latestInvitationToken(t.outbox, 'tharu@example.test');
    const stranger = t.client();
    ok(await stranger.post('/api/v1/invitations/code', { token: declineToken }));
    ok(await stranger.post('/api/v1/invitations/decline', { token: declineToken, code: latestCode(t.outbox, 'tharu@example.test') }));
    const after = ok(await parent.get(`/api/v1/profiles/${profile.id}`));
    assert.ok(after.candidate.objectedAt);
    rejected(await parent.post(`/api/v1/profiles/${profile.id}/invitations`, { channel: 'email', contact: 'tharu@example.test' }), 409, 'CANDIDATE_OBJECTED');
  });
});

describe('document retention (X01, S05)', () => {
  test('files are deleted 90 days after the decision; a failed delete is retried', async () => {
    const member = await t.client().signIn('purge@example.test');
    const submitted = ok(await member.post('/api/v1/verification', documentForm()), 201);
    ok(await reviewer.post(`/api/v1/staff/verification/${submitted.id}/decision`, { decision: 'approved' }));
    const [decided] = await t.db.select().from(verificationCase).where(eq(verificationCase.id, submitted.id));
    assert.ok(decided?.purgeAfter && decided.purgeAfter.getTime() - decided.reviewedAt!.getTime() === 90 * 86_400_000);
    const fileKey = `private/${decided!.evidenceKey}`;
    assert.ok(t.files.has(fileKey));

    await t.db.update(verificationCase).set({ purgeAfter: sql`now() - interval '1 minute'` }).where(eq(verificationCase.id, submitted.id));
    t.storage.failDeletes = true;
    const failedRun = await purgeDocuments(t.deps);
    assert.equal(failedRun.failed, failedRun.due);
    assert.ok(t.files.has(fileKey), 'still there after a failed run');
    t.storage.failDeletes = false;
    const retried = await purgeDocuments(t.deps);
    assert.equal(retried.failed, 0);
    assert.ok(!t.files.has(fileKey));
    const [after] = await t.db.select().from(verificationCase).where(eq(verificationCase.id, submitted.id));
    assert.equal(after?.evidenceKey, null);
    assert.ok(after?.purgedAt);
    assert.equal(after?.status, 'approved', 'the decision itself is kept');
    rejected(await owner.get(`/api/v1/staff/verification/${submitted.id}/document`), 410, 'DOCUMENT_DELETED');
  });

  test('revoking a staff member ends their access at once (S05)', async () => {
    const leaving = await staffClient('leaving@favoritehearts.test', 'backup_reviewer');
    await enableTwoFactor(leaving);
    ok(await leaving.get('/api/v1/staff/verification'));
    await revokeStaff(t.deps, 'leaving@favoritehearts.test');
    rejected(await leaving.get('/api/v1/staff/verification'), 401, 'UNAUTHENTICATED');
  });
});
