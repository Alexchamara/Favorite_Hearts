/**
 * Staff workspace API (OWNER-DECISIONS section 10): the owner and the backup reviewer review
 * identity documents. Two-step login is required (requireStaff) and re-checked by the database.
 * Every look at a document and every decision is written to the audit trail.
 */
import { and, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { VERIFICATION_STATUSES, verificationDecisionSchema, type StaffQueueItem } from '@fh/shared';
import { verificationCase } from '../db/schema/trust.ts';
import { fail, parse, readJson, withActor, type AppEnv } from '../http.ts';
import { audit } from '../lib/audit.ts';
import { rows } from '../lib/profile-view.ts';
import { requireStaff } from '../middleware/session.ts';

export const staff = new Hono<AppEnv>().use(requireStaff('owner', 'backup_reviewer'));

staff.get('/verification', async (c) => {
  const status = parse(z.enum(VERIFICATION_STATUSES).default('pending'), c.req.query('status'));
  const queue = await withActor(c, async (tx) =>
    rows<{ queue: StaffQueueItem[] }>(await tx.execute(sql`select app.staff_verification_queue(${status}) as queue`))[0]!.queue,
  );
  return c.json({ cases: queue });
});

/** A short-lived link to the document image; audited. Gone once the 90-day purge has run. */
staff.get('/verification/:id/document', async (c) => {
  const id = parse(z.uuid(), c.req.param('id'));
  const { storage } = c.var.deps;
  const key = await withActor(c, async (tx) => {
    const [row] = await tx.select().from(verificationCase).where(eq(verificationCase.id, id));
    if (!row) fail(404, 'NOT_FOUND', 'Verification case not found.');
    if (!row.evidenceKey) fail(410, 'DOCUMENT_DELETED', 'The document was deleted under the 90-day retention rule.');
    await audit(c, tx, { action: 'verification.document_viewed', entityType: 'verification_case', entityId: id });
    return row.evidenceKey;
  });
  return c.json({ url: await storage.signedGetUrl('private', key), expiresInSeconds: c.var.deps.config.signedUrlTtlSeconds });
});

/** Approve or reject (with a reason the member sees). Decisions are final; the member resubmits. */
staff.post('/verification/:id/decision', async (c) => {
  const id = parse(z.uuid(), c.req.param('id'));
  const input = parse(verificationDecisionSchema, await readJson(c));
  const decided = await withActor(c, async (tx) => {
    const [row] = await tx
      .update(verificationCase)
      .set({ status: input.decision, decisionReason: input.decision === 'rejected' ? input.reason : null })
      .where(and(eq(verificationCase.id, id), eq(verificationCase.status, 'pending')))
      .returning();
    if (!row) fail(409, 'ALREADY_DECIDED', 'This case is not waiting for review.');
    await audit(c, tx, {
      action: `verification.${input.decision}`,
      entityType: 'verification_case',
      entityId: id,
      reason: input.decision === 'rejected' ? input.reason : undefined,
      metadata: { before: 'pending', after: input.decision, documentType: row.documentType },
    });
    return row;
  });
  return c.json({ id: decided.id, status: decided.status, reviewedAt: decided.reviewedAt, purgeAfter: decided.purgeAfter });
});
