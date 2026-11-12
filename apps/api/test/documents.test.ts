/**
 * Identity documents in several photos (owner, 5 Nov 2026), through the real HTTP API: the sides each document needs,
 * drafts that are replaced and previewed only by their owner, the selfie switch, the phone link (QR code), and that no
 * identity photo is ever left behind: sent, replaced, removed, expired, purged after 90 days or deleted with the account.
 */
import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { eq, sql } from 'drizzle-orm';
import sharp from 'sharp';
import { memberAccount } from '../src/db/schema/members.ts';
import { auditEvent } from '../src/db/schema/operations.ts';
import { verificationCase, verificationDraft, verificationUploadLink } from '../src/db/schema/trust.ts';
import { purgeDocuments } from '../src/jobs/purge-documents.ts';
import { drainStorageDeletions, purgeExpiredDrafts } from '../src/lib/storage-cleanup.ts';
import { Client, createTestApp, photoForm, staffBrowser, testDocumentPhoto, type AdminClient, type Res } from './harness.ts';

type App = Awaited<ReturnType<typeof createTestApp>>;
let t: App;
let owner: AdminClient;
let reviewer: AdminClient;
let photo: Buffer;

const ok = (res: Res, status = 200) => {
  assert.equal(res.status, status, JSON.stringify(res.body));
  return res.body;
};
const rejected = (res: Res, status: number, code: string) => {
  assert.equal(res.status, status, JSON.stringify(res.body));
  assert.equal(res.body.code, code, JSON.stringify(res.body));
};
const documentFiles = () => [...t.files.keys()].filter((key) => key.startsWith('private/documents/')).length;

async function staffClient(email: string, role: 'owner' | 'backup_reviewer'): Promise<AdminClient> {
  return staffBrowser(t, email, role, { name: role });
}

/** A client that holds only a phone link's token, as the phone page does. */
function phone(url: string): Client {
  const client = t.client();
  (client as unknown as { headers: Record<string, string> }).headers = { 'x-upload-token': new URL(url).hash.slice(1) };
  return client;
}

before(async () => {
  t = await createTestApp();
  photo = await testDocumentPhoto();
  owner = await staffClient('owner@documents.test', 'owner');
  reviewer = await staffClient('reviewer@documents.test', 'backup_reviewer');
});

