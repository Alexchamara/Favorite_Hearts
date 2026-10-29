import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import { HttpError, pgError, type AppEnv, type Deps, type PgError } from './http.ts';
import { log } from './lib/log.ts';
import { loadSession } from './middleware/session.ts';
import { turnstileGuard } from './middleware/turnstile.ts';
import { payments, plans, profileBilling } from './routes/billing.ts';
import { discover } from './routes/discover.ts';
import { health } from './routes/health.ts';
import { invitations } from './routes/invitations.ts';
import { me } from './routes/me.ts';
import { owner } from './routes/owner.ts';
import { profilePhotos } from './routes/photos.ts';
import { profiles } from './routes/profiles.ts';
import { reports } from './routes/reports.ts';
import { connections, interests, profileRequests } from './routes/requests.ts';
import { staff } from './routes/staff.ts';
import { verification } from './routes/verification.ts';

type Answer = [status: 400 | 403 | 404 | 409 | 429, code: string, message: string];

/** Endpoints that send a code or check a password: a Turnstile token is required once a secret is configured. */
const TURNSTILE_PATHS = [
  '/api/auth/email-otp/send-verification-otp',
  '/api/auth/email-otp/request-password-reset',
  '/api/auth/email-otp/request-email-change',
  '/api/auth/forget-password/email-otp',
  '/api/auth/phone-number/send-otp',
  '/api/auth/phone-number/request-password-reset',
  '/api/auth/sign-in/email',
  '/api/v1/invitations/code',
];

