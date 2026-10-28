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
| Marketing site | Astro (static output) | Fast pages, tiny attack surface. Hosted as static files (Cloudflare Pages assumed). |
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

Owner and backup reviewer sign in with email + password + TOTP (Better-Auth `twoFactor`).
No public password sign-up; the owner provisions staff. `requireStaff('owner')` guards payments,
`requireStaff('owner', 'backup_reviewer')` documents and reports. Both require 2FA to be enabled,
checked on the server. RLS policies on payment tables additionally only admit `app.role = 'owner'`.

## Database access

Tables (`apps/api/src/db/schema/`) follow spec 12.1. Discoverable profile fields live in `profile`. Private data has
its own tables with stricter rules: `private_contact`, `photo_original` (original photo keys; `photo` holds only the
blurred copy) and `verification_case`. Plans are versioned (`plan`, `price_version`, amounts in minor units), and plan
access is an append-only history (`entitlement_event`).

Row-level security is the second layer under the API's own checks:

- `withActor(actor, fn)` runs a transaction as the role `fh_app` (`SET LOCAL ROLE`) and sets `app.user_id` and
  `app.role`. `fh_app` has no BYPASSRLS and only explicit grants.
- Every domain table has RLS enabled and denies by default. The policies, helper functions and invariant triggers are
  in `drizzle/0003_access_rules.sql`.
- Helper functions such as `app.operates_profile()` and `app.can_view_private()` are SECURITY DEFINER and only answer
  about the current actor.
- Staff powers need the claimed role, an active `staff_member` row and two-step login, checked in the database. The
  backup reviewer has no payment access at all.
- Triggers hold what a policy cannot express:
  - append-only history and audit
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
  revoked manager, the backup reviewer and the owner (`test/access-rules.test.ts`).

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
`retention.sweep` (6-month records). `notifications.send` drains the notification outbox.
