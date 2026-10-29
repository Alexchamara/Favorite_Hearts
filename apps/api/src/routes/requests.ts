/**
 * Requests and connections (OWNER-DECISIONS sections 1–4, 7). Every action that changes more than one row
 * is one database function with its own checks and locks (drizzle/0007_requests_and_privacy.sql); these
 * routes check the member is allowed, call it, and answer with what the member may see.
 */
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  blockSchema,
  engagedSchema,
  sendInterestSchema,
  SHARING_POLICY_VERSION,
  type BlockView,
  type ConnectionView,
  type PlanUsage,
  type ReceivedInterests,
  type SentInterestView,
} from '@fh/shared';
import { block, connection, interest } from '../db/schema/connections.ts';
import { profile } from '../db/schema/members.ts';
import { fail, parse, readJson, withActor, type AppEnv, type Tx } from '../http.ts';
import { cardsById, scalar, sharedContacts } from '../lib/member-view.ts';
import { operatedProfile, ownProfileView, rows } from '../lib/profile-view.ts';
import { requireMember } from '../middleware/session.ts';

const idParam = (value: string | undefined) => parse(z.uuid({ error: 'Not found.' }), value);

/** The other profile of a pair. */
const other = (pair: { profileLow: string; profileHigh: string }, mine: string) => (pair.profileLow === mine ? pair.profileHigh : pair.profileLow);

// --- Under /profiles/:id (mounted after the profiles router, whose requireMember also covers these) ---------

export const profileRequests = new Hono<AppEnv>();

profileRequests.post('/:id/interests', async (c) => {
  const id = idParam(c.req.param('id'));
  const input = parse(sendInterestSchema, await readJson(c));
  const key = input.idempotencyKey ?? c.req.header('Idempotency-Key') ?? null;
  const interestId = await withActor(c, async (tx) => {
    await operatedProfile(tx, id);
    const [row] = rows<{ id: string }>(
      await tx.execute(sql`select app.send_interest(${id}, ${input.receiverProfileId}, ${SHARING_POLICY_VERSION}, ${key}::text) as id`),
    );
    return row!.id;
  });
  return c.json({ id: interestId }, 201);
});

profileRequests.get('/:id/interests', async (c) => {
  const id = idParam(c.req.param('id'));
  const box = parse(z.enum(['received', 'sent'], { error: 'Choose received or sent.' }).default('received'), c.req.query('box'));
  const result = await withActor(c, async (tx): Promise<ReceivedInterests | { interests: SentInterestView[] }> => {
    await operatedProfile(tx, id);
    if (box === 'sent') return { interests: await sentInterests(c, tx, id) };
    // Sections 1 and 4: without an active plan, previews only; the sender's identity stays on the server.
    if (!(await scalar<boolean>(tx, sql`app.has_active_entitlement(${id})`))) {
      const previews = rows<{ interest_id: string; received_at: string; sender_age: number | null; sender_occupation: string | null }>(
        await tx.execute(sql`select * from app.received_interest_previews(${id})`),
      );
      return {
        identified: false,
        previews: previews.map((p) => ({ id: p.interest_id, receivedAt: p.received_at, senderAge: p.sender_age, senderOccupation: p.sender_occupation })),
      };
    }
    const pending = await tx
      .select()
      .from(interest)
      .where(and(eq(interest.receiverProfileId, id), eq(interest.status, 'pending'), sql`not app.is_blocked(${interest.senderProfileId}, ${id})`))
      .orderBy(desc(interest.createdAt));
    const cards = await cardsById(c, tx, pending.map((i) => i.senderProfileId));
    return {
      identified: true,
      interests: pending.map((i) => ({ id: i.id, receivedAt: i.createdAt, sender: cards.get(i.senderProfileId) ?? null })),
    };
  });
  return c.json(result);
});

