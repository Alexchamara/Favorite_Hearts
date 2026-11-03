/**
 * Cloudflare Turnstile, checked on the server (D7; OWNER-DECISIONS Part 2: abuse limits on sign-in and codes).
 * The browser widget puts a one-time token in the X-Captcha-Response header, and the API asks Cloudflare whether it
 * is valid before a code is sent or a password is tried. Off until a secret key is configured; env.ts requires one
 * in production. If Cloudflare cannot be reached the check fails closed.
 */
import { createMiddleware } from 'hono/factory';
import { fail, type AppEnv } from '../http.ts';
import { log } from '../lib/log.ts';

export interface Turnstile {
  verify(token: string): Promise<boolean>;
}

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export function createTurnstile(secretKey: string): Turnstile {
  return {
    async verify(token) {
      try {
        const res = await fetch(SITEVERIFY_URL, {
          method: 'POST',
          body: new URLSearchParams({ secret: secretKey, response: token }),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          log.error('turnstile.http_error', { status: res.status });
          return false;
        }
        const result = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
        if (result.success !== true) log.warn('turnstile.rejected', { codes: (result['error-codes'] ?? []).join(',') });
        return result.success === true;
      } catch (err) {
        log.error('turnstile.unreachable', { message: (err as Error).message });
        return false;
      }
    },
  };
}

export const turnstileGuard = createMiddleware<AppEnv>(async (c, next) => {
  const { turnstile } = c.var.deps;
  if (!turnstile) return next();
  const token = c.req.header('x-captcha-response')?.trim();
  if (!token || token.length > 2048) fail(403, 'CAPTCHA_REQUIRED', 'api.captchaRequired');
  if (!(await turnstile.verify(token))) fail(403, 'CAPTCHA_FAILED', 'api.captchaFailed');
  await next();
});
