/**
 * The admin site's sign-in and request pipeline (docs/ADMIN-PANEL-PLAN.md, phase admin-1): invitations, enrolment,
 * two-step sign-in, sessions, step-up, lock-outs, the request guard, Cloudflare Access, the route policy and alerts.
 */
import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { and, eq, sql } from 'drizzle-orm';
import { createStaffInvite } from '../src/admin/invites.ts';
import { session } from '../src/db/schema/auth.ts';
import { auditEvent, notificationOutbox } from '../src/db/schema/operations.ts';
import { sendNotifications } from '../src/jobs/notifications.ts';
import { AdminClient, ADMIN_ORIGIN, createTestApp, SECURITY_MAILBOX, totp, type Res } from './harness.ts';

type TestApp = Awaited<ReturnType<typeof createTestApp>>;
const PASSWORD = 'a long staff passphrase 2026';

const ok = (res: Res) => {
  assert.ok(res.status >= 200 && res.status < 300, `expected success, got ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
};
const rejected = (res: Res, status: number, code?: string) => {
  assert.equal(res.status, status, JSON.stringify(res.body));
  if (code) assert.equal(res.body?.code, code, JSON.stringify(res.body));
};
const tokenOf = (link: string) => link.split('#')[1]!;

/** Invited, password chosen, authenticator app set up: what a new staff member does from their link. */
async function enrol(t: TestApp, email: string, role: 'owner' | 'backup_reviewer') {
  const { link } = await createStaffInvite(t.deps, { email, name: `Staff ${role}`, role, invitedBy: null });
  const browser = t.adminClient();
  ok(await browser.post('/auth/staff-invite/accept', { token: tokenOf(link), password: PASSWORD }));
  const { totpURI, backupCodes } = ok(await browser.post('/auth/two-factor/enable', { password: PASSWORD }));
  ok(await browser.post('/auth/two-factor/verify-totp', { code: totp(totpURI) }));
  ok(await browser.post('/auth/sign-out', {}));
  return { totpURI: totpURI as string, backupCodes: backupCodes as string[] };
}

/** Password, then the authenticator code: a staff session. */
async function signIn(t: TestApp, email: string, totpURI: string) {
  const browser = t.adminClient();
  const first = ok(await browser.post('/auth/sign-in/email', { email, password: PASSWORD }));
  assert.equal(first.twoFactorRedirect, true, 'a password alone never opens a staff session');
  ok(await browser.post('/auth/two-factor/verify-totp', { code: totp(totpURI) }));
  return browser;
}

const actions = async (t: TestApp, action: string) => t.db.select().from(auditEvent).where(eq(auditEvent.action, action));
const alerts = async (t: TestApp) =>
  (await t.db.select().from(notificationOutbox).where(eq(notificationOutbox.template, 'security_alert'))).map((row) => (row.payload as { kind: string }).kind);
/** Moves a session's clocks back, as if time had passed. */
const age = (t: TestApp, browser: AdminClient, field: 'step_up_at' | 'last_active_at' | 'expires_at', minutes: number) =>
  t.db.execute(sql`update auth_session set ${sql.raw(field)} = now() - make_interval(mins => ${minutes})
                   where token = ${decodeURIComponent(browser.cookies.get('fha.session_token') ?? '').split('.')[0]}`);

describe('admin site: invitations and enrolment', () => {
  let t: TestApp;
  before(async () => {
    t = await createTestApp();
  });

  test('an invitation link works once, for its own person, and opens an enrolment-only session', async () => {
    const { link } = await createStaffInvite(t.deps, { email: 'Reviewer@FavoriteHearts.test', name: 'New Reviewer', role: 'backup_reviewer', invitedBy: null });
    assert.match(link, new RegExp(`^${ADMIN_ORIGIN}/invite#[A-Za-z0-9_-]{43}$`));
    const browser = t.adminClient();
    const preview = ok(await browser.post('/auth/staff-invite/preview', { token: tokenOf(link) }));
    assert.deepEqual([preview.email, preview.role], ['reviewer@favoritehearts.test', 'backup_reviewer']);

    rejected(await browser.post('/auth/staff-invite/accept', { token: tokenOf(link), password: 'too short' }), 400, 'VALIDATION');
    ok(await browser.post('/auth/staff-invite/accept', { token: tokenOf(link), password: PASSWORD }));
    rejected(await t.adminClient().post('/auth/staff-invite/accept', { token: tokenOf(link), password: PASSWORD }), 410, 'INVITE_INVALID');

    const me = ok(await browser.get('/me'));
    assert.equal(me.enrolment, true);
    assert.deepEqual(me.permissions, []);
    rejected(await browser.get('/staff/verification'), 403, 'ENROLMENT_INCOMPLETE');
    rejected(await browser.get('/auth/list-sessions'), 403, 'ENROLMENT_INCOMPLETE');
    // A passkey only after the authenticator app, so every account has a fallback.
    rejected(await browser.get('/auth/passkey/generate-register-options'), 403, 'TOTP_FIRST');
    assert.equal((await actions(t, 'staff.invited')).length, 1);
    assert.equal((await actions(t, 'staff.invite_accepted')).length, 1);
  });

  test('a new invitation replaces the old link; an expired one stops working', async () => {
    const first = await createStaffInvite(t.deps, { email: 'twice@favoritehearts.test', name: 'Twice', role: 'backup_reviewer', invitedBy: null });
    const second = await createStaffInvite(t.deps, { email: 'twice@favoritehearts.test', name: 'Twice', role: 'backup_reviewer', invitedBy: null });
    rejected(await t.adminClient().post('/auth/staff-invite/preview', { token: tokenOf(first.link) }), 410, 'INVITE_INVALID');
    ok(await t.adminClient().post('/auth/staff-invite/preview', { token: tokenOf(second.link) }));
    await t.db.execute(sql`update staff_invite set expires_at = now() - interval '1 minute' where email = 'twice@favoritehearts.test'`);
    rejected(await t.adminClient().post('/auth/staff-invite/preview', { token: tokenOf(second.link) }), 410, 'INVITE_INVALID');
  });

  test('a member account’s email cannot become a staff account', async () => {
    await t.client().signIn('member@favoritehearts.test', 'A Member');
    await assert.rejects(
      createStaffInvite(t.deps, { email: 'member@favoritehearts.test', name: 'X', role: 'owner', invitedBy: null }),
      /member account already uses this email/,
    );
  });

  test('after setting up two-step login the person signs in again with it; a password alone opens nothing', async () => {
    const { totpURI } = await enrol(t, 'owner@favoritehearts.test', 'owner');
    const browser = await signIn(t, 'owner@favoritehearts.test', totpURI);
    const me = ok(await browser.get('/me'));
    assert.deepEqual([me.role, me.enrolment, me.factor, me.stepUpFresh], ['owner', false, 'totp', true]);
    assert.ok(me.permissions.includes('payments.manage'));
    ok(await browser.get('/staff/verification'));
    ok(await browser.get('/owner/payments'));
    assert.equal((await actions(t, 'staff.signed_in')).length, 1);
    assert.ok((await alerts(t)).includes('two_factor_changed'), 'turning two-step login on emails the owner');
    assert.ok((await alerts(t)).includes('new_device_sign_in'), 'the first sign-in from a device emails the owner');
  });

  test('“trust this device” is refused, and non-staff get the wrong-password answer', async () => {
    rejected(await t.adminClient().post('/auth/sign-in/email', { email: 'owner@favoritehearts.test', password: PASSWORD, trustDevice: true }), 403, 'TRUST_DEVICE_OFF');
    rejected(await t.adminClient().post('/auth/sign-in/email', { email: 'member@favoritehearts.test', password: 'a quiet evening by the lake' }), 401, 'INVALID_EMAIL_OR_PASSWORD');
    rejected(await t.adminClient().post('/auth/sign-in/email', { email: 'nobody@favoritehearts.test', password: PASSWORD }), 401, 'INVALID_EMAIL_OR_PASSWORD');
    // Invited but two-step login not set up yet: also no sign-in.
    const { link } = await createStaffInvite(t.deps, { email: 'halfway@favoritehearts.test', name: 'Halfway', role: 'backup_reviewer', invitedBy: null });
    ok(await t.adminClient().post('/auth/staff-invite/accept', { token: tokenOf(link), password: PASSWORD }));
    rejected(await t.adminClient().post('/auth/sign-in/email', { email: 'halfway@favoritehearts.test', password: PASSWORD }), 401, 'INVALID_EMAIL_OR_PASSWORD');
  });
});

