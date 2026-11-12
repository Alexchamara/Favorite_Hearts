# Favorite Hearts: Admin Panel Plan (v2)

Approved by the owner on 12 November 2026. Nothing is built yet. OWNER-DECISIONS.md overrides this plan wherever they conflict.

## Context

There is already a staff workspace at `/app/staff`, inside the member app (`apps/member/src/features/staff/*`). It covers:

- **Both roles:** the documents queue and the reports queue.
- **Owner only:** payments, plans and prices, payment details, and the 3 service switches.

These are backed by `apps/api/src/routes/staff.ts` and `owner.ts`. The backend enforces two-step login, and so does the database (`app.is_staff()` and `app.is_owner()`). Decisions are written to the append-only `audit_event` table.

**Missing controls.** There is no way to:

- look a member up, suspend or ban them, or moderate photos directly. The database already allows these, but nothing calls them.
- manage staff, except through the CLI `apps/api/scripts/staff.ts`, which writes no audit row.
- read the audit log, failed emails or background jobs.
- change limits that are hard-coded in `packages/shared`.

**Security gaps:**

- Staff sessions last 30 days and renew as they are used (`apps/api/src/auth.ts:134`).
- Staff share an origin and cookies with the member app.
- No owner action asks you to confirm who you are again.
- `/api/v1` has no CSRF check, and `readJson` (`http.ts:67`) accepts any content type.
- Repeated wrong two-step codes or backup codes don't lock the account.
- The initial password alone lets someone enrol two-step login.
- Audit rows record no IP address, device or session, and `correlationId` is never filled in.
- Sign-ins and staff changes aren't audited.
- Audit rows can be deleted.

**Goal:** an admin panel on its own subdomain that controls the whole site and stays safe even if a staff password leaks or the member app has a bug.

## Owner decisions (12 Nov 2026)

| # | Decision |
|---|---|
| A1 | Separate admin app at `admin.favoritehearts.com`, behind Cloudflare Access. Subdomain, hosting and Access are all free. |
| A2 | Only two roles: owner and backup reviewer. Checks move to named permissions so a role can be added later. |
| A3 | Passkeys are the main second factor, with an authenticator app (TOTP) and backup codes as the fallback. |
| A4 | All four new areas: Members & content, Dashboard & logs, Staff management, Editable rules. |
| A5 | Suspension: the profile is hidden and the member is blocked from acting. Plan time is paused (the expiry moves forward when they are unsuspended), and connections are kept. |
| A6 | A ban blocks re-registration with the same email and phone for 6 months, using the existing keyed hashes in `retained_identity`. |
| A7 | Alerts go to a new dedicated mailbox, `security@favoritehearts.com`, set in `SECURITY_ALERT_EMAIL`. The owner creates it, and I use a placeholder until then. |
| A8 | No location limit. Protection is the Access email code, then password, then passkey. |
| A9 | Build order: security first, then the app shell, then staff and audit, then members, dashboard, rules, hardening. |

## Architecture: one origin for the admin

```
browser ──► admin.favoritehearts.com  (Cloudflare Access: only the 2 staff emails, one-time email code)
              ├─ /*        Cloudflare Pages: apps/admin static build, strict _headers CSP
              └─ /api/*    Pages Function proxy ──► API (Fly/Railway) /admin/*
                           forwards Cf-Access-Jwt-Assertion; API verifies it
```

- **Same origin:** the app and its API sit on one host, so there is no CORS. The admin cookie can be `SameSite=Strict`, host-only, and never sent to the member host.
- **Passkeys:** the passkey site ID (`rpID`) is simply `admin.favoritehearts.com`.
- **API check:** in production the API accepts `/admin/*` only with a valid Cloudflare Access token (JWKS from the team domain, audience tag checked). The API host can't be used to get round Access. In development and tests a stub verifier is used.

## Security layers

Each layer must hold on its own.

### 1. Edge
- **Access policy:** a Cloudflare Access app on `admin.favoritehearts.com` allows the two staff emails, with a one-time email code and a 24-hour Access session.
- **Token check:** the API checks the Access token with `jose` (new dependency).

### 2. Separate sign-in
- **Second Better-Auth instance** (`createAdminAuth`, next to `createAuth` in `apps/api/src/auth.ts`):
  - `basePath: '/admin/auth'`
  - `baseURL` is the admin origin, and `trustedOrigins` is only the admin origin
  - `cookiePrefix: 'fha'`, with `sameSite: 'strict'` and `secure`
  - `disableSignUp`