async function sentInterests(c: Parameters<typeof cardsById>[0], tx: Tx, id: string): Promise<SentInterestView[]> {
  const sent = await tx.select().from(interest).where(eq(interest.senderProfileId, id)).orderBy(desc(interest.createdAt)).limit(100);
  if (!sent.length) return [];
  const cards = await cardsById(c, tx, sent.map((i) => i.receiverProfileId));
  const opened = await tx.select({ id: connection.id, interestId: connection.interestId }).from(connection).where(
    inArray(
      connection.interestId,
      sent.map((i) => i.id),
    ),
  );
  const connectionOf = new Map(opened.map((o) => [o.interestId, o.id]));
  return Promise.all(
    sent.map(async (i) => ({
      id: i.id,
      status: i.status,
      createdAt: i.createdAt,
      respondedAt: i.respondedAt,
      receiver: cards.get(i.receiverProfileId) ?? null,
      connectionId: connectionOf.get(i.id) ?? null,
      cooldownUntil:
        i.status === 'declined' || i.status === 'withdrawn'
          ? await scalar<string | null>(tx, sql`app.pair_cooldown_until(${id}, ${i.receiverProfileId})`)
          : null,
    })),
  );
}

profileRequests.get('/:id/connections', async (c) => {
  const id = idParam(c.req.param('id'));
  const list = await withActor(c, async (tx): Promise<ConnectionView[]> => {
    await operatedProfile(tx, id);
    const active = await tx
      .select()
      .from(connection)
      .where(and(isNull(connection.endedAt), sql`(${connection.profileLow} = ${id} or ${connection.profileHigh} = ${id})`))
      .orderBy(desc(connection.acceptedAt));
    const others = active.map((conn) => other(conn, id));
    const cards = await cardsById(c, tx, others);
    const hasPlan = await scalar<boolean>(tx, sql`app.has_active_entitlement(${id})`);
    const managementOf = new Map(
      (others.length ? await tx.select({ id: profile.id, management: profile.management }).from(profile).where(inArray(profile.id, others)) : []).map(
        (p) => [p.id, p.management],
      ),
    );
    return Promise.all(
      active.map(async (conn) => {
        const otherId = other(conn, id);
        const management = managementOf.get(otherId);
        const contacts = management ? await sharedContacts(tx, { id: otherId, management }) : null;
        return {
          id: conn.id,
          acceptedAt: conn.acceptedAt,
          profileId: otherId,
          profile: cards.get(otherId) ?? null,
          contacts,
          contactsHidden: contacts ? null : hasPlan ? 'not_allowed' : 'plan_needed',
        };
      }),
    );
  });
  return c.json({ connections: list });
});

profileRequests.get('/:id/blocks', async (c) => {
  const id = idParam(c.req.param('id'));
  const list = await withActor(c, async (tx): Promise<BlockView[]> => {
    await operatedProfile(tx, id);
    const found = rows<{ block_id: string; profile_id: string | null; display_name: string | null; blocked_at: string }>(
      await tx.execute(sql`select * from app.blocked_profiles(${id})`),
    );
    return found.map((b) => ({ id: b.block_id, profileId: b.profile_id, displayName: b.display_name, blockedAt: b.blocked_at }));
  });
  return c.json({ blocks: list });
});

profileRequests.post('/:id/blocks', async (c) => {
  const id = idParam(c.req.param('id'));
  const input = parse(blockSchema, await readJson(c));
  const blockId = await withActor(c, async (tx) => {
    await operatedProfile(tx, id);
    const [row] = rows<{ id: string }>(await tx.execute(sql`select app.block_profile(${id}, ${input.profileId}) as id`));
    return row!.id;
  });
  return c.json({ id: blockId }, 201);
});

/** Unblocking does not bring back an ended connection; the 7-day wait still applies to new requests. */
profileRequests.delete('/:id/blocks/:blockId', async (c) => {
  const id = idParam(c.req.param('id'));
  const blockId = idParam(c.req.param('blockId'));
  await withActor(c, async (tx) => {
    await operatedProfile(tx, id);
    const lifted = await tx
      .update(block)
      .set({ revokedAt: new Date() })
      .where(and(eq(block.id, blockId), eq(block.blockerProfileId, id), isNull(block.revokedAt)))
      .returning({ id: block.id });
    if (!lifted.length) fail(404, 'NOT_FOUND', 'Block not found.');
  });
  return c.body(null, 204);
});