/** Friendly answers for rules the database enforces (the API usually checks first). */
const CONSTRAINTS: Record<string, Answer> = {
  profile_one_per_candidate_idx: [409, 'PROFILE_EXISTS', 'You already have your own profile.'],
  verification_case_one_pending_idx: [409, 'VERIFICATION_PENDING', 'Your document is already waiting for review.'],
  profile_published_complete: [400, 'PROFILE_INCOMPLETE', 'Complete the profile before publishing.'],
  profile_caste_needs_consent: [400, 'VALIDATION', 'Caste can only be saved with your explicit consent.'],
  report_one_open_idx: [409, 'REPORT_EXISTS', 'You already reported this for that reason. Our staff will review it.'],
  photo_profile_slot_idx: [409, 'PHOTO_LIMIT', 'A profile can have up to 5 photos.'],
  payment_submission_one_open_idx: [409, 'PAYMENT_OPEN', 'This profile already has a payment in progress. Finish or cancel it first.'],
  payment_submission_settlement_ref_unique: [409, 'SETTLEMENT_USED', 'That statement line was already used for another payment.'],
  plan_pkey: [409, 'PLAN_EXISTS', 'A plan with this code already exists.'],
};
const RAISED: Record<string, Answer> = {
  manager_capacity_reached: [409, 'MANAGER_LIMIT', 'A manager can run up to 3 profiles. Contact us if you need more.'],
  invitation_contact_matches_manager: [400, 'INVITE_CONTACT_IS_MANAGER', 'Use the candidate’s own email or phone, not yours.'],
  // Requests and connections (drizzle/0007_requests_and_privacy.sql).
  interest_not_allowed: [403, 'NOT_ALLOWED', 'You cannot send or answer requests for this profile.'],
  interest_key_reused: [409, 'CONFLICT', 'This request was already sent.'],
  interest_sender_not_published: [409, 'PROFILE_NOT_PUBLISHED', 'Publish your profile before sending requests.'],
  interest_needs_plan: [403, 'PLAN_REQUIRED', 'A plan is needed to send, see and accept requests.'],
  interest_receiver_unavailable: [404, 'PROFILE_UNAVAILABLE', 'This profile is not available.'],
  interest_already_connected: [409, 'ALREADY_CONNECTED', 'You are already connected with this profile.'],
  interest_already_pending: [409, 'REQUEST_PENDING', 'There is already an open request between you and this profile.'],
  interest_cooldown: [409, 'REQUEST_COOLDOWN', 'You can send a new request to this profile 7 days after the last one ended.'],
  interest_daily_limit: [429, 'DAILY_LIMIT', 'You have used today’s requests. More are available after midnight, Sri Lanka time.'],
  interest_monthly_limit: [429, 'MONTHLY_LIMIT', 'You have used this month’s requests on your plan.'],
  interest_not_found: [404, 'NOT_FOUND', 'Request not found.'],
  interest_closed: [409, 'REQUEST_CLOSED', 'This request was already answered or withdrawn.'],
  interest_unavailable: [409, 'PROFILE_UNAVAILABLE', 'One of the profiles is not available right now.'],
  connection_not_found: [404, 'NOT_FOUND', 'Connection not found.'],
  block_not_allowed: [403, 'NOT_ALLOWED', 'You cannot block this profile.'],
  profile_not_allowed: [403, 'NOT_ALLOWED', 'You cannot change this profile.'],
  profile_not_engageable: [409, 'PROFILE_NOT_ACTIVE', 'Only a published or paused profile can be marked engaged or married.'],
  report_not_allowed: [403, 'NOT_ALLOWED', 'You cannot report this profile.'],
  report_needs_verification: [403, 'VERIFICATION_REQUIRED', 'Reporting opens once your identity document is reviewed and your phone is verified.'],
  report_target_unavailable: [404, 'PROFILE_UNAVAILABLE', 'This profile is not available.'],
  report_not_found: [404, 'NOT_FOUND', 'Report not found.'],
  report_already_decided: [409, 'ALREADY_DECIDED', 'This report was already decided.'],
  // Plans and payments (drizzle/0009_payment_rules.sql).
  payment_not_allowed: [403, 'NOT_ALLOWED', 'You cannot pay for this profile.'],
  payment_terms_unconfirmed: [400, 'TERMS_REQUIRED', 'Confirm that you have read the refund terms.'],
  payment_country_invalid: [400, 'VALIDATION', 'Choose the country you live in.'],
  payment_profile_not_published: [409, 'PROFILE_NOT_PUBLISHED', 'Publish the profile before buying a plan.'],
  payment_already_open: [409, 'PAYMENT_OPEN', 'This profile already has a payment in progress. Finish or cancel it first.'],
  plan_change_downgrade: [409, 'PLAN_DOWNGRADE', 'A lower plan can be bought once the current plan has ended.'],
  plan_change_too_early: [409, 'RENEWAL_TOO_EARLY', 'A plan at the same level can be renewed in the last 7 days of the current one.'],
  plan_unavailable: [409, 'PLAN_UNAVAILABLE', 'This plan is not on sale.'],
  payment_lost_days_unconfirmed: [400, 'LOST_DAYS_UNCONFIRMED', 'Confirm that the unused days of the current plan will be lost.'],
  payment_price_unavailable: [409, 'PRICE_UNAVAILABLE', 'This plan has no price for your country of residence yet.'],
  payment_channel_currency: [400, 'CHANNEL_CURRENCY', 'Pay LKR by local bank transfer, and USD by SWIFT, Wise or PayPal.'],
  payment_channel_unavailable: [409, 'CHANNEL_UNAVAILABLE', 'This payment method is not set up yet. Please choose another one or try again later.'],
  payment_not_found: [404, 'NOT_FOUND', 'Payment not found.'],
  payment_closed: [409, 'PAYMENT_CLOSED', 'This payment is closed. Start a new one if you still want the plan.'],
  payment_proof_limit: [409, 'PROOF_LIMIT', 'A payment can have up to 5 receipts. Contact us if you need to send more.'],
  payment_not_cancellable: [409, 'PAYMENT_NOT_CANCELLABLE', 'Only a payment without a receipt can be cancelled.'],
  payment_owner_only: [403, 'FORBIDDEN', 'Only the owner can do this.'],
  payment_settlement_required: [400, 'SETTLEMENT_REQUIRED', 'Enter the statement line that matches this payment.'],
  payment_settlement_used: [409, 'SETTLEMENT_USED', 'That statement line was already used for another payment.'],
  payment_already_decided: [409, 'ALREADY_DECIDED', 'This payment was already decided.'],
  payment_no_receipt: [409, 'NO_RECEIPT', 'There is no receipt to review yet.'],
  payment_profile_unavailable: [409, 'PROFILE_UNAVAILABLE', 'The profile is not active, so its plan cannot change.'],
  payment_reason_required: [400, 'REASON_REQUIRED', 'Give a reason.'],
  payment_refund_reason_required: [400, 'REASON_REQUIRED', 'Choose the refund reason.'],
  payment_not_refundable: [409, 'NOT_REFUNDABLE', 'Only a payment whose money was received can be refunded.'],
  payment_has_evidence: [409, 'PAYMENT_HAS_EVIDENCE', 'A payment with a receipt or a decision stays on record. Only one without a receipt can be deleted.'],
  payment_no_settlement: [409, 'NO_SETTLEMENT', 'Only an approved or refunded payment has a statement line.'],
  plan_days_invalid: [400, 'VALIDATION', 'Use 1 to 400 days.'],
  plan_not_found: [404, 'NOT_FOUND', 'Plan not found.'],
  plan_not_active: [409, 'PLAN_NOT_ACTIVE', 'This profile has no active plan.'],
  plan_in_use: [409, 'PLAN_IN_USE', 'This plan was bought or granted, so it stays on record. Retire it instead.'],
  price_invalid: [400, 'VALIDATION', 'Enter a price above 0.'],
};

