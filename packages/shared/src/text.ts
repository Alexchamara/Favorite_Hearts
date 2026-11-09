/**
 * Languages and text (OWNER-DECISIONS section 10). Every text members see lives in the catalogues under
 * `src/i18n/<language>/<area>.json`, English being the source:
 *   app         the member app (staff screens stay in English, owner 3 Nov 2026)
 *   api         the API's messages, answered in the language the request asks for (Accept-Language)
 *   email       emails and text messages, sent in the member's saved language
 *   validation  form checks, shared by the app and the API
 *   shared      other words both use: month names and the order of a date
 * Sinhala is drafted by the developer and corrected by the owner's reviewer in the spreadsheet (`npm run text:export`,
 * `npm run text:import`). Tamil is prepared but hidden until it is fully translated.
 *
 * A text may hold {name} placeholders. Plural texts are stored as `key_one` and `key_other` and chosen with `count`.
 */
import { MAX_PAYMENT_PROOFS, RENEWAL_GRACE_DAYS, RENEWAL_WINDOW_DAYS } from './billing.ts';
import { DEFAULT_MANAGER_CAPACITY, DOCUMENT_RETENTION_DAYS, LOCALES, INVITATION_TTL_HOURS, MAX_PHOTOS, MAX_SOCIAL_LINKS } from './domain.ts';
import { CODE_LENGTH, CODE_TTL_SECONDS } from './login-channels.ts';
import { MAX_AGE, MAX_HEIGHT_CM, MIN_AGE, MIN_HEIGHT_CM } from './profile.ts';
import { REQUEST_COOLDOWN_DAYS, SHORTLIST_LIMIT } from './requests.ts';
import { RECENT_SIGN_IN_MINUTES, RETENTION_MONTHS } from './safety.ts';

/** Every language with a catalogue. */
export const LANGUAGES = ['en', 'si', 'ta'] as const;
export type Language = (typeof LANGUAGES)[number];
/** The languages people can choose: Tamil stays hidden. */
export const OFFERED_LANGUAGES = LOCALES;
export type OfferedLanguage = (typeof OFFERED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: OfferedLanguage = 'en';
/** Each language in its own script, as a language switch shows it. */
export const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', si: 'සිංහල', ta: 'தமிழ்' };

export const isOfferedLanguage = (value: unknown): value is OfferedLanguage =>
  typeof value === 'string' && (OFFERED_LANGUAGES as readonly string[]).includes(value);

/** The best offered language in an Accept-Language header ("si-LK,si;q=0.9,en;q=0.8" is Sinhala); English otherwise. */
export function languageFromHeader(header: string | null | undefined): OfferedLanguage {
  const ranked = (header ?? '')
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      return { language: tag.trim().toLowerCase().split('-')[0], weight: q ? Number(q.slice(2)) : 1, index };
    })
    .filter((entry) => entry.language && entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  const best = ranked.find((entry) => isOfferedLanguage(entry.language))?.language;
  return isOfferedLanguage(best) ? best : DEFAULT_LANGUAGE;
}

export type Catalogue = Readonly<Record<string, string>>;
export type Catalogues = Partial<Record<Language, Catalogue>>;
export type TextVars = Readonly<Record<string, string | number>>;
/** A text to show later, in whatever language the reader uses. */
export type TextRef = { key: string; vars?: TextVars };

/** Limits any text may name, so the words never drift from the rules: "Enter an age between {minAge} and {maxAge}." */
export const TEXT_CONSTANTS: TextVars = {
  minAge: MIN_AGE,
  maxAge: MAX_AGE,
  minHeightCm: MIN_HEIGHT_CM,
  maxHeightCm: MAX_HEIGHT_CM,
  codeLength: CODE_LENGTH,
  codeMinutes: Math.round(CODE_TTL_SECONDS / 60),
  maxPhotos: MAX_PHOTOS,
  maxSocialLinks: MAX_SOCIAL_LINKS,
  maxPaymentProofs: MAX_PAYMENT_PROOFS,
  managerCapacity: DEFAULT_MANAGER_CAPACITY,
  invitationHours: INVITATION_TTL_HOURS,
  requestCooldownDays: REQUEST_COOLDOWN_DAYS,
  shortlistLimit: SHORTLIST_LIMIT,
  renewalWindowDays: RENEWAL_WINDOW_DAYS,
  renewalGraceDays: RENEWAL_GRACE_DAYS,
  recentSignInMinutes: RECENT_SIGN_IN_MINUTES,
  retentionMonths: RETENTION_MONTHS,
  documentRetentionDays: DOCUMENT_RETENTION_DAYS,
  maxUploadMb: 5,
};