describe('admin site: sessions, step-up and lock-out', () => {
  let t: TestApp;
  let owner: { totpURI: string; backupCodes: string[] };
  let reviewer: { totpURI: string; backupCodes: string[] };
  before(async () => {
    t = await createTestApp();
    owner = await enrol(t, 'owner@favoritehearts.test', 'owner');
    reviewer = await enrol(t, 'reviewer@favoritehearts.test', 'backup_reviewer');
  });

  test('the member app and the admin site never accept each other’s sessions', async () => {
    const admin = await signIn(t, 'owner@favoritehearts.test', owner.totpURI);
    const member = await t.client().signIn('someone@favoritehearts.test', 'Someone');
    // The member's browser has no admin cookie; the admin cookie, sent to the member API, is unknown there.
    rejected(await t.adminClient().get('/me'), 401, 'UNAUTHENTICATED');
    const adminCookie = admin.cookies.get('fha.session_token')!;
    const stolen = t.client();
    (stolen as unknown as { cookies: Map<string, string> }).cookies.set('fh.session_token', adminCookie);
    const asMember = await stolen.get('/api/v1/me');
    rejected(asMember, 401);
    assert.equal((await member.get('/api/v1/me')).status, 200);
  });

  test('the backup reviewer is refused every owner route, and unknown routes are refused for everyone', async () => {
    const browser = await signIn(t, 'reviewer@favoritehearts.test', reviewer.totpURI);
    ok(await browser.get('/staff/verification'));
    ok(await browser.get('/staff/reports'));
    for (const path of ['/owner/payments', '/owner/plans', '/owner/payment-settings', '/owner/operations']) {
      rejected(await browser.get(path), 403, 'FORBIDDEN');
    }
    rejected(await browser.put('/owner/operations/signups_paused', { enabled: true, reason: 'x' }), 403, 'FORBIDDEN');
    const ownerBrowser = await signIn(t, 'owner@favoritehearts.test', owner.totpURI);
    rejected(await ownerBrowser.get('/owner/something-new'), 403, 'NO_POLICY');
  });

  test('risky actions need a passkey or code from the last 5 minutes', async () => {
    const browser = await signIn(t, 'owner@favoritehearts.test', owner.totpURI);
    ok(await browser.put('/owner/operations/signups_paused', { enabled: false, reason: 'Just signed in' }));
    await age(t, browser, 'step_up_at', 6);
    rejected(await browser.put('/owner/operations/signups_paused', { enabled: false, reason: 'Later' }), 403, 'STEP_UP_REQUIRED');
    rejected(await browser.post('/auth/two-factor/generate-backup-codes', { password: PASSWORD }), 403, 'STEP_UP_REQUIRED');
    // A fresh code (not the one just used: authenticator codes are single use per 30 seconds).
    ok(await browser.post('/auth/two-factor/verify-totp', { code: totp(owner.totpURI, Date.now() + 30_000) }));
    ok(await browser.put('/owner/operations/signups_paused', { enabled: false, reason: 'After step-up' }));
    assert.equal((await actions(t, 'staff.step_up')).length, 1);
    // Reading is not risky: no step-up needed.
    await age(t, browser, 'step_up_at', 6);
    ok(await browser.get('/owner/operations'));
  });

  test('30 idle minutes or 8 hours end the session', async () => {
    const idle = await signIn(t, 'owner@favoritehearts.test', owner.totpURI);
    await age(t, idle, 'last_active_at', 31);
    rejected(await idle.get('/me'), 401, 'SESSION_IDLE');
    rejected(await idle.get('/me'), 401, 'UNAUTHENTICATED');

    const old = await signIn(t, 'owner@favoritehearts.test', owner.totpURI);
    const [row] = await t.db.select({ createdAt: session.createdAt, expiresAt: session.expiresAt }).from(session).where(eq(session.realm, 'admin')).orderBy(sql`created_at desc`).limit(1);
    assert.equal(Math.round((row!.expiresAt.getTime() - row!.createdAt.getTime()) / 3_600_000), 8);
    await age(t, old, 'expires_at', 1);
    rejected(await old.get('/me'), 401, 'UNAUTHENTICATED');
  });

  test('5 wrong codes lock the account for 15 minutes and email the owner', async () => {
    await enrol(t, 'locked@favoritehearts.test', 'backup_reviewer');
    const browser = t.adminClient();
    ok(await browser.post('/auth/sign-in/email', { email: 'locked@favoritehearts.test', password: PASSWORD }));
    for (let i = 0; i < 5; i += 1) {
      const res = await browser.post('/auth/two-factor/verify-totp', { code: '000000' });
      assert.ok(res.status === 401 || res.status === 429 || res.status === 400, JSON.stringify(res.body));
    }
    const [row] = rowsOf(await t.db.execute(sql`select t.locked_until from auth_two_factor t join auth_user u on u.id = t.user_id where u.email = 'locked@favoritehearts.test'`));
    assert.ok(row?.locked_until, 'the account is locked');
    assert.ok((await actions(t, 'staff.code_failed')).length >= 5);
    assert.ok((await alerts(t)).includes('account_locked'));
  });

  test('backup codes sign in once each', async () => {
    const browser = t.adminClient();
    ok(await browser.post('/auth/sign-in/email', { email: 'reviewer@favoritehearts.test', password: PASSWORD }));
    ok(await browser.post('/auth/two-factor/verify-backup-code', { code: reviewer.backupCodes[0] }));
    assert.equal(ok(await browser.get('/me')).factor, 'backup_code');
    const again = t.adminClient();
    ok(await again.post('/auth/sign-in/email', { email: 'reviewer@favoritehearts.test', password: PASSWORD }));
    assert.equal((await again.post('/auth/two-factor/verify-backup-code', { code: reviewer.backupCodes[0] })).status, 401);
  });

  test('revoking a staff member ends their admin access at once', async () => {
    const { totpURI } = await enrol(t, 'leaving@favoritehearts.test', 'backup_reviewer');
    const browser = await signIn(t, 'leaving@favoritehearts.test', totpURI);
    ok(await browser.get('/me'));
    await t.db.execute(sql`update staff_member set revoked_at = now() where user_id = (select id from auth_user where email = 'leaving@favoritehearts.test')`);
    rejected(await browser.get('/me'), 401, 'UNAUTHENTICATED');
  });
});

