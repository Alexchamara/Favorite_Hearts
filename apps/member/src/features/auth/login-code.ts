import { loginCodeSchema, requestCodeSchema, type LoginChannel, type RequestCodeInput } from '@fh/shared';
import { authClient } from '@/lib/auth-client';
import { env } from '@/lib/env';

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

function unwrap(result: { error: { message?: string } | null }) {
  if (result.error) throw new Error(result.error.message || 'Something went wrong. Please try again.');
}

export async function requestLoginCode(input: RequestCodeInput): Promise<void> {
  const target = requestCodeSchema.parse(input);
  if (!enabledChannels().includes(target.channel)) throw new Error('This sign-in option is not available yet.');
  if (target.channel === 'email') {
    unwrap(await authClient.emailOtp.sendVerificationOtp({ email: target.email, type: 'sign-in' }));
  } else {
    unwrap(await authClient.phoneNumber.sendOtp({ phoneNumber: target.phone }));
  }
}

export async function verifyLoginCode(input: RequestCodeInput, code: string): Promise<void> {
  const target = requestCodeSchema.parse(input);
  const otp = loginCodeSchema.parse(code);
  if (target.channel === 'email') {
    unwrap(await authClient.signIn.emailOtp({ email: target.email, otp }));
  } else {
    unwrap(await authClient.phoneNumber.verify({ phoneNumber: target.phone, code: otp }));
  }
}
