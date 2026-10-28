/**
 * Contact normalisation used for login identifiers and invitation channels.
 * Server code must apply the same rules (spec 5.1, I01: whitespace/case
 * variants must not bypass "candidate contact differs from manager").
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_PATTERN = /^\+[1-9]\d{8,14}$/;

/** Trim and lowercase. Returns null when the value is not a plausible email. */
export function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  return email.length <= 150 && EMAIL_PATTERN.test(email) ? email : null;
}

/**
 * Normalise a phone number to E.164 (the format Supabase Auth expects).
 * Accepts "+94 76 676 9894", "0094766769894" and, for Sri Lanka, the local
 * form "0766769894". Returns null when the result is not valid E.164.
 */
export function normalizePhone(value: string, defaultCountryCode = '94'): string | null {
  let phone = value.replace(/[\s().-]/g, '');
  if (phone.startsWith('00')) phone = `+${phone.slice(2)}`;
  else if (!phone.startsWith('+') && phone.startsWith('0')) phone = `+${defaultCountryCode}${phone.slice(1)}`;
  else if (!phone.startsWith('+')) phone = `+${phone}`;
  return E164_PATTERN.test(phone) ? phone : null;
}

/** Same person/channel check after normalisation. */
export function sameContact(a: string, b: string): boolean {
  const left = normalizeEmail(a) ?? normalizePhone(a);
  const right = normalizeEmail(b) ?? normalizePhone(b);
  return left !== null && left === right;
}
