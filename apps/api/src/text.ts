/**
 * The API's words in the reader's language (OWNER-DECISIONS section 10; the catalogues and their rules are described in
 * packages/shared/src/text.ts). An error carries a key, and the error handler answers in the language the request
 * asks for (Accept-Language, which the member app always sends). Emails and text messages use the language the member
 * saved, or the request's language when there is no account yet. Tamil is hidden, so only English and Sinhala load.
 */
import type { Context } from 'hono';
import {
  formatDate,
  languageFromHeader,
  textFor,
  type Catalogues,
  type Language,
  type OfferedLanguage,
  type TextKey,
  type TextRef,
  type TextVars,
} from '@fh/shared';
import enApi from '@fh/shared/i18n/en/api.json' with { type: 'json' };
import enEmail from '@fh/shared/i18n/en/email.json' with { type: 'json' };
import enShared from '@fh/shared/i18n/en/shared.json' with { type: 'json' };
import enValidation from '@fh/shared/i18n/en/validation.json' with { type: 'json' };
import siApi from '@fh/shared/i18n/si/api.json' with { type: 'json' };
import siEmail from '@fh/shared/i18n/si/email.json' with { type: 'json' };
import siShared from '@fh/shared/i18n/si/shared.json' with { type: 'json' };
import siValidation from '@fh/shared/i18n/si/validation.json' with { type: 'json' };

const catalogues: Catalogues = {
  en: { ...enApi, ...enEmail, ...enValidation, ...enShared },
  si: { ...siApi, ...siEmail, ...siValidation, ...siShared },
};

/** Keys the API may answer with: its own messages and the shared form checks. */
export type ApiTextKey = TextKey<typeof enApi> | TextKey<typeof enValidation>;
export type EmailTextKey = TextKey<typeof enEmail>;
/** A message as code writes it: a key, or a key with values for its placeholders. */
export type Say = ApiTextKey | { key: ApiTextKey; vars?: TextVars };

export const toRef = (say: Say): TextRef => (typeof say === 'string' ? { key: say } : say);

export function text(language: Language, key: ApiTextKey | EmailTextKey, vars?: TextVars): string {
  return textFor(catalogues, language, key, vars);
}

export const render = (language: Language, ref: TextRef) => textFor(catalogues, language, ref.key, ref.vars);

/** A date on the Sri Lanka clock in `language` (shared catalogue: month names and order). */
export const dateIn = (language: Language, value: string | Date, kind: 'day' | 'when' | 'whenLong') =>
  formatDate(catalogues, language, value, kind);

/** The language a request asks for (Accept-Language); English when it names none we offer. */
export const requestLanguage = (c: Context): OfferedLanguage => languageFromHeader(c.req.header('accept-language'));
export const headersLanguage = (headers: Headers | undefined | null): OfferedLanguage =>
  languageFromHeader(headers?.get('accept-language'));
