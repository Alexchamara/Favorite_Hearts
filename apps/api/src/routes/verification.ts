/**
 * Identity documents (OWNER-DECISIONS section 5): NIC, passport or driving licence, uploaded only
 * through this form (section 8: never by WhatsApp or email). Stored in the private bucket; members
 * never get a link to the file, and staff review it (routes/staff.ts).
 */
import { and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { documentTypeSchema } from '@fh/shared';
import { operationsFlag } from '../db/schema/operations.ts';
import { verificationCase } from '../db/schema/trust.ts';
import { fail, parse, withActor, type AppEnv } from '../http.ts';
import { requireMember } from '../middleware/session.ts';
import { InvalidImageError, processDocument } from '../storage/images.ts';
import { newObjectKey } from '../storage/storage.ts';

const caseView = (row: typeof verificationCase.$inferSelect) => ({
  id: row.id,
  documentType: row.documentType,
  status: row.status,
  submittedAt: row.submittedAt,
  reviewedAt: row.reviewedAt,
  decisionReason: row.decisionReason,
});

export const verification = new Hono<AppEnv>().use(requireMember);

verification.get('/', async (c) => {
  const userId = c.var.user!.id;
  const cases = await withActor(c, (tx) =>
    tx.select().from(verificationCase).where(eq(verificationCase.subjectUserId, userId)).orderBy(desc(verificationCase.submittedAt)),
  );
  return c.json({ cases: cases.map(caseView) });
});

verification.post('/', async (c) => {
  const { storage } = c.var.deps;
  const userId = c.var.user!.id;
  const form = await c.req.parseBody().catch(() => fail(400, 'BAD_FORM', 'Send the document as a form upload.'));
  const documentType = parse(documentTypeSchema, form.documentType);
  const file = form.file;
  if (!(file instanceof File)) fail(400, 'VALIDATION', 'Choose a photo of the document.', { file: 'Required' });

  // Friendly answers before the upload; the database enforces both again on insert.
  await withActor(c, async (tx) => {
    const [paused] = await tx.select().from(operationsFlag).where(eq(operationsFlag.key, 'document_submissions_paused'));
    if (paused?.enabled) fail(403, 'DOCUMENTS_PAUSED', 'Document submissions are paused for now. Please try again later.');
    const [pending] = await tx
      .select({ id: verificationCase.id })
      .from(verificationCase)
      .where(and(eq(verificationCase.subjectUserId, userId), eq(verificationCase.status, 'pending')));
    if (pending) fail(409, 'VERIFICATION_PENDING', 'Your document is already waiting for review.');
  });
  if (!storage.configured) fail(503, 'STORAGE_UNAVAILABLE', 'Document upload is not available yet.');

  let image: Buffer;
  try {
    image = (await processDocument(Buffer.from(await file.arrayBuffer()))).image;
  } catch (err) {
    if (err instanceof InvalidImageError) fail(400, 'INVALID_DOCUMENT', err.message);
    throw err;
  }
  const key = newObjectKey('documents');
  await storage.put('private', key, image, 'image/jpeg');
  try {
    const created = await withActor(c, async (tx) => {
      const [row] = await tx
        .insert(verificationCase)
        .values({ subjectUserId: userId, documentType, evidenceKey: key })
        .returning();
      return row!;
    });
    return c.json(caseView(created), 201);
  } catch (err) {
    // Never keep an identity document the database does not know about.
    await storage.delete('private', key).catch(() => undefined);
    throw err;
  }
});
