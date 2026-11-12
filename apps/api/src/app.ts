import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import { HttpError, pgError, type AppEnv, type Deps, type PgError } from './http.ts';
import { render, requestLanguage, text, toRef, type Say } from './text.ts';
import { log } from './lib/log.ts';
import { rateLimits } from './lib/rate-limit.ts';
import { randomUUID } from 'node:crypto';
import { adminMe, adminPolicy, adminRequestGuard, loadAdminSession } from './middleware/admin-session.ts';
import { loadSession } from './middleware/session.ts';
import { turnstileGuard } from './middleware/turnstile.ts';
import { account } from './routes/account.ts';
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
import { serviceStatus } from './routes/service-status.ts';
import { staff } from './routes/staff.ts';
import { verification, verificationLink } from './routes/verification.ts';

type Answer = [status: 400 | 403 | 404 | 409 | 429, code: string, message: Say];

/** Endpoints that send a code or check a password: a Turnstile token is required once a secret is configured. */
const TURNSTILE_PATHS = [
  '/api/auth/phone-number/send-otp',
  '/api/auth/sign-in/email',
  '/api/auth/sign-in/phone-number',
  '/api/auth/member/sign-up',
  '/api/auth/member/sign-up/invitation',
  '/api/auth/request-password-reset',
  '/api/v1/invitations/code',
  '/api/admin/auth/sign-in/email',
];