describe('admin site: the request guard and Cloudflare Access', () => {
  let t: TestApp;
  let owner: { totpURI: string };
  before(async () => {
    t = await createTestApp({
      accessVerifier: async (token) => (token === 'signed-for-owner' ? { email: 'owner@favoritehearts.test' } : token === 'signed-for-someone-else' ? { email: 'else@favoritehearts.test' } : null),
    });
    const withAccess = { 'cf-access-jwt-assertion': 'signed-for-owner' };
    const { link } = await createStaffInvite(t.deps, { email: 'owner@favoritehearts.test', name: 'Owner', role: 'owner', invitedBy: null });
    const browser = t.adminClient();
    browser.headers = withAccess;
    ok(await browser.post('/auth/staff-invite/accept', { token: tokenOf(link), password: PASSWORD }));
    const { totpURI } = ok(await browser.post('/auth/two-factor/enable', { password: PASSWORD }));
    ok(await browser.post('/auth/two-factor/verify-totp', { code: totp(totpURI) }));
    owner = { totpURI };
  });

  const signedIn = async (access: string) => {
    const browser = t.adminClient();
    browser.headers = { 'cf-access-jwt-assertion': access };
    ok(await browser.post('/auth/sign-in/email', { email: 'owner@favoritehearts.test', password: PASSWORD }));
    ok(await browser.post('/auth/two-factor/verify-totp', { code: totp(owner.totpURI, Date.now() + 30_000) }));
    return browser;
  };

  test('without Cloudflare Access’s signed token nothing answers, sign-in included', async () => {
    rejected(await t.adminClient().post('/auth/sign-in/email', { email: 'owner@favoritehearts.test', password: PASSWORD }), 403, 'ACCESS_REQUIRED');
    const forged = t.adminClient();
    forged.headers = { 'cf-access-jwt-assertion': 'forged' };
    rejected(await forged.get('/me'), 403, 'ACCESS_REQUIRED');
  });

  test('the person Access let in must be the one signed in', async () => {
    const browser = await signedIn('signed-for-owner');
    ok(await browser.get('/me'));
    browser.headers = { 'cf-access-jwt-assertion': 'signed-for-someone-else' };
    rejected(await browser.get('/me'), 403, 'ACCESS_MISMATCH');
  });

  test('requests must come from the admin site itself: its header, its origin, JSON only', async () => {
    const browser = await signedIn('signed-for-owner');
    rejected(await browser.request('GET', '/me', undefined, { 'x-fh-admin': '' }), 403, 'ADMIN_HEADER_REQUIRED');
    rejected(await browser.request('GET', '/me', undefined, { 'sec-fetch-site': 'cross-site' }), 403, 'CROSS_SITE');
    rejected(await browser.request('PUT', '/owner/operations/signups_paused', { enabled: false, reason: 'x' }, { origin: 'http://localhost:5173' }), 403, 'BAD_ORIGIN');
    rejected(await browser.request('PUT', '/owner/operations/signups_paused', 'enabled=false', { 'content-type': 'text/plain' }), 415, 'JSON_ONLY');
    // The member app's CORS never extends to admin paths.
    const preflight = await t.app.request('http://localhost:8787/api/admin/me', {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'GET', 'access-control-request-headers': 'x-fh-admin' },
    });
    assert.equal(preflight.headers.get('access-control-allow-origin'), null);
  });
});

