/**
 * Invitation secrets (OWNER-DECISIONS section 5). The database never sees a usable secret:
 * the link token is stored as sha256, the 6-digit code as an HMAC keyed by the server secret.
 */
import { createHash, createHmac, randomBytes, randomInt } from 'node:crypto';

/** 32 random bytes as 43 URL-safe characters (matches invitationTokenSchema). */
export const newInvitationToken = () => randomBytes(32).toString('base64url');
export const tokenDigest = (token: string) => createHash('sha256').update(token).digest('hex');
export const newInvitationCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');
export const codeDigest = (secret: string, tokenHash: string, code: string) =>
  createHmac('sha256', secret).update(`${tokenHash}:${code}`).digest('hex');

/** Enough for the candidate to recognise where the code went, without exposing it. */
export function maskContact(channel: 'email' | 'phone', contact: string): string {
  if (channel === 'phone') return `•••• ${contact.slice(-3)}`;
  const [local = '', domain = ''] = contact.split('@');
  return `${local.slice(0, 1)}•••@${domain}`;
}

/** Link to the member app; the token is in the fragment so it never reaches a server log. */
export const invitationLink = (memberAppUrl: string, token: string) => `${memberAppUrl}/invite#${token}`;
