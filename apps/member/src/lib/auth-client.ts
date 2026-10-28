import { createAuthClient } from 'better-auth/react';
import { emailOTPClient, phoneNumberClient, twoFactorClient } from 'better-auth/client/plugins';
import { env } from './env';

/** Better-Auth client. Talks to the API's /api/auth/* routes with the session cookie. */
export const authClient = createAuthClient({
  baseURL: env.apiUrl || window.location.origin,
  basePath: '/api/auth',
  plugins: [emailOTPClient(), phoneNumberClient(), twoFactorClient()],
});
