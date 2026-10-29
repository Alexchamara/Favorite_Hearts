/**
 * The profiles a member operates: as the self-managed candidate, as a manager (up to 3, §5), or as
 * an invited candidate who joined. Everything runs through withActor, so row-level security and the
 * database triggers re-check each rule (drizzle/0003 and 0005).
 */
import { randomUUID } from 'node:crypto';
import { and, count, eq, gt, isNull, sql } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
  contactSchema,
  contactUpdateSchema,
  INVITATION_TTL_HOURS,
  invitationCreateSchema,
  managerPermissionsSchema,
  MAX_SOCIAL_LINKS,
  profileCreateSchema,
  profileUpdateSchema,
} from '@fh/shared';
import { invitation, privateContact, profile, profileManager } from '../db/schema/members.ts';
import { fail, parse, readJson, withActor, type AppEnv } from '../http.ts';
import { invitationLink, newInvitationToken, tokenDigest } from '../lib/invitation-tokens.ts';
import {
  actorRights,
  contactView,
  missingForPublication,
  operatedProfile,
  ownProfileView,
  profilePeople,
  rows,
} from '../lib/profile-view.ts';
import { SmsUnavailableError } from '../messaging/messenger.ts';
import { invitationEmail, invitationSms } from '../messaging/templates.ts';
import { requireMember } from '../middleware/session.ts';

/** Invitations a manager may send per profile in 24 hours (§5: "with a limit on resends"). */
export const MAX_INVITATIONS_PER_DAY = 3;

const uuid = z.uuid();
const idParam = (value: string | undefined) => parse(uuid, value);

export const profiles = new Hono<AppEnv>().use(requireMember);

profiles.get('/', async (c) => {
  const userId = c.var.user!.id;
  const list = await withActor(c, async (tx) => {
    const own = await tx
      .select()
      .from(profile)
      .where(sql`${profile.id} in (select app.operated_profiles())`)
      .orderBy(profile.createdAt);
    return Promise.all(own.map((row) => ownProfileView(tx, row.id, userId)));
  });
  return c.json({ profiles: list });
});

profiles.post('/', async (c) => {
  const input = parse(profileCreateSchema, await readJson(c));
  const userId = c.var.user!.id;
  const id = randomUUID();
  const view = await withActor(c, async (tx) => {
    if (input.management === 'self') {
      await tx.insert(profile).values({
        id,
        management: 'self',
        createdByUserId: userId,
        candidateUserId: userId,
        adultDeclaredAt: new Date(),
      });
    } else {
      // The manager's authority declaration is also the candidate's 18+ declaration (§5).
      await tx.insert(profile).values({ id, management: 'manager', createdByUserId: userId, adultDeclaredAt: new Date() });
      await tx.insert(profileManager).values({
        profileId: id,
        managerUserId: userId,
        relationship: input.relationship,
        authorityDeclaredAt: new Date(),
      });
    }
    return ownProfileView(tx, id, userId);
  });
  return c.json(view, 201);
});

profiles.get('/:id', async (c) => {
  const id = idParam(c.req.param('id'));
  return c.json(await withActor(c, (tx) => ownProfileView(tx, id, c.var.user!.id)));
});

profiles.patch('/:id', async (c) => {
  const id = idParam(c.req.param('id'));
  const { version, caste, adultDeclared, ...fields } = parse(profileUpdateSchema, await readJson(c));
  const userId = c.var.user!.id;
  const view = await withActor(c, async (tx) => {
    const row = await operatedProfile(tx, id);
    const rights = await actorRights(tx, id);
    if (!rights.canEdit) {
      fail(
        403,
        'CANNOT_EDIT',
        row.candidateUserId === userId
          ? 'Take over the profile to edit it yourself.'
          : 'The candidate has not allowed you to edit this profile.',
      );
    }
    if (adultDeclared && row.management !== 'self') {
      fail(400, 'VALIDATION', 'The manager declared the candidate is 18 or over when creating this profile.');
    }
    const updated = await tx
      .update(profile)
      .set({
        ...fields,
        ...(caste !== undefined && { caste: caste?.value ?? null, casteConsentedAt: caste ? new Date() : null }),
        ...(adultDeclared && { adultDeclaredAt: new Date() }),
      })
      .where(and(eq(profile.id, id), eq(profile.version, version)))
      .returning({ id: profile.id });
    if (!updated.length) fail(409, 'VERSION_CONFLICT', 'This profile was changed elsewhere. Reload it and try again.');
    return ownProfileView(tx, id, userId);
  });
  return c.json(view);
});