- **Shared tables, separate cookies:** it uses the same `auth_*` tables, but the cookie name and host differ.
- **Kept apart:**
  - The member `loadSession` refuses staff users.
  - The new `loadAdminSession` refuses anyone without an active `staff_member` row.

### 3. Factors
- **Password:** 12+ characters (existing `staff-accounts.ts:26`).
- **Passkeys:** the `@better-auth/passkey` plugin (new dependency).
- **TOTP:** the existing `twoFactor` plugin.
- **Session gate:** a session gets staff powers only when the account has at least one passkey or TOTP **and** the session was completed with one. Session metadata records `amr: passkey|totp|backup_code`.
- **Lockouts:**
  - Per account: 5 wrong TOTP or backup codes lock the account for 15 minutes and send an alert. This reuses the counter pattern of `clearCounter`/`login-fail` in `auth.ts:175-205`.
  - Per IP address: backup codes get their own limit of 5 per minute.
- **Turnstile:** stays on admin sign-in (existing `turnstile.tsx`).

### 4. Invites replace typed passwords
- **The invite:** `staff_invite` stores a hash of a single-use, 24-hour token, plus the email and role.
- **The invite page:** the new staff member sets their own password, then must register a passkey or TOTP in the same flow. The account gets no session until both are done.
- **CLI:** `scripts/staff.ts add` now prints an invite link. It is used only for the first owner.

### 5. Sessions
- **Lifetime:** at most 8 hours, and 30 minutes of inactivity signs you out. Last activity is kept on the session row and checked in `loadAdminSession`.
- **Sessions screen:** lists your sessions (device, IP address, last active), with revoke one or revoke all.
- **New-device alert:** a sign-in from a new device sends an alert. A device is a hash of the user agent plus the first 3 parts of the IP address.

### 6. Step-up check
- **`requireStepUp()` middleware:** needs a passkey or TOTP check within the last 5 minutes, stored as `stepUpAt` on the session. Otherwise it answers `403 STEP_UP_REQUIRED`, and the UI asks for the check and retries.
- **Guarded actions:**
  - payment approve, refund, delete, or settlement correction
  - payment-details change
  - plan grant or revoke, and plan or price changes
  - service switches
  - staff invite, revoke or two-step reset
  - ban, suspend, capacity change
  - rule edits
  - audit or member export
- **Typed reason:** required on every one of these actions (reasons already exist on most).

### 7. Request integrity
On every `/admin/*` request:

- Hono `csrf({ origin: adminOrigin })` runs on write methods.
- `Content-Type: application/json` is required (an admin variant of `readJson`).
- The `X-FH-Admin: 1` header is required.
- The existing `secureHeaders`, `no-store` and body limits from `app.ts:136-174` are reused.

The admin app's `_headers` set:

- a strict CSP: `default-src 'self'`, no inline scripts, `connect-src 'self'`, `frame-ancestors 'none'`, `require-trusted-types-for 'script'`
- HSTS
- `noindex`

### 8. Permissions
- **The map:** `packages/shared/src/permissions.ts` maps each action to the roles allowed, for example `{ 'payments.approve': ['owner'], 'reports.decide': ['owner','backup_reviewer'], … }`.
- **`requirePermission(p)`** replaces `requireStaff(...)`. It is added in `middleware/session.ts` and reuses the same two-step logic.
- **The UI** hides what the role can't do, but the server and RLS decide. The `app.*` policies and functions stay the final check.

### 9. Audit
- **Migration `0017`** adds to `audit_event`:
  - `session_id`
  - `ip` (shortened: an IPv4 /24 prefix or IPv6 /48)
  - `user_agent` (first 200 characters)
  - `prev_hash`
  - `row_hash`: sha256 of the previous hash plus the row, set by a trigger, so a gap or edit is detectable
- **Request IDs:** a middleware fills `correlationId` on every request.
- **DELETE is refused** by a trigger unless `app.retention_purge` set the local flag `app.retention = on`. The 6-month rule still works.
- **Newly audited:**
  - sign-in, sign-in failure, lockout
  - passkey or TOTP added or removed; backup codes regenerated
  - invite, revoke, reset
  - opening a member's page; revealing a contact
  - exports
  - viewing the payment list or a payment's detail
- **`lib/audit.ts`** fills the new fields automatically from `c.var`.

### 10. Alerts
- **What triggers one:**
  - payment details changed
  - staff invite, revoke or reset
  - two-step method changed
  - lockout
  - ban
  - sign-in from a new device
  - an audit chain check failing
- **How they're sent:** each queues a `security_alert` template in `notification_outbox` to `SECURITY_ALERT_EMAIL`. The existing `notifications.send` job and Resend deliver it.

