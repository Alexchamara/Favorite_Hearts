/**
 * The member's own account (OWNER-DECISIONS section 8): what deleting it would do, deleting it, and downloading
 * everything it holds. The rules run in the database (app.delete_account, drizzle/0011_safety_rules.sql); deleting needs
 * a recent sign-in.
 */
import { and, count, eq, inArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import {
  deleteAccountSchema,
  RETENTION_MONTHS,
  type AccountDeletionPreview,
  type AccountDeletionResult,
  type DeletionOutcomeView,
} from '@fh/shared';
import { paymentSubmission } from '../db/schema/billing.ts';
import { isoDate, parse, readJson, withActor, type AppEnv } from '../http.ts';
import { audit } from '../lib/audit.ts';
import { buildDataExport } from '../lib/data-export.ts';
import { hasherFor, signInHashes } from '../lib/identity-hash.ts';
import { log } from '../lib/log.ts';
import { rows } from '../lib/profile-view.ts';
import { cleanUpSoon } from '../lib/storage-cleanup.ts';
import { recentSignIn, requireMember, requireRecentSignIn } from '../middleware/session.ts';

export const account = new Hono<AppEnv>().use(requireMember);

type OutcomeRow = {
  profile_id: string;
  display_name: string | null;
  outcome: DeletionOutcomeView['outcome'];
  candidate_name: string | null;
  plan_active: boolean;
  plan_ends_at: string | Date | null;
};

/** What deleting the account would do to each profile it runs, and what stays with the owner. */
account.get('/deletion', async (c) => {
  const userId = c.var.user!.id;
  const preview = await withActor(c, async (tx): Promise<AccountDeletionPreview> => {
    const outcomes = rows<OutcomeRow>(await tx.execute(sql`select * from app.deletion_outcomes()`));
    const [waiting] = await tx
      .select({ n: count() })
      .from(paymentSubmission)
      .where(and(eq(paymentSubmission.payerUserId, userId), inArray(paymentSubmission.status, ['pending_review', 'held'])));
    return {
      profiles: outcomes.map((o) => ({
        profileId: o.profile_id,
        displayName: o.display_name,
        outcome: o.outcome,
        candidateName: o.candidate_name,
        planActive: o.plan_active,
        planEndsAt: isoDate(o.plan_ends_at),
      })),
      paymentsUnderReview: Number(waiting?.n ?? 0),
      recentSignIn: recentSignIn(c),
      retentionMonths: RETENTION_MONTHS,
    };
  });
  return c.json(preview);
});

/** Section 8: deletes the account now. The browser is signed out; every other session already ended in the database. */
account.post('/delete', async (c) => {
  parse(deleteAccountSchema, await readJson(c));
  requireRecentSignIn(c);
  const user = c.var.user!;
  const { emailHash, phoneHash } = signInHashes(hasherFor(c.var.deps.config.authSecret), user);
  const result = await withActor(c, async (tx) => {
    const [row] = rows<{ result: AccountDeletionResult & { banned: boolean } }>(
      await tx.execute(
        sql`select app.delete_account(${emailHash}::text, ${phoneHash}::text, ${RETENTION_MONTHS}::integer) as result`,
      ),
    );
    await audit(c, tx, { action: 'account.deleted', entityType: 'account', entityId: user.id, metadata: row!.result });
    return row!.result;
  });
  await cleanUpSoon(c.var.deps);
  try {
    const signedOut = await c.var.deps.auth.api.signOut({ headers: c.req.raw.headers, asResponse: true });
    for (const cookie of signedOut.headers.getSetCookie()) c.header('Set-Cookie', cookie, { append: true });
  } catch (err) {
    log.warn('account.sign_out_after_delete_failed', { message: (err as Error).message });
  }
  return c.json<AccountDeletionResult>({ profilesDeleted: result.profilesDeleted, profilesHandedOver: result.profilesHandedOver });
});

/** Everything the account and its profiles hold, as the app shows it, in one ZIP file (lib/data-export.ts). */
account.get('/export', async (c) => {
  const userId = c.var.user!.id;
  const exported = await withActor(c, async (tx) => {
    const built = await buildDataExport(c, tx);
    await audit(c, tx, { action: 'account.exported', entityType: 'account', entityId: userId, metadata: { profiles: built.profiles, photos: built.photos } });
    return built;
  });
  const day = new Date().toISOString().slice(0, 10);
  return c.body(new Uint8Array(exported.file), 200, {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="favorite-hearts-data-${day}.zip"`,
  });
});
