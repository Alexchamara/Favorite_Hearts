/**
 * Identity documents (OWNER-DECISIONS section 5): NIC, passport or driving licence, uploaded only
 * through the app (section 8: never by WhatsApp or email). Stored in the private bucket; members
 * never get a link to the file, and staff review it (routes/staff.ts).
 *
 * A submission is several photos (owner, 5 Nov 2026): the front and back of an NIC or driving licence, a passport's
 * photo page, and a selfie holding the document while the owner requires one. Each photo is a draft as soon as it is
 * chosen (shown back to its owner as a preview, replaceable, deleted after DOCUMENT_DRAFT_HOURS); sending turns the
 * drafts into one case. A phone link (QR code) lets a phone add drafts without signing in: routes in
 * verificationLink below. Every draft change goes through database functions (0014) that queue unused files.
 */
import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import sharp from 'sharp';
import { z } from 'zod';
import {
  DOCUMENT_SIDES,
  documentTypeSchema,
  requiredSides,
  UPLOAD_LINK_MINUTES,
  type PhoneLinkView,
  type PhoneUploadStatus,
  type VerificationCaseView,
  type VerificationDraftView,
  type VerificationDraftsView,
} from '@fh/shared';
import { operationsFlag } from '../db/schema/operations.ts';
import { verificationCase, verificationDraft, verificationUploadLink } from '../db/schema/trust.ts';
import { fail, parse, pgError, readJson, withActor, type AppEnv, type Tx } from '../http.ts';
import { rows } from '../lib/profile-view.ts';
import { cleanUpSoon } from '../lib/storage-cleanup.ts';
import { requireMember } from '../middleware/session.ts';
import { InvalidImageError, processDocument } from '../storage/images.ts';
import { newObjectKey } from '../storage/storage.ts';

/** A photo whose longest side is shorter than this cannot be read by a reviewer. */
export const MIN_DOCUMENT_PIXELS = 800;
/** How wide the owner's own preview of a draft is. */
const PREVIEW_WIDTH = 900;

const sideSchema = z.enum(DOCUMENT_SIDES);
const tokenDigest = (token: string) => createHash('sha256').update(token).digest('hex');

const caseView = (row: typeof verificationCase.$inferSelect): VerificationCaseView => ({
  id: row.id,
  documentType: row.documentType,
  status: row.status,
  submittedAt: row.submittedAt,
  reviewedAt: row.reviewedAt,
  decisionReason: row.decisionReason,
});

const draftView = (row: typeof verificationDraft.$inferSelect): VerificationDraftView => ({
  id: row.id,
  side: row.side,
  via: row.via as VerificationDraftView['via'],
  createdAt: row.createdAt,
  expiresAt: row.expiresAt,
});

async function flags(tx: Tx) {
  const all = await tx.select().from(operationsFlag);
  const on = (key: (typeof all)[number]['key']) => all.some((flag) => flag.key === key && flag.enabled);
  return { paused: on('document_submissions_paused'), selfieRequired: on('selfie_required') };
}

/** The friendly refusals before any upload; the database refuses the same again. */
async function assertCanUpload(c: Context<AppEnv>, tx: Tx, userId: string | null) {
  if ((await flags(tx)).paused) fail(403, 'DOCUMENTS_PAUSED', 'api.verification.paused');
  if (userId) {
    const [pending] = await tx
      .select({ id: verificationCase.id })
      .from(verificationCase)
      .where(and(eq(verificationCase.subjectUserId, userId), eq(verificationCase.status, 'pending')));
    if (pending) fail(409, 'VERIFICATION_PENDING', 'api.verification.pending');
  }
  if (!c.var.deps.storage.configured) fail(503, 'STORAGE_UNAVAILABLE', 'api.verification.uploadUnavailable');
}

