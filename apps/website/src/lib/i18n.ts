/**
 * The website in English and Sinhala (OWNER-DECISIONS section 10). Every page is built twice from one file in
 * `pages/[...lang]/`: at its English address and under `/si/`. Its words are keys in the `website` catalogue
 * (packages/shared/src/i18n, English the source); country and month names are the app's (`country.XX`, `date.*`).
 * A Sinhala text not written yet falls back to English. Tamil stays hidden.
 */
import { textFor, type Catalogues, type TextKey, type TextVars } from '@fh/shared';
import enApp from '@fh/shared/i18n/en/app.json';
import enShared from '@fh/shared/i18n/en/shared.json';
import enWeb from '@fh/shared/i18n/en/website.json';
import siApp from '@fh/shared/i18n/si/app.json';
import siShared from '@fh/shared/i18n/si/shared.json';
import siWeb from '@fh/shared/i18n/si/website.json';
import countryList from '../../../member/src/features/profile/countries.json';

const catalogues: Catalogues = {
  en: { ...enApp, ...enShared, ...enWeb },
  si: { ...siApp, ...siShared, ...siWeb },
};

export const LANGS = ['en', 'si'] as const;
export type Lang = (typeof LANGS)[number];
export type WebKey = TextKey<typeof enWeb>;

/** Each page's getStaticPaths: the English address and the /si/ one. */
export const languagePaths = () => [{ params: { lang: undefined } }, { params: { lang: 'si' } }];
export const langOf = (param: string | undefined): Lang => (param === 'si' ? 'si' : 'en');

/** "/pricing/" in a language: "/pricing/" or "/si/pricing/". */
export const pathIn = (lang: Lang, route: string) => (lang === 'en' ? route : `/si${route}`);
/** The route of a page without its language: "/si/pricing/" → "/pricing/". */
export const routeOf = (pathname: string) => pathname.replace(/^\/si(?=\/|$)/, '') || '/';

const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Tags a text may use without being given: bold, emphasis and a line break. */
const PLAIN_TAGS = new Set(['strong', 'em', 'br']);

export function texts(lang: Lang) {
  const t = (key: WebKey, vars?: TextVars) => textFor(catalogues, lang, key, vars);
  /**
   * A text as HTML for set:html. Its words are escaped; marked words <name>…</name> become the element `tags[name]`
   * opens (e.g. { link: '<a href="/terms/">' }), a mark <name/> becomes the whole element `tags[name]`, and <strong>,
   * <em> and <br> stay as they are.
   */
  const html = (key: WebKey, tags: Record<string, string> = {}, vars?: TextVars) =>
    escape(t(key, vars)).replace(/&lt;(\/?)(\w+)(\/?)&gt;/g, (whole, closing: string, name: string, alone: string) => {
      const open = tags[name];
      if (open && alone) return open;
      if (open) return closing ? `</${/^<(\w+)/.exec(open)?.[1] ?? 'span'}>` : open;
      return PLAIN_TAGS.has(name) && !alone ? `<${closing}${name}>` : name === 'br' ? '<br>' : whole;
    });
  const path = (route: string) => pathIn(lang, route);
  /** "October 2026" or "2026 ඔක්තෝබර්". */
  const monthYear = (month: number, year: number) =>
    t('web.common.monthYear', { month: textFor(catalogues, lang, `date.month.${month}`), year });
  /** "31 October 2026" or "2026 ඔක්තෝබර් 31". */
  const date = (day: number, month: number, year: number) =>
    t('web.common.date', { day, month: textFor(catalogues, lang, `date.month.${month}`), year });
  /** Countries in this language, sorted by their names in it. */
  const countries = () =>
    lang === 'en'
      ? countryList
      : countryList
          .map(({ code }) => ({ code, name: textFor(catalogues, lang, `country.${code}`) }))
          .sort((a, b) => a.name.localeCompare(b.name, lang));
  /** Words the page's scripts need (keys under web.js.), handed over in one JSON block (Dialogs.astro). */
  const scriptTexts = () =>
    Object.fromEntries(Object.keys(enWeb).filter((key) => key.startsWith('web.js.')).map((key) => [key, textFor(catalogues, lang, key)]));
  return { lang, other: (lang === 'en' ? 'si' : 'en') as Lang, t, html, path, monthYear, date, countries, scriptTexts };
}

export type Texts = ReturnType<typeof texts>;