/** Publish (or resume): complete profile, no candidate objection, verified publisher (§5). */
profiles.post('/:id/publish', async (c) => {
  const id = idParam(c.req.param('id'));
  const userId = c.var.user!.id;
  const view = await withActor(c, async (tx) => {
    const row = await operatedProfile(tx, id);
    if (!(await actorRights(tx, id)).canEdit) fail(403, 'CANNOT_EDIT', 'You cannot publish this profile.');
    if (row.status === 'suspended') fail(403, 'SUSPENDED', 'This profile is suspended. Please contact support.');
    const contacts = await tx.select().from(privateContact).where(eq(privateContact.profileId, id));
    const missing = missingForPublication(row, contacts);
    if (missing.length) {
      fail(400, 'PROFILE_INCOMPLETE', 'Complete the profile before publishing.', Object.fromEntries(missing.map((key) => [key, 'Required'])));
    }
    if (row.candidateObjectionAt) {
      fail(409, 'CANDIDATE_OBJECTED', 'The candidate has asked for this profile not to be shown. Only they can change that.');
    }
    const [{ verified } = { verified: false }] = rows<{ verified: boolean }>(
      await tx.execute(sql`select app.publisher_verified(${id}) as verified`),
    );
    if (!verified) {
      const publisher = (await profilePeople(tx, id)).publisher;
      const needs = [
        ...(publisher?.phoneVerified ? [] : ['a phone number verified by SMS code']),
        ...(publisher?.documentStatus === 'approved' ? [] : ['an approved identity document']),
      ];
      fail(
        403,
        'VERIFICATION_REQUIRED',
        `Before publishing, ${publisher?.isMe ? 'you need' : 'the profile manager needs'} ${needs.join(' and ') || 'verification'}.`,
      );
    }
    await tx.update(profile).set({ status: 'published' }).where(eq(profile.id, id));
    return ownProfileView(tx, id, userId);
  });
  return c.json(view);
});

/** Pause: hidden from discovery at any time (§7). */
profiles.post('/:id/pause', async (c) => {
  const id = idParam(c.req.param('id'));
  const userId = c.var.user!.id;
  const view = await withActor(c, async (tx) => {
    const row = await operatedProfile(tx, id);
    if (!(await actorRights(tx, id)).canEdit) fail(403, 'CANNOT_EDIT', 'You cannot change this profile.');
    if (row.status !== 'published') fail(409, 'NOT_PUBLISHED', 'Only a published profile can be paused.');
    await tx.update(profile).set({ status: 'paused' }).where(eq(profile.id, id));
    return ownProfileView(tx, id, userId);
  });
  return c.json(view);
});

// --- Private contacts ----------------------------------------------------------------------------

profiles.post('/:id/contacts', async (c) => {
  const id = idParam(c.req.param('id'));
  const input = parse(contactSchema, await readJson(c));
  const contact = await withActor(c, async (tx) => {
    const row = await operatedProfile(tx, id);
    if (!(await actorRights(tx, id)).canEdit) fail(403, 'CANNOT_EDIT', 'You cannot change this profile’s contacts.');
    if (input.kind === 'social') {
      const [socials] = await tx
        .select({ n: count() })
        .from(privateContact)
        .where(and(eq(privateContact.profileId, id), eq(privateContact.kind, 'social')));
      if ((socials?.n ?? 0) >= MAX_SOCIAL_LINKS) fail(409, 'TOO_MANY_SOCIALS', `Add up to ${MAX_SOCIAL_LINKS} social links.`);
    }
    const [created] = await tx
      .insert(privateContact)
      .values({ profileId: id, ...input })
      .returning();
    return contactView(created!, row.management);
  });
  return c.json(contact, 201);
});

/** What is shared with connections: the candidate decides once they have joined (§4). */
profiles.patch('/:id/contacts/:contactId', async (c) => {
  const id = idParam(c.req.param('id'));
  const contactId = idParam(c.req.param('contactId'));
  const input = parse(contactUpdateSchema, await readJson(c));
  const contact = await withActor(c, async (tx) => {
    const row = await operatedProfile(tx, id);
    const [updated] = await tx
      .update(privateContact)
      .set(input)
      .where(and(eq(privateContact.id, contactId), eq(privateContact.profileId, id)))
      .returning();
    if (!updated) fail(404, 'NOT_FOUND', 'Contact not found.');
    return contactView(updated, row.management);
  });
  return c.json(contact);
});

profiles.delete('/:id/contacts/:contactId', async (c) => {
  const id = idParam(c.req.param('id'));
  const contactId = idParam(c.req.param('contactId'));
  await withActor(c, async (tx) => {
    await operatedProfile(tx, id);
    if (!(await actorRights(tx, id)).canEdit) fail(403, 'CANNOT_EDIT', 'You cannot change this profile’s contacts.');
    const removed = await tx
      .delete(privateContact)
      .where(and(eq(privateContact.id, contactId), eq(privateContact.profileId, id)))
      .returning({ id: privateContact.id });
    if (!removed.length) fail(404, 'NOT_FOUND', 'Contact not found.');
  });
  return c.body(null, 204);
});

// --- The joined candidate's controls (§5) -------------------------------------------------------

