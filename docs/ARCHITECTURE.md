# Architecture

Chosen stack (owner decision, 27 Oct 2026). It replaces the Supabase/Replit suggestion in the
spec's D6/D7; the business rules in `OWNER-DECISIONS.md` are unchanged. Nothing is live yet.

## Repository layout

```
apps/website/      Astro — public marketing site, static HTML, almost no JavaScript
apps/member/       Vite + React + TypeScript — member app (SPA behind sign-in), served at /app/
apps/api/          Hono + TypeScript on Node — the single API and security boundary
packages/shared/   Zod schemas, constants, helpers shared by all three
docs/              owner decisions, architecture, build progress, spec PDF
reference/         the original demo, READ-ONLY (copy from it; never edit or deploy it)
```

## Components

| Layer | Choice | Why / notes |
| --- | --- | --- |
| Marketing site | Astro 7.4 (static output) | Fast pages, tiny attack surface. Hosted as static files (Cloudflare Pages assumed). See "Website". |
| Member app | Vite, React 19, TypeScript | SPA behind login, no server rendering needed. |
| UI | Tailwind + Radix UI | Accessible primitives. The demo's design tokens and UI components are in `apps/member` (Stage 1); screens move with their stage. |
| Server state | TanStack Query | The API stays the source of truth; no duplicated client state. |
| Validation | Zod (`@fh/shared`) | Same schemas in forms and on the server; server always re-validates. |
| API | Hono on Node 22, Fly.io or Railway | One typed API: every request passes the same auth + permission checks. |
| Auth | Better-Auth, self-hosted (≥ 1.6.22) | Email + SMS codes, sessions, password hashing, TOTP for staff. Users in our DB, no per-user fees. |
| Database | Neon Postgres + Drizzle ORM / Drizzle Kit | Versioned SQL migrations in `apps/api/drizzle/`. Separate staging and production. |
| Second layer | Postgres row-level security | Member and staff transactions run as the role `fh_app` with `app.user_id` / `app.role` set (`db/actor.ts`); policies deny by default. See "Database access". |
| Files | Cloudflare R2, private buckets | ID documents, payment proofs, original photos. Short-lived signed URLs only. |
| Images | sharp (in the API) | Real image decoding, metadata stripping, separate blurred copies. |
| Jobs | pg-boss (inside Postgres) | Document auto-deletion, retention, notifications. No extra service. |
| Email | Resend | Login codes now; notifications later. |
| SMS | Adapter in `apps/api/src/messaging/sms.ts` | Provider chosen later; `SMS_PROVIDER=none` until then. |

## Request flow

```
Browser (website, static)         Browser (member app /app/)
                                     │  cookie: fh.session_token (httpOnly, Secure, SameSite=Lax)
                                     ▼
                         API (Hono)  ── /api/auth/*  → Better-Auth
                                     ── /api/v1/*    → loadSession → requireUser / requireStaff(role)
                                                       → Zod validation → withActor(tx) → Drizzle
                                     ── /health
                                     │
                    ┌────────────────┼──────────────────────┐
                 Neon Postgres     Cloudflare R2         Resend / SMS
             (app tables + RLS,   (private buckets,
              auth_*, pgboss)      signed URLs)
```

### Domains and cookies

The session cookie must be first-party. In production run the member app and the API on the
same registrable domain, e.g. `yourdomain/app/` + `api.yourdomain` (or proxy `/api` from the
same host). Until the domain is bought, test locally: the Vite dev server proxies `/api` to
the API so everything is same-origin. Do not rely on `*.fly.dev` + `*.pages.dev` together —
browsers treat them as different sites and block the cookie.

Same-origin for the browser is not enough for Better-Auth: it compares the browser's `Origin`
header with `ALLOWED_ORIGINS` and refuses anything else with `403 Invalid origin`. List every
address members open: locally the website (`http://localhost:4321`) and the member app's dev
server (`http://localhost:5173`); in staging and production the site's own origin. The API
refuses to start when the origin of `MEMBER_APP_URL` is missing from `ALLOWED_ORIGINS`.

## Login codes (email now, SMS built in)

```
Member app ─ authClient.emailOtp.sendVerificationOtp({ email })  ─▶ Better-Auth ─▶ sendEmail()  ─▶ Resend
           ─ authClient.phoneNumber.sendOtp({ phoneNumber })     ─▶ Better-Auth ─▶ sendSms()    ─▶ SMS adapter
           ─ signIn.emailOtp / phoneNumber.verify ({ code })     ─▶ Better-Auth ─▶ session cookie
```

