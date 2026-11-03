/**
 * The member app in the member's language (OWNER-DECISIONS section 10). Every text is a key in
 * packages/shared/src/i18n (the `app` and `validation` catalogues); English is the source and the fallback for anything
 * not translated yet. The choice is shared with the website (`fh-visitor-preferences`, same origin) and saved on the
 * account, so emails follow it and it comes back on another device. Staff screens stay in English (owner, 3 Nov 2026).
 */
import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  DEFAULT_LANGUAGE,
  formatDate,
  isOfferedLanguage,
  issueText,
  textFor,
  type Catalogues,
  type OfferedLanguage,
  type TextKey,
  type TextVars,
} from '@fh/shared';
import enApp from '@fh/shared/i18n/en/app.json';
import enShared from '@fh/shared/i18n/en/shared.json';
import enValidation from '@fh/shared/i18n/en/validation.json';
import siApp from '@fh/shared/i18n/si/app.json';
import siShared from '@fh/shared/i18n/si/shared.json';
import siValidation from '@fh/shared/i18n/si/validation.json';

const catalogues: Catalogues = { en: { ...enApp, ...enValidation, ...enShared }, si: { ...siApp, ...siValidation, ...siShared } };

export type AppTextKey = TextKey<typeof enApp> | TextKey<typeof enValidation>;
export type Translate = (key: AppTextKey, vars?: TextVars) => string;

/** The website's language and country choice (apps/website welcome.js), read and written here too. */
const PREFERENCES = 'fh-visitor-preferences';

function storedLanguage(): OfferedLanguage | null {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFERENCES) ?? 'null') as { language?: unknown } | null;
    return isOfferedLanguage(saved?.language) ? saved.language : null;
  } catch {
    return null;
  }
}

function storeLanguage(language: OfferedLanguage) {
  try {
    const saved = (JSON.parse(localStorage.getItem(PREFERENCES) ?? 'null') as Record<string, unknown> | null) ?? {};
    localStorage.setItem(PREFERENCES, JSON.stringify({ ...saved, language }));
  } catch {
    // Storage is optional: the choice still holds for this visit.
  }
}

/** A link from the website's Sinhala pages (?lang=si), the saved choice, or the browser's own language. */
function firstLanguage(): OfferedLanguage {
  const asked = new URLSearchParams(window.location.search).get('lang');
  if (isOfferedLanguage(asked)) {
    storeLanguage(asked);
    return asked;
  }
  const browser = navigator.languages?.some((tag) => tag.toLowerCase().startsWith('si')) ? 'si' : DEFAULT_LANGUAGE;
  return storedLanguage() ?? browser;
}

let current: OfferedLanguage = firstLanguage();

/** The language on screen now: every API request asks for its answers in it (lib/api.ts, lib/auth-client.ts). */
export const currentLanguage = () => current;

/** A date on the Sri Lanka clock in the language on screen (lib/format.ts). */
export const dateNow = (value: string | Date, kind: 'day' | 'when') => formatDate(catalogues, current, value, kind);

/** Any text in a given language, for lists built per language (country names). */
export const textIn = (language: OfferedLanguage | 'ta', key: AppTextKey) => textFor(catalogues, language, key);

/** Whether a key exists (for stored values that may or may not be one of our suggestions). */
export const hasText = (key: string) => Object.hasOwn(catalogues.en ?? {}, key);

/** English whatever is on screen: the staff screens' fixed words (EnglishOnly). */
export const englishText: Translate = (key, vars) => textFor(catalogues, 'en', key, vars);

/** Text for code outside React, such as errors thrown by plain modules: in the language on screen now. */
export const say: Translate = (key, vars) => textFor(catalogues, current, key, vars);

/** A validation problem from the shared Zod schemas, in the language on screen. */
export const issueMessage = (issue: Parameters<typeof issueText>[0]) => {
  const ref = issueText(issue);
  return textFor(catalogues, current, ref.key, ref.vars);
};

type I18n = {
  language: OfferedLanguage;
  t: Translate;
  /** A text with marked words, <link>like this</link>, each rendered by the function of the same name. */
  rich: (key: AppTextKey, parts: Record<string, (words: ReactNode) => ReactNode>, vars?: TextVars) => ReactNode;
  setLanguage: (language: OfferedLanguage) => void;
};

const I18nContext = createContext<I18n | null>(null);

function build(language: OfferedLanguage, setLanguage: (language: OfferedLanguage) => void): I18n {
  const t: Translate = (key, vars) => textFor(catalogues, language, key, vars);
  const rich: I18n['rich'] = (key, parts, vars) => {
    const pieces: ReactNode[] = [];
    let last = 0;
    const template = t(key, vars);
    for (const match of template.matchAll(/<(\w+)>([\s\S]*?)<\/\1>/g)) {
      pieces.push(template.slice(last, match.index));
      const part = parts[match[1]!];
      pieces.push(<Fragment key={match.index}>{part ? part(match[2]) : match[2]}</Fragment>);
      last = match.index! + match[0].length;
    }
    pieces.push(template.slice(last));
    return pieces;
  };
  return { language, t, rich, setLanguage };
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setState] = useState<OfferedLanguage>(current);
  const setLanguage = useCallback((next: OfferedLanguage) => {
    current = next;
    storeLanguage(next);
    setState(next);
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  const value = useMemo(() => build(language, setLanguage), [language, setLanguage]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Staff screens: English whatever the visitor chose, without changing their saved choice. */
export function EnglishOnly({ children }: { children: ReactNode }) {
  const outer = useContext(I18nContext);
  // Set while rendering, so the staff screens' first requests already ask for English.
  const [previous] = useState(() => {
    const before = current;
    current = 'en';
    return before;
  });
  useEffect(() => {
    current = 'en';
    document.documentElement.lang = 'en';
    return () => {
      current = previous;
      document.documentElement.lang = previous;
    };
  }, [previous]);
  const value = useMemo(() => build('en', outer?.setLanguage ?? (() => {})), [outer?.setLanguage]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n needs I18nProvider');
  return value;
}

/**
 * Keeps the account and the screen in one language once the account is known (signing in). A choice made on this
 * device (the switch, the website's dialog, a Sinhala link) wins and is saved to the account, so emails follow it; a
 * device where nobody has chosen yet takes the account's language, so it comes back on a new phone.
 */
export function useAccountLanguage(saved: OfferedLanguage | null | undefined, saveToAccount: (language: OfferedLanguage) => void) {
  const { language, setLanguage } = useI18n();
  const seen = useRef<OfferedLanguage | null | undefined>(undefined);
  useEffect(() => {
    if (saved === seen.current) return;
    seen.current = saved;
    if (!saved) return;
    const chosenHere = storedLanguage();
    if (chosenHere && chosenHere !== saved) saveToAccount(chosenHere);
    else if (!chosenHere && saved !== language) setLanguage(saved);
  }, [saved, language, setLanguage, saveToAccount]);
}
