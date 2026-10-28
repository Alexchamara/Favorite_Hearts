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
| UI | Tailwind + Radix UI | Accessible primitives; the demo's components move over in Stage 1. |
| Server state | TanStack Query | The API stays the source of truth; no duplicated client state. |
| Validation | Zod (`@fh/shared`) | Same schemas in forms and on the server; server always re-validates. |
| API | Hono on Node 22, Fly.io or Railway | One typed API: every request passes the same auth + permission checks. |
| Auth | Better-Auth, self-hosted (≥ 1.6.22) | Email + SMS codes, sessions, password hashing, TOTP for staff. Users in our DB, no per-user fees. |
| Database | Neon Postgres + Drizzle ORM / Drizzle Kit | Versioned SQL migrations in `apps/api/drizzle/`. Separate staging and production. |
| Second layer | Postgres row-level security | API sets `app.user_id` / `app.role` per transaction (`db/rls.ts`); policies deny by default. |
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

## Files

Upload → API checks permission → sharp decodes/validates (5 MiB max) → original (metadata stripped)
to the private bucket, blurred copy to the derived bucket → keys stored in Postgres. Viewing →
API checks the viewer's right to that exact object (connection, plan, block, cover toggle) →
returns a signed URL valid for `SIGNED_URL_TTL_SECONDS` (default 120 s). No public bucket URLs.

## Jobs

pg-boss runs in the API process on one instance (`RUN_JOBS=true`), using the direct Neon
connection. Scheduled daily at 02:00 / 02:15 Sri Lanka time: `documents.purge` (D8, 90 days),
`retention.sweep` (6-month records). `notifications.send` drains the notification outbox.
