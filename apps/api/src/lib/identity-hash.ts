/**
 * §8: "a scrambled form of email and phone" kept after an account is deleted, so that a banned person cannot sign up
 * again. It is an HMAC with a key derived from the auth secret: unlike a plain hash it cannot be reversed by trying
 * every phone number. The same hash keys the per-address code limits, so no address is stored in the rate-limit
 * table either. Rotating BETTER_AUTH_SECRET makes earlier hashes unmatchable (they then simply expire).
 */
import { createHmac, hkdfSync } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Db } from '../db/types.ts';
import { PHONE_ONLY_EMAIL_DOMAIN } from '../messaging/messenger.ts';
import { rows } from './profile-view.ts';

export type IdentityHasher = (address: string) => string;

const hashers = new Map<string, IdentityHasher>();

/** One hasher per auth secret (the key is derived once). */
export function hasherFor(secret: string): IdentityHasher {
  let hasher = hashers.get(secret);
  if (!hasher) {
    const key = Buffer.from(hkdfSync('sha256', secret, 'favorite-hearts', 'retained-identity-v1', 32));
    hasher = (address) => createHmac('sha256', key).update(address.trim().toLowerCase()).digest('base64url');
    hashers.set(secret, hasher);
  }
  return hasher;
}

/** The sign-in addresses worth keeping: placeholder emails of phone-only members are not. */
export function signInHashes(hash: IdentityHasher, user: { email: string; phoneNumber?: string | null }) {
  return {
    emailHash: user.email.endsWith(`@${PHONE_ONLY_EMAIL_DOMAIN}`) ? null : hash(user.email),
    phoneHash: user.phoneNumber ? hash(user.phoneNumber) : null,
  };
}

/** True when this email or phone belongs to a deleted account that was banned, within the retention period. */
export async function isBannedAddress(db: Db, hash: IdentityHasher, address: string): Promise<boolean> {
  const value = hash(address);
  const [row] = rows<{ banned: boolean }>(
    await db.execute(sql`select exists (select 1 from retained_identity
                         where banned and purge_after > now() and (email_hash = ${value} or phone_hash = ${value})) as banned`),
  );
  return Boolean(row?.banned);
}