/** The candidate sets what the manager may do; takes effect on the manager's next request (spec I07). */
profiles.patch('/:id/manager', async (c) => {
  const id = idParam(c.req.param('id'));
  const input = parse(managerPermissionsSchema, await readJson(c));
  const userId = c.var.user!.id;
  const view = await withActor(c, async (tx) => {
    const row = await operatedProfile(tx, id);
    if (row.candidateUserId !== userId) fail(403, 'CANDIDATE_ONLY', 'Only the candidate sets the manager’s permissions.');
    const updated = await tx
      .update(profileManager)
      .set(input)
      .where(and(eq(profileManager.profileId, id), isNull(profileManager.revokedAt)))
      .returning({ id: profileManager.id });
    if (!updated.length) fail(404, 'NO_MANAGER', 'This profile has no manager.');
    return ownProfileView(tx, id, userId);
  });
  return c.json(view);
});

async function candidateAction(
  fn: 'candidate_take_over' | 'candidate_withdraw_consent' | 'candidate_restore_consent',
  c: Context<AppEnv>,
) {
  const id = idParam(c.req.param('id'));
  const userId = c.var.user!.id;
  return withActor(c, async (tx) => {
    await operatedProfile(tx, id);
    const [{ result } = { result: { status: 'forbidden' } }] = rows<{ result: { status: string } }>(
      await tx.execute(sql`select app.${sql.raw(fn)}(${id}) as result`),
    );
    if (result.status === 'forbidden') fail(403, 'CANDIDATE_ONLY', 'Only the candidate can do this.');
    if (result.status === 'already_self_managed') fail(409, 'ALREADY_SELF_MANAGED', 'You already manage this profile.');
    return ownProfileView(tx, id, userId);
  });
}

/** Takeover: the manager loses all access now; the plan carries over; no fee (§5, spec I08). */
profiles.post('/:id/take-over', async (c) => c.json(await candidateAction('candidate_take_over', c)));
/** One-click takedown: hidden at once, and only the candidate can lift it (spec I06). */
profiles.post('/:id/withdraw-consent', async (c) => c.json(await candidateAction('candidate_withdraw_consent', c)));
/** Lifts the objection; publishing again is a separate, explicit step (spec I09). */
profiles.post('/:id/restore-consent', async (c) => c.json(await candidateAction('candidate_restore_consent', c)));

// --- Invitations, manager side (§5) ---------------------------------------------------------------

profiles.post('/:id/invitations', async (c) => {
  const id = idParam(c.req.param('id'));
  const input = parse(invitationCreateSchema, await readJson(c));
  const { config, messenger } = c.var.deps;
  const user = c.var.user!;
  if (input.channel === 'phone' && !messenger.smsEnabled) {
    fail(503, 'SMS_UNAVAILABLE', 'SMS invitations are not available yet. Please invite by email.');
  }
  const sent = await withActor(c, async (tx) => {
    const row = await operatedProfile(tx, id);
    // One invitation at a time per profile, so the daily limit cannot be raced.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'invitation:' + id}))`);
    if (row.management !== 'manager' || row.candidateUserId) fail(409, 'CANDIDATE_JOINED', 'The candidate has already joined.');
    if (row.candidateObjectionAt) fail(409, 'CANDIDATE_OBJECTED', 'The candidate declined this profile.');
    const [recent] = await tx
      .select({ n: count() })
      .from(invitation)
      .where(and(eq(invitation.profileId, id), gt(invitation.createdAt, sql`now() - interval '24 hours'`)));
    if ((recent?.n ?? 0) >= MAX_INVITATIONS_PER_DAY) {
      fail(429, 'INVITATION_LIMIT', `You can send up to ${MAX_INVITATIONS_PER_DAY} invitations a day for this profile.`);
    }
    const token = newInvitationToken();
    const [created] = await tx
      .insert(invitation)
      .values({
        profileId: id,
        issuedByUserId: user.id,
        channel: input.channel,
        contact: input.contact,
        tokenHash: tokenDigest(token),
        resendNumber: recent?.n ?? 0,
      })
      .returning();
    const wording = {
      managerName: user.name || 'A family member',
      candidateName: row.displayName,
      link: invitationLink(config.memberAppUrl, token),
      hours: INVITATION_TTL_HOURS,
    };
    // Sending inside the transaction: if delivery fails, the invitation is not kept.
    try {
      if (input.channel === 'email') await messenger.sendEmail({ to: input.contact, ...invitationEmail(wording) });
      else await messenger.sendSms({ to: input.contact, body: invitationSms(wording) });
    } catch (err) {
      if (err instanceof SmsUnavailableError) fail(503, 'SMS_UNAVAILABLE', err.message);
      fail(502, 'SEND_FAILED', 'The invitation could not be sent. Please check the address and try again.');
    }
    return created!;
  });
  return c.json({ channel: sent.channel, contact: sent.contact, expiresAt: sent.expiresAt }, 201);
});
