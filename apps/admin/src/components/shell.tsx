/**
 * The admin site's frame and small building blocks, on the member app's design system (the demo's .m-* classes), but
 * with its own header: the brand, who is signed in and in which role, My security, sign out and the theme. The member
 * app's own frame is not used here because it carries the member sign-in and language choice.
 */
import { useRef, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { Heart, LogOut, Moon, ShieldCheck, Sun } from 'lucide-react';
import { useToastRoot } from '@/components/toast-host';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { authClient } from '@admin/lib/auth-client';
import { resetSession, useMe } from '@admin/lib/queries';

const ROLE_NAMES = { owner: 'Owner', backup_reviewer: 'Backup reviewer' } as const;

export function AdminShell({ children, width = 'wide' }: { children: ReactNode; width?: 'wide' | 'narrow' }) {
  const { theme, toggleTheme } = useTheme();
  const me = useMe();
  const navigate = useNavigate();
  const root = useRef<HTMLDivElement>(null);
  useToastRoot(root);
  const signedIn = me.data && !me.data.enrolment ? me.data : null;
  const signOut = async () => {
    await authClient.signOut();
    await resetSession();
    navigate('/');
  };
  return (
    <div className="m-app" data-theme={theme} ref={root}>
      <a href="#main" className="m-skip-link">
        Skip to content
      </a>
      <header className="m-header">
        <a className="m-brand" href="/">
          <span aria-hidden="true">
            <Heart size={19} fill="currentColor" />
          </span>
          Favorite Hearts
          <span className="m-brand-dot" aria-hidden="true">
            .
          </span>
          <span className="ml-2 hidden rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide min-[400px]:inline">Admin</span>
        </a>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          {signedIn && (
            <>
              <span className="hidden text-sm sm:inline" data-testid="signed-in-as">
                {signedIn.name} · {ROLE_NAMES[signedIn.role]}
              </span>
              {/* On a phone the two links show their icons only; their names stay for screen readers. */}
              <Link to="/security" className="m-text inline-flex min-h-11 min-w-11 items-center justify-center gap-2 sm:px-2">
                <ShieldCheck size={16} aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">My security</span>
              </Link>
              <button type="button" className="m-text inline-flex min-h-11 min-w-11 items-center justify-center gap-2" onClick={() => void signOut()}>
                <LogOut size={16} aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">Sign out</span>
              </button>
            </>
          )}
          <button type="button" className="ma-theme" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Use the light theme' : 'Use the dark theme'}>
            {theme === 'dark' ? <Sun size={19} aria-hidden="true" /> : <Moon size={19} aria-hidden="true" />}
          </button>
        </div>
      </header>
      <main id="main" className="m-main">
        {width === 'wide' ? children : <div className="mx-auto w-full max-w-3xl">{children}</div>}
      </main>
      <footer className="m-footer">
        <span>Staff never ask anyone for a password or a code. Everything you open here is logged.</span>
      </footer>
    </div>
  );
}

/** A main container: the demo's .m-surface. */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('m-surface', className)}>{children}</section>;
}

export function PageTitle({ kicker, title, children, action }: { kicker?: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="m-page-heading">
      <div>
        {kicker && <span className="m-kicker uppercase">{kicker}</span>}
        <h1>{title}</h1>
        {children && (typeof children === 'string' ? <p>{children}</p> : <div className="m-page-lead">{children}</div>)}
      </div>
      {action && <div className="m-discover-heading-actions">{action}</div>}
    </div>
  );
}

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

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <p role="status" className="py-10 text-center text-sm text-muted-foreground">
      {label}
    </p>
  );
}
