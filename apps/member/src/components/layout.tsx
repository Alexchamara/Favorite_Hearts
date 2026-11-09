/**
 * The frame around every member screen, in the demo's look (owner, 6 Nov 2026): the rose brand mark, a menu drawer for
 * the account (language, theme, verification, help, sign out), and a floating dock for the four places members go
 * every day. Signed-out visitors and staff keep a plain header without the dock.
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
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
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

/** How wide a screen's content runs: forms and single tasks read best narrow; lists and two-column screens go wide. */
const widths = { narrow: 'max-w-3xl', wide: 'max-w-[1360px]' } as const;

export function AppShell({ children, home = '/', width = 'narrow' }: { children: ReactNode; home?: string; width?: keyof typeof widths }) {
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
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-card focus:px-3 focus:py-2">
        {t('layout.skip')}
      </a>
      <header className="flex h-[70px] items-center gap-3 border-b bg-card px-4 sm:h-20 sm:px-[3.1%]">
        <BrandMark href={home === '/staff' ? '/app/staff' : language === 'si' ? '/si/' : '/'} />
        <div className="ml-auto flex items-center gap-2">
          {member ? (
            <MenuDrawer onSignOut={signOut} onLanguage={chooseLanguage} />
          ) : (
            <>
              {me.data && (
                <Button variant="ghost" size="sm" onClick={signOut}>
                  <LogOut aria-hidden="true" />
                  {t('layout.signOut')}
                </Button>
              )}
              {showSupport && (
                // The spoken name starts with the visible word (WCAG 2.5.3), then says what it does.
                <Button variant="ghost" size="sm" className="h-11 sm:h-9" onClick={() => void chooseLanguage(other)}>
                  <span lang={other}>{LANGUAGE_NAMES[other]}</span>
                  <span className="sr-only">{t(`layout.languageTo.${other}`)}</span>
                </Button>
              )}
              <button
                type="button"
                className={roundButton}
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? t('layout.lightTheme') : t('layout.darkTheme')}
              >
                {theme === 'dark' ? <Sun className="size-5" aria-hidden="true" /> : <Moon className="size-5" aria-hidden="true" />}
              </button>
            </>
          )}
        </div>
      </header>
      <main id="main" className={cn('mx-auto w-full flex-1 px-4 pt-7 pb-12 sm:px-[4%] sm:pt-10', widths[width])}>
        {children}
      </main>
      {showSupport && (member ? <SlimFooter /> : <SupportFooter />)}
      {member && <Dock />}
    </div>
  );
}

const roundButton =
  'relative grid size-11 shrink-0 place-items-center rounded-full border bg-[var(--ui-surface)] text-foreground transition-colors hover:bg-accent';

/** The rose heart and the name with its rose full stop, as on the website. */
export function BrandMark({ href }: { href: string }) {
  return (
    <a href={href} className="inline-flex items-center gap-2 text-[1.02rem] font-extrabold tracking-[-0.6px] whitespace-nowrap sm:gap-[9px] sm:text-[1.2rem] sm:tracking-[-0.8px]">
      <span className="grid size-7 place-items-center rounded-full bg-[var(--ui-rose)] text-white sm:size-8" aria-hidden="true">
        <Heart className="size-4 fill-current sm:size-[19px]" />
      </span>
      Favorite Hearts
      <span className="-ml-2 text-[var(--ui-rose-ink)]" aria-hidden="true">
        .
      </span>
    </a>
  );
}

/** The account's own checks are incomplete: the menu badge and the Verification row say so. */
function useVerificationNeeded(): boolean {
  const me = useMe().data;
  const cases = useMyCases(Boolean(me?.memberAccount));
  if (!me || cases.isPending) return false;
  return !me.phoneNumberVerified || cases.data?.[0]?.status !== 'approved';
}