### 11. Data minimisation
- **Contacts:** masked in every list (`07•• ••• 894`). Revealing one is a separate endpoint and is audited.
- **Documents and receipts:** only through the existing 120-second signed links.
- **Reported content:** shown on its own, never the member's whole private gallery.

### 12. Recovery (§10)
- **Owner devices:** the owner registers two passkeys on different devices, plus TOTP, plus printed backup codes.
- **Last resort:** `staff.ts reset-2fa` needs direct database access. It now writes an audit row and sends an alert.
- **Runbook:** `docs/ADMIN-RUNBOOK.md` covers setup, Access, recovery and the backup reviewer leaving.

## Panel contents

| Area | Who | Contents |
|---|---|---|
| Dashboard | both | Queue counts and the oldest item against the 48-hour promise; auto-hidden items; switch states; recent alerts (owner) |
| Review → Documents, Reports | both | Existing screens moved over. Reports gain "restore auto-hidden" and flag reporters who keep making false reports |
| Review → Photos | both | Reported and hidden photos: hide or restore, with a reason |
| Members | both; payments owner only | Search by name, email, phone, payment reference or profile ID. Member page: account, profiles, managers, verification history, reports made and received, block count, sessions, payments (owner). Actions: suspend or unsuspend the account or a profile; hide or restore a profile; sign the member out everywhere; ban (owner); managed-profile limit (owner) |
| Payments, Plans, Payment details | owner | Existing screens moved over, with the step-up check |
| Messages | owner | Notification outbox: failed and queued emails and SMS, retry or cancel |
| Settings | owner | Service switches (existing) and **editable rules** |
| Staff | owner | Invite, revoke, reset two-step login, sessions |
| Audit log | owner (backup sees only their own actions) | Filters by person, action, item and date; chain check status; CSV export |
| System | owner | pg-boss job runs and failures, failed file deletions, retention runs |
| My security | both | Passkeys, TOTP, backup codes, sessions, change password |

**Editable rules.** Table `platform_setting` has: `key`, `value` (jsonb), `updated_by`, `updated_at`. It comes with:

- a `platform_setting_history` table
- a typed registry in `packages/shared/src/settings.ts`: key, type, minimum, maximum, default (the current constants)
- the SQL function `app.setting(key)`, used by the RLS functions and SQL thresholds

The first keys:

- `REQUEST_COOLDOWN_DAYS`
- `SHORTLIST_LIMIT`
- `MAX_PHOTOS`
- the report hide thresholds (serious 1, other 3)
- `RENEWAL_GRACE_DAYS`
- `RENEWAL_WINDOW_DAYS`
- `DEFAULT_MANAGER_CAPACITY`

**Suspension (A5).**

- The new functions `app.suspend_account(user, reason)` and `app.unsuspend_account(user)` (security definer, role-checked, audited) set `member_account.status` and hide that member's profiles.
- They record `suspended_at`. On unsuspend, `entitlement_event` gets a `replace` row whose expiry moves forward by the suspended time.
- Connections stay, but the API refuses every action by the member (the existing `ACCOUNT_SUSPENDED` path in `requireMember`).

**Ban (A6).** `app.ban_account` (owner only) suspends the account, writes the keyed hashes to `retained_identity` with `banned = true` and a 6-month `purge_after`, and ends the member's sessions.

## Phases

Each phase ends with a commit, an `admin-N` tag and a stop for review. Work runs on the new branch `feat/admin-panel`, cut from `main` after the current branch's uncommitted open-browsing change (0016) is settled by the owner. Migrations are applied to Neon only when the owner asks.

1. **admin-1: Security foundation (API only).**
   - `createAdminAuth` with passkey and TOTP, and `loadAdminSession` with idle and absolute limits.
   - `requirePermission`, `requireStepUp`, CSRF, JSON and header guard.
   - Access token verifier (stub in tests), per-account lockout, request IDs.
   - Migration `0017`: audit columns, hash chain, delete trigger, `staff_invite`, passkey table, session `step_up_at`/`last_active_at`.
   - Alert template.
   - The existing staff and owner routes are mounted again under `/admin/*` with permissions. The old `/api/v1/staff|owner` routes stay until admin-2 ships, then are removed.
