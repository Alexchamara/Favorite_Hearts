// Email delivery through Resend's HTTP API (no SDK needed).
import { log } from '../lib/log.ts';
import { PHONE_ONLY_EMAIL_DOMAIN, type EmailMessage } from './messenger.ts';

export type ResendSettings = { apiKey: string; from: string; replyTo?: string };

export function createResendSender(settings: ResendSettings) {
  return async function sendEmail(message: EmailMessage): Promise<void> {
    if (message.to.endsWith(`@${PHONE_ONLY_EMAIL_DOMAIN}`)) {
      throw new Error('This account has no email address.');
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json',
        ...(message.idempotencyKey ? { 'Idempotency-Key': message.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: settings.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(settings.replyTo ? { reply_to: settings.replyTo } : {}),
      }),
    });
    if (!res.ok) {
      // 403 from Resend while using onboarding@resend.dev = recipient is not the Resend account owner.
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      log.error('email.send_failed', { provider: 'resend', status: res.status, detail });
      throw new Error('Could not send the email. Please try again shortly.');
    }
  };
}