/** Friendly answers for rules the database enforces (the API usually checks first). */
const CONSTRAINTS: Record<string, Answer> = {
  profile_one_per_candidate_idx: [409, 'PROFILE_EXISTS', 'api.rule.ownProfileExists'],
  verification_case_one_pending_idx: [409, 'VERIFICATION_PENDING', 'api.verification.pending'],
  profile_published_complete: [400, 'PROFILE_INCOMPLETE', 'api.profile.incomplete'],
  profile_caste_needs_consent: [400, 'VALIDATION', 'validation.casteConsent'],
  report_one_open_idx: [409, 'REPORT_EXISTS', 'api.rule.reportExists'],
  photo_profile_slot_idx: [409, 'PHOTO_LIMIT', 'api.photos.limit'],
  payment_submission_one_open_idx: [409, 'PAYMENT_OPEN', 'api.rule.paymentOpen'],
  payment_submission_settlement_ref_unique: [409, 'SETTLEMENT_USED', 'api.staff.settlementUsed'],
  plan_pkey: [409, 'PLAN_EXISTS', 'api.staff.planExists'],
};
const RAISED: Record<string, Answer> = {
  manager_capacity_reached: [409, 'MANAGER_LIMIT', 'api.rule.managerLimit'],
  invitation_contact_matches_manager: [400, 'INVITE_CONTACT_IS_MANAGER', 'api.rule.inviteContactIsManager'],
  // Requests and connections (drizzle/0007_requests_and_privacy.sql).
  interest_not_allowed: [403, 'NOT_ALLOWED', 'api.rule.interestNotAllowed'],
  interest_key_reused: [409, 'CONFLICT', 'api.rule.interestReused'],
  interest_sender_not_published: [409, 'PROFILE_NOT_PUBLISHED', 'api.rule.publishFirst'],
  interest_needs_plan: [403, 'PLAN_REQUIRED', 'api.rule.planNeeded'],
  interest_receiver_unavailable: [404, 'PROFILE_UNAVAILABLE', 'api.profile.unavailable'],
  interest_already_connected: [409, 'ALREADY_CONNECTED', 'api.rule.alreadyConnected'],
  interest_already_pending: [409, 'REQUEST_PENDING', 'api.rule.requestPending'],
  interest_cooldown: [409, 'REQUEST_COOLDOWN', 'api.rule.cooldown'],
  interest_daily_limit: [429, 'DAILY_LIMIT', 'api.rule.dailyLimit'],
  interest_monthly_limit: [429, 'MONTHLY_LIMIT', 'api.rule.monthlyLimit'],
  interest_not_found: [404, 'NOT_FOUND', 'api.requests.notFound'],
  interest_closed: [409, 'REQUEST_CLOSED', 'api.requests.closed'],
  interest_unavailable: [409, 'PROFILE_UNAVAILABLE', 'api.rule.profileUnavailableNow'],
  connection_not_found: [404, 'NOT_FOUND', 'api.rule.connectionNotFound'],
  block_not_allowed: [403, 'NOT_ALLOWED', 'api.rule.blockNotAllowed'],
  // The shortlist (drizzle/0015_shortlist.sql).
  shortlist_not_allowed: [403, 'NOT_ALLOWED', 'api.rule.shortlistNotAllowed'],
  shortlist_target_unavailable: [404, 'PROFILE_UNAVAILABLE', 'api.profile.unavailable'],
  shortlist_full: [409, 'SHORTLIST_FULL', 'api.rule.shortlistFull'],
  profile_not_allowed: [403, 'NOT_ALLOWED', 'api.profile.cannotChange'],
  profile_not_engageable: [409, 'PROFILE_NOT_ACTIVE', 'api.rule.engagedNotActive'],
  report_not_allowed: [403, 'NOT_ALLOWED', 'api.rule.reportNotAllowed'],
  report_needs_verification: [403, 'VERIFICATION_REQUIRED', 'api.rule.reportNeedsVerification'],
  report_target_unavailable: [404, 'PROFILE_UNAVAILABLE', 'api.profile.unavailable'],
  report_not_found: [404, 'NOT_FOUND', 'api.staff.reportNotFound'],
  report_already_decided: [409, 'ALREADY_DECIDED', 'api.staff.reportDecided'],
  // Plans and payments (drizzle/0009_payment_rules.sql).
  payment_not_allowed: [403, 'NOT_ALLOWED', 'api.rule.paymentNotAllowed'],
  payment_terms_unconfirmed: [400, 'TERMS_REQUIRED', 'validation.confirmRefundTerms'],
  payment_country_invalid: [400, 'VALIDATION', 'validation.residenceCountry'],
  payment_profile_not_published: [409, 'PROFILE_NOT_PUBLISHED', 'api.rule.paymentPublishFirst'],
  payment_already_open: [409, 'PAYMENT_OPEN', 'api.rule.paymentOpen'],
  plan_change_downgrade: [409, 'PLAN_DOWNGRADE', 'api.rule.downgrade'],
  plan_change_too_early: [409, 'RENEWAL_TOO_EARLY', 'api.rule.renewalTooEarly'],
  plan_unavailable: [409, 'PLAN_UNAVAILABLE', 'api.rule.planUnavailable'],
  payment_lost_days_unconfirmed: [400, 'LOST_DAYS_UNCONFIRMED', 'api.rule.lostDays'],
  payment_price_unavailable: [409, 'PRICE_UNAVAILABLE', 'api.rule.noPriceForCountry'],
  payment_channel_currency: [400, 'CHANNEL_CURRENCY', 'api.rule.channelCurrency'],
  payment_channel_unavailable: [409, 'CHANNEL_UNAVAILABLE', 'api.rule.channelUnavailable'],
  payment_not_found: [404, 'NOT_FOUND', 'api.payment.notFound'],
  payment_closed: [409, 'PAYMENT_CLOSED', 'api.payment.closed'],
  payment_proof_limit: [409, 'PROOF_LIMIT', 'api.payment.proofLimit'],
  payment_not_cancellable: [409, 'PAYMENT_NOT_CANCELLABLE', 'api.rule.paymentNotCancellable'],
  payment_owner_only: [403, 'FORBIDDEN', 'api.staff.ownerOnly'],
  payment_settlement_required: [400, 'SETTLEMENT_REQUIRED', 'api.staff.settlementRequired'],
  payment_settlement_used: [409, 'SETTLEMENT_USED', 'api.staff.settlementUsed'],
  payment_already_decided: [409, 'ALREADY_DECIDED', 'api.staff.paymentDecided'],
  payment_no_receipt: [409, 'NO_RECEIPT', 'api.staff.noReceipt'],
  payment_profile_unavailable: [409, 'PROFILE_UNAVAILABLE', 'api.staff.profileInactive'],
  payment_reason_required: [400, 'REASON_REQUIRED', 'api.staff.reasonRequired'],
  payment_refund_reason_required: [400, 'REASON_REQUIRED', 'api.staff.refundReasonRequired'],
  payment_not_refundable: [409, 'NOT_REFUNDABLE', 'api.staff.notRefundable'],
  payment_has_evidence: [409, 'PAYMENT_HAS_EVIDENCE', 'api.staff.paymentHasEvidence'],
  payment_no_settlement: [409, 'NO_SETTLEMENT', 'api.staff.noSettlement'],
  plan_days_invalid: [400, 'VALIDATION', 'api.staff.planDays'],
  plan_not_found: [404, 'NOT_FOUND', 'api.staff.planNotFound'],
  plan_not_active: [409, 'PLAN_NOT_ACTIVE', 'api.staff.planNotActive'],
  plan_in_use: [409, 'PLAN_IN_USE', 'api.staff.planInUse'],
  price_invalid: [400, 'VALIDATION', 'api.staff.priceInvalid'],
  // Deletion and hand-over (drizzle/0011_safety_rules.sql).
  profile_delete_candidate_only: [403, 'CANDIDATE_DECIDES', 'api.rule.candidateDecides'],
  hand_over_needs_candidate: [409, 'NO_CANDIDATE', 'api.rule.noCandidate'],
  account_not_found: [404, 'NOT_FOUND', 'api.rule.accountNotFound'],
  account_is_staff: [403, 'STAFF_ACCOUNT', 'api.staff.accountIsStaff'],
};