2. **admin-2: Admin app shell.**
   - `apps/admin` (Vite 7 + React 19 + react-router + TanStack Query), reusing `apps/member/src/components/ui` through a shared copy, or a new `packages/ui` if the duplication is large.
   - Sign-in, invite and enrolment pages, the step-up dialog, My security.
   - `StaffApp`, `ReportsQueue`, `PaymentsQueue`, `PlansAdmin`, `PaymentDetailsAdmin` and `ServiceAdmin` move over.
   - The Pages Function proxy and `_headers`.
   - The member app's `/staff` redirects to the admin site.
   - A sandbox launch config, `admin-sandbox`.
3. **admin-3: Staff management and audit.**
   - Staff routes and screens, the audit viewer and export, the chain check job.
   - The `staff.ts` CLI now audits and sets `grantedBy`.
   - `docs/ADMIN-RUNBOOK.md`.
4. **admin-4: Members and moderation.**
   - Migration `0018` with the suspend, unsuspend, ban, profile hide, photo hide and capacity functions.
   - Member search and the member page; the photo queue; restoring auto-hidden reports.
5. **admin-5: Dashboard, Messages and System screens.**
6. **admin-6: Editable rules.**
   - Migration `0019` with `platform_setting`.
   - The settings registry; API and SQL switched over to live values; the Settings screen.
7. **admin-7: Hardening.**
   - A route-by-role matrix test across every `/admin/*` route.
   - A `/security-review` pass and an OWASP ASVS level 2 checklist.
   - Update `docs/ARCHITECTURE.md`, `docs/OWNER-DECISIONS.md` (record A1–A9) and `docs/ADMIN-PANEL-PLAN.md`.
   - List what goes to the independent security reviewer.

## Critical files

**API**
- `apps/api/src/auth.ts`: `createAdminAuth`.
- `apps/api/src/app.ts`: mount `/admin/*` with its guards.
- `apps/api/src/middleware/session.ts`: `loadAdminSession`, `requirePermission`, `requireStepUp`. It reuses `recentSignIn` and `requireStaff` logic.
- `apps/api/src/lib/audit.ts`: fill the new fields.
- `apps/api/src/lib/staff-accounts.ts`: invites.
- `apps/api/src/lib/rate-limit.ts`: reuse for the lockouts.
- `apps/api/src/messaging/templates.ts`: `security_alert`.
- `apps/api/src/routes/staff.ts` and `owner.ts`: moved under `routes/admin/`.
- New `routes/admin/{members,photos,staff,audit,messages,system,settings,security}.ts`.

**Database**
- `apps/api/drizzle/0017+`
- `apps/api/src/db/schema/{operations,staff,auth}.ts`

**Shared**
- `packages/shared/src/permissions.ts`, `settings.ts`
- Constants in `domain.ts`, `requests.ts` and `billing.ts` become defaults.

**Admin app**
- New `apps/admin/`, including `functions/api/[[path]].ts` (the proxy) and `public/_headers`.

**Member app**
- `apps/member/src/App.tsx`: the `/staff` redirect. Remove `features/staff/` after the move.

**Tests**
- New `apps/api/test/admin-*.test.ts`.
- Update `api.test.ts`, `payments.test.ts`, `access-rules.test.ts` and `safety.test.ts` for the new paths.

## Verification

**Every phase:**
- `npm test` (the PGlite API and database tests) and `npm run typecheck`.
- New tests for:
  - CSRF, wrong content type and missing header being refused
  - a missing or invalid Access token
  - idle and absolute session expiry
  - step-up expiry
  - the TOTP and backup-code lockout
  - the invite being single-use and expiring
  - audit chain tampering being detected
  - audit DELETE being refused, except by retention
  - suspension pausing the plan (plan time restored on unsuspend)
  - a ban stopping re-registration
  - the backup reviewer refused on every owner permission, through the API and in RLS

**Walkthrough** in the in-app browser with the `admin-sandbox` launch config:
1. Invite the backup reviewer and enrol a passkey.
2. Check the reviewer can't open Payments, through the UI and through the API directly.
3. As the owner, approve a payment through the step-up prompt.
4. Suspend and unsuspend a member and check the plan expiry moved forward.
5. Ban a member and try signing up again.
6. Edit a rule and see it take effect.
7. Read the audit log and run the chain check.

**Before launch:** set up Cloudflare Access on staging, and the owner creates the security@ mailbox.

## Progress

### admin-1: Security foundation (API only), 12 November 2026

