import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import { HttpError, pgError, type AppEnv, type Deps, type PgError } from './http.ts';
import { log } from './lib/log.ts';
import { loadSession } from './middleware/session.ts';
import { health } from './routes/health.ts';
import { invitations } from './routes/invitations.ts';
import { me } from './routes/me.ts';
import { profiles } from './routes/profiles.ts';
import { staff } from './routes/staff.ts';
import { verification } from './routes/verification.ts';

/** Friendly answers for rules the database enforces (the API usually checks first). */
const CONSTRAINTS: Record<string, [status: 400 | 403 | 409, code: string, message: string]> = {
  profile_one_per_candidate_idx: [409, 'PROFILE_EXISTS', 'You already have your own profile.'],
  verification_case_one_pending_idx: [409, 'VERIFICATION_PENDING', 'Your document is already waiting for review.'],
  profile_published_complete: [400, 'PROFILE_INCOMPLETE', 'Complete the profile before publishing.'],
  profile_caste_needs_consent: [400, 'VALIDATION', 'Caste can only be saved with your explicit consent.'],
};
const RAISED: Record<string, [status: 400 | 403 | 409, code: string, message: string]> = {
  manager_capacity_reached: [409, 'MANAGER_LIMIT', 'A manager can run up to 3 profiles. Contact us if you need more.'],
  invitation_contact_matches_manager: [400, 'INVITE_CONTACT_IS_MANAGER', 'Use the candidate’s own email or phone, not yours.'],
};

function databaseAnswer(err: PgError): [status: 400 | 403 | 409, code: string, message: string] | null {
  const raised = RAISED[err.message];
  if (raised) return raised;
  if (err.constraint && CONSTRAINTS[err.constraint]) return CONSTRAINTS[err.constraint]!;
  if (err.code === '42501') return [403, 'FORBIDDEN', 'You are not allowed to make this change.'];
  if (err.code === '23505') return [409, 'CONFLICT', 'This already exists.'];
  if (err.code === '23514' || err.code === '23503' || err.code === '22P02') return [400, 'INVALID', 'Some of the information is not valid.'];
  return null;
}

export function createApp(deps: Deps) {
  const app = new Hono<AppEnv>();

  app.use('*', secureHeaders());
  app.use('*', async (c, next) => {
    c.set('deps', deps);
    await next();
  });
  app.use(
    '/api/*',
    cors({
      origin: deps.config.allowedOrigins,
      credentials: true,
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Idempotency-Key'],
      maxAge: 600,
    }),
  );
  // Default JSON body limit; the document upload allows a 5 MiB image plus form overhead.
  const small = bodyLimit({ maxSize: 100 * 1024 });
  const upload = bodyLimit({ maxSize: 6 * 1024 * 1024 });
  app.use('/api/*', (c, next) => (c.req.method === 'POST' && c.req.path === '/api/v1/verification' ? upload : small)(c, next));

  app.route('/health', health);

  // SMS codes stay off until a provider is configured: say so clearly instead of failing silently.
  app.post('/api/auth/phone-number/send-otp', (c, next) =>
    deps.messenger.smsEnabled
      ? next()
      : c.json({ code: 'SMS_UNAVAILABLE', message: 'SMS sign-in is not available yet. Please use email.' }, 503),
  );
  app.on(['GET', 'POST'], '/api/auth/*', (c) => deps.auth.handler(c.req.raw));

  // Everything below is our own API: session loaded once, permission checks per route.
  const v1 = new Hono<AppEnv>()
    .use(loadSession)
    .route('/me', me)
    .route('/profiles', profiles)
    .route('/invitations', invitations)
    .route('/verification', verification)
    .route('/staff', staff);
  app.route('/api/v1', v1);

  app.notFound((c) => c.json({ code: 'NOT_FOUND', message: 'Not found.' }, 404));
  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ code: err.code, message: err.message, fields: err.fields }, err.status);
    if (err instanceof HTTPException) return c.json({ code: 'HTTP_' + err.status, message: err.message }, err.status);
    const db = pgError(err);
    const answer = db && databaseAnswer(db);
    if (answer) {
      log.warn('api.rule_rejected', { path: c.req.path, code: answer[1], pg: db.code, constraint: db.constraint });
      return c.json({ code: answer[1], message: answer[2] }, answer[0]);
    }
    log.error('api.unhandled', { path: c.req.path, message: err.message });
    return c.json({ code: 'INTERNAL', message: 'Something went wrong. Please try again.' }, 500);
  });

  return app;
}
