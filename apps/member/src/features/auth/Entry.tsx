/**
 * The demo's account entry (product/app/matrimony/account-entry.ts, SCREEN-022 to 024 and 026): its own page,
 * .m-app.ma-entry, with the header (.ma-header), the panel (.ma-panel) and the supporting column (.ma-info).
 *
 * The first visit asks for language and country (SCREEN-022). That choice is a preference only (decision B2c): it is
 * kept in this browser with the website's own choice (fh-visitor-preferences, apps/website welcome.js), sets the
 * language on screen, and changes nothing about billing or a profile. Someone who already chose on the website goes
 * straight to sign-in.
 */
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Moon, Sun } from 'lucide-react';
import { LANGUAGE_NAMES } from '@fh/shared';
import { CountryCombobox } from '@/components/form/country-combobox';
import { SupportFooter } from '@/components/layout';
import { useToastRoot } from '@/components/toast-host';
import { useCountries } from '@/features/profile/options';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

const PREFERENCES = 'fh-visitor-preferences';

type Preferences = { language?: string; country?: string };

export function readPreferences(): Preferences {
  try {
    return (JSON.parse(localStorage.getItem(PREFERENCES) ?? 'null') as Preferences | null) ?? {};
  } catch {
    return {};
  }
}

function savePreferences(changes: Preferences): void {
  try {
    localStorage.setItem(PREFERENCES, JSON.stringify({ ...readPreferences(), ...changes }));
  } catch {
    // Storage can be blocked (private windows): the choice still applies to this visit.
  }
}

/** Arriving from the website's "Join now" (it opens /app/?lang=…): the language and country step comes first. */
export const fromJoin = () => new URLSearchParams(window.location.search).has('lang');

/**
 * Whether the language and country step is done: this browser has a country on record (from the website's welcome
 * dialog or this step), and the visitor did not just arrive from "Join now", where the step always comes first, with
 * the earlier choice filled in. Done, the step drops ?lang from the address, so a reload opens the form.
 */
export function useLocaleChosen(): [boolean, () => void] {
  const [chosen, setChosen] = useState(() => Boolean(readPreferences().country) && !fromJoin());
  return [
    chosen,
    () => {
      const url = new URL(window.location.href);
      url.searchParams.delete('lang');
      history.replaceState(history.state, '', url.pathname + url.search + url.hash);
      setChosen(true);
    },
  ];
}

/** The entry page: header, the panel with `children`, and (optionally) the supporting column. */
export function EntryShell({ children, aside = 'full' }: { children: ReactNode; aside?: 'full' | 'title' | 'none' }) {
  const { theme, toggleTheme } = useTheme();
  const { t, language, setLanguage } = useI18n();
  const other = language === 'en' ? 'si' : 'en';
  const root = useRef<HTMLDivElement>(null);
  useToastRoot(root);
  return (
    <div className="m-app ma-entry" data-theme={theme} ref={root}>
      <a href="#main" className="m-skip-link">
        {t('layout.skip')}
      </a>
      <header className="ma-header">
        <a className="ma-brand" href={language === 'si' ? '/si/' : '/'}>
          <span aria-hidden="true">♥ </span>Favorite Hearts
        </a>
        <div>
          <span>{t('entry.matrimony')}</span>
          {/* Not in the demo's header: the other language, as on every app page (the demo asks only on its first step). */}
          <button
            type="button"
            className="m-text"
            onClick={() => {
              setLanguage(other);
              savePreferences({ language: other });
            }}
          >
            <span lang={other}>{LANGUAGE_NAMES[other]}</span>
            <span className="sr-only">{t(`layout.languageTo.${other}`)}</span>
          </button>
          <button type="button" className="ma-theme" onClick={toggleTheme} aria-label={theme === 'dark' ? t('layout.lightTheme') : t('layout.darkTheme')}>
            {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          </button>
        </div>
      </header>
      <main id="main" className="ma-layout">
        <section className="ma-panel">{children}</section>
        {aside === 'full' ? <EntryAside /> : aside === 'title' ? <EntryAside titleOnly /> : null}
      </main>
      <SupportFooter />
    </div>
  );
}

/**
 * The supporting column, as in the demo: kicker, the serif promise, the lead, the four steps and the note. On the
 * language step the demo shows only the promise.
 */
function EntryAside({ titleOnly = false }: { titleOnly?: boolean }) {
  const { t } = useI18n();
  const title = (
    <h2>
      {t('home.aside.title1')}
      <br />
      {t('home.aside.title2')}
    </h2>
  );
  if (titleOnly) return <aside className="ma-info">{title}</aside>;
  return (
    <aside className="ma-info">
      <span className="m-kicker uppercase">{t('home.aside.kicker')}</span>
      {title}
      <p>{t('home.aside.lead')}</p>
      <ol className="ma-steps" aria-label={t('home.aside.steps')}>
        {(['1', '2', '3', '4'] as const).map((step) => (
          <li key={step}>{t(`home.aside.step.${step}`)}</li>
        ))}
      </ol>
      <p className="ma-note">{t('home.aside.note')}</p>
    </aside>
  );
}

/** SCREEN-022: language as the demo's toggle buttons, country as a searchable list (CountryCombobox). */
export function LocaleStep({ onDone }: { onDone: () => void }) {
  const { t, language, setLanguage } = useI18n();
  const countries = useCountries();
  const [country, setCountry] = useState(() => readPreferences().country ?? 'LK');
  const [error, setError] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!countries.some((option) => option.code === country)) return setError(t('entry.locale.choose'));
    savePreferences({ language, country });
    onDone();
  };
  return (
    <>
      <h1>{t('entry.locale.title')}</h1>
      <form onSubmit={submit} noValidate>
        <div className="m-field" role="group" aria-labelledby="entry-language">
          <span id="entry-language">
            <span aria-hidden="true">🌐 </span>
            {t('entry.locale.language')}
            <span aria-hidden="true"> *</span>
          </span>
          <div className="fh-language-buttons">
            {(['en', 'si'] as const).map((code) => (
              <button
                key={code}
                type="button"
                lang={code}
                aria-pressed={language === code}
                onClick={() => {
                  setLanguage(code);
                  savePreferences({ language: code });
                }}
              >
                {LANGUAGE_NAMES[code]}
              </button>
            ))}
          </div>
        </div>
        <div className="m-field">
          <span>
            <label htmlFor="entry-country">
              <span aria-hidden="true">📍 </span>
              {t('entry.locale.country')}
              <span aria-hidden="true"> *</span>
            </label>
          </span>
          <CountryCombobox
            id="entry-country"
            countries={countries}
            value={country}
            onChange={(code) => {
              setCountry(code);
              setError('');
            }}
            invalid={Boolean(error)}
            describedBy={error ? 'entry-country-error' : undefined}
            placeholder={t('entry.locale.search')}
          />
        </div>
        <button type="submit" className="m-btn">
          {t('common.continue')}
        </button>
        <p className="m-error" role="alert" id="entry-country-error">
          {error}
        </p>
        <details className="fh-native-help">
          <summary aria-label={t('entry.locale.helpLabel')}>ⓘ</summary>
          <p>{t('entry.locale.help')}</p>
        </details>
      </form>
    </>
  );
}
