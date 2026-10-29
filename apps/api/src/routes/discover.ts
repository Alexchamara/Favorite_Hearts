/**
 * Discovery (OWNER-DECISIONS sections 1, 6, 7; owner decision 29 Oct 2026: verified members only).
 * Filtering happens here, on the server; members never receive a profile they may not see, nor a field
 * outside the member allowlist. Parents' names and contact details appear only after both accept.
 */
import { and, desc, eq, gte, isNull, lte, sql, type SQL } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { actingProfileSchema, DISCOVER_PAGE_SIZE, discoverQuerySchema, type DiscoverPage, type MemberProfileView, type RelationView } from '@fh/shared';
import { connection, interest } from '../db/schema/connections.ts';
import { profile } from '../db/schema/members.ts';
import { fail, parse, withActor, type AppEnv, type Tx } from '../http.ts';
import { cardColumns, memberCards, memberProfileView, scalar } from '../lib/member-view.ts';
import { operatedProfile } from '../lib/profile-view.ts';
import { requireMember } from '../middleware/session.ts';

export const discover = new Hono<AppEnv>().use(requireMember);

/** Browsing opens once the member's identity document is reviewed and phone verified (N04). */
export async function requireVerifiedMember(tx: Tx): Promise<void> {
  if (!(await scalar<boolean>(tx, sql`app.is_verified_member()`))) {
    fail(403, 'VERIFICATION_REQUIRED', 'Browsing opens once your identity document is reviewed and your phone is verified.');
  }
}

const cursorSchema = z.object({ t: z.iso.datetime(), id: z.uuid() });
const encodeCursor = (t: Date, id: string) => Buffer.from(JSON.stringify({ t: t.toISOString(), id })).toString('base64url');
function decodeCursor(value: string) {
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
  } catch {
    return fail(400, 'VALIDATION', 'This page link is no longer valid.', { cursor: 'Invalid' });
  }
}

discover.get('/', async (c) => {
  const q = parse(discoverQuerySchema, c.req.query());
  const page = await withActor(c, async (tx): Promise<DiscoverPage> => {
    await requireVerifiedMember(tx);
    const where: (SQL | undefined)[] = [
      eq(profile.status, 'published'),
      isNull(profile.moderationHiddenAt),
      sql`not app.operates_profile(${profile.id})`,
      q.gender ? eq(profile.gender, q.gender) : undefined,
      q.ageMin !== undefined ? sql`${profile.birthDate} <= current_date - make_interval(years => ${q.ageMin}::int)` : undefined,
      q.ageMax !== undefined ? sql`${profile.birthDate} > current_date - make_interval(years => ${q.ageMax + 1}::int)` : undefined,
      q.countryCode ? eq(profile.countryCode, q.countryCode) : undefined,
      q.religion ? eq(profile.religion, q.religion) : undefined,
      q.maritalStatus ? eq(profile.maritalStatus, q.maritalStatus) : undefined,
      q.heightMin !== undefined ? gte(profile.heightCm, q.heightMin) : undefined,
      q.heightMax !== undefined ? lte(profile.heightCm, q.heightMax) : undefined,
      // Section 6: caste filters only match profiles that consented to show it.
      q.caste ? sql`lower(${profile.caste}) = lower(${q.caste}) and ${profile.casteConsentedAt} is not null` : undefined,
    ];
    if (q.cursor) {
      const after = decodeCursor(q.cursor);
      where.push(sql`(${profile.firstPublishedAt}, ${profile.id}) < (${after.t}::timestamptz, ${after.id}::uuid)`);
    }
    const found = await tx
      .select({ ...cardColumns, firstPublishedAt: profile.firstPublishedAt })
      .from(profile)
      .where(and(...where))
      .orderBy(desc(profile.firstPublishedAt), desc(profile.id))
      .limit(DISCOVER_PAGE_SIZE + 1);
    const more = found.length > DISCOVER_PAGE_SIZE;
    const shown = found.slice(0, DISCOVER_PAGE_SIZE);
    const last = shown.at(-1);
    return {
      profiles: await memberCards(c, tx, shown),
      nextCursor: more && last?.firstPublishedAt ? encodeCursor(last.firstPublishedAt, last.id) : null,
    };
  });
  return c.json(page);
});

/** Where the acting profile stands with `target`. Without a plan, nothing about requests is revealed. */
async function relation(tx: Tx, acting: string, target: string): Promise<RelationView> {
  const base: RelationView = { actingProfileId: acting, connectionId: null, latestInterest: null, cooldownUntil: null, canSend: false, reason: null };
  if (!(await scalar<boolean>(tx, sql`app.can_manage_interests(${acting})`))) return { ...base, reason: 'not_allowed' };
  if (!(await scalar<boolean>(tx, sql`app.has_active_entitlement(${acting})`))) return { ...base, reason: 'no_plan' };
  const [low, high] = [acting, target].sort() as [string, string];
  const [active] = await tx
    .select({ id: connection.id })
    .from(connection)
    .where(and(eq(connection.profileLow, low), eq(connection.profileHigh, high), isNull(connection.endedAt)));
  const [latest] = await tx
    .select()
    .from(interest)
    .where(and(eq(interest.pairLow, low), eq(interest.pairHigh, high)))
    .orderBy(desc(interest.createdAt))
    .limit(1);
  const cooldownUntil = await scalar<string | null>(tx, sql`app.pair_cooldown_until(${acting}, ${target})`);
  const published = await scalar<boolean>(tx, sql`exists (select 1 from profile where id = ${acting} and status = 'published' and moderation_hidden_at is null)`);
  const reason: RelationView['reason'] = !published
    ? 'not_published'
    : active
      ? 'connected'
      : latest?.status === 'pending'
        ? 'pending'
        : cooldownUntil && new Date(cooldownUntil) > new Date()
          ? 'cooldown'
          : null;
  return {
    actingProfileId: acting,
    connectionId: active?.id ?? null,
    latestInterest: latest
      ? { id: latest.id, direction: latest.senderProfileId === acting ? 'sent' : 'received', status: latest.status, createdAt: latest.createdAt }
      : null,
    cooldownUntil,
    canSend: reason === null,
    reason,
  };
}

discover.get('/:id', async (c) => {
  const id = parse(z.uuid({ error: 'Profile not found.' }), c.req.param('id'));
  const as = c.req.query('as') === undefined ? null : parse(actingProfileSchema, c.req.query('as'));
  const view = await withActor(c, async (tx): Promise<MemberProfileView> => {
    await requireVerifiedMember(tx);
    const [row] = await tx.select().from(profile).where(and(eq(profile.id, id), sql`not app.operates_profile(${profile.id})`));
    if (!row) fail(404, 'NOT_FOUND', 'This profile is not available.');
    if (as) await operatedProfile(tx, as);
    const base = await memberProfileView(c, tx, row);
    const connected = base.family.namesShown;
    const hasPlan = as ? await scalar<boolean>(tx, sql`app.has_active_entitlement(${as})`) : true;
    return {
      ...base,
      contactsHidden: base.contacts ? null : !connected ? 'not_connected' : hasPlan ? 'not_allowed' : 'plan_needed',
      relation: as ? await relation(tx, as, id) : null,
    };
  });
  return c.json(view);
});
