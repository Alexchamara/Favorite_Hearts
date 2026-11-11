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

/**
 * Member sign-up (owner decision, 11 Nov 2026): the account holder's name, one email address or phone number, a
 * password (checked by passwordProblem, password.ts) and the consent tick. The address is confirmed with a code before
 * the account exists.
 */
export const memberSignUpSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    email: emailSchema.optional(),
    phoneNumber: phoneSchema.optional(),
    password: z.string().min(1),
    consent: z.literal(true, { error: 'validation.signUpConsent' }),
  })
  .strict()
  .refine((value) => Boolean(value.email) !== Boolean(value.phoneNumber), { message: 'validation.emailOrPhone', path: ['email'] });
export type MemberSignUpInput = z.input<typeof memberSignUpSchema>;

/** The code that confirms a sign-up, for the same email address or phone number. */
export const memberSignUpCodeSchema = z
  .object({ email: emailSchema.optional(), phoneNumber: phoneSchema.optional(), code: loginCodeSchema })
  .strict()
  .refine((value) => Boolean(value.email) !== Boolean(value.phoneNumber), { message: 'validation.emailOrPhone', path: ['email'] });

