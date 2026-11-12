/**
 * Cloudflare Access in front of the admin site (docs/ADMIN-PANEL-PLAN.md, layer 1). Access lets only the staff
 * emails through, and signs each request it lets through with a short-lived token in the Cf-Access-Jwt-Assertion
 * header. The API checks that token on every admin request: its signature (Access's public keys), its issuer (the
 * team domain) and its audience (this application's tag). So the admin API cannot be used by going round Access, for
 * example by calling the API host directly.
 */
import { createRemoteJWKSet, jwtVerify } from 'jose';

/** The email Access signed in, or null when the token is missing, forged, expired or for another application. */
export type AccessVerifier = (token: string | undefined) => Promise<{ email: string } | null>;

export const ACCESS_HEADER = 'cf-access-jwt-assertion';

export function createAccessVerifier({ teamDomain, audience }: { teamDomain: string; audience: string }): AccessVerifier {
  const issuer = `https://${teamDomain}`;
  const keys = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
  return async (token) => {
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, keys, { issuer, audience, algorithms: ['RS256'] });
      return typeof payload.email === 'string' && payload.email ? { email: payload.email.toLowerCase() } : null;
    } catch {
      return null;
    }
  };
}
