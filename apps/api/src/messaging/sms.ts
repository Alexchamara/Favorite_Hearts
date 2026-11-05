// SMS delivery behind a small adapter so the provider can be chosen without touching auth. To add one: implement
// SmsSender, register it below, add its name to SMS_PROVIDERS in @fh/shared and its settings to apps/api/.env.example.
import type { SmsProvider } from '@fh/shared';
import { log } from '../lib/log.ts';
import { SmsUnavailableError, type SmsMessage } from './messenger.ts';

type SmsSender = (message: SmsMessage) => Promise<void>;

/** What a provider needs; only the chosen provider's values are used. */
export type SmsSettings = {
  senderId: string;
  smslenz?: { userId: string; apiKey: string; baseUrl: string };
  /** Tests pass a fake; otherwise the global fetch. */
  fetch?: typeof fetch;
};

/** Thrown when the provider refused or could not be reached; the member sees a "try again shortly" message. */
export class SmsSendError extends Error {
  constructor(readonly detail: string) {
    super('Could not send the SMS. Please try again shortly.');
  }
}

/**
 * SMSlenz.lk (https://smslenz.lk/developers/api): POST {base}/send-sms with user_id, api_key, sender_id, contact
 * (+94… as we store numbers) and message; it answers { success: true, … } when sent. Anything else is a failure.
 */
function smslenz(settings: SmsSettings): SmsSender {
  const account = settings.smslenz;
  const request = settings.fetch ?? fetch;
  return async ({ to, body }) => {
    if (!account) throw new SmsUnavailableError();
    let res: Response;
    try {
      res = await request(`${account.baseUrl.replace(/\/$/, '')}/send-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ user_id: account.userId, api_key: account.apiKey, sender_id: settings.senderId, contact: to, message: body }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new SmsSendError(err instanceof Error ? err.name : 'network');
    }
    const answer = (await res.json().catch(() => null)) as { success?: boolean; message?: string } | null;
    if (!res.ok || answer?.success !== true) throw new SmsSendError(`HTTP ${res.status}${answer?.message ? `: ${answer.message}` : ''}`);
  };
}

export function createSmsSender(provider: SmsProvider, settings: SmsSettings): SmsSender {
  const providers: Record<SmsProvider, SmsSender> = {
    /** Not configured yet: fail clearly instead of pretending the code was sent. */
    none: async () => {
      throw new SmsUnavailableError();
    },
    /** LOCAL DEVELOPMENT ONLY (env.ts refuses it elsewhere): prints to the console. */
    log: async ({ to, body }) => {
      console.log(`[sms:log] to=${to} body=${body}`);
    },
    smslenz: smslenz(settings),
  };
  return async (message) => {
    try {
      await providers[provider](message);
    } catch (err) {
      // Never the number, the text or the key: only what went wrong.
      if (!(err instanceof SmsUnavailableError)) log.error('sms.send_failed', { provider, detail: err instanceof SmsSendError ? err.detail : 'unexpected' });
      throw err;
    }
  };
}
