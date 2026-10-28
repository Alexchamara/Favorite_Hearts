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
  /** Better-Auth secret; also keys the HMAC of invitation codes. */
  authSecret: string;
  /** Better-Auth request rate limits (off only in automated tests). */
  rateLimit: boolean;
  signedUrlTtlSeconds: number;
};