function databaseAnswer(err: PgError): Answer | null {
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
      allowHeaders: ['Content-Type', 'Idempotency-Key', 'X-Captcha-Response'],
      maxAge: 600,
    }),
  );
  // Default JSON body limit; document, photo and receipt uploads allow a 5 MiB image plus form overhead.
  const small = bodyLimit({ maxSize: 100 * 1024 });
  const upload = bodyLimit({ maxSize: 6 * 1024 * 1024 });
  const isUpload = (path: string) =>
    path === '/api/v1/verification' ||
    /^\/api\/v1\/profiles\/[^/]+\/photos$/.test(path) ||
    /^\/api\/v1\/payments\/[^/]+\/proof$/.test(path);
  app.use('/api/*', (c, next) => (c.req.method === 'POST' && isUpload(c.req.path) ? upload : small)(c, next));

  app.route('/health', health);

  // SMS codes stay off until a provider is configured: say so clearly instead of failing silently.
  app.post('/api/auth/phone-number/send-otp', (c, next) =>
    deps.messenger.smsEnabled
      ? next()
      : c.json({ code: 'SMS_UNAVAILABLE', message: 'SMS sign-in is not available yet. Please use email.' }, 503),
  );
  // Bot check before anything sends a code or tries a password (Cloudflare Turnstile, checked on the server).
  for (const path of TURNSTILE_PATHS) app.post(path, turnstileGuard);
  app.on(['GET', 'POST'], '/api/auth/*', (c) => deps.auth.handler(c.req.raw));

  // Everything below is our own API: session loaded once, permission checks per route.
  // profileRequests, profilePhotos and profileBilling have no guard of their own: profiles' requireMember covers
  // /profiles/*. /owner is the owner's alone (payments): the backup reviewer is refused there and in the database.
  const v1 = new Hono<AppEnv>()
    .use(loadSession)
    .route('/me', me)
    .route('/plans', plans)
    .route('/profiles', profiles)
    .route('/profiles', profileRequests)
    .route('/profiles', profilePhotos)
    .route('/profiles', profileBilling)
    .route('/payments', payments)
    .route('/discover', discover)
    .route('/interests', interests)
    .route('/connections', connections)
    .route('/reports', reports)
    .route('/invitations', invitations)
    .route('/verification', verification)
    .route('/staff', staff)
    .route('/owner', owner);
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
