import { loginCodeSchema, requestCodeSchema, type LoginChannel, type RequestCodeInput } from '@fh/shared';
import { authClient } from '@/lib/auth-client';
import { env } from '@/lib/env';
import { issueMessage, say, type AppTextKey } from '@/lib/i18n';

/**
 * Passwordless sign-in / sign-up with a one-time code (D2: email or SMS, member's choice).
 * Better-Auth on the API generates, rate-limits and checks the code; the API sends it by
 * Resend (email) or the SMS adapter. The screens using this land in Stage 2.
 */
export function enabledChannels(): LoginChannel[] {
  return [
    ...(env.loginEmailEnabled ? (['email'] as const) : []),
    ...(env.loginSmsEnabled ? (['sms'] as const) : []),
  ];
}

/**
 * Better-Auth's own error codes, in words people understand and in the language on screen. Our own refusals (a banned
 * address, paused sign-ups, too many codes) arrive already in that language (the API's text.ts).
 */
const MESSAGES: Record<string, AppTextKey> = {
  INVALID_OTP: 'signIn.error.invalidCode',
  OTP_EXPIRED: 'signIn.error.expired',
  TOO_MANY_ATTEMPTS: 'signIn.error.tooManyAttempts',
  TOO_MANY_REQUESTS: 'signIn.error.tooManyRequests',
  CAPTCHA_REQUIRED: 'signIn.error.captchaRequired',
  CAPTCHA_FAILED: 'signIn.error.captchaFailed',
};
const OWN_CODES = new Set(['ADDRESS_BANNED', 'SIGNUPS_PAUSED', 'CODES_PER_ADDRESS']);

/** A Better-Auth error in words people understand, in the language on screen. */
export function authErrorMessage(error: { message?: string; code?: string; status?: number }): string {
  const { code, status, message } = error;
  const known = (code && MESSAGES[code]) || (status === 429 && !OWN_CODES.has(code ?? '') ? MESSAGES.TOO_MANY_REQUESTS : undefined);
  if (known) return say(known);
  return code && OWN_CODES.has(code) && message ? message : say('common.somethingWrong');
}

function unwrap(result: { error: { message?: string; code?: string; status?: number } | null }) {
  if (result.error) throw new Error(authErrorMessage(result.error));
}

/** A value checked with a shared schema; a problem becomes an error people can read, in the language on screen. */
function checked<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: unknown[] } } }, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error(issueMessage(result.error.issues[0] as Parameters<typeof issueMessage>[0]));
  return result.data;
}

/** `headers`: the Turnstile token (components/turnstile.tsx), when the bot check is on. */
export async function requestLoginCode(input: RequestCodeInput, headers?: Record<string, string>): Promise<void> {
  const target = checked(requestCodeSchema, input);
  if (!enabledChannels().includes(target.channel)) throw new Error(say('signIn.error.channelUnavailable'));
  const fetchOptions = { headers };
  if (target.channel === 'email') {
    unwrap(await authClient.emailOtp.sendVerificationOtp({ email: target.email, type: 'sign-in', fetchOptions }));
  } else {
    unwrap(await authClient.phoneNumber.sendOtp({ phoneNumber: target.phone, fetchOptions }));
  }
}

export async function verifyLoginCode(input: RequestCodeInput, code: string): Promise<void> {
  const target = checked(requestCodeSchema, input);
  const otp = checked(loginCodeSchema, code);
  if (target.channel === 'email') {
    unwrap(await authClient.signIn.emailOtp({ email: target.email, otp }));
  } else {
    unwrap(await authClient.phoneNumber.verify({ phoneNumber: target.phone, code: otp }));
  }
}