function MenuDrawer({ onSignOut, onLanguage }: { onSignOut: () => void; onLanguage: (language: 'en' | 'si') => void }) {
  const { t, language } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const me = useMe().data!;
  const attention = useVerificationNeeded();
  const page = (route: string) => (language === 'si' ? `/si${route}` : route);
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button type="button" className={roundButton} aria-label={t(attention ? 'layout.menu.openAttention' : 'layout.menu.open')}>
          <Menu className="size-[22px]" aria-hidden="true" />
          {attention && (
            // A dot, not a number: the label says what needs attention, and a visible number would not be in it.
            <span className="absolute top-0 right-0 size-3 rounded-full border-2 border-[var(--ui-surface)] bg-[var(--ui-rose-ink)]" aria-hidden="true" />
          )}
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-[min(360px,92vw)] flex-col gap-0 overflow-y-auto border-l bg-card p-6 sm:max-w-none">
        <SheetHeader className="p-0 pr-10">
          <SheetTitle className="font-serif text-[2rem] leading-[1.15] font-normal tracking-[-0.03em]">{t('layout.menu.title')}</SheetTitle>
          <SheetDescription className="break-words">{t('layout.menu.signedInAs', { name: me.name || me.email || '' })}</SheetDescription>
        </SheetHeader>

        <div className="mt-7 flex flex-col gap-4 border-b pb-6">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold" id="menu-language">
              {t('layout.menu.language')}
            </span>
            <div role="group" aria-labelledby="menu-language" className="flex gap-1 rounded-[10px] bg-[var(--ui-soft)] p-1">
              {(['en', 'si'] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  lang={code}
                  aria-pressed={language === code}
                  onClick={() => onLanguage(code)}
                  className={cn(
                    'min-h-9 rounded-[8px] px-3 text-sm font-semibold transition-colors',
                    language === code ? 'bg-[var(--ui-purple)] text-[var(--ui-on-purple)]' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {LANGUAGE_NAMES[code]}
                </button>
              ))}
            </div>
          </div>
          <label className="flex min-h-9 cursor-pointer items-center justify-between gap-3 text-sm font-semibold">
            <span className="inline-flex items-center gap-2">
              {theme === 'dark' ? <Moon className="size-4" aria-hidden="true" /> : <Sun className="size-4" aria-hidden="true" />}
              {t('layout.menu.darkMode')}
            </span>
            <Switch checked={theme === 'dark'} onCheckedChange={toggleTheme} />
          </label>
        </div>

        <nav aria-label={t('layout.menu.nav')} className="mt-4 grid gap-1">
          <MenuItem to="/verify" Icon={ShieldCheck} label="layout.menu.verification" note={attention ? t('layout.menu.needsAttention') : undefined} />
          <MenuItem href={page('/help/')} Icon={CircleHelp} label="layout.help" />
          <MenuItem href={page('/terms/')} Icon={FileText} label="layout.terms" />
          <MenuItem href={page('/privacy/')} Icon={FileText} label="layout.privacy" />
        </nav>

        <section aria-labelledby="menu-contact" className="mt-5 border-t pt-5">
          <h2 id="menu-contact" className="text-sm font-semibold">
            {t('layout.menu.contact')}
          </h2>
          <ul className="mt-2 grid gap-1 text-sm">
            <li>
              <a className={menuRow} href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="size-5 text-[var(--ui-purple)]" aria-hidden="true" />
                {t('layout.whatsapp', { phone: phoneLabel })}
              </a>
            </li>
            <li>
              <a className={menuRow} href={`tel:${site.telephone}`}>
                <Phone className="size-5 text-[var(--ui-purple)]" aria-hidden="true" />
                {t('layout.call', { phone: phoneLabel })}
              </a>
            </li>
            <li>
              <a className={menuRow} href={`mailto:${site.email}`}>
                <Mail className="size-5 text-[var(--ui-purple)]" aria-hidden="true" />
                <span className="break-all">{site.email}</span>
              </a>
            </li>
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{t('layout.staffNeverAsk')}</p>
        </section>

        <div className="mt-auto border-t pt-5">
          <Button variant="danger" className="h-11" onClick={onSignOut}>
            <LogOut aria-hidden="true" />
            {t('layout.signOut')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

const menuRow = 'flex min-h-12 items-center gap-3 rounded-[10px] px-3 py-2 text-[15px] hover:bg-[var(--ui-soft)]';

function MenuItem({ to, href, Icon, label, note }: { to?: string; href?: string; Icon: LucideIcon; label: AppTextKey; note?: string }) {
  const { t } = useI18n();
  const body = (
    <>
      <Icon className="size-5 shrink-0 text-[var(--ui-purple)]" aria-hidden="true" />
      <span className="flex-1">
        {t(label)}
        {note && <span className="block text-xs font-semibold text-[var(--ui-rose-ink)]">{note}</span>}
      </span>
      {href && <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
    </>
  );
  return to ? (
    <Link to={to} className={menuRow}>
      {body}
    </Link>
  ) : (
    <a href={href} className={menuRow}>
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

/** The floating dock: always in reach of a thumb on a phone, centred under the content on a computer. */
function Dock() {
  const { t } = useI18n();
  const { pathname, search } = useLocation();
  // Keep the profile being acted for when moving between Discover, Requests and Connected.
  const as = new URLSearchParams(search).get('as');
  return (
    <nav
      aria-label={t('layout.mainNav')}
      className="fixed inset-x-0 bottom-[max(12px,env(safe-area-inset-bottom))] z-40 mx-auto grid w-[min(520px,calc(100%-16px))] grid-cols-5 gap-0.5 rounded-[32px] border bg-card p-1.5 shadow-[var(--ui-dock-shadow)] sm:gap-1"
    >
      {DOCK.map(({ to, label, Icon, match }) => {
        const current = match(pathname);
        return (
          <Link
            key={to}
            to={as && to !== '/' ? `${to}?as=${as}` : to}
            aria-current={current ? 'page' : undefined}
            className={cn(
              'flex min-h-[54px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-[24px] px-0.5 text-center text-[11px] leading-[1.15] font-semibold transition-colors',
              current
                ? 'bg-[image:var(--ui-dock-selected)] text-[var(--ui-on-dock)] shadow-[inset_0_1px_0_#ffffff30,0_3px_10px_#a8582820]'
                : 'text-muted-foreground hover:bg-[var(--ui-soft)] hover:text-foreground',
            )}
          >
            <Icon className="size-[22px]" aria-hidden="true" />
            <span className="max-w-full break-words">{t(label)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Under signed-in screens: support lives in the menu, so the footer only names the policies. */
function SlimFooter() {
  const { t, language } = useI18n();
  const page = (route: string) => (language === 'si' ? `/si${route}` : route);
  return (
    <footer className="px-4 pb-32 text-center text-sm text-muted-foreground sm:pb-36">
      <nav aria-label={t('layout.helpNav')} className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
        <span>{t('layout.copyright', { year: new Date().getFullYear() })}</span>
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
    </footer>
  );
}

/** Support channels and the policies, under the sign-in page: help before anyone has an account. */
function SupportFooter() {
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

/** A main container: page colour on the surface colour, a hairline, no shadow (the demo's .m-surface). */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('rounded-[var(--ui-panel-radius)] border bg-card p-5 sm:p-7', className)}>{children}</section>;
}

/** The small spaced capitals above a heading, as in the demo. */
export const kickerClass = 'text-xs font-bold tracking-[0.15em] text-muted-foreground uppercase';

export function PageTitle({ kicker, title, children, action }: { kicker?: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-col gap-5 sm:mb-8 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
      <div className="min-w-0">
        {kicker && <p className={cn(kickerClass, 'mb-2')}>{kicker}</p>}
        <h1 className="font-serif text-[2.25rem] leading-[1.12] sm:text-5xl">{title}</h1>
        {children && <div className="mt-3 max-w-[65ch] text-muted-foreground">{children}</div>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-3">{action}</div>}
    </div>
  );
}

const noticeTones = {
  info: 'border-[var(--ui-line)] bg-[var(--ui-soft)]',
  warning: 'border-[var(--ui-accent)] bg-[color-mix(in_srgb,var(--ui-accent)_14%,var(--ui-surface))]',
  error: 'border-destructive bg-[color-mix(in_srgb,var(--ui-danger)_10%,var(--ui-surface))]',
};

export function Notice({ tone = 'info', title, children }: { tone?: keyof typeof noticeTones; title?: string; children?: ReactNode }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('rounded-[12px] border px-4 py-3 text-sm leading-relaxed', noticeTones[tone])}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? 'mt-1' : undefined}>{children}</div>}
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
