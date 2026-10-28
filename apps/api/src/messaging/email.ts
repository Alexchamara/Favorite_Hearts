// Email delivery through Resend's HTTP API (no SDK needed).
import { env } from '../env.ts';
import { log } from '../lib/log.ts';

export type EmailMessage = { to: string; subject: string; html: string; text: string; idempotencyKey?: string };

/** Placeholder addresses created for phone-only accounts must never be emailed. */
export const PHONE_ONLY_EMAIL_DOMAIN = 'phone.favoritehearts.invalid';

export async function sendEmail(message: EmailMessage): Promise<void> {
  if (message.to.endsWith(`@${PHONE_ONLY_EMAIL_DOMAIN}`)) {
    throw new Error('This account has no email address.');
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      ...(message.idempotencyKey ? { 'Idempotency-Key': message.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(env.EMAIL_REPLY_TO ? { reply_to: env.EMAIL_REPLY_TO } : {}),
    }),
  });
  if (!res.ok) {
    // 403 from Resend while using onboarding@resend.dev = recipient is not the Resend account owner.
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    log.error('email.send_failed', { provider: 'resend', status: res.status, detail });
    throw new Error('Could not send the email. Please try again shortly.');
  }
}
