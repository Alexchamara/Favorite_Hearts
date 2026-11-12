/**
 * Runtime settings the app is built from. Production builds it from the validated environment
 * (env.ts → configFromEnv); tests pass a literal, so nothing reads process.env implicitly.
 */
export type Config = {
  nodeEnv: 'development' | 'test' | 'staging' | 'production';
  /** Public URL of this API (Better-Auth base URL). */
  apiUrl: string;
  /** Member app base URL, used in invitation links, e.g. https://example.lk/app */
  memberAppUrl: string;
  allowedOrigins: string[];
  /** Better-Auth secret; also keys the HMACs of invitation codes and of retained sign-in details (lib/identity-hash.ts). */
  authSecret: string;
  /** Rate limits: Better-Auth's and our own (off only in automated tests). */
  rateLimit: boolean;
  /**
   * The request header the host sets to the visitor's IP address (e.g. cf-connecting-ip, fly-client-ip). Null = the
   * connection's own address (local development). Never X-Forwarded-For as sent by the browser: anyone can type it.
   */
  clientIpHeader: string | null;
  signedUrlTtlSeconds: number;
  /**
   * The admin site's origin, e.g. https://admin.favoritehearts.com (docs/ADMIN-PANEL-PLAN.md). It reaches this API
   * through its own proxy under /api/admin, with its own sign-in. Null = no admin site (its routes answer 404).
   */
  adminOrigin: string | null;
  /**
   * Cloudflare Access in front of the admin site (layer 1): the team domain (e.g. favoritehearts.cloudflareaccess.com)
   * and the application's audience tag. Every admin request must carry Access's signed token. Null in development.
   */
  cloudflareAccess: { teamDomain: string; audience: string } | null;
  /** The owner's dedicated mailbox for security alerts (decision A7). Null = alerts are only logged and audited. */
  securityAlertEmail: string | null;
};