Branch `feat/admin-panel`, cut from `feat/demo-ui-parity` at `7b49a12` (owner's choice). There are no screens yet; those come in admin-2.

**Built**

- **Admin sign-in** (`apps/api/src/admin/auth.ts`). A second Better-Auth instance at `/api/admin/auth` with:
  - its own derived key
  - `fha.*` cookies (SameSite=Strict)
  - staff only, no sign-up and no password reset
  - "trust this device" refused
- **How a session is opened.** Each session records it in `amr`:
  - passkey
  - password + authenticator code
  - password + backup code
  - `enrolment`: the short session from an invitation, which can only set up two-step login and passkeys

  Sessions last at most 8 hours, end after 30 idle minutes, and are never extended.
- **Invitations** (`apps/api/src/admin/invites.ts`, CLI `npm run staff -w @fh/api -- invite …`).
  - The link works once, for 24 hours, and only its hash is stored.
  - The person chooses their own password, then must set up the authenticator app (with backup codes). The app comes first, so every account has a fallback before it has a passkey.
  - After that they sign in again.
- **Passkeys:** `@better-auth/passkey` with user verification required. A passkey signs in only an active staff member who also has the authenticator app.
- **Step-up:** risky actions need a passkey or code from the last 5 minutes. This covers sign-in settings and the routes marked in `apps/api/src/admin/policy.ts`: payment approve, refund, settlement and delete; payment details; plans and prices; plan grant and revoke; service switches.
- **Lock-outs:**
  - 5 wrong authenticator or backup codes lock the account for 15 minutes and email the owner.
  - 5 wrong passwords lock the address for 15 minutes.
  - Non-staff, and staff who haven't set up two-step login, get the wrong-password answer.
- **Request guard** (`apps/api/src/middleware/admin-session.ts`). Each request needs:
  - Cloudflare Access's signed token (when configured), with its email equal to the signed-in staff member's
  - the `X-FH-Admin: 1` header, and `Sec-Fetch-Site` same-origin
  - the admin origin on every change
  - JSON bodies only

  The member app's CORS no longer covers `/api/admin`.
- **Route policy** (`apps/api/src/admin/policy.ts`, `packages/shared/src/permissions.ts`):
  - Every admin route names one permission. Unlisted routes are refused (`NO_POLICY`).
  - The backup reviewer has documents, reports and their own sign-in only.
  - The existing staff and owner routes are mounted again under `/api/admin/staff` and `/api/admin/owner`. The `/api/v1/staff|owner` routes stay until admin-2.
- **Audit** (migrations `0017_admin_security`, `0018_admin_security_rules`):
  - Every row now records the session, a shortened address (/24 or /48), the browser and the request ID (`X-Request-Id`).
  - Every row is hash-chained to the one before. `app.audit_chain_check()` reports edited, unlinked and forked rows.
  - DELETE and TRUNCATE are refused, except inside the 6-month retention sweep, which leaves a tombstone for each row it removes.
  - Newly audited: sign-ins and failures; wrong codes; step-ups; changes to sign-in settings; invitations; revoke and reset; opening the document, report and payment lists and payment details.
- **Alerts** (`apps/api/src/lib/security-alerts.ts`):
  - **Sent to:** `SECURITY_ALERT_EMAIL`, through the outbox and the existing send job.
  - **When:**
    - a sign-in from a new device
    - a lock-out
    - two-step login, passkey, backup-code or password changes
    - a staff member invited, joining, revoked or reset
    - a payment-details change
- **Better-Auth** upgraded from 1.7.14 to 1.7.21 (API and member app) to match the passkey plugin. Member log-in was checked in the browser against the sandbox afterwards.

**Checks**

```
npm test -w @fh/api          ℹ tests 203  ℹ pass 203  ℹ fail 0   (185 before + 18 in test/admin-auth.test.ts)
npm run typecheck            api, member, website (astro check: 0 errors), shared: clean
npm run test --workspaces    203 + 5 + 9 pass; node --test scripts/text/*.test.mjs pass
npm run build -w @fh/member  built
```

The retention test in `test/safety.test.ts` now also asserts that the chain still checks after the sweep, using tombstones.

**Not covered yet, or for the owner**

- **Passkey sign-in end to end:** the tests have no WebAuthn authenticator, so they check passkey sign-in's gates (not before the authenticator app; an enrolment session only) but not a real passkey ceremony. The admin-2 walkthrough checks one in the browser.
- **Existing staff accounts:** the admin sign-in uses its own key, so authenticator apps set up in the member app don't carry over. Existing staff join the admin site from a new invitation (`invite`).
- **Deleting the newest audit row:** the hash chain can't detect it on its own. The chain check job in admin-3 will record the head hash so this becomes detectable.
- **Neon dev:** migrations 0017 and 0018 have not been applied (only on request).
- **Waiting on the owner:** a Cloudflare Access application for the admin site (`CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`), and the security@ mailbox.
