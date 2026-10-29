import type { ReactNode } from 'react';
import { Heart, LogOut, Moon, Sun } from 'lucide-react';
import { Link, NavLink, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { resetSession, useMe } from '@/lib/queries';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

export function AppShell({ children, home = '/' }: { children: ReactNode; home?: string }) {
  const { theme, toggleTheme } = useTheme();
  const me = useMe();
  const navigate = useNavigate();
  const showNav = Boolean(me.data && !me.data.staffRole && me.data.name);
  const signOut = async () => {
    await authClient.signOut();
    await resetSession();
    navigate(home);
  };
  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:rounded focus:bg-card focus:px-3 focus:py-2">
        Skip to content
      </a>
      {/* On phones the navigation wraps to its own row under the brand and account buttons. */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3 sm:px-6">
        <Link to={home} className="inline-flex items-center gap-2 text-sm font-semibold whitespace-nowrap">
          <Heart className="size-4 fill-current text-brand" aria-hidden="true" />
          Favorite Hearts
        </Link>
        {showNav && (
          <nav aria-label="Main" className="order-last flex w-full items-center gap-1 text-sm sm:order-none sm:ml-auto sm:w-auto">
            <NavLink to="/" end className={navClass}>
              Profiles
            </NavLink>
            <NavLink to="/browse" className={navClass}>
              Browse
            </NavLink>
          </nav>
        )}
        <div className={cn('ml-auto flex items-center gap-2', showNav && 'sm:ml-0')}>
          {me.data && (
            <>
              <span className="hidden max-w-[16ch] truncate text-sm text-muted-foreground md:inline">{me.data.name || me.data.email}</span>
              <Button variant="ghost" size="sm" onClick={signOut}>
                <LogOut aria-hidden="true" />
                Sign out
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="icon"
            className="rounded-full"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Use the light theme' : 'Use the dark theme'}
          >
            {theme === 'dark' ? <Sun /> : <Moon />}
          </Button>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
        {children}
      </main>
    </div>
  );
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn('rounded-[8px] px-2.5 py-1.5 font-semibold', isActive ? 'bg-[var(--ui-soft)] text-foreground' : 'text-muted-foreground hover:text-foreground');

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-[var(--ui-panel-radius)] border bg-card p-5 shadow-[var(--ui-shadow)] sm:p-6', className)}>
      {children}
    </section>
  );
}

export function PageTitle({ kicker, title, children }: { kicker?: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-8">
      {kicker && <p className="mb-2 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">{kicker}</p>}
      <h1 className="font-serif text-3xl leading-tight sm:text-4xl">{title}</h1>
      {children && <div className="mt-3 text-muted-foreground">{children}</div>}
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

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <p role="status" className="py-10 text-center text-sm text-muted-foreground">
      {label}
    </p>
  );
}