describe('admin site: audit trail and alerts', () => {
  let t: TestApp;
  let owner: { totpURI: string };
  before(async () => {
    t = await createTestApp();
    owner = await enrol(t, 'owner@favoritehearts.test', 'owner');
  });

  test('admin actions carry the session, a shortened address, the browser and the request id', async () => {
    const browser = await signIn(t, 'owner@favoritehearts.test', owner.totpURI);
    ok(await browser.put('/owner/operations/document_submissions_paused', { enabled: true, reason: 'Queue is long' }));
    const [row] = await t.db.select().from(auditEvent).where(and(eq(auditEvent.entityType, 'operations_flag'), eq(auditEvent.entityId, 'document_submissions_paused')));
    assert.ok(row?.sessionId);
    assert.equal(row?.ip, '198.51.100.0/24');
    assert.equal(row?.userAgent, 'TestBrowser/1.0');
    assert.match(row?.correlationId ?? '', /^[0-9a-f-]{36}$/);
    assert.equal((await actions(t, 'payment.queue_viewed')).length, 0);
    ok(await browser.get('/owner/payments'));
    assert.equal((await actions(t, 'payment.queue_viewed')).length, 1, 'opening the payment list is audited');
  });

  test('changing payment details emails the owner; alerts go out from the outbox to the security mailbox', async () => {
    const browser = await signIn(t, 'owner@favoritehearts.test', owner.totpURI);
    ok(await browser.put('/owner/payment-settings/wise', { enabled: false, instructions: 'Wise: details to follow' }));
    assert.ok((await alerts(t)).includes('payment_details_changed'));
    const sent: { to: string; subject: string; text: string }[] = [];
    const result = await sendNotifications({
      db: t.db,
      config: t.deps.config,
      messenger: { smsEnabled: false, sendSms: async () => undefined, sendEmail: async (m) => void sent.push(m) },
    });
    assert.ok(result.sent >= 1);
    const mail = sent.find((m) => m.subject.includes('payment details'));
    assert.equal(mail?.to, SECURITY_MAILBOX);
    assert.doesNotMatch(mail?.text ?? '', /\b\d{6}\b/, 'no code in an alert');
  });

  test('every audit row is chained; an edit is detected; deleting is refused', async () => {
    const check = async () => rowsOf(await t.db.execute(sql`select app.audit_chain_check() as r`))[0]!.r as Record<string, unknown>;
    const fine = await check();
    assert.equal(fine.ok, true, JSON.stringify(fine));
    const appendOnly = (err: unknown) => /append-only/.test(String((err as { cause?: Error }).cause?.message ?? err));
    await assert.rejects(t.db.execute(sql`delete from audit_event where action = 'staff.signed_in'`), appendOnly);
    await assert.rejects(t.db.execute(sql`truncate audit_event`), appendOnly);
    await t.db.execute(sql`alter table audit_event disable trigger audit_event_append_only`);
    await t.db.execute(sql`update audit_event set reason = 'rewritten' where seq = (select min(seq) from audit_event where action = 'staff.signed_in')`);
    await t.db.execute(sql`alter table audit_event enable trigger audit_event_append_only`);
    const broken = await check();
    assert.equal(broken.ok, false);
    assert.equal((broken.edited as unknown[]).length, 1);
  });
});

function rowsOf(result: unknown): any[] {
  return (result as { rows: any[] }).rows;
}
