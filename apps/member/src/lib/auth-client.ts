import { createAuthClient } from 'better-auth/react';
import { phoneNumberClient, twoFactorClient } from 'better-auth/client/plugins';
import { env } from './env';
import { currentLanguage } from './i18n';

/**
 * Better-Auth client. Talks to the API's /api/auth/* routes with the session cookie, and asks for answers and codes in
 * the language on screen.
 */
export const authClient = createAuthClient({
  baseURL: env.apiUrl || window.location.origin,
  basePath: '/api/auth',
  fetchOptions: {
    onRequest: (context) => {
      context.headers.set('Accept-Language', currentLanguage());
      return context;
    },
  },
  plugins: [phoneNumberClient(), twoFactorClient()],
});
