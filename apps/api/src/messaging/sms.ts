// SMS delivery behind a small adapter so the provider can be chosen later without
// touching auth. To add one: implement SmsSender, register it below, add its name to
// SMS_PROVIDERS in @fh/shared and its credentials to apps/api/.env.example.
import type { SmsProvider } from '@fh/shared';
import { env } from '../env.ts';
import { log } from '../lib/log.ts';

export type SmsMessage = { to: string; body: string };
type SmsSender = (message: SmsMessage) => Promise<void>;

export class SmsUnavailableError extends Error {
  constructor() {
    super('SMS sign-in is not available yet. Please use email.');
  }
}

const providers: Record<SmsProvider, SmsSender> = {
  /** Not configured yet: fail clearly instead of pretending the code was sent. */
  none: async () => {
    throw new SmsUnavailableError();
  },

  /** LOCAL DEVELOPMENT ONLY (env.ts refuses it elsewhere): prints to the console. */
  log: async ({ to, body }) => {
    console.log(`[sms:log] to=${to} body=${body}`);
  },

  // Real provider, when chosen, e.g.:
  // provider_name: async ({ to, body }) => {
  //   const res = await fetch('https://api.provider.example/send', { method: 'POST', ... });
  //   if (!res.ok) throw new Error('Could not send the SMS. Please try again shortly.');
  // },
};

export const smsEnabled = env.SMS_PROVIDER !== 'none';

export async function sendSms(message: SmsMessage): Promise<void> {
  try {
    await providers[env.SMS_PROVIDER](message);
  } catch (err) {
    if (!(err instanceof SmsUnavailableError)) log.error('sms.send_failed', { provider: env.SMS_PROVIDER });
    throw err;
  }
}
