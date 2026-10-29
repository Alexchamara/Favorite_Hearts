/**
 * Reports (OWNER-DECISIONS section 7). Serious categories hide the content after 1 report; all others after
 * reports from 3 different verified members. The database applies the thresholds (app.file_report); staff
 * review every report (routes/staff.ts). Reporters see only their own reports; the reported member never does.
 */
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { reportSchema } from '@fh/shared';
import { parse, readJson, withActor, type AppEnv } from '../http.ts';
import { rows } from '../lib/profile-view.ts';
import { requireMember } from '../middleware/session.ts';

export const reports = new Hono<AppEnv>().use(requireMember);

reports.post('/', async (c) => {
  const input = parse(reportSchema, await readJson(c));
  const id = await withActor(c, async (tx) => {
    const [row] = rows<{ id: string }>(
      await tx.execute(
        sql`select app.file_report(${input.reporterProfileId}, ${input.profileId}, ${input.photoId ?? null}::uuid,
                                   ${input.category}::report_category, ${input.detail ?? null}::text) as id`,
      ),
    );
    return row!.id;
  });
  // The reporter learns only that the report was received, never whether it hid anything.
  return c.json({ id, message: 'Thank you. Our staff will review it.' }, 201);
});