describe('the sides a document needs', () => {
  test('an NIC needs its front and back; staff see both, each look audited with its side', async () => {
    const member = await t.client().signIn('nimal@documents.test', 'Nimal');
    ok(await member.post('/api/v1/verification/drafts', photoForm('front', photo)), 201);
    const incomplete = await member.post('/api/v1/verification', { documentType: 'nic' });
    rejected(incomplete, 400, 'DOCUMENT_INCOMPLETE');
    assert.deepEqual(Object.keys(incomplete.body.fields), ['back']);

    ok(await member.post('/api/v1/verification/drafts', photoForm('back', photo)), 201);
    const sent = ok(await member.post('/api/v1/verification', { documentType: 'nic' }), 201);
    assert.deepEqual(ok(await member.get('/api/v1/verification/drafts')).drafts, [], 'the drafts became the case');

    const item = ok(await reviewer.get('/api/admin/staff/verification')).cases.find((c: { id: string }) => c.id === sent.id);
    assert.deepEqual(item.sides, ['front', 'back']);
    for (const side of ['front', 'back']) {
      assert.match(ok(await reviewer.get(`/api/admin/staff/verification/${sent.id}/document?side=${side}`)).url, /\/private\/documents\//);
    }
    rejected(await reviewer.get(`/api/admin/staff/verification/${sent.id}/document?side=selfie`), 410, 'DOCUMENT_DELETED');
    const looks = await t.db.select().from(auditEvent).where(eq(auditEvent.entityId, sent.id));
    assert.deepEqual(looks.map((look) => (look.metadata as { side: string }).side).sort(), ['back', 'front']);
  });

  test('a passport needs only its photo page; a back photo left from before is deleted, not kept', async () => {
    const member = await t.client().signIn('priya@documents.test', 'Priya');
    const before = documentFiles();
    ok(await member.post('/api/v1/verification/drafts', photoForm('front', photo)), 201);
    ok(await member.post('/api/v1/verification/drafts', photoForm('back', photo)), 201);
    const sent = ok(await member.post('/api/v1/verification', { documentType: 'passport' }), 201);
    const [row] = await t.db.select().from(verificationCase).where(eq(verificationCase.id, sent.id));
    assert.ok(row!.evidenceKey);
    assert.equal(row!.evidenceBackKey, null);
    assert.equal(documentFiles(), before + 1, 'only the photo page is kept');
  });

  test('retaking a side replaces it and deletes the old file; removing one deletes its file', async () => {
    const member = await t.client().signIn('ruwan@documents.test', 'Ruwan');
    const before = documentFiles();
    const first = ok(await member.post('/api/v1/verification/drafts', photoForm('front', photo)), 201);
    const second = ok(await member.post('/api/v1/verification/drafts', photoForm('front', photo)), 201);
    assert.notEqual(first.id, second.id);
    const { drafts } = ok(await member.get('/api/v1/verification/drafts'));
    assert.deepEqual(drafts.map((d: { side: string; via: string }) => [d.side, d.via]), [['front', 'device']]);
    assert.equal(documentFiles(), before + 1);
    rejected(await member.delete(`/api/v1/verification/drafts/${first.id}`), 404, 'NOT_FOUND');
    assert.equal(ok(await member.delete(`/api/v1/verification/drafts/${second.id}`), 204), null);
    assert.equal(documentFiles(), before);
  });

  test('only the uploader sees a preview, smaller than the original and never cached', async () => {
    const member = await t.client().signIn('sunil@documents.test', 'Sunil');
    const other = await t.client().signIn('kamala@documents.test', 'Kamala');
    const big = await sharp({ create: { width: 2000, height: 1300, channels: 3, background: '#cfc8ba' } }).jpeg().toBuffer();
    const draft = ok(await member.post('/api/v1/verification/drafts', photoForm('front', big)), 201);
    const res = await member.send('GET', `/api/v1/verification/drafts/${draft.id}/preview`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/jpeg');
    assert.match(res.headers.get('cache-control') ?? '', /no-store/);
    assert.equal((await sharp(Buffer.from(await res.arrayBuffer())).metadata()).width, 900);
    rejected(await other.get(`/api/v1/verification/drafts/${draft.id}/preview`), 404, 'NOT_FOUND');
    rejected(await other.delete(`/api/v1/verification/drafts/${draft.id}`), 404, 'NOT_FOUND');
  });

  test('a photo too small to read is refused and nothing is stored', async () => {
    const member = await t.client().signIn('tiny@documents.test', 'Tiny');
    const before = documentFiles();
    const small = await sharp({ create: { width: 640, height: 400, channels: 3, background: '#cfc8ba' } }).jpeg().toBuffer();
    rejected(await member.post('/api/v1/verification/drafts', photoForm('front', small)), 400, 'DOCUMENT_TOO_SMALL');
    rejected(await member.post('/api/v1/verification/drafts', photoForm('inside', photo)), 400, 'VALIDATION');
    assert.equal(documentFiles(), before);
  });

  test('while the owner requires a selfie, a submission needs one; turned off, it does not', async () => {
    ok(await owner.put('/api/admin/owner/operations/selfie_required', { enabled: true }));
    const member = await t.client().signIn('selfie@documents.test', 'Selfie');
    assert.equal(ok(await member.get('/api/v1/verification/drafts')).selfieRequired, true);
    rejected(await member.sendDocument('driving_licence'), 400, 'DOCUMENT_INCOMPLETE');
    ok(await member.post('/api/v1/verification/drafts', photoForm('selfie', photo)), 201);
    const sent = ok(await member.post('/api/v1/verification', { documentType: 'driving_licence' }), 201);
    const item = ok(await reviewer.get('/api/admin/staff/verification')).cases.find((c: { id: string }) => c.id === sent.id);
    assert.deepEqual(item.sides, ['front', 'back', 'selfie']);
    ok(await owner.put('/api/admin/owner/operations/selfie_required', { enabled: false }));
    const later = await t.client().signIn('noselfie@documents.test', 'Later');
    ok(await later.sendDocument('nic'), 201);
  });
});

describe('the phone link (QR code)', () => {
  test('a phone adds photos with the link alone; the member sees them; a new link or sending closes it', async () => {
    const member = await t.client().signIn('qr@documents.test', 'Qr');
    const first = ok(await member.post('/api/v1/verification/phone-link'), 201);
    assert.match(first.url, /\/app\/verify\/phone#[A-Za-z0-9_-]{43}$/);
    const [stored] = await t.db.select().from(verificationUploadLink).where(eq(verificationUploadLink.tokenHash, new URL(first.url).hash.slice(1)));
    assert.equal(stored, undefined, 'the token itself is never stored');

    const link = ok(await member.post('/api/v1/verification/phone-link', { documentType: 'nic' }), 201);
    assert.match(link.url, /\/verify\/phone\?document=nic#/);
    rejected(await phone(first.url).get('/api/v1/verification-link'), 410, 'LINK_INVALID');
    const device = phone(link.url);
    const status = ok(await device.get('/api/v1/verification-link'));
    assert.deepEqual(status.uploaded, []);
    assert.equal(JSON.stringify(status).includes('qr@documents.test'), false, 'the phone page never learns who it is for');

    ok(await device.post('/api/v1/verification-link/drafts', photoForm('front', photo)), 201);
    ok(await device.post('/api/v1/verification-link/drafts', photoForm('back', photo)), 201);
    assert.deepEqual(ok(await device.get('/api/v1/verification-link')).uploaded, ['front', 'back']);
    const { drafts, phoneLink } = ok(await member.get('/api/v1/verification/drafts'));
    assert.deepEqual(drafts.map((d: { side: string; via: string }) => [d.side, d.via]), [['front', 'phone'], ['back', 'phone']]);
    assert.ok(phoneLink);

    ok(await member.post('/api/v1/verification', { documentType: 'nic' }), 201);
    rejected(await device.post('/api/v1/verification-link/drafts', photoForm('front', photo)), 410, 'LINK_INVALID');
    rejected(await t.client().get('/api/v1/verification-link'), 410, 'LINK_INVALID');
  });

  test('a link stops working when it ends or the member closes it', async () => {
    const member = await t.client().signIn('ended@documents.test', 'Ended');
    const link = ok(await member.post('/api/v1/verification/phone-link'), 201);
    await t.db.execute(sql`update verification_upload_link set expires_at = now() - interval '1 second' where revoked_at is null`);
    rejected(await phone(link.url).post('/api/v1/verification-link/drafts', photoForm('front', photo)), 410, 'LINK_INVALID');
    const again = ok(await member.post('/api/v1/verification/phone-link'), 201);
    ok(await member.delete('/api/v1/verification/phone-link'), 204);
    rejected(await phone(again.url).get('/api/v1/verification-link'), 410, 'LINK_INVALID');
  });

  test('the app role cannot add a draft for someone else', async () => {
    await assert.rejects(
      t.db.transaction(async (tx) => {
        await tx.execute(sql`set local role fh_app`);
        await tx.execute(sql`select app.put_draft('someone', 'front', 'documents/x', 'device')`);
      }),
      (err: Error & { cause?: Error }) => /permission denied for function put_draft/.test(err.cause?.message ?? err.message),
    );
  });
});

describe('no identity photo is left behind', () => {
  test('drafts not sent within a day are deleted with their files', async () => {
    const member = await t.client().signIn('late@documents.test', 'Late');
    const before = documentFiles();
    ok(await member.post('/api/v1/verification/drafts', photoForm('front', photo)), 201);
    await t.db.execute(
      sql`update verification_draft set expires_at = now() - interval '1 minute'
          where user_id = (select id from auth_user where email = 'late@documents.test')`,
    );
    assert.ok((await purgeExpiredDrafts(t.deps)) >= 1);
    await drainStorageDeletions(t.deps);
    assert.deepEqual(ok(await member.get('/api/v1/verification/drafts')).drafts, []);
    assert.equal(documentFiles(), before);
  });

  test('90 days after the decision every side goes, the back and selfie with the front', async () => {
    ok(await owner.put('/api/admin/owner/operations/selfie_required', { enabled: true }));
    const member = await t.client().signIn('purge@documents.test', 'Purge');
    const before = documentFiles();
    const sent = ok(await member.sendDocument('nic', ['front', 'back', 'selfie']), 201);
    ok(await owner.put('/api/admin/owner/operations/selfie_required', { enabled: false }));
    assert.equal(documentFiles(), before + 3);
    ok(await reviewer.post(`/api/admin/staff/verification/${sent.id}/decision`, { decision: 'approved' }));
    await t.db.update(verificationCase).set({ purgeAfter: new Date(Date.now() - 1000) }).where(eq(verificationCase.id, sent.id));
    await purgeDocuments(t.deps);
    await drainStorageDeletions(t.deps);
    const [row] = await t.db.select().from(verificationCase).where(eq(verificationCase.id, sent.id));
    assert.deepEqual([row!.evidenceKey, row!.evidenceBackKey, row!.selfieKey], [null, null, null]);
    assert.equal(documentFiles(), before);
  });

  test('deleting the account deletes its drafts and closes its phone link at once', async () => {
    const member = await t.client().signIn('leaving@documents.test', 'Leaving');
    const before = documentFiles();
    ok(await member.post('/api/v1/verification/drafts', photoForm('front', photo)), 201);
    const link = ok(await member.post('/api/v1/verification/phone-link'), 201);
    const me = ok(await member.get('/api/v1/me'));
    await t.db.update(memberAccount).set({ status: 'deleted', deletedAt: new Date() }).where(eq(memberAccount.userId, me.id));
    await drainStorageDeletions(t.deps);
    assert.equal((await t.db.select().from(verificationDraft).where(eq(verificationDraft.userId, me.id))).length, 0);
    assert.equal(documentFiles(), before);
    rejected(await phone(link.url).get('/api/v1/verification-link'), 410, 'LINK_INVALID');
  });
});
