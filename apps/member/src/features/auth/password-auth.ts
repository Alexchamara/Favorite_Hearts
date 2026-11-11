/**
 * Member sign-up and log-in with a password (owner decision, 11 Nov 2026; API: apps/api/src/lib/member-access.ts and
 * Better-Auth's own log-in and reset). Every call asks for answers in the language on screen (auth-client.ts); a
 * refusal comes back as an AuthProblem: one message for the form, and field messages to show under their fields.
 */
import { normalizeEmail, normalizePhone } from '@fh/shared';
import { authClient } from '@/lib/auth-client';
import { env } from '@/lib/env';
import { say, type AppTextKey } from '@/lib/i18n';

/** Where the address goes: an email address, or (Sri Lanka, once SMS is set up) a phone number. */
export type Identity = { email: string } | { phoneNumber: string };

export class AuthProblem extends Error {
  constructor(
    message: string,
    public code: string | null,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

/** Better-Auth's own refusals, in words people understand. Our API's own come translated already. */
const MESSAGES: Record<string, AppTextKey> = {
  INVALID_EMAIL_OR_PASSWORD: 'signIn.error.wrongPassword',
  INVALID_PHONE_NUMBER_OR_PASSWORD: 'signIn.error.wrongPassword',
  PHONE_NUMBER_NOT_VERIFIED: 'signIn.error.phoneNotVerified',
  EMAIL_NOT_VERIFIED: 'signIn.error.emailNotVerified',
  INVALID_TOKEN: 'auth.reset.invalidLink',
  CAPTCHA_REQUIRED: 'signIn.error.captchaRequired',
  CAPTCHA_FAILED: 'signIn.error.captchaFailed',
};
const OWN = new Set([
  'VALIDATION',
  'CODE_EXPIRED',
  'INVALID_CODE',
  'TOO_MANY_ATTEMPTS',
  'ACCOUNT_EXISTS',
  'LOGIN_LOCKED',
  'SIGNUPS_PAUSED',
  'ADDRESS_BANNED',
  'CODES_PER_ADDRESS',
  'SMS_UNAVAILABLE',
]);

type FetchError = { status?: number; code?: string; message?: string; fields?: Record<string, string> } | null;

function problem(error: FetchError): AuthProblem {
  const code = error?.code ?? null;
  if (code && MESSAGES[code]) return new AuthProblem(say(MESSAGES[code]), code);
  if (code && OWN.has(code) && error?.message) return new AuthProblem(error.message, code, error.fields ?? {});
  if (error?.status === 429) return new AuthProblem(say('signIn.error.tooManyRequests'), code);
  return new AuthProblem(say('common.somethingWrong'), code);
}

function unwrap<T>(result: { data: T | null; error: FetchError }): T {
  if (result.error) throw problem(result.error);
  return result.data as T;
}

/** Whether phone numbers can be used here: SMS is set up, and the visitor is in Sri Lanka (the SMS provider's). */
export const phoneAllowed = (country: string) => env.loginSmsEnabled && country === 'LK';

/** What the person typed, as an email address or a phone number; null when it is neither (or phones are not allowed). */
export function readIdentity(value: string, phones: boolean): Identity | null {
  const email = normalizeEmail(value);
  if (email) return { email };
  if (!phones || value.includes('@')) return null;
  const phone = /^[+\d\s().-]{9,20}$/.test(value.trim()) ? normalizePhone(value) : null;
  return phone ? { phoneNumber: phone } : null;
}

export const identityText = (identity: Identity) => ('email' in identity ? identity.email : identity.phoneNumber);

type Headers = Record<string, string> | undefined;

export async function startSignUp(input: { name: string; identity: Identity; password: string; consent: boolean }, headers: Headers) {
  return unwrap<{ sent: true; channel: 'email' | 'sms' }>(
    await authClient.$fetch('/member/sign-up', {
      method: 'POST',
      body: { name: input.name, ...input.identity, password: input.password, consent: input.consent },
      headers,
    }),
  );
}

export async function confirmSignUp(identity: Identity, code: string) {
  return unwrap(await authClient.$fetch('/member/sign-up/verify', { method: 'POST', body: { ...identity, code } }));
}

export async function logIn(identity: Identity, password: string, headers: Headers) {
  const fetchOptions = { headers };
  return 'email' in identity
    ? unwrap(await authClient.signIn.email({ email: identity.email, password, fetchOptions }))
    : unwrap(await authClient.signIn.phoneNumber({ phoneNumber: identity.phoneNumber, password, fetchOptions }));
}

export async function requestReset(email: string, headers: Headers) {
  return unwrap(await authClient.requestPasswordReset({ email, fetchOptions: { headers } }));
}

export async function resetPassword(token: string, newPassword: string) {
  return unwrap(await authClient.resetPassword({ token, newPassword }));
}
