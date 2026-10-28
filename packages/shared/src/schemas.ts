import { z } from 'zod';
import { normalizeEmail, normalizePhone } from './contact.ts';
import { CODE_LENGTH } from './login-channels.ts';

/** Email, trimmed and lowercased. Same rule on client and server. */
export const emailSchema = z.string().transform((value, ctx) => {
  const email = normalizeEmail(value);
  if (!email) {
    ctx.addIssue({ code: 'custom', message: 'Enter a valid email address.' });
    return z.NEVER;
  }
  return email;
});

/** Phone number normalised to E.164 (Sri Lankan local numbers accepted). */
export const phoneSchema = z.string().transform((value, ctx) => {
  const phone = normalizePhone(value);
  if (!phone) {
    ctx.addIssue({ code: 'custom', message: 'Enter a valid phone number with country code.' });
    return z.NEVER;
  }
  return phone;
});

export const loginCodeSchema = z
  .string()
  .transform((value) => value.replace(/\s/g, ''))
  .pipe(z.string().regex(new RegExp(`^\\d{${CODE_LENGTH}}$`), `Enter the ${CODE_LENGTH}-digit code.`));

export const requestCodeSchema = z.discriminatedUnion('channel', [
  z.object({ channel: z.literal('email'), email: emailSchema }),
  z.object({ channel: z.literal('sms'), phone: phoneSchema }),
]);
export type RequestCodeInput = z.input<typeof requestCodeSchema>;