/** "Hello {name}" with { name: "Nimal" } is "Hello Nimal". A placeholder without a value stays as it is. */
export function fillText(template: string, vars?: TextVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

/** The placeholders in a text, for checking that a translation keeps them all. */
export const placeholdersOf = (template: string) => [...new Set([...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))].sort();

/** Plural keys are stored as `key_one`, `key_other` (and any other CLDR form a language needs). */
export const PLURAL_FORMS = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;
const pluralRules = new Map<string, Intl.PluralRules>();
function pluralForm(language: Language, count: number): string {
  if (!pluralRules.has(language)) pluralRules.set(language, new Intl.PluralRules(language));
  return pluralRules.get(language)!.select(count);
}

function pick(catalogue: Catalogue | undefined, language: Language, key: string, count: unknown): string | undefined {
  if (!catalogue) return undefined;
  if (typeof count === 'number') {
    const plural = catalogue[`${key}_${pluralForm(language, count)}`] ?? catalogue[`${key}_other`];
    if (plural !== undefined) return plural;
  }
  return catalogue[key];
}

/**
 * The text for `key` in `language`, falling back to English when it is not translated yet, and to the key itself when
 * even English has none (a mistake the type checks and tests catch).
 */
export function textFor(catalogues: Catalogues, language: Language, key: string, vars?: TextVars): string {
  const own = pick(catalogues[language], language, key, vars?.count);
  const template = own ?? pick(catalogues.en, 'en', key, vars?.count) ?? key;
  return fillText(template, vars ? { ...TEXT_CONSTANTS, ...vars } : TEXT_CONSTANTS);
}

/** The calendar and clock in Sri Lanka, read with English locale data, which every browser and server has. */
const sriLankaParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Colombo',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * A date on the Sri Lanka clock, in the reader's language: `day` is "3 December 2026", `when` "3 Dec 2026, 15:30",
 * `whenLong` "3 December 2026, 15:30". Month names and the order come from the `shared` catalogue (`date.*`), not from
 * the browser, so Sinhala reads the same everywhere and the reviewer chooses the words.
 */
export function formatDate(catalogues: Catalogues, language: Language, value: string | Date, kind: 'day' | 'when' | 'whenLong'): string {
  const parts = Object.fromEntries(sriLankaParts.formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  const month = Number(parts.month);
  return textFor(catalogues, language, `date.${kind}`, {
    day: Number(parts.day),
    year: parts.year!,
    month: textFor(catalogues, language, `date.month.${month}`),
    monthShort: textFor(catalogues, language, `date.monthShort.${month}`),
    time: `${parts.hour}:${parts.minute}`,
  });
}

/** Keys in a catalogue type, with plural keys reduced to their base (`left_one` and `left_other` are `left`). */
export type TextKey<C> = Extract<keyof C, string> extends infer K
  ? K extends `${infer Base}_${(typeof PLURAL_FORMS)[number]}`
    ? Base
    : K
  : never;

/** What a validation problem from Zod should say: the schema's own key, or one key per kind of problem. */
export function issueText(issue: {
  code: string;
  message: string;
  origin?: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
  format?: string;
}): TextRef {
  if (/^(validation|api)\.[\w.]+$/.test(issue.message)) return { key: issue.message };
  const limit = (value: number | bigint | undefined) => Number(value ?? 0);
  switch (issue.code) {
    case 'too_small':
      if (issue.origin === 'string') {
        return limit(issue.minimum) <= 1 ? { key: 'validation.required' } : { key: 'validation.tooShort', vars: { min: limit(issue.minimum) } };
      }
      if (issue.origin === 'array' || issue.origin === 'set') return { key: 'validation.tooFew', vars: { min: limit(issue.minimum) } };
      return { key: 'validation.tooLow', vars: { min: limit(issue.minimum) } };
    case 'too_big':
      if (issue.origin === 'string') return { key: 'validation.tooLong', vars: { max: limit(issue.maximum) } };
      if (issue.origin === 'array' || issue.origin === 'set') return { key: 'validation.tooMany', vars: { max: limit(issue.maximum) } };
      return { key: 'validation.tooHigh', vars: { max: limit(issue.maximum) } };
    case 'invalid_value':
      return { key: 'validation.chooseOption' };
    case 'invalid_format':
      return { key: issue.format === 'email' ? 'validation.email' : 'validation.invalid' };
    case 'invalid_type':
      return { key: 'validation.required' };
    default:
      return { key: 'validation.invalid' };
  }
}
