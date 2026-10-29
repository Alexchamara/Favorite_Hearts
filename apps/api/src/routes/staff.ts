/**
 * Staff workspace API (OWNER-DECISIONS section 10): the owner and the backup reviewer review
 * identity documents. Two-step login is required (requireStaff) and re-checked by the database.
 * Every look at a document and every decision is written to the audit trail.
 */
import { and, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  REPORT_STATUSES,
  reportDecisionSchema,
  VERIFICATION_STATUSES,
  verificationDecisionSchema,
  type StaffQueueItem,
  type StaffReportItem,
} from '@fh/shared';
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

/**
 * Section 7: the report queue, hidden content first so wrongly hidden members wait least. Each reporter's
 * earlier dismissed reports are counted, so repeated false reporting is visible.
 */
staff.get('/reports', async (c) => {
  const status = parse(z.enum(REPORT_STATUSES).default('open'), c.req.query('status'));
  const items = await withActor(c, async (tx): Promise<StaffReportItem[]> => {
    const found = rows<{
      id: string;
      category: StaffReportItem['category'];
      detail: string | null;
      status: StaffReportItem['status'];
      created_at: string;
      target_profile_id: string | null;
      target_name: string | null;
      target_photo_id: string | null;
      hidden: boolean | null;
      reporter_profile_id: string | null;
      reporter_name: string | null;
      dismissed_before: number;
    }>(
      await tx.execute(sql`
        select r.id, r.category, r.detail, r.status, r.created_at,
               r.target_profile_id, tp.display_name as target_name, r.target_photo_id,
               case when r.target_photo_id is not null then ph.moderation_status = 'hidden'
                    else tp.moderation_hidden_at is not null end as hidden,
               r.reporter_profile_id, rp.display_name as reporter_name,
               (select count(*)::int from report d
                 where d.reporter_user_id = r.reporter_user_id and d.status = 'dismissed') as dismissed_before
        from report r
        left join profile tp on tp.id = r.target_profile_id
        left join photo ph on ph.id = r.target_photo_id
        left join profile rp on rp.id = r.reporter_profile_id
        where r.status = ${status}::report_status
        order by hidden desc nulls last, r.created_at asc
        limit 200`),
    );
    return found.map((r) => ({
      id: r.id,
      category: r.category,
      detail: r.detail,
      status: r.status,
      createdAt: r.created_at,
      target: { profileId: r.target_profile_id, displayName: r.target_name, photoId: r.target_photo_id, hidden: Boolean(r.hidden) },
      reporter: { profileId: r.reporter_profile_id, displayName: r.reporter_name, dismissedBefore: r.dismissed_before },
    }));
  });
  return c.json({ reports: items });
});

/** Upheld keeps the content hidden; dismissed restores it unless other open reports still meet a threshold. */
staff.post('/reports/:id/decision', async (c) => {
  const id = parse(z.uuid(), c.req.param('id'));
  const input = parse(reportDecisionSchema, await readJson(c));
  const hidden = await withActor(c, async (tx) => {
    const [row] = rows<{ hidden: boolean }>(
      await tx.execute(sql`select app.review_report(${id}, ${input.decision}::report_status, ${input.note ?? null}::text) as hidden`),
    );
    await audit(c, tx, {
      action: `report.${input.decision}`,
      entityType: 'report',
      entityId: id,
      reason: input.note,
      metadata: { contentHidden: row!.hidden },
    });
    return row!.hidden;
  });
  return c.json({ id, status: input.decision, contentHidden: hidden });
});