- Codes: 6 digits, 10 minutes, 5 attempts, 3 requests/min per IP+endpoint (rate limit).
- Phone-only members get a placeholder email on the reserved `.invalid` domain that is never emailed.
- `SMS_PROVIDER=none`: the API answers `503 SMS_UNAVAILABLE` and the app hides SMS
  (`VITE_LOGIN_SMS_ENABLED=false`). Nothing pretends a code was sent.
- Before the domain is verified in Resend, `onboarding@resend.dev` only delivers to the Resend
  account owner's inbox (others get HTTP 403). After buying the domain: verify it in Resend
  (SPF/DKIM), set `EMAIL_FROM`, update `siteUrl`, `API_URL`, `ALLOWED_ORIGINS`.

### Adding the SMS provider later

1. Add a sender in `apps/api/src/messaging/sms.ts` and its name to `SMS_PROVIDERS` in `@fh/shared`.
2. Add credential names to `apps/api/.env.example`; set real values as host secrets.
3. Set `SMS_PROVIDER=<name>` (API) and `VITE_LOGIN_SMS_ENABLED=true` (member app).
4. Test Sri Lankan and overseas numbers (Part 2 checklist).

## Staff

The owner and the backup reviewer sign in with email, password and TOTP (Better-Auth `twoFactor`). There is no
public password sign-up.

- **Accounts.** The developer and the owner create staff accounts together with
  `npm run staff -w @fh/api -- add --email … --name … --role owner|backup_reviewer`. The password is typed at a
  hidden prompt.
- **Two-step login.** At first sign-in, the staff member turns it on: `/api/auth/two-factor/enable` returns the
  authenticator link and backup codes. Staff routes refuse to work until it is on.
- **Route guards.** `requireStaff('owner')` guards payments; `requireStaff('owner', 'backup_reviewer')` guards documents
  and reports. Both need two-step login, and the database re-checks role and two-step login in every policy.
- **Leaving.** `npm run staff -w @fh/api -- revoke --email …` removes the role and ends every session at once.
- **Lost authenticator.** Use a backup code first. If those are lost too, the developer and the owner run
  `reset-2fa --email …` together. It turns two-step login off and ends all sessions, and staff powers stay locked until
  it is set up again.

## Accounts, profiles and invitations (Stage 2)

The API is built by `createApp(deps)` (`src/app.ts`): database, Better-Auth, storage and messaging are passed in.
`src/index.ts` wires the real services, and the tests wire PGlite with in-memory fakes. Route code reads and writes
member data only through `withActor(c, tx => …)` (`src/http.ts`).

- **Members.** They sign in with an email code; SMS codes stay BLOCKED until a provider is chosen. The member account
  is created on first use, unless the owner has paused sign-ups (`operations_flag`).
- **Profiles.** `/api/v1/profiles` covers create (self, or managed with an authority declaration), edit with a version
  check, publish and pause, contacts, and the candidate's controls. Publishing needs a complete profile, no candidate
  objection, and the publisher's approved document plus SMS-verified phone. The publisher is the active manager,
  otherwise the candidate.
- **Invitations (§5).**
  - The link carries a 32-byte token in its fragment (`/app/invite#…`), so it never reaches server logs. It is stored
    as sha256, is single-use, lasts 24 hours, and a new one replaces the old.
  - A manager can send up to 3 a day per profile, and never to their own email or phone.
  - Opening the link sends a 6-digit code to the nominated contact. Each code lasts 10 minutes and allows 5 tries;
    up to 3 codes per link. It is stored as an HMAC.
  - Accepting (signed in) or declining (no account needed) runs in one locked database function, so a link cannot be
    used twice.
- **Candidate controls.** The candidate sets the manager's permissions and decides what is shared. Withdrawing consent
  takes the profile down, and only the candidate can lift that. Takeover revokes the manager at once and keeps the
  plan; a published profile pauses until the candidate's own identity is verified.
- **Documents.** NIC, passport or driving licence, as a photo (JPEG, PNG or WebP, at most 5 MB). The image is decoded
  and re-encoded by sharp, which strips metadata, and stored in the private bucket. Members never get a link to it.
  Staff see the queue without files; opening a document gives a 120-second signed link and writes an audit record.
  Decisions are final and stamped by the database, with a purge date 90 days on.
- **`documents.purge`.** It runs daily and deletes each due file before clearing its key, so a failed delete is retried
  the next night. Each run is logged and audited with counts only.

## Member app screens (Stages 2b, 3b, 4b, 5a and 5b)

