/**
 * The candidate's side of an invitation (OWNER-DECISIONS section 5): someone holding the link can
 * see who invited them, ask for a code at the nominated contact, then accept (signed in) or decline
 * (no account needed). The checks and changes run in reviewed database functions (drizzle/0005).
 */
import { sql } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { invitationCodeSchema, invitationTokenSchema, type InvitationPreview } from '@fh/shared';
import { fail, parse, readJson, withActor, type AppEnv } from '../http.ts';
import { codeDigest, maskContact, newInvitationCode, tokenDigest } from '../lib/invitation-tokens.ts';
import { rows } from '../lib/profile-view.ts';
import { SmsUnavailableError } from '../messaging/messenger.ts';
import { codeEmail, codeSms } from '../messaging/templates.ts';
import { requireMember } from '../middleware/session.ts';

/** Codes a link can request (each lasts 10 minutes and allows 5 tries). */
export const MAX_CODES_PER_INVITATION = 3;
const CODE_MINUTES = 10;

const tokenBody = z.object({ token: invitationTokenSchema });
type Result = { status: string; channel?: 'email' | 'phone'; contact?: string; profileId?: string };

async function call(c: Context<AppEnv>, query: ReturnType<typeof sql>): Promise<Result> {
  return withActor(c, async (tx) => rows<{ result: Result }>(await tx.execute(query))[0]!.result);
}

function codeProblem(status: string): never {
  switch (status) {
    case 'wrong_code':
      fail(400, 'WRONG_CODE', 'That code is not right. Check the latest code and try again.');
    case 'code_expired':
      fail(400, 'CODE_EXPIRED', 'That code has expired or was tried too many times. Ask for a new code.');
    case 'unauthenticated':
      fail(401, 'UNAUTHENTICATED', 'Please sign in to accept.');
    case 'is_manager':
      fail(409, 'IS_MANAGER', 'The profile manager cannot accept on the candidate’s behalf.');
    case 'already_candidate':
      fail(409, 'ALREADY_CANDIDATE', 'This account already has its own profile.');
    default:
      // One answer for every unusable link, so the token reveals nothing about the invitation.
      fail(404, 'INVITATION_INVALID', 'This invitation link can no longer be used: it has expired, been replaced by a newer one, or already been answered.');
  }
}

export const invitations = new Hono<AppEnv>();

invitations.post('/preview', async (c) => {
  const { token } = parse(tokenBody, await readJson(c));
  const preview = await withActor(c, async (tx) => {
    const [row] = rows<{ preview: { channel: 'email' | 'phone'; contact: string; expiresAt: string; candidateName: string | null; managerName: string | null; relationship: InvitationPreview['relationship'] } | null }>(
      await tx.execute(sql`select app.invitation_preview(${tokenDigest(token)}) as preview`),
    );
    return row?.preview ?? null;
  });
  if (!preview) codeProblem('invalid');
  return c.json<InvitationPreview>({
    candidateName: preview.candidateName,
    managerName: preview.managerName,
    relationship: preview.relationship,
    channel: preview.channel,
    contactHint: maskContact(preview.channel, preview.contact),
    expiresAt: preview.expiresAt,
  });
});

/** Sends a fresh code to the nominated contact (never to an address the requester chooses). */
invitations.post('/code', async (c) => {
  const { token } = parse(tokenBody, await readJson(c));
  const { config, messenger } = c.var.deps;
  const tokenHash = tokenDigest(token);
  const code = newInvitationCode();
  const sent = await withActor(c, async (tx) => {
    const [row] = rows<{ result: Result }>(
      await tx.execute(
        sql`select app.invitation_issue_code(${tokenHash}, ${codeDigest(config.authSecret, tokenHash, code)}, ${MAX_CODES_PER_INVITATION}) as result`,
      ),
    );
    const result = row!.result;
    if (result.status === 'limit') fail(429, 'CODE_LIMIT', 'Too many codes were requested for this invitation. Ask for a new invitation.');
    if (result.status !== 'sent') codeProblem(result.status);
    // Sent inside the transaction: if delivery fails, the code is not counted.
    try {
      if (result.channel === 'email') await messenger.sendEmail({ to: result.contact!, ...codeEmail('invitation', code, CODE_MINUTES) });
      else await messenger.sendSms({ to: result.contact!, body: codeSms(code, CODE_MINUTES) });
    } catch (err) {
      if (err instanceof SmsUnavailableError) fail(503, 'SMS_UNAVAILABLE', 'SMS codes are not available yet.');
      fail(502, 'SEND_FAILED', 'The code could not be sent. Please try again shortly.');
    }
    return result;
  });
  return c.json({ channel: sent.channel, contactHint: maskContact(sent.channel!, sent.contact!) });
});

/**
 * Accept as the signed-in account: it becomes the profile's candidate. A wrong code is counted
 * (the function returns, so the count is committed) before the error is reported.
 */
invitations.post('/accept', requireMember, async (c) => {
  const { token, code } = parse(invitationCodeSchema, await readJson(c));
  const tokenHash = tokenDigest(token);
  const result = await call(c, sql`select app.invitation_accept(${tokenHash}, ${codeDigest(c.var.deps.config.authSecret, tokenHash, code)}) as result`);
  if (result.status !== 'accepted') codeProblem(result.status);
  return c.json({ profileId: result.profileId });
});

/** Decline with the code; no account needed. The profile is taken down (spec I06). */
invitations.post('/decline', async (c) => {
  const { token, code } = parse(invitationCodeSchema, await readJson(c));
  const tokenHash = tokenDigest(token);
  const result = await call(c, sql`select app.invitation_decline(${tokenHash}, ${codeDigest(c.var.deps.config.authSecret, tokenHash, code)}) as result`);
  if (result.status !== 'declined') codeProblem(result.status);
  return c.json({ declined: true });
});