/** Section 2: the active plan and what is left of today's and this month's requests. */
profileRequests.get('/:id/plan', async (c) => {
  const id = idParam(c.req.param('id'));
  const usage = await withActor(c, async (tx): Promise<PlanUsage> => {
    await operatedProfile(tx, id);
    const [row] = rows<{
      active: boolean;
      plan_id: string | null;
      ends_at: string | null;
      daily_cap: number | null;
      monthly_cap: number | null;
      daily_used: number;
      monthly_used: number;
    }>(
      await tx.execute(sql`
        select app.has_active_entitlement(${id}) as active, e.plan_id, e.ends_at,
          coalesce(e.daily_request_cap, p.daily_request_cap) as daily_cap,
          coalesce(e.monthly_request_cap, p.monthly_request_cap) as monthly_cap,
          (select count(*)::int from quota_ledger q where q.profile_id = ${id}
             and q.charged_at >= date_trunc('day', now() at time zone 'Asia/Colombo') at time zone 'Asia/Colombo') as daily_used,
          (select count(*)::int from quota_ledger q where q.profile_id = ${id}
             and q.charged_at >= e.starts_at + floor(extract(epoch from now() - e.starts_at) / 2592000) * interval '30 days') as monthly_used
        from entitlement_event e left join plan p on p.id = e.plan_id
        where e.profile_id = ${id} order by e.seq desc limit 1`),
    );
    if (!row?.active) return { active: false, planId: null, endsAt: null, daily: null, monthly: null };
    return {
      active: true,
      planId: row.plan_id,
      endsAt: row.ends_at,
      daily: row.daily_cap === null ? null : { used: row.daily_used, cap: row.daily_cap },
      monthly: row.monthly_cap === null ? null : { used: row.monthly_used, cap: row.monthly_cap },
    };
  });
  return c.json(usage);
});

/** Section 7: hides the profile and ends its plan, after the member confirmed the forfeit warning. */
profileRequests.post('/:id/engaged', async (c) => {
  const id = idParam(c.req.param('id'));
  parse(engagedSchema, await readJson(c));
  const userId = c.var.user!.id;
  const view = await withActor(c, async (tx) => {
    await operatedProfile(tx, id);
    await tx.execute(sql`select app.mark_engaged(${id})`);
    return ownProfileView(tx, id, userId);
  });
  return c.json(view);
});

// --- /interests/:id and /connections/:id ----------------------------------------------------------------

export const interests = new Hono<AppEnv>().use(requireMember);

interests.post('/:id/accept', async (c) => {
  const id = idParam(c.req.param('id'));
  const connectionId = await withActor(c, async (tx) => {
    const [row] = rows<{ id: string }>(await tx.execute(sql`select app.accept_interest(${id}) as id`));
    return row!.id;
  });
  return c.json({ connectionId });
});

/** Declining needs the receiver's plan, like accepting (section 1); withdrawing is for the sender. */
async function closeInterest(tx: Tx, id: string, status: 'declined' | 'withdrawn') {
  const [found] = await tx.select().from(interest).where(eq(interest.id, id));
  if (!found) fail(404, 'NOT_FOUND', 'Request not found.');
  const side = status === 'declined' ? found.receiverProfileId : found.senderProfileId;
  if (!(await scalar<boolean>(tx, sql`app.can_manage_interests(${side})`))) fail(404, 'NOT_FOUND', 'Request not found.');
  if (found.status !== 'pending') fail(409, 'REQUEST_CLOSED', 'This request was already answered or withdrawn.');
  if (status === 'declined' && !(await scalar<boolean>(tx, sql`app.has_active_entitlement(${side})`))) {
    fail(403, 'PLAN_REQUIRED', 'A plan is needed to see and answer requests.');
  }
  const changed = await tx
    .update(interest)
    .set({ status })
    .where(and(eq(interest.id, id), eq(interest.status, 'pending')))
    .returning({ id: interest.id });
  if (!changed.length) fail(409, 'REQUEST_CLOSED', 'This request was already answered or withdrawn.');
}

interests.post('/:id/decline', async (c) => {
  const id = idParam(c.req.param('id'));
  await withActor(c, (tx) => closeInterest(tx, id, 'declined'));
  return c.body(null, 204);
});

interests.post('/:id/withdraw', async (c) => {
  const id = idParam(c.req.param('id'));
  await withActor(c, (tx) => closeInterest(tx, id, 'withdrawn'));
  return c.body(null, 204);
});

export const connections = new Hono<AppEnv>().use(requireMember);

/** Section 4: either side may end a connection at any time; both lose access to each other's details. */
connections.post('/:id/end', async (c) => {
  const id = idParam(c.req.param('id'));
  await withActor(c, (tx) => tx.execute(sql`select app.end_connection(${id})`));
  return c.body(null, 204);
});