One single-page app at `/app` (`apps/member`, react-router with base `/app`). Members and staff use the same app; the
staff area is `/app/staff`.

| Route | Screen |
| --- | --- |
| `/` | Sign-in with an email code, the account holder's name on first sign-in, then the dashboard: own and managed profiles, creating one, the verification summary, and the account itself (download my data, delete my account) |
| `/profiles/:id` | Overview (badges, publishing, the plan with its expiry warning and remaining requests, "engaged or married", deleting the profile), Details in four steps, Photos, Contacts, Requests (received, sent), Connections (with blocked profiles), Plan (the plan in force, what each plan would do now, the payment step, receipts and past payments), and for guardian-managed profiles the candidate's or manager's panel (the manager's includes handing the profile over) |
| `/browse` | Discovery with filters, for verified members |
| `/members/:id` | Another member's profile: photos (blurred unless allowed), where the acting profile stands, sending a request after seeing what will be shared, blocking and reporting |
| `/verify` | Phone check by SMS code and the identity-document upload |
| `/invite#…` | The candidate's invitation: code, then accept (signing in on the spot) or decline (no account) |
| `/staff` | Staff sign-in with password and two-step login, enrolment, the document review queue and the report queue; for the owner only, the payment queue with its decisions, plans and prices, payment details, and the service switches |

- **Acting profile.** A manager may run several profiles, so `/browse` and `/members/:id` act for the profile in
  `?as=`. The server checks that the account really operates it.
- **Plan and payment (4b).** The Plan tab shows each plan's price in LKR and USD and what buying it would do now:
  start, upgrade, renew, or wait (with the date renewal opens). The payment step asks where the payer lives, offers
  only the methods the owner switched on for that currency, shows the draft refund terms, and needs ticks for the
  terms and any lost days. The payment card then shows the amount, the owner's details, the reference (with a copy
  button) and the receipt upload: photos or screenshots, checked in the browser and again on the server. Plan dates
  are shown on the Sri Lanka clock.
- **Owner screens (4b).** The payment queue (waiting payments first, with how long each has waited and the residence
  flags explained) opens each payment with its receipts (each look logged). Approve needs the statement line and a
  tick that the transfer was found in the real statement. Hold, reject, refund, notes, statement-line corrections, the
  profile's plan history, grant and revoke sit on the same page. The Plans tab adds, edits, re-prices, retires and
  deletes plans; Payment details holds the account details members pay into. The backup reviewer never sees these
  tabs, and the server refuses them anyway.
- **Bot check.** With `VITE_TURNSTILE_SITE_KEY` set, the Cloudflare Turnstile widget appears on every form that sends
  a code or tries a staff password (`src/components/turnstile.tsx`); its one-time token goes in the
  `X-Captcha-Response` header and the widget starts over after each use. Without a key there is no widget.
- **Account and deletion (5a).** The dashboard's "Your account" card downloads the data export and deletes the account.
  Before deleting, a dialog shows what happens to each profile (deleted, or passed to its candidate), what goes now,
  what is kept for 6 months, and payments still being checked; it needs a tick and a sign-in within the last 15
  minutes (otherwise it offers to sign out and in again). A profile's Overview has "Delete this profile" for its
  candidate, or for its manager while no candidate has joined; a manager of a joined candidate is pointed to "Hand the
  profile over" in the Candidate tab. The sign-in screen and the document upload say when the owner has paused them,
  and the owner's Service tab switches the pauses.
- **Help footer (5b).** Every member screen and the sign-in page end with "Need help?": WhatsApp and calls on the
  support number, the support email, "Favorite Hearts staff will never ask for your password or a code", and links to
  the website's help, terms and privacy pages. The number and email come from the website's `site.config.json`, so the
  app and the website always show the same ones. Staff screens leave it out.

- **One contract.** The API's response shapes are in `packages/shared/src/api-types.ts`; the API annotates its
  responses with them and the app reads them, so both sides compile against the same types. Forms validate with the
  same Zod schemas as the API (`profileFieldsSchema`, `contactSchema`). The details form sends only changed fields,
  with the version it was based on.
- **Data.** TanStack Query hooks in `src/lib/queries.ts`; signing in or out resets the cache. API errors arrive as
  `{ code, message, fields }` and are shown as written, with field errors next to their fields.
- **Two-step enrolment.** The QR code is drawn in the browser (`uqr`), so the secret never goes to a QR service.
  Backup codes are shown once and must be confirmed as saved.
- **Failures.** A screen that fails to render shows a reload notice instead of a blank page (`ErrorBoundary`, reset
  when the route changes).

### Sandbox

