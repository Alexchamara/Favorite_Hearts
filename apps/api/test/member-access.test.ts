/**
 * Member sign-up and log-in with a password (owner decision, 11 Nov 2026), through the real HTTP API: the address is
 * confirmed once with a code (email: code and one-step link; phone: SMS code) before the account exists; log-in is the
 * address and password; five wrong passwords lock the address; a forgotten password is reset by an email link; the
 * password rules (8+ characters, not common, not personal) hold at sign-up, reset and change.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { eq } from 'drizzle-orm';
import { LOGIN_FAILURE_LIMIT } from '@fh/shared';
import { user } from '../src/db/schema/auth.ts';
import { operationsFlag } from '../src/db/schema/operations.ts';
import { SIGN_UP_CODE_TRIES } from '../src/lib/member-access.ts';
import { createTestApp, latestCode, latestInvitationToken, staffBrowser, STAFF_TEST_PASSWORD, type Outbox, type Res } from './harness.ts';

const PASSWORD = 'tea in kandy at seven';
const ok = (res: Res, status = 200) => {
  assert.equal(res.status, status, JSON.stringify(res.body));
  return res.body;
};
const rejected = (res: Res, status: number, code: string) => {
  assert.equal(res.status, status, JSON.stringify(res.body));
  assert.equal(res.body?.code, code, JSON.stringify(res.body));
  return res.body;
};
const signUp = (email: string, extra: Record<string, unknown> = {}) => ({ name: 'Nadee Perera', email, password: PASSWORD, consent: true, ...extra });
const resetToken = (outbox: Outbox, to: string) => {
  const token = outbox.emails.filter((m) => m.to === to).at(-1)?.text.match(/reset-password#token=([^\s&]+)/)?.[1];
  assert.ok(token, `no reset link was sent to ${to}`);
  return decodeURIComponent(token);
};

describe('member sign-up with a password', () => {
  test('email: nothing exists until the code comes back; the email carries the code and a one-step link', async () => {
    const t = await createTestApp();
    const client = t.client();
    assert.deepEqual(ok(await client.post('/api/auth/member/sign-up', signUp(' Nadee@Example.test '))), { sent: true, channel: 'email' });
    assert.equal((await t.db.select().from(user).where(eq(user.email, 'nadee@example.test'))).length, 0, 'no account before the code');
    const message = t.outbox.emails.at(-1)!;
    assert.equal(message.to, 'nadee@example.test');
    const code = latestCode(t.outbox, 'nadee@example.test');
    assert.match(message.text, new RegExp(`/app/confirm#email=nadee%40example\\.test&code=${code}`), 'the link carries the address and code after #');
    assert.ok(!message.text.includes(PASSWORD), 'the password is never sent');

    const created = ok(await client.post('/api/auth/member/sign-up/verify', { email: 'nadee@example.test', code }));
    assert.equal(created.user.name, 'Nadee Perera');
    const me = ok(await client.get('/api/v1/me'));
    assert.equal(me.email, 'nadee@example.test');
    assert.equal(me.emailVerified, true);
    rejected(await client.post('/api/auth/member/sign-up/verify', { email: 'nadee@example.test', code }), 400, 'CODE_EXPIRED');

    // Log out, then log in with the password: no code.
    ok(await client.post('/api/auth/sign-out'));
    assert.equal((await client.get('/api/v1/me')).status, 401);
    const before = t.outbox.emails.length;
    ok(await client.post('/api/auth/sign-in/email', { email: 'nadee@example.test', password: PASSWORD }));
    assert.equal(t.outbox.emails.length, before, 'logging in sends nothing');
    assert.equal(ok(await client.get('/api/v1/me')).name, 'Nadee Perera');
    rejected(await t.client().post('/api/auth/sign-in/email', { email: 'nadee@example.test', password: 'tea in kandy at eight' }), 401, 'INVALID_EMAIL_OR_PASSWORD');
  });

  test('phone: an SMS code, then log in with the number and password', async () => {
    const t = await createTestApp();
    const client = t.client();
    assert.deepEqual(ok(await client.post('/api/auth/member/sign-up', { name: 'Kasun', phoneNumber: '077 123 4567', password: PASSWORD, consent: true })), {
      sent: true,
      channel: 'sms',
    });
    ok(await client.post('/api/auth/member/sign-up/verify', { phoneNumber: '+94771234567', code: latestCode(t.outbox, '+94771234567') }));
    const [row] = await t.db.select().from(user).where(eq(user.phoneNumber, '+94771234567'));
    assert.equal(row?.phoneNumberVerified, true);
    assert.match(row!.email, /\.invalid$/, 'phone-only accounts get an address that cannot receive mail');
    ok(await client.post('/api/auth/sign-out'));
    ok(await client.post('/api/auth/sign-in/phone-number', { phoneNumber: '+94771234567', password: PASSWORD }));
    assert.equal(ok(await client.get('/api/v1/me')).name, 'Kasun');
  });

  test('the password rules, the consent tick and one address are checked before any code is sent', async () => {
    const t = await createTestApp();
    const client = t.client();
    const field = (res: Res, name: string) => rejected(res, 400, 'VALIDATION').fields[name];
    assert.match(field(await client.post('/api/auth/member/sign-up', signUp('a@example.test', { password: 'short' })), 'password'), /8 characters/);
    assert.match(field(await client.post('/api/auth/member/sign-up', signUp('a@example.test', { password: 'Password2024!' })), 'password'), /too common/);
    assert.match(field(await client.post('/api/auth/member/sign-up', signUp('a@example.test', { password: 'qwertyuiop' })), 'password'), /too common/);
    assert.match(field(await client.post('/api/auth/member/sign-up', signUp('a@example.test', { password: 'nadeeperera99' })), 'password'), /name, email/);
    assert.match(field(await client.post('/api/auth/member/sign-up', signUp('kasun.lk@example.test', { password: 'kasun.lk-1990' })), 'password'), /name, email/);
    assert.ok(field(await client.post('/api/auth/member/sign-up', signUp('a@example.test', { consent: false })), 'consent'));
    assert.ok(field(await client.post('/api/auth/member/sign-up', signUp('a@example.test', { phoneNumber: '+94771234567' })), 'email'));
    assert.ok(field(await client.post('/api/auth/member/sign-up', { name: 'A', password: PASSWORD, consent: true }), 'email'));
    assert.equal(t.outbox.emails.length + t.outbox.sms.length, 0, 'no code was sent');
  });

  test('an address that already has an account: the same answer on screen, and a note to its owner instead of a code', async () => {
    const t = await createTestApp();
    const first = t.client();
    ok(await first.post('/api/auth/member/sign-up', signUp('taken@example.test')));
    ok(await first.post('/api/auth/member/sign-up/verify', { email: 'taken@example.test', code: latestCode(t.outbox, 'taken@example.test') }));
    const stranger = t.client();
    assert.deepEqual(ok(await stranger.post('/api/auth/member/sign-up', signUp('taken@example.test', { name: 'Someone else' }))), { sent: true, channel: 'email' });
    const note = t.outbox.emails.at(-1)!;
    assert.match(note.subject, /tried to sign up/);
    assert.ok(!/\b\d{6}\b/.test(note.text), 'the note carries no code');
    rejected(await stranger.post('/api/auth/member/sign-up/verify', { email: 'taken@example.test', code: '123456' }), 400, 'CODE_EXPIRED');
    assert.equal((await t.db.select().from(user).where(eq(user.email, 'taken@example.test')))[0]?.name, 'Nadee Perera', 'the account is unchanged');
  });

  test(`a code allows ${SIGN_UP_CODE_TRIES} wrong tries, then a new one is needed; a new sign-up replaces the old code`, async () => {
    const t = await createTestApp();
    const client = t.client();
    ok(await client.post('/api/auth/member/sign-up', signUp('tries@example.test')));
    const code = latestCode(t.outbox, 'tries@example.test');
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < SIGN_UP_CODE_TRIES; i += 1) rejected(await client.post('/api/auth/member/sign-up/verify', { email: 'tries@example.test', code: wrong }), 400, 'INVALID_CODE');
    rejected(await client.post('/api/auth/member/sign-up/verify', { email: 'tries@example.test', code }), 429, 'TOO_MANY_ATTEMPTS');
    rejected(await client.post('/api/auth/member/sign-up/verify', { email: 'tries@example.test', code }), 400, 'CODE_EXPIRED');
    assert.equal((await t.db.select().from(user).where(eq(user.email, 'tries@example.test'))).length, 0);
    ok(await client.post('/api/auth/member/sign-up', signUp('tries@example.test')));
    const fresh = latestCode(t.outbox, 'tries@example.test');
    if (fresh !== code) rejected(await client.post('/api/auth/member/sign-up/verify', { email: 'tries@example.test', code }), 400, 'INVALID_CODE');
    ok(await client.post('/api/auth/member/sign-up/verify', { email: 'tries@example.test', code: fresh }));
  });

  test('paused sign-ups send no code', async () => {
    const t = await createTestApp();
    await t.db.update(operationsFlag).set({ enabled: true }).where(eq(operationsFlag.key, 'signups_paused'));
    rejected(await t.client().post('/api/auth/member/sign-up', signUp('paused@example.test')), 403, 'SIGNUPS_PAUSED');
    assert.equal(t.outbox.emails.length, 0);
  });

  test('once a Turnstile secret is set, sign-up and both log-ins need a token', async () => {
    const t = await createTestApp({ turnstile: { verify: async (token) => token === 'valid-token' } });
    const client = t.client();
    rejected(await client.post('/api/auth/member/sign-up', signUp('bot@example.test')), 403, 'CAPTCHA_REQUIRED');
    rejected(await client.post('/api/auth/sign-in/phone-number', { phoneNumber: '+94771234567', password: PASSWORD }), 403, 'CAPTCHA_REQUIRED');
    rejected(await client.post('/api/auth/request-password-reset', { email: 'bot@example.test' }), 403, 'CAPTCHA_REQUIRED');
    client.headers['x-captcha-response'] = 'valid-token';
    ok(await client.post('/api/auth/member/sign-up', signUp('bot@example.test')));
  });
});

describe('log-in lockout and password reset', () => {
  async function member(t: Awaited<ReturnType<typeof createTestApp>>, email: string) {
    const client = t.client();
    ok(await client.post('/api/auth/member/sign-up', signUp(email)));
    ok(await client.post('/api/auth/member/sign-up/verify', { email, code: latestCode(t.outbox, email) }));
    return client;
  }

  test(`${LOGIN_FAILURE_LIMIT} wrong passwords lock the address, even for the right password; a reset unlocks it`, async () => {
    const t = await createTestApp();
    await member(t, 'locked@example.test');
    const attacker = t.client();
    for (let i = 0; i < LOGIN_FAILURE_LIMIT; i += 1) {
      rejected(await attacker.post('/api/auth/sign-in/email', { email: 'locked@example.test', password: `guess number ${i}` }), 401, 'INVALID_EMAIL_OR_PASSWORD');
    }
    const owner = t.client();
    const locked = rejected(await owner.post('/api/auth/sign-in/email', { email: 'Locked@Example.test', password: PASSWORD }), 429, 'LOGIN_LOCKED');
    assert.match(locked.message, /15 minutes/);
    // An address with no account locks the same way, so the lock tells nobody who is a member.
    for (let i = 0; i < LOGIN_FAILURE_LIMIT; i += 1) await attacker.post('/api/auth/sign-in/email', { email: 'nobody@example.test', password: `guess ${i}` });
    rejected(await attacker.post('/api/auth/sign-in/email', { email: 'nobody@example.test', password: PASSWORD }), 429, 'LOGIN_LOCKED');

    ok(await owner.post('/api/auth/request-password-reset', { email: 'locked@example.test' }));
    ok(await owner.post('/api/auth/reset-password', { token: resetToken(t.outbox, 'locked@example.test'), newPassword: 'a fresh walk in galle' }));
    ok(await owner.post('/api/auth/sign-in/email', { email: 'locked@example.test', password: 'a fresh walk in galle' }));
  });

  test('a right password clears earlier wrong ones', async () => {
    const t = await createTestApp();
    const client = await member(t, 'clears@example.test');
    ok(await client.post('/api/auth/sign-out'));
    for (let round = 0; round < 2; round += 1) {
      for (let i = 0; i < LOGIN_FAILURE_LIMIT - 1; i += 1) await client.post('/api/auth/sign-in/email', { email: 'clears@example.test', password: `nope ${i}` });
      ok(await client.post('/api/auth/sign-in/email', { email: 'clears@example.test', password: PASSWORD }));
      ok(await client.post('/api/auth/sign-out'));
    }
  });

  test('reset: a one-use link by email, the same rules for the new password, and every old session ends', async () => {
    const t = await createTestApp();
    const signedIn = await member(t, 'forgot@example.test');
    const visitor = t.client();
    ok(await visitor.post('/api/auth/request-password-reset', { email: 'forgot@example.test' }));
    const message = t.outbox.emails.at(-1)!;
    assert.match(message.subject, /Reset your Favorite Hearts password/);
    assert.match(message.text, /http:\/\/localhost:4321\/app\/reset-password#token=/);
    assert.match(message.text, /60 minutes/);
    const token = resetToken(t.outbox, 'forgot@example.test');
    const weak = rejected(await visitor.post('/api/auth/reset-password', { token, newPassword: 'password123' }), 400, 'VALIDATION');
    assert.match(weak.fields.newPassword, /too common/);
    rejected(await visitor.post('/api/auth/reset-password', { token, newPassword: 'nadee-perera-2026' }), 400, 'VALIDATION');
    ok(await visitor.post('/api/auth/reset-password', { token, newPassword: 'a quiet morning in ella' }));
    assert.notEqual((await visitor.post('/api/auth/reset-password', { token, newPassword: 'another quiet morning' })).status, 200, 'the link works once');
    assert.equal((await signedIn.get('/api/v1/me')).status, 401, 'old sessions end');
    rejected(await visitor.post('/api/auth/sign-in/email', { email: 'forgot@example.test', password: PASSWORD }), 401, 'INVALID_EMAIL_OR_PASSWORD');
    ok(await visitor.post('/api/auth/sign-in/email', { email: 'forgot@example.test', password: 'a quiet morning in ella' }));
  });

  test('no reset link for an unknown address, a phone-only account or staff; the answer is the same', async () => {
    const t = await createTestApp();
    const phone = t.client();
    ok(await phone.post('/api/auth/member/sign-up', { name: 'Kasun', phoneNumber: '+94771234567', password: PASSWORD, consent: true }));
    ok(await phone.post('/api/auth/member/sign-up/verify', { phoneNumber: '+94771234567', code: latestCode(t.outbox, '+94771234567') }));
    await staffBrowser(t, 'owner@example.test', 'owner', { enrol: false });
    const before = t.outbox.emails.length;
    const visitor = t.client();
    for (const email of ['nobody@example.test', '94771234567@phone.favoritehearts.invalid', 'owner@example.test']) {
      ok(await visitor.post('/api/auth/request-password-reset', { email }));
    }
    assert.equal(t.outbox.emails.length, before, 'no email went out');
  });

  test('changing the password while signed in meets the same rules; staff keep 12 characters, on the admin site only', async () => {
    const t = await createTestApp();
    const client = await member(t, 'change@example.test');
    const weak = rejected(await client.post('/api/auth/change-password', { currentPassword: PASSWORD, newPassword: 'iloveyou2' }), 400, 'VALIDATION');
    assert.match(weak.fields.newPassword, /too common/);
    ok(await client.post('/api/auth/change-password', { currentPassword: PASSWORD, newPassword: 'mangoes after the rain' }));
    const staff = await staffBrowser(t, 'staff@example.test', 'owner');
    const short = await staff.post('/auth/change-password', { currentPassword: STAFF_TEST_PASSWORD, newPassword: 'nine char' });
    assert.equal(short.status, 400, JSON.stringify(short.body));
    // The member sign-in gives a staff address the wrong-password answer.
    rejected(await t.client().post('/api/auth/sign-in/email', { email: 'staff@example.test', password: STAFF_TEST_PASSWORD }), 401, 'INVALID_EMAIL_OR_PASSWORD');
  });
});

describe('the invited candidate signs up with a password (no second code)', () => {
  async function invitation(t: Awaited<ReturnType<typeof createTestApp>>, candidateEmail: string) {
    const manager = await t.client().signIn(`manager-of-${candidateEmail}`, 'Sunil');
    const profile = ok(await manager.post('/api/v1/profiles', { management: 'manager', relationship: 'mother', authorityDeclared: true }), 201);
    ok(await manager.post(`/api/v1/profiles/${profile.id}/invitations`, { channel: 'email', contact: candidateEmail }), 201);
    const token = latestInvitationToken(t.outbox, candidateEmail);
    ok(await t.client().post('/api/v1/invitations/code', { token }));
    return { manager, profileId: profile.id as string, token, code: latestCode(t.outbox, candidateEmail) };
  }
  const account = (extra: Record<string, unknown> = {}) => ({ name: 'Nimali Perera', password: 'mangoes after the rain', consent: true, ...extra });

  test('the invitation code proves the address: one request makes the account, accepts and signs in', async () => {
    const t = await createTestApp();
    const { token, code, profileId } = await invitation(t, 'nimali@example.test');
    const before = t.outbox.emails.length;
    const candidate = t.client();
    const joined = ok(await candidate.post('/api/auth/member/sign-up/invitation', { token, code, ...account() }));
    assert.equal(joined.profileId, profileId);
    assert.equal(t.outbox.emails.length, before, 'no second code');
    const me = ok(await candidate.get('/api/v1/me'));
    assert.equal(me.email, 'nimali@example.test');
    assert.equal(me.emailVerified, true);
    assert.equal(me.memberAccount.status, 'active');
    assert.ok(ok(await candidate.get('/api/v1/profiles')).profiles.some((p: { id: string; me: { role: string } }) => p.id === profileId && p.me.role === 'candidate'));
    ok(await t.client().post('/api/auth/sign-in/email', { email: 'nimali@example.test', password: 'mangoes after the rain' }));
    rejected(await t.client().post('/api/auth/member/sign-up/invitation', { token, code, ...account() }), 404, 'INVITATION_INVALID');
  });

  test('a wrong code is counted against the invitation and leaves no account behind', async () => {
    const t = await createTestApp();
    const { token, code } = await invitation(t, 'wrong@example.test');
    const wrong = code === '000000' ? '111111' : '000000';
    rejected(await t.client().post('/api/auth/member/sign-up/invitation', { token, code: wrong, ...account() }), 400, 'WRONG_CODE');
    assert.equal((await t.db.select().from(user).where(eq(user.email, 'wrong@example.test'))).length, 0);
    ok(await t.client().post('/api/auth/member/sign-up/invitation', { token, code, ...account() }));
  });

  test('an invited address that already has an account logs in and accepts; weak passwords are refused first', async () => {
    const t = await createTestApp();
    const { token, code, profileId } = await invitation(t, 'existing@example.test');
    rejected(await t.client().post('/api/auth/member/sign-up/invitation', { token, code, ...account({ password: 'nimali1234' }) }), 400, 'VALIDATION');
    rejected(await t.client().post('/api/auth/member/sign-up/invitation', { token, code, ...account({ consent: false }) }), 400, 'VALIDATION');
    const existing = await t.client().signIn('existing@example.test', 'Nimali');
    rejected(await t.client().post('/api/auth/member/sign-up/invitation', { token, code, ...account() }), 409, 'ACCOUNT_EXISTS');
    assert.equal(ok(await existing.post('/api/v1/invitations/accept', { token, code })).profileId, profileId);
  });
});
