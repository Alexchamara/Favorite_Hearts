import { z } from 'zod';
import { normalizeEmail, normalizePhone } from './contact.ts';
import { LOCALES } from './domain.ts';
import { CODE_LENGTH } from './login-channels.ts';

/** Email, trimmed and lowercased. Same rule on client and server. */
export const emailSchema = z.string().transform((value, ctx) => {
  const email = normalizeEmail(value);
  if (!email) {
    ctx.addIssue({ code: 'custom', message: 'validation.email' });
    return z.NEVER;
  }
  return email;
});

/** Phone number normalised to E.164 (Sri Lankan local numbers accepted). */
export const phoneSchema = z.string().transform((value, ctx) => {
  const phone = normalizePhone(value);
  if (!phone) {
    ctx.addIssue({ code: 'custom', message: 'validation.phone' });
    return z.NEVER;
  }
  return phone;
});

export const loginCodeSchema = z
  .string()
  .transform((value) => value.replace(/\s/g, ''))
  .pipe(z.string().regex(new RegExp(`^\\d{${CODE_LENGTH}}$`), 'validation.code'));

/** The language a member chooses for the app and for emails (§10: English or Sinhala; Tamil hidden). */
export const languageChoiceSchema = z.object({ language: z.enum(LOCALES, { error: 'validation.chooseOption' }) }).strict();

export const requestCodeSchema = z.discriminatedUnion('channel', [
  z.object({ channel: z.literal('email'), email: emailSchema }),
  z.object({ channel: z.literal('sms'), phone: phoneSchema }),
]);
export type RequestCodeInput = z.input<typeof requestCodeSchema>;