/** Reads the side and photo from a form, re-encodes the photo (no location or camera data) and stores it privately. */
async function storeUpload(c: Context<AppEnv>): Promise<{ side: z.infer<typeof sideSchema>; key: string }> {
  const form = await c.req.parseBody().catch(() => fail(400, 'BAD_FORM', 'api.upload.documentForm'));
  const side = parse(sideSchema, form.side);
  const file = form.file;
  if (!(file instanceof File)) fail(400, 'VALIDATION', 'api.verification.chooseDocument', { file: 'validation.required' });
  let image: Buffer;
  try {
    const processed = await processDocument(Buffer.from(await file.arrayBuffer()));
    if (Math.max(processed.width, processed.height) < MIN_DOCUMENT_PIXELS) fail(400, 'DOCUMENT_TOO_SMALL', 'api.verification.tooSmall');
    image = processed.image;
  } catch (err) {
    if (err instanceof InvalidImageError) fail(400, 'INVALID_DOCUMENT', err.key);
    throw err;
  }
  const key = newObjectKey('documents');
  await c.var.deps.storage.put('private', key, image, 'image/jpeg');
  return { side, key };
}

export const verification = new Hono<AppEnv>().use(requireMember);

verification.get('/', async (c) => {
  const userId = c.var.user!.id;
  const cases = await withActor(c, (tx) =>
    tx.select().from(verificationCase).where(eq(verificationCase.subjectUserId, userId)).orderBy(desc(verificationCase.submittedAt)),
  );
  return c.json({ cases: cases.map(caseView) });
});

verification.get('/drafts', async (c) => {
  const userId = c.var.user!.id;
  const view = await withActor(c, async (tx): Promise<VerificationDraftsView> => {
    const drafts = await tx
      .select()
      .from(verificationDraft)
      .where(and(eq(verificationDraft.userId, userId), gt(verificationDraft.expiresAt, new Date())));
    const [link] = await tx
      .select({ expiresAt: verificationUploadLink.expiresAt })
      .from(verificationUploadLink)
      .where(and(eq(verificationUploadLink.userId, userId), isNull(verificationUploadLink.revokedAt), gt(verificationUploadLink.expiresAt, new Date())))
      .orderBy(desc(verificationUploadLink.createdAt))
      .limit(1);
    return { drafts: drafts.map(draftView), phoneLink: link ?? null, selfieRequired: (await flags(tx)).selfieRequired };
  });
  return c.json(view);
});

/** Adds or replaces the photo of one side (form: side, file). */
verification.post('/drafts', async (c) => {
  const userId = c.var.user!.id;
  await withActor(c, (tx) => assertCanUpload(c, tx, userId));
  const { side, key } = await storeUpload(c);
  try {
    const draft = await withActor(c, async (tx) => {
      const [created] = rows<{ id: string }>(await tx.execute(sql`select app.add_draft(${side}::document_side, ${key}) as id`));
      const [row] = await tx.select().from(verificationDraft).where(eq(verificationDraft.id, created!.id));
      return row!;
    });
    await cleanUpSoon(c.var.deps); // the photo it replaced, if any
    return c.json(draftView(draft), 201);
  } catch (err) {
    // Never keep an identity photo the database does not know about.
    await c.var.deps.storage.delete('private', key).catch(() => undefined);
    throw err;
  }
});