`npm run dev:sandbox` (`apps/api/scripts/sandbox.ts`) runs the real `createApp` on PGlite with every migration, for
trying the screens without any service:

- Email and SMS go to the console (codes, invitation links). `/health` reports SMS as available, so the phone screens
  can be tried; on real environments SMS stays BLOCKED until a provider is chosen.
- Files stay in memory; staff see documents as `data:` URLs instead of signed links.
- Two staff accounts (`owner@sandbox.test`, `reviewer@sandbox.test`) get a random password, printed at start and new
  on every run. Two-step login is set up on first sign-in, as anywhere else.
- Four synthetic test members are seeded: verified, published, "Sandbox test member" in their bio, two with generated
  placeholder photos, one on Starter and one on Premium. They sign in with the email code printed in the console.
- Payment details start empty, as everywhere: sign in as the owner and enter test details first. For a quick plan the
  sandbox alone also has `POST /sandbox/plans` on its API port. The member app's proxy does not reach it, and it is
  not part of the real API. The sandbox runs no scheduled jobs, so expiry and payment emails are not sent there.
- The bot check is off unless `TURNSTILE_SECRET_KEY` is set. Cloudflare's always-passing test keys
  (`TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA` for the sandbox and
  `VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA` for the member app) show the test widget and check its token
  with Cloudflare.
- It never reads `apps/api/.env`, listens on 127.0.0.1 only, and uses ports 8788 (API) and 5174 (member app), so it
  can run beside `npm run dev`. `SANDBOX_API_PORT` and `SANDBOX_MEMBER_ORIGIN` move it, e.g. for a second sandbox.
  Nothing in it is deployed.

## Requests, connections and privacy (Stage 3)

Server side (3a). The rules live in `drizzle/0007_requests_and_privacy.sql`; the routes are `src/routes/discover.ts`,
`requests.ts`, `photos.ts` and `reports.ts`, plus the report queue in `staff.ts`.

- **Who browses.** Only verified members (owner decision, 29 Oct 2026). That means the account passed its own checks
  (SMS-verified phone and an approved document), or it operates a profile whose publisher did. A candidate who joined
  through an invitation relies on the manager's checks. On real environments this waits for the SMS provider, like
  publishing.
- **Discovery.**
  - `GET /api/v1/discover` filters on the server and lists newest first, 20 per page with a cursor. Filters: gender,
    age range, country, religion, marital status, height range, and caste (consenting profiles only).
  - `GET /api/v1/discover/:id?as=<profile>` returns one profile, plus where the acting profile stands with it.
  - Members get an allowlist (`src/lib/member-view.ts`): age, never the date of birth; caste only with consent; parents'
    names only after both accept (owner decision); contact details only through `app.can_view_private`.
- **One path per action.** Sending, accepting, ending a connection, blocking, reporting, reviewing a report and
  "engaged or married" are each one database function with its own checks. Each takes an advisory lock on the
  profile or the pair, so simultaneous requests give one consistent result. Members cannot insert interests,
  connections, request charges, sharing-log rows, reports or blocks directly.
- **Request limits (section 2).**
  - Starter: 5 a day and 30 in each 30-day block of the plan. Premium: 30 a day. A day starts at midnight Sri Lanka
    time.
  - Each request is charged once, in `quota_ledger`, and never refunded. A repeated idempotency key returns the first
    request.
- **7-day wait (section 4).** After a decline, a withdrawn request or an ended connection, neither profile can send
  the other a new request for 7 days.
- **Sender blur (sections 1, 4).** A receiver without a plan gets previews only: age, occupation and date. The API
  never puts the sender in that response, and the database hides pending requests from unpaid receivers. Answering
  needs a plan.
- **Plan expiry (section 3).** Only the viewer's own plan matters (owner decision, spec O03). The member whose plan
  ended loses contact details and original photos; the paying member keeps them while the connection lasts.
- **Sharing log (section 4).** `disclosure_event` records categories (e.g. `manager_phone`, `gallery`,
  `family_names`), never values. It is written when a request is accepted, when a connection ends, and when a contact
  changes while connected.
- **Blocks.** A block hides each profile from the other, ends their connection and closes open requests. Lifting it
  restores nothing. The blocked side never sees the block.
- **Reports (section 7).**
  - Serious categories hide the content after 1 open report; others after open reports from 3 different verified
    accounts. A photo report hides only that photo; a profile report hides the profile until staff decide.
  - A hidden profile is frozen: it is out of discovery, and it neither shows nor sees private details.
  - Staff decide each report. Upheld keeps the content hidden; dismissed restores it unless the remaining reports
    still meet a threshold. The queue shows each reporter's earlier dismissed reports. Decisions are audited.
