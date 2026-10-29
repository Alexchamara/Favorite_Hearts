/**
 * Cloudflare Turnstile (D7): the bot check the API asks for before it sends a code or tries a staff password.
 * Shown only when a site key is configured (VITE_TURNSTILE_SITE_KEY). The API checks the token with
 * Cloudflare; each token works once, so the widget starts over after every use.
 */
import { useEffect, useRef, useState } from 'react';
import { env } from '@/lib/env';
import { useTheme } from '@/lib/theme';

type TurnstileApi = {
  render(element: HTMLElement, options: Record<string, unknown>): string;
  remove(widgetId: string): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('The security check did not load.')));
    script.onerror = () => {
      loading = null;
      reject(new Error('The security check could not load. Check your connection and try again.'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/**
 * `widget` goes in the form; `headers` go with the request; `ready` is false until there is a token (always
 * true when no check is configured); `reset()` after every request that used the token.
 */
export function useBotCheck() {
  const [token, setToken] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const required = Boolean(env.turnstileSiteKey);
  return {
    ready: !required || token !== null,
    headers: token ? { 'x-captcha-response': token } : undefined,
    reset: () => {
      setToken(null);
      setRound((n) => n + 1);
    },
    widget: required ? <BotCheck key={round} onToken={setToken} /> : null,
  };
}

function BotCheck({ onToken }: { onToken: (token: string | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    let widgetId: string | null = null;
    let cancelled = false;
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !box.current) return;
        widgetId = turnstile.render(box.current, {
          sitekey: env.turnstileSiteKey,
          theme: theme === 'dark' ? 'dark' : 'light',
          size: 'flexible',
          callback: (token: string) => {
            setProblem(null);
            onToken(token);
          },
          'expired-callback': () => onToken(null),
          'error-callback': () => {
            onToken(null);
            setProblem('The security check did not pass. Please wait a moment and try again.');
          },
        });
      })
      .catch((err: Error) => setProblem(err.message));
    return () => {
      cancelled = true;
      if (widgetId) window.turnstile?.remove(widgetId);
    };
    // The theme is read once per widget; a new widget is made after every use anyway.
  }, [onToken]);
  return (
    <div className="flex flex-col gap-1">
      <div ref={box} className="min-h-[65px]" />
      {problem && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {problem}
        </p>
      )}
    </div>
  );
}
