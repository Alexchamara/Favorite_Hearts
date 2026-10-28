/** Typed access to public build-time configuration. */
function flag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value === 'true';
}

const apiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';

export const env = {
  /** '' = same origin (local dev proxy). */
  apiUrl,
  loginEmailEnabled: flag(import.meta.env.VITE_LOGIN_EMAIL_ENABLED, true),
  loginSmsEnabled: flag(import.meta.env.VITE_LOGIN_SMS_ENABLED, false),
  turnstileSiteKey: (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) || null,
} as const;
