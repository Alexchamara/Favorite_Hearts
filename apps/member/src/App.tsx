import { useQuery } from '@tanstack/react-query';
import { Heart, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { enabledChannels } from '@/features/auth/login-code';
import { env } from '@/lib/env';
import { useTheme } from '@/lib/theme';

type Health = { ok: boolean; database: boolean; email: boolean; sms: boolean; storage: boolean };

/**
 * App shell in the demo's design: brand header, light/dark theme and toasts. Until sign-in
 * arrives in Stage 2 the page shows what is connected. Screens from the demo
 * (reference/Favorite-Hearts-Integrated/product) move in with the stage that builds their API.
 */
export default function App() {
  const { theme, toggleTheme } = useTheme();
  const health = useQuery({
    queryKey: ['health'],
    queryFn: async (): Promise<Health> => {
      const res = await fetch(`${env.apiUrl}/health`);
      return res.json();
    },
  });

  const status = (value: boolean | undefined) => (value === undefined ? '…' : value ? 'ready' : 'not configured');
  const rows: [string, string][] = [
    ['API', health.isError ? 'not reachable' : health.data ? 'reachable' : '…'],
    ['Database', status(health.data?.database)],
    ['Email codes (Resend)', status(health.data?.email)],
    ['SMS codes', status(health.data?.sms)],
    ['File storage (R2)', status(health.data?.storage)],
    ['Sign-in options shown', enabledChannels().join(' + ') || 'none'],
  ];

  return (
    <div className="min-h-dvh">
      <Toaster position="top-center" />
      <header className="flex items-center justify-between border-b px-4 py-3 sm:px-6">
        <a href="/" className="inline-flex items-center gap-2 text-sm font-semibold">
          <Heart className="size-4 fill-current text-brand" aria-hidden="true" />
          Favorite Hearts
        </a>
        <Button
          variant="outline"
          size="icon"
          className="rounded-full"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Use the light theme' : 'Use the dark theme'}
        >
          {theme === 'dark' ? <Sun /> : <Moon />}
        </Button>
      </header>

      <main className="mx-auto max-w-xl px-4 py-12 sm:py-16">
        <a href="/" className="text-sm text-muted-foreground underline underline-offset-4">
          ← Back to the website
        </a>
        <h1 className="mt-6 font-serif text-3xl">Join Favorite Hearts</h1>
        <p className="mt-2 text-muted-foreground">
          Sign-up and sign-in will open here. This page is a developer preview showing what is connected so far.
        </p>
        <dl className="mt-8 divide-y rounded-[var(--ui-panel-radius)] border bg-card shadow-[var(--ui-shadow)]">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 px-4 py-3 text-sm">
              <dt className="font-medium">{label}</dt>
              <dd className="text-right text-muted-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      </main>
    </div>
  );
}