- **Photos (sections 6, 7).**
  - Up to 5, one cover. sharp re-encodes the original into the private bucket and makes a separate blurred copy in
    the derived bucket.
  - A signed link is made only for what row-level security returned: the original for the profile's operators, a
    cover the member chose to show, or a connection with a plan; otherwise the blurred copy.
  - Changing photos needs edit rights.
- **Engaged or married (section 7).** The member confirms the warning first. The profile is hidden, the plan is
  forfeited and open requests close; connections stay on record. The profile may be published again later, without
  the forfeited plan.

## Plans and payments (Stage 4)

Server side (4a). The rules live in `drizzle/0009_payment_rules.sql`; the routes are `src/routes/billing.ts`
(members and the public catalogue) and `src/routes/owner.ts` (owner only).

- **Plans the owner manages.** Each plan has a name, a level, a length in months and request limits. Prices are
  versioned rows in minor units: a new price closes the current version, so a payment already started keeps its quote.
  A plan anyone ever bought or was granted is retired, never deleted. `GET /api/v1/plans` is public.
- **Which price (section 2).** The payer declares their country of residence. Sri Lanka pays the local LKR price,
  anywhere else the diaspora USD price. LKR arrives by local bank transfer; USD by SWIFT, Wise or PayPal.
- **Payment details (section 9).** Only the owner enters them, per method, in `payment_channel_setting`. Every method
  starts off and empty. Members see a method's details only once the owner has switched it on. Each change is audited
  with the details before and after.
- **A payment's life.**
  1. The member starts it (`start_payment`). They confirm the refund terms (`refund-v1`) and, for an upgrade or a
     renewal, the days they lose. They get a unique reference: `FH` and 6 characters, without 0/O or 1/I/L.
  2. They add receipt images (`attach_payment_proof`). These are re-encoded by sharp into the private bucket, at most
     5, and every one is kept.
  3. The owner finds the transfer in the real statement and approves it with that statement line
     (`approve_payment`). One payment per profile can be open at a time; before a receipt the member can cancel.
  - The owner can also hold a payment for more (the member's next receipt puts it back in review), reject it (the
    reason is shown to the member), or refund it.
- **Approval, exactly once.** In one transaction it locks the payment and the profile, re-checks the plan rules (time
  may have passed), adds one grant or replacement that starts now, and queues the payer's email. A repeat with the
  same statement line returns the first result. A statement line (compared without case or extra spaces) can be used
  by one payment only, and a unique index allows one grant per payment.
- **Plan changes (owner decision, 29 Oct 2026).** A higher level is an upgrade and replaces the plan on approval; the
  unused days are lost. The same level renews only in the last 7 days. A lower level is blocked while a plan is active.
  Every new term starts at approval and lasts whole calendar months on the Sri Lanka clock.
- **Renewal grace (owner decision).** After the end, access continues for up to 3 days while a receipt sent before the
  end waits for review (in review or held). A rejection ends it at once.
- **Refunds and disputes (section 9).** Only for a duplicate payment, a mistaken payment or a failure on our side. The
  owner decides whether the plan that payment bought ends now. Disputes and suspensions use a manual revoke with a
  reason; the owner can also grant a plan without a payment, with a reason.
- **The owner's queue.** `app.owner_payments` lists waiting payments first, oldest receipt first, with residence
  flags for review: the profile's country differs, or the phone country does not match the declared residence. It
  finds a payment by its reference or statement line. Each look at a receipt is audited.
- **Takeover (section 5).** The plan belongs to the profile, so the candidate keeps the paid time. The former
  manager's payments that never got a receipt are cancelled, and the candidate never sees the manager's payments.
- **Owner only, twice over.** The `/api/v1/owner` routes need the owner role with two-step login. Every payment
  function checks `app.is_owner()` again, and the backup reviewer sees no payments, receipts, plan history or their
  audit entries.
- **Emails.** Payment decisions go to the payer. Expiry warnings go to everyone running the profile: 7 days before the
  end, on the last day, and once it has ended. They state the date and what will be hidden. They are queued in
  `notification_outbox` in the same transaction as the event, so each is sent once.

## Safety (Stage 5a)

Rate limits, security headers, the owner's pause switches, deletion with the retention list, and the data export. The
database rules are in `drizzle/0011_safety_rules.sql`; tests in `test/safety.test.ts`.

