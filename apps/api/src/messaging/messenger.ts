/**
 * Outgoing email and SMS, behind one interface so tests can capture messages instead of sending.
 * Production: Resend for email (email.ts) and the SMS adapter (sms.ts).
 */
export type EmailMessage = { to: string; subject: string; html: string; text: string; idempotencyKey?: string };
export type SmsMessage = { to: string; body: string };

export interface Messenger {
  /** False until an SMS provider is configured: callers must say so, never pretend (D6). */
  readonly smsEnabled: boolean;
  sendEmail(message: EmailMessage): Promise<void>;
  sendSms(message: SmsMessage): Promise<void>;
}

/** Placeholder addresses created for phone-only accounts must never be emailed. */
export const PHONE_ONLY_EMAIL_DOMAIN = 'phone.favoritehearts.invalid';

export class SmsUnavailableError extends Error {
  constructor() {
    super('SMS is not available yet. Please use email.');
  }
}
