/**
 * The admin site's own sign-in (apps/api/src/admin/auth.ts): /api/admin/auth on this site, with passkeys and the
 * authenticator app. Nothing here talks to the member app's sign-in.
 */
import { passkeyClient } from '@better-auth/passkey/client';
import { createAuthClient } from 'better-auth/react';
import { twoFactorClient } from 'better-auth/client/plugins';
import { adminHeaders } from './api';

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  basePath: '/api/admin/auth',
  fetchOptions: {
    credentials: 'same-origin',
    onRequest: (context) => {
      for (const [name, value] of Object.entries(adminHeaders)) context.headers.set(name, value);
      return context;
    },
  },
  plugins: [twoFactorClient(), passkeyClient()],
});

/** Better-Auth answers with { error: { code, message } }; this turns one into an Error, or returns the data. */
export async function check<T>(call: Promise<{ data: T | null; error: { code?: string; message?: string; status?: number } | null }>): Promise<T> {
  const result = await call;
  if (result.error) {
    const error = new Error(result.error.message || 'That did not work. Try again.') as Error & { code?: string; status?: number };
    error.code = result.error.code;
    error.status = result.error.status;
    throw error;
  }
  return result.data as T;
}
