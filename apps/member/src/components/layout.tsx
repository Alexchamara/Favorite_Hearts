/**
 * The frame around every member screen, in the original demo's markup and classes (docs/UI-PARITY.md, phase ui-3):
 * .m-app > header.m-header (brand, More button), nav.m-primary-nav.m-floating-nav (the dock), main.m-main and
 * footer.m-footer, with the More sheet (.m-app.m-more-sheet) for language, theme, verification, help and sign out.
 * Their look comes from the demo's stylesheets (styles/source/). Signed-out visitors and staff get the header without
 * the dock or the More sheet.
 */
import { useCallback, type ReactNode } from 'react';
import {
  ArrowUpRight,
  Bookmark,
  CircleHelp,
  Compass,
  FileText,
  Heart,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  Moon,
  Phone,
  ShieldCheck,
  Sun,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router';
import { LANGUAGE_NAMES } from '@fh/shared';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { put } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { useAccountLanguage, useI18n, type AppTextKey } from '@/lib/i18n';
import { keys, resetSession, useMe, useMyCases } from '@/lib/queries';
import { queryClient } from '@/lib/query-client';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import site from '../../../website/site.config.json';

// The official support channels are the website's (apps/website/site.config.json; owner, 30 Oct 2026), so the app and
// the website always show the same ones (audit X06). The one number takes WhatsApp messages and calls.
const phoneDigits = site.telephone.replace(/\D/g, '');
const phoneLabel = site.telephone.startsWith('+94')
  ? `0${phoneDigits.slice(2)}`.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1 $2 $3')
  : site.telephone;

/**
 * How wide a screen's content runs. The demo's .m-main has one width; screens not yet rebuilt on the demo's markup
 * keep a narrow column inside it so their forms stay readable (removed screen by screen, phases ui-4 to ui-9).
 */
const widths = { narrow: 'mx-auto w-full max-w-3xl', wide: '' } as const;

/** `onboarding`: the demo's setup wizard brings its own <main class="m-onboarding">, and the dock is hidden meanwhile. */
export function AppShell({ children, home = '/', width = 'narrow', onboarding = false }: { children: ReactNode; home?: string; width?: keyof typeof widths; onboarding?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const me = useMe();
  const navigate = useNavigate();
  const member = Boolean(me.data && !me.data.staffRole && me.data.name);
  const showSupport = home !== '/staff' && !me.data?.staffRole;
  const { t, language, setLanguage } = useI18n();
  // The account's language follows the member's choice, so emails do too; staff screens stay in English.
  const saveLanguage = useCallback(async (next: 'en' | 'si') => {
    await put('/me/language', { language: next }).catch(() => undefined);
    await queryClient.invalidateQueries({ queryKey: keys.me });
  }, []);
  useAccountLanguage(showSupport ? me.data?.memberAccount?.locale : undefined, saveLanguage);
  const other = language === 'en' ? 'si' : 'en';
  const chooseLanguage = async (next: 'en' | 'si') => {
    if (next === language) return;
    setLanguage(next);
    if (me.data?.memberAccount) await saveLanguage(next);
  };
  const signOut = async () => {
    await authClient.signOut();
    await resetSession();
    navigate(home);
  };
  return (
    <div className="m-app" data-theme={theme}>
      <a href="#main" className="m-skip-link">
        {t('layout.skip')}
      </a>
      <header className="m-header">
        <Brand href={home === '/staff' ? '/app/staff' : language === 'si' ? '/si/' : '/'} />
        {member ? (
          <MoreMenu onSignOut={signOut} onLanguage={chooseLanguage} />
        ) : (
          <div className="ml-auto flex items-center gap-2">
            {me.data && (
              <button type="button" className="m-text inline-flex min-h-11 items-center gap-2" onClick={signOut}>
                <LogOut size={16} aria-hidden="true" />
                {t('layout.signOut')}
              </button>
            )}
            {showSupport && (
              // The spoken name starts with the visible word (WCAG 2.5.3), then says what it does.
              <button type="button" className="m-text min-h-11 px-2" onClick={() => void chooseLanguage(other)}>
                <span lang={other}>{LANGUAGE_NAMES[other]}</span>
                <span className="sr-only">{t(`layout.languageTo.${other}`)}</span>
              </button>
            )}
            <button type="button" className="ma-theme" onClick={toggleTheme} aria-label={theme === 'dark' ? t('layout.lightTheme') : t('layout.darkTheme')}>
              {theme === 'dark' ? <Sun size={19} aria-hidden="true" /> : <Moon size={19} aria-hidden="true" />}
            </button>
          </div>
        )}
      </header>
      {member && !onboarding && <Dock />}
      {onboarding ? (
        children
      ) : (
        <main id="main" className="m-main">
          {width === 'wide' ? children : <div className={widths[width]}>{children}</div>}
        </main>
      )}
      {showSupport &&
        (member ? (
          <footer className="m-footer">
            <span>{t('layout.copyright', { year: new Date().getFullYear() })}</span>
          </footer>
        ) : (
          <SupportFooter />
        ))}
    </div>
  );
}

/** The demo's brand: the heart in its disc, the name, and the full stop. */
export function Brand({ href }: { href: string }) {
  return (
    <a className="m-brand" href={href}>
      <span aria-hidden="true">
        <Heart size={19} fill="currentColor" />
      </span>
      Favorite Hearts
      <span className="m-brand-dot" aria-hidden="true">
        .
      </span>
    </a>
  );
}

/** The account's own checks are incomplete: the More button and the Verification row show a count. */
function useVerificationNeeded(): boolean {
  const me = useMe().data;
  const cases = useMyCases(Boolean(me?.memberAccount));
  if (!me || cases.isPending) return false;
  return !me.phoneNumberVerified || cases.data?.[0]?.status !== 'approved';
}

function MoreMenu({ onSignOut, onLanguage }: { onSignOut: () => void; onLanguage: (language: 'en' | 'si') => void }) {
  const { t, language } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const attention = useVerificationNeeded();
  const page = (route: string) => (language === 'si' ? `/si${route}` : route);
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button type="button" className="m-more-button" aria-label={t(attention ? 'layout.menu.openAttention' : 'layout.menu.open')}>
          <Menu size={22} aria-hidden="true" />
          {attention && (
            <span className="m-menu-count" aria-hidden="true">
              1
            </span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="m-app m-more-sheet"
        data-theme={theme}
        // The demo opens the sheet without focusing its first control; focus goes to the sheet itself, so it is still
        // inside the dialog for keyboard and screen-reader users.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement).focus();
        }}
      >
        <SheetHeader>
          <SheetTitle>{t('layout.menu.title')}</SheetTitle>
          <SheetDescription>{t(attention ? 'layout.menu.attention' : 'layout.menu.upToDate')}</SheetDescription>
        </SheetHeader>
        <label className="fh-language">
          <span>{t('layout.menu.language')}</span>
          <select value={language} onChange={(event) => onLanguage(event.target.value as 'en' | 'si')}>
            {(['en', 'si'] as const).map((code) => (
              <option key={code} value={code} lang={code}>
                {LANGUAGE_NAMES[code]}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="m-btn m-secondary m-menu-theme" onClick={toggleTheme}>
          {theme === 'dark' ? <Sun size={19} aria-hidden="true" /> : <Moon size={19} aria-hidden="true" />}
          {theme === 'dark' ? t('layout.lightTheme') : t('layout.darkTheme')}
        </button>
        <nav aria-label={t('layout.menu.nav')}>
          <MenuItem to="/verify" Icon={ShieldCheck} label={t('layout.menu.verification')} count={attention ? t('layout.menu.needsAttention') : undefined} />
          <MenuItem href={page('/help/')} Icon={CircleHelp} label={t('layout.help')} />
          <MenuItem href={page('/terms/')} Icon={FileText} label={t('layout.terms')} />
          <MenuItem href={page('/privacy/')} Icon={FileText} label={t('layout.privacy')} />
        </nav>
        <nav aria-label={t('layout.menu.contact')}>
          <MenuItem href={`https://wa.me/${phoneDigits}`} external Icon={MessageCircle} label={t('layout.whatsapp', { phone: phoneLabel })} />
          <MenuItem href={`tel:${site.telephone}`} Icon={Phone} label={t('layout.call', { phone: phoneLabel })} />
          <MenuItem href={`mailto:${site.email}`} Icon={Mail} label={site.email} />
          <p className="m-menu-note">{t('layout.staffNeverAsk')}</p>
        </nav>
        <div className="m-menu-bottom">
          <button type="button" className="m-menu-logout" onClick={onSignOut}>
            <LogOut size={16} aria-hidden="true" />
            {t('layout.signOut')}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * A row of the More sheet. The demo's rows are buttons; here rows that open a page are links (parity.css gives them the
 * same look). A row that needs attention carries the demo's count badge, with the words for screen readers.
 */
function MenuItem({ to, href, external, Icon, label, count }: { to?: string; href?: string; external?: boolean; Icon: LucideIcon; label: string; count?: string }) {
  const body = (
    <>
      <Icon size={20} aria-hidden="true" />
      <span className="min-w-0 break-words">{label}</span>
      {count && (
        <span className="m-menu-item-count">
          <span aria-hidden="true">1</span>
          <span className="sr-only">{count}</span>
        </span>
      )}
      <ArrowUpRight size={16} aria-hidden="true" />
    </>
  );
  return to ? (
    <Link to={to}>{body}</Link>
  ) : (
    <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {body}
    </a>
  );
}

/** Where the dock item belongs: other members' pages are part of Discover, each profile of Profiles. */
const DOCK: { to: string; label: AppTextKey; Icon: LucideIcon; match: (path: string) => boolean }[] = [
  { to: '/browse', label: 'layout.dock.discover', Icon: Compass, match: (path) => path.startsWith('/browse') || path.startsWith('/members/') },
  { to: '/requests', label: 'layout.dock.requests', Icon: Heart, match: (path) => path.startsWith('/requests') },
  { to: '/connections', label: 'layout.dock.connections', Icon: Users, match: (path) => path.startsWith('/connections') },
  { to: '/shortlist', label: 'layout.dock.shortlist', Icon: Bookmark, match: (path) => path.startsWith('/shortlist') },
  { to: '/', label: 'layout.dock.profiles', Icon: UserRound, match: (path) => path === '/' || path.startsWith('/profiles/') },
];

/** The demo's floating dock: buttons, the current one marked selected and aria-current. */
function Dock() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  // Keep the profile being acted for when moving between Discover, Requests and Connected.
  const as = new URLSearchParams(search).get('as');
  return (
    <nav className="m-primary-nav m-floating-nav" aria-label={t('layout.mainNav')}>
      {DOCK.map(({ to, label, Icon, match }) => {
        const current = match(pathname);
        return (
          <button
            key={to}
            type="button"
            aria-current={current ? 'page' : undefined}
            className={current ? 'selected' : undefined}
            onClick={() => navigate(as && to !== '/' ? `${to}?as=${as}` : to)}
          >
            <span className="m-dock-icon">
              <Icon size={22} aria-hidden="true" />
            </span>
            <span>{t(label)}</span>
          </button>
        );
      })}
    </nav>
  );
}

/** Support channels and the policies, under the sign-in page: help before anyone has an account. */
export function SupportFooter() {
  const { t, language } = useI18n();
  // The website's pages in the language on screen: Sinhala ones are under /si/ (apps/website, Stage 5d).
  const page = (route: string) => (language === 'si' ? `/si${route}` : route);
  return (
    <footer className="mx-auto w-full max-w-[1360px] px-4 pb-10 text-sm text-muted-foreground sm:px-[4%]">
      <div className="border-t pt-6">
        <h2 className="font-semibold text-foreground">{t('layout.needHelp')}</h2>
        <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
          <li>
            <a className={footerLink} href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noopener noreferrer">
              {t('layout.whatsapp', { phone: phoneLabel })}
            </a>
          </li>
          <li>
            <a className={footerLink} href={`tel:${site.telephone}`}>
              {t('layout.call', { phone: phoneLabel })}
            </a>
          </li>
          <li>
            <a className={footerLink} href={`mailto:${site.email}`}>
              {site.email}
            </a>
          </li>
        </ul>
        <p className="mt-3">{t('layout.staffNeverAsk')}</p>
        <nav aria-label={t('layout.helpNav')} className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
          <a className={footerLink} href={page('/help/')}>
            {t('layout.help')}
          </a>
          <a className={footerLink} href={page('/terms/')}>
            {t('layout.terms')}
          </a>
          <a className={footerLink} href={page('/privacy/')}>
            {t('layout.privacy')}
          </a>
        </nav>
      </div>
    </footer>
  );
}

const footerLink = 'underline underline-offset-4 hover:text-foreground';

/** A main container: the demo's .m-surface. */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('m-surface', className)}>{children}</section>;
}

/** The small spaced capitals above a heading: the demo's .m-kicker (its texts are written in capitals). */
export const kickerClass = 'm-kicker uppercase';

/** The demo's page heading: kicker, serif title, lead line, and actions on the right. */
export function PageTitle({ kicker, title, children, action }: { kicker?: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="m-page-heading">
      <div>
        {kicker && <span className={kickerClass}>{kicker}</span>}
        <h1>{title}</h1>
        {children && (typeof children === 'string' ? <p>{children}</p> : <div className="m-page-lead">{children}</div>)}
      </div>
      {action && <div className="m-discover-heading-actions">{action}</div>}
    </div>
  );
}

/** The demo's .m-note for information and warnings, .m-error for errors. */
export function Notice({ tone = 'info', title, children }: { tone?: 'info' | 'warning' | 'error'; title?: string; children?: ReactNode }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={tone === 'error' ? 'm-error' : 'm-note'} data-tone={tone}>
      <div>
        {title && <strong>{title}</strong>}
        {children && (title ? <div className="mt-1">{children}</div> : children)}
      </div>
    </div>
  );
}

export function Loading({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <p role="status" className="py-10 text-center text-sm text-muted-foreground">
      {label ?? t('common.loading')}
    </p>
  );
}