function databaseAnswer(err: PgError): Answer | null {
  const raised = RAISED[err.message];
  if (raised) return raised;
  if (err.constraint && CONSTRAINTS[err.constraint]) return CONSTRAINTS[err.constraint]!;
  if (err.code === '42501') return [403, 'FORBIDDEN', 'api.forbiddenChange'];
  if (err.code === '23505') return [409, 'CONFLICT', 'api.conflict'];
  if (err.code === '23514' || err.code === '23503' || err.code === '22P02') return [400, 'INVALID', 'api.invalidData'];
  return null;
}

export function createApp(deps: Deps) {
  const app = new Hono<AppEnv>();

  // The API only answers with JSON and files: nothing may run, embed or frame it, and nothing it sends is cached.
  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"] },
      strictTransportSecurity: 'max-age=31536000; includeSubDomains',
      referrerPolicy: 'no-referrer',
      xFrameOptions: 'DENY',
      permissionsPolicy: { camera: [], microphone: [], geolocation: [], payment: [] },
    }),
  );
  app.use('/api/*', async (c, next) => {
    await next();
    if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store');
    c.header('X-Robots-Tag', 'noindex');
  });
  app.use('*', async (c, next) => {
    c.set('deps', deps);
    // One id per request, returned as X-Request-Id and kept in the audit trail as the correlation id.
    c.set('requestId', randomUUID());
    c.header('X-Request-Id', c.var.requestId);
    await next();
  });
  // The member app's origins only. The admin site never uses CORS: it reaches /api/admin through its own proxy, on
  // its own origin, so no other site's script can read or send admin requests.
  const memberCors = cors({
    origin: deps.config.allowedOrigins,
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Idempotency-Key', 'X-Captcha-Response'],
    maxAge: 600,
  });
  app.use('/api/*', (c, next) => (c.req.path.startsWith('/api/admin/') ? next() : memberCors(c, next)));
  // Default JSON body limit; document, photo and receipt uploads allow a 5 MiB image plus form overhead.
  const small = bodyLimit({ maxSize: 100 * 1024 });
  const upload = bodyLimit({ maxSize: 6 * 1024 * 1024 });
  const isUpload = (path: string) =>
    path === '/api/v1/verification' ||
    path === '/api/v1/verification/drafts' ||
    path === '/api/v1/verification-link/drafts' ||
    /^\/api\/v1\/profiles\/[^/]+\/photos$/.test(path) ||
    /^\/api\/v1\/payments\/[^/]+\/proof$/.test(path);
  app.use('/api/*', (c, next) => (c.req.method === 'POST' && isUpload(c.req.path) ? upload : small)(c, next));

  app.get('/', (c) =>
    c.json({
      service: 'favorite-hearts-api',
      status: 'ok',
      health: '/health',
    }),
  );
  app.route('/health', health);

  // SMS codes stay off until a provider is configured: say so clearly instead of failing silently.
  app.post('/api/auth/phone-number/send-otp', (c, next) =>
    deps.messenger.smsEnabled
      ? next()
      : c.json({ code: 'SMS_UNAVAILABLE', message: text(requestLanguage(c), 'api.smsSignInUnavailable') }, 503),
  );
  // Bot check before anything sends a code or tries a password (Cloudflare Turnstile, checked on the server).
  for (const path of TURNSTILE_PATHS) app.post(path, turnstileGuard);
  app.on(['GET', 'POST'], '/api/auth/*', (c) => deps.auth.handler(c.req.raw));

  // Everything below is our own API: session loaded once, permission checks per route.
  // profileRequests, profilePhotos and profileBilling have no guard of their own: profiles' requireMember covers
  // /profiles/*. Staff work is on the admin site only (/api/admin below, since phase admin-2).
  const v1 = new Hono<AppEnv>()
    .use(loadSession)
    .use(rateLimits)
    .route('/service-status', serviceStatus)
    .route('/me', me)
    .route('/account', account)
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
    // The phone page of a QR code: a link token, no session (routes/verification.ts).
    .route('/verification-link', verificationLink);
  app.route('/api/v1', v1);

  // The admin site (docs/ADMIN-PANEL-PLAN.md): its own sign-in and session, then a permission and step-up check per
  // route (admin/policy.ts, default deny). /owner is the owner's alone (payments): the backup reviewer is refused
  // there, in the route files and in the database.
  const admin = new Hono<AppEnv>()
    .use(adminRequestGuard)
    .on(['GET', 'POST'], '/auth/*', (c) => (deps.adminAuth ? deps.adminAuth.handler(c.req.raw) : c.json({ code: 'NOT_FOUND' }, 404)))
    .use(loadAdminSession)
    .use(rateLimits)
    .use(adminPolicy)
    .get('/me', adminMe)
    .route('/staff', staff)
    .route('/owner', owner);
  app.route('/api/admin', admin);

  // Every answer people read is rendered here, in the language the request asks for (text.ts).
  app.notFound((c) => c.json({ code: 'NOT_FOUND', message: text(requestLanguage(c), 'api.notFound') }, 404));
  app.onError((err, c) => {
    const language = requestLanguage(c);
    if (err instanceof HttpError) {
      const fields = err.fields && Object.fromEntries(Object.entries(err.fields).map(([field, ref]) => [field, render(language, ref)]));
      return c.json({ code: err.code, message: render(language, err.text), fields }, err.status);
    }
    if (err instanceof HTTPException) {
      const message = err.status === 413 ? text(language, 'api.tooLarge') : err.message;
      return c.json({ code: 'HTTP_' + err.status, message }, err.status);
    }
    const db = pgError(err);
    const answer = db && databaseAnswer(db);
    if (answer) {
      log.warn('api.rule_rejected', { path: c.req.path, code: answer[1], pg: db.code, constraint: db.constraint });
      return c.json({ code: answer[1], message: render(language, toRef(answer[2])) }, answer[0]);
    }
    log.error('api.unhandled', { path: c.req.path, message: err.message });
    return c.json({ code: 'INTERNAL', message: text(language, 'api.internal') }, 500);
  });

  return app;
}