/** The owner's own preview of a draft, made smaller; never a storage link, never cached. */
verification.get('/drafts/:id/preview', async (c) => {
  const id = parse(z.uuid(), c.req.param('id'));
  const [draft] = await withActor(c, (tx) => tx.select().from(verificationDraft).where(eq(verificationDraft.id, id)));
  if (!draft) fail(404, 'NOT_FOUND', 'api.verification.draftNotFound');
  const original = await c.var.deps.storage.get('private', draft.objectKey);
  if (!original) fail(404, 'NOT_FOUND', 'api.verification.draftNotFound');
  const preview = await sharp(original).resize({ width: PREVIEW_WIDTH, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  return c.body(new Uint8Array(preview), 200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store' });
});

verification.delete('/drafts/:id', async (c) => {
  const id = parse(z.uuid(), c.req.param('id'));
  const removed = await withActor(c, async (tx) => rows<{ ok: boolean }>(await tx.execute(sql`select app.remove_draft(${id}) as ok`))[0]!.ok);
  if (!removed) fail(404, 'NOT_FOUND', 'api.verification.draftNotFound');
  await cleanUpSoon(c.var.deps);
  return c.body(null, 204);
});

/**
 * A new phone link (QR code) for adding photos from a phone; any earlier open link is closed. JSON: documentType
 * (optional), which only tells the phone page which sides to ask for.
 */
verification.post('/phone-link', async (c) => {
  const userId = c.var.user!.id;
  const input = parse(z.object({ documentType: documentTypeSchema.optional() }), await readJson(c).catch(() => ({})));
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + UPLOAD_LINK_MINUTES * 60_000);
  await withActor(c, async (tx) => {
    await assertCanUpload(c, tx, userId);
    await tx
      .update(verificationUploadLink)
      .set({ revokedAt: new Date() })
      .where(and(eq(verificationUploadLink.userId, userId), isNull(verificationUploadLink.revokedAt)));
    await tx.insert(verificationUploadLink).values({ userId, tokenHash: tokenDigest(token), expiresAt });
  });
  // The token travels after "#", so it is never sent to a server in a page request or kept in its logs.
  const query = input.documentType ? `?document=${input.documentType}` : '';
  const url = `${c.var.deps.config.memberAppUrl.replace(/\/$/, '')}/verify/phone${query}#${token}`;
  return c.json<PhoneLinkView>({ url, expiresAt }, 201);
});

verification.delete('/phone-link', async (c) => {
  const userId = c.var.user!.id;
  await withActor(c, (tx) =>
    tx
      .update(verificationUploadLink)
      .set({ revokedAt: new Date() })
      .where(and(eq(verificationUploadLink.userId, userId), isNull(verificationUploadLink.revokedAt))),
  );
  return c.body(null, 204);
});

/** Sends the drafts for review as one case (JSON: documentType). */
verification.post('/', async (c) => {
  const userId = c.var.user!.id;
  const input = parse(z.object({ documentType: documentTypeSchema }), await readJson(c));
  const created = await withActor(c, async (tx) => {
    await assertCanUpload(c, tx, userId);
    const drafts = await tx
      .select({ side: verificationDraft.side })
      .from(verificationDraft)
      .where(and(eq(verificationDraft.userId, userId), gt(verificationDraft.expiresAt, new Date())));
    const have = new Set(drafts.map((draft) => draft.side));
    const missing = requiredSides(input.documentType, (await flags(tx)).selfieRequired).filter((side) => !have.has(side));
    if (missing.length) {
      fail(400, 'DOCUMENT_INCOMPLETE', 'api.verification.missingSides', Object.fromEntries(missing.map((side) => [side, 'validation.required' as const])));
    }
    const [row] = rows<{ id: string }>(await tx.execute(sql`select app.submit_document(${input.documentType}::document_type) as id`));
    const [created] = await tx.select().from(verificationCase).where(eq(verificationCase.id, row!.id));
    return created!;
  });
  await cleanUpSoon(c.var.deps); // drafts the case did not need
  return c.json(caseView(created), 201);
});

// --- The phone page: a link token instead of a session ----------------------------------------------------------

const linkToken = (c: Context<AppEnv>) => {
  const token = c.req.header('x-upload-token')?.trim();
  if (!token || token.length > 100) fail(410, 'LINK_INVALID', 'api.verification.linkInvalid');
  return tokenDigest(token);
};

export const verificationLink = new Hono<AppEnv>();

/** What the phone page shows: when the link ends and which photos are in. 410 once it has ended or been replaced. */
verificationLink.get('/', async (c) => {
  const hash = linkToken(c);
  const status = await withActor(c, async (tx) =>
    rows<{ status: PhoneUploadStatus | null }>(await tx.execute(sql`select app.upload_link_status(${hash}) as status`))[0]?.status ?? null,
  );
  if (!status) fail(410, 'LINK_INVALID', 'api.verification.linkInvalid');
  return c.json(status);
});

verificationLink.post('/drafts', async (c) => {
  const hash = linkToken(c);
  await withActor(c, async (tx) => {
    const [row] = rows<{ owner: string | null }>(await tx.execute(sql`select app.upload_link_owner(${hash}) as owner`));
    if (!row?.owner) fail(410, 'LINK_INVALID', 'api.verification.linkInvalid');
    await assertCanUpload(c, tx, null);
  });
  const { side, key } = await storeUpload(c);
  try {
    await withActor(c, (tx) => tx.execute(sql`select app.add_draft_via_link(${hash}, ${side}::document_side, ${key})`));
  } catch (err) {
    await c.var.deps.storage.delete('private', key).catch(() => undefined);
    // The link ended while the photo was uploading.
    if (pgError(err)?.code === '42501') fail(410, 'LINK_INVALID', 'api.verification.linkInvalid');
    throw err;
  }
  await cleanUpSoon(c.var.deps);
  return c.json({ side }, 201);
});