- **Rate limits** (Part 2: sign-in, codes, requests, invitations, reports, uploads). Counted in Postgres
  (`rate_limit_counter`, one atomic statement per request), so limits hold across restarts and API instances.
  Better-Auth counts its own in the same table (`customStorage`). A refusal is `429 RATE_LIMITED` with `Retry-After`.
  The numbers are proposed (BUILD-PROGRESS decisions) and live in `src/lib/rate-limit.ts` and `src/auth.ts`:

  | What | Limit |
  | --- | --- |
  | Code requests (email or SMS) | 3 a minute per IP address, and 5 an hour per address whatever the IP |
  | Signing in with a code | 10 a minute per IP address |
  | Staff password; staff two-step code | 5 a minute per IP address each |
  | Sending requests | 10 a minute per account (the plan caps still apply) |
  | Answering, withdrawing and ending | 30 a minute per account |
  | Blocks; reports | 20 and 10 an hour per account |
  | Invitations sent; candidate invitation codes | 10 an hour per account; 10 a minute per IP address |
  | Photo, document and receipt uploads | 30, 5 and 10 an hour per account |
  | Starting payments; new profiles | 10 an hour; 10 a day per account |
  | Data export; deleting or handing over | 5 a day; 10 an hour per account |
  | Everything else under `/api/v1` | 300 a minute per account, 120 a minute per IP address for visitors |

  Behind a proxy only the header the host sets is trusted for the visitor's address: `CLIENT_IP_HEADER` (for example
  `cf-connecting-ip` behind Cloudflare, `fly-client-ip` on Fly.io) is required in production. Many Sri Lankan mobile
  users share one address (carrier NAT), so the per-address code limit and Turnstile carry most of the weight.
- **Security headers.**
  - API: every answer has `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, `X-Frame-Options:
    DENY`, `nosniff`, `Referrer-Policy: no-referrer`, HSTS, and under `/api` `Cache-Control: no-store` and
    `X-Robots-Tag: noindex`.
  - Static host (`apps/website/public/_headers`, Cloudflare Pages): the website keeps its strict policy; under `/app/`
    it is removed (`! Content-Security-Policy`) because the member app brings its own; HSTS, `X-Frame-Options: DENY`,
    COOP and a Permissions-Policy everywhere; `/app/` pages are `noindex`; hashed app files are cached for a year.
  - Member app: its policy is the first tag of its built page (`apps/member/vite.config.ts`): scripts only from the
    site and `challenges.cloudflare.com` (Turnstile, also as frames), API calls to the site or `VITE_API_URL`, photos
    from R2's signed links (`*.r2.cloudflarestorage.com`), nothing else. The dev server leaves it out.
  - `_redirects` sends `/app/assets/*` to itself before `/app/* → /app/index.html`: Cloudflare Pages follows a rule
    even when a file exists, so without that line every app script would be answered with the page.
  - `npm run preview:site` (`scripts/serve-site.mjs`) serves `dist/site` with Pages' documented `_headers` and
    `_redirects` behaviour, and passes `/api` to `API_ORIGIN`, to check all of this before a deploy.
- **Service switches (section 10).** The owner pauses new sign-ups or document submissions (`PUT
  /api/v1/owner/operations/:key`, audited with the reason). Sign-ups are refused where an account would be created
  (Better-Auth's user hook and the first member call); documents where they are uploaded. `GET
  /api/v1/service-status` lets the app say so in advance. Members already signed up keep using the app.
- **Deleting (section 8; owner decision 30 Oct 2026: the candidate decides).**
  - A profile: its candidate may always delete it; its manager only while no candidate has joined. A manager of a
    joined candidate can hand the profile over instead (`POST /profiles/:id/hand-over`), as after a takeover.
  - An account (`POST /api/v1/account/delete`): the member's own profile is deleted; a profile they manage passes to
    its candidate when one has joined (paid time carries over, the manager's own contact details leave it) and is
    deleted otherwise. The other person is told by email. `GET /api/v1/account/deletion` shows this first.
  - Deleted at once: profile text, photos (files too), contact details and social handles, requests, connections,
    shortlists, invitations, the sharing log, identity document files, notifications, sessions and sign-in methods;
    the sign-in identity is emptied (no name, email or phone). The plan ends; payments without a receipt stop.
  - Kept for 6 months (`RETENTION_MONTHS`), on an empty profile shell nobody operates or sees: payment records with
    their receipts, plan history, reports and blocks, document decisions, the staff audit trail, and a keyed hash
    (HMAC) of the sign-in email and phone in `retained_identity`. The hashes stop a banned person from signing up again:
    no code is sent to those addresses and no account is created.
  - Banned (proposed): the account or one of its profiles was suspended, or a serious report (explicit content, minors,
    threats, scam) against one of its profiles was upheld, before or after the deletion.
  - Deleting needs a sign-in within the last 15 minutes and a confirmation. Staff accounts are not deleted here.
  - Files are queued in `storage_deletion` and deleted straight after the change; failures are retried by the
    `storage.cleanup` job.
- **Retention sweep.** `retention.sweep` (daily) runs `app.retention_purge(6)`: 6 months after a profile or an account
  was deleted, its payment records and receipt files, plan history, reports, blocks, document decisions, the audit
  entries about them, the hashes and the empty shells are deleted. The accountant must confirm 6 months for payment
  records (Part 2).
- **Data export.** `GET /api/v1/account/export` returns one ZIP (`src/lib/data-export.ts`, `src/lib/zip.ts`):
  `data.json` with the account, every profile the member runs (details, contacts, photos, requests, connections,
  shortlist, blocks, plan history), their payments, document reviews (not the document) and reports they made, plus
  the original photos. It is read through row-level security as the app reads it, so it never holds more than the
  member may see: a sender hidden until the member has a plan stays hidden. Each export is audited.

## Website (Stage 5b)

The public site (`apps/website`, Astro 7.4.0 pinned, static output). Its text follows `OWNER-DECISIONS.md`; the terms
and the privacy policy are drafts for the owner's lawyer, and what the lawyer must check is in `LEGAL-REVIEW.md`.

- **Settings** (`site.config.json`): the domain (`siteUrl`, https://favoritehearts.com), `indexable` (false until the
  owner approves launch), the support email and phone, the social links (a link stays hidden while it is `null`), and
  `release`, added to every stylesheet and script address so browsers fetch new copies after a release.
- **Prices.** The pricing page has no price in its HTML. `assets/js/pricing.js` loads the owner's live catalogue
  (`GET /api/v1/plans`, the plans and prices the app sells), builds the cards with `textContent` because plan names are
  the owner's text, and switches between LKR and USD with the visitor's country choice. When the API cannot be
  reached, the page says so and points to the app; it never falls back to a stored or sample price. The API is called
  on the site's own address (`/api` through the production domain). If it gets an address of its own, building with
  `VITE_API_URL` makes `scripts/assemble-site.mjs` add that origin to the website policy's `connect-src`.
- **Legal pages.** `src/components/LegalPage.astro` lays out the terms and the privacy policy from the section lists
  in their pages: numbered contents, the date, a "Draft for legal review" notice that also says the English text is
  the official version, and highlighted placeholders (`[operator’s legal name and address]`) for the owner to fill.
- **Help.** The questions are a data list in `src/pages/help/index.astro`; `assets/js/help.js` filters and searches
  them.
- **Search engines and link previews.** `src/components/Seo.astro` gives every page a canonical link on `siteUrl`, a
  robots tag that follows `indexable`, Open Graph and Twitter tags with a 1200×630 preview photo
  (`public/assets/og-image.jpg`), and JSON-LD. `sitemap.xml` lists every page except the 404 page. `robots.txt`
  disallows everything while `indexable` is false, then allows the site and names the sitemap. The member app is never
  indexed (`X-Robots-Tag: noindex` under `/app/`, see "Safety").
- **Site check.** `npm run check:site` (`scripts/check-site.mjs`, also the last step of `npm run build:site`) reads
  `dist/site` and fails the build on: a missing or repeated title or description; a canonical link that is not the
  page's own address; a robots tag or `robots.txt` that disagrees with `indexable`; missing or mismatched social tags; a
  preview image that is missing or not the size its tags state; a page without exactly one `h1` or without a language;
  JSON-LD that does not parse; a broken internal link, asset or `#anchor`; a sitemap that misses or adds a page; and
  `/app/` without `noindex`. Titles over 70 and descriptions over 160 characters, which search results may shorten,
  are listed as notes.

## Database access

Tables (`apps/api/src/db/schema/`) follow spec 12.1. Discoverable profile fields live in `profile`. Private data has
its own tables with stricter rules: `private_contact`, `photo_original` (original photo keys; `photo` holds only the
blurred copy) and `verification_case`. Plans are versioned (`plan`, `price_version`, amounts in minor units), and plan
access is an append-only history (`entitlement_event`).

Row-level security is the second layer under the API's own checks:

- `withActor(c, fn)` (`src/http.ts`, over `runAsActor` in `src/db/actor.ts`) runs a transaction as the role
  `fh_app` (`SET LOCAL ROLE`) and sets `app.user_id` and `app.role`. `fh_app` has no BYPASSRLS and only explicit
  grants.
- Every domain table has RLS enabled and denies by default. The policies, helper functions and invariant triggers are
  in `drizzle/0003_access_rules.sql`, extended in `0005_accounts_and_trust.sql`.
- Helper functions such as `app.operates_profile()` and `app.can_view_private()` are SECURITY DEFINER and only answer
  about the current actor.
- Staff powers need the claimed role, an active `staff_member` row and two-step login, checked in the database. The
  backup reviewer has no payment access at all.
- Triggers hold what a policy cannot express:
  - append-only history and audit (outside `fh_app` a row may only lose a link to a deleted record, never change)
  - prices that are versioned, never edited
  - the 3-profile manager limit
  - invitation rules
  - interest, connection and payment state changes
  - `first_published_at` set once
- Neon's owner role (`neondb_owner`) has BYPASSRLS, so code on the plain connection bypasses the policies. That code
  is Better-Auth, jobs, migrations and the staff lookup in `requireStaff`. Keep it minimal; everything acting for a
  person goes through `withActor`.
- `npm test -w @fh/api` runs every migration in PGlite (PostgreSQL 18.6 in-process, the same version as Neon dev).
  It tests the rules with separate accounts: anonymous, two members, an unpaid member, a manager, a candidate, a
  revoked manager, the backup reviewer and the owner (`test/access-rules.test.ts`). It also drives the real HTTP API
  through Better-Auth sign-in, invitations, document review and the purge job (`test/api.test.ts`).

Adding a table:

1. Define it in `src/db/schema/` and run `npm run db:generate`.
2. In a custom migration (`npx drizzle-kit generate --custom`), grant `fh_app` only what it needs, enable RLS and add
   the policies.
3. Add tests. Separate every SQL statement with `--> statement-breakpoint`.

## Environments

| Environment | Database | Data |
| --- | --- | --- |
| Development | Neon dev branch (`apps/api/.env`) | Synthetic only |
| Staging | Separate Neon project, `favorite-hearts-staging` | Synthetic only (D6) |
| Production | Separate Neon project, `favorite-hearts-production` | Real members, after launch approval |

Staging and production are separate Neon projects, not branches of one project, so no credential or branch reset can
cross between them. They are created in the owner's Neon account (D5); the developer is a collaborator.

For each project:

1. Region: Asia Pacific (Singapore). Use Postgres 18, the version the migrations and tests run on.
2. Create the database `favorite_hearts`.
3. Put the pooled URL into `DATABASE_URL` and the direct URL into `DATABASE_URL_DIRECT` in the API host's secret store
   for that environment. They never go in code or chat.
4. Run `npm run db:migrate` with that environment's direct URL before the first deploy, and before every release that
   adds migrations.

## Files

Upload → API checks permission → sharp decodes/validates (5 MiB max) → original (metadata stripped)
to the private bucket, blurred copy to the derived bucket → keys stored in Postgres. Viewing →
API checks the viewer's right to that exact object (connection, plan, block, cover toggle) →
returns a signed URL valid for `SIGNED_URL_TTL_SECONDS` (default 120 s). No public bucket URLs.

## Jobs

pg-boss runs in the API process on one instance (`RUN_JOBS=true`), using the direct Neon
connection. Scheduled daily at 02:00 / 02:15 Sri Lanka time: `documents.purge` (D8, 90 days),
`retention.sweep` (D8: what was kept 6 months after a deletion; it also clears old rate-limit counters).
`storage.cleanup` runs every 10 minutes and retries file deletions that failed. `plans.expiry_warnings` runs daily at
09:00 Sri Lanka time and queues the expiry emails. `notifications.send` runs every 2 minutes and drains the notification outbox through Resend. It claims each
row first and passes the event key as Resend's idempotency key, so a retry never sends twice. It gives up after 5
attempts and skips phone-only accounts until SMS exists.

## Bot check (Turnstile)

Every endpoint that sends a code or checks a password needs a Cloudflare Turnstile token in the
`X-Captcha-Response` header. The API verifies it with Cloudflare (`src/middleware/turnstile.ts`) before anything is
sent. The check is off while `TURNSTILE_SECRET_KEY` is empty (local development) and required in production. If
Cloudflare cannot be reached, it fails closed. The member app shows the widget when `VITE_TURNSTILE_SITE_KEY` is set
(see "Member app screens"); the site key and the secret come from the owner's Cloudflare account. The member app's
security policy allows `challenges.cloudflare.com` for scripts and frames (see "Safety").
