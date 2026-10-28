# API (Hono on Node)

The single security boundary: every request passes the same session and permission checks
before touching data. Postgres row-level security sits underneath as a second layer.

```
src/
  index.ts            production wiring (Neon, Resend, SMS adapter, R2) + server + pg-boss workers
  app.ts              createApp(deps): security headers, CORS, body limits, routes, error shape
  http.ts             Deps, request context, typed errors, parse(), withActor(c, fn) for every member/staff query
  config.ts / env.ts  runtime config; validated environment (Zod) — refuses to start on bad config
  auth.ts             createAuth(): Better-Auth, email/SMS codes for members, password + TOTP for staff
  middleware/         session + actor, requireUser, requireMember, requireStaff(role) (+ 2FA enforced)
  routes/             /health, /me, /profiles (+ contacts, candidate controls, invitations),
                      /invitations (candidate side), /verification (documents), /staff (review)
  lib/                profile view, invitation tokens, audit trail, staff accounts, logger
  db/schema/          Drizzle tables: auth_* (Better-Auth), members, trust, connections, billing, operations, staff
  db/client.ts        pooled Neon connection
  db/actor.ts         runAsActor(): role fh_app + app.user_id / app.role for row-level security
  messaging/          Messenger interface, Resend email, SMS adapter (provider TBD), templates
  storage/            Storage interface, R2 private buckets + signed URLs, sharp photo/document processing
  jobs/               pg-boss queues; documents.purge (90-day document deletion)
scripts/staff.ts      add / revoke staff, reset two-step login (run with the owner)
drizzle/              SQL migrations (commit them; never edit an applied one). 0003 and 0005 are hand-written:
                      RLS policies, helper functions, triggers, fh_app grants, plan prices
test/                 access-rule tests and HTTP flow tests on PGlite (in-process Postgres, no network)
```

## Tests

```sh
npm test -w @fh/api
```

Runs every migration in an in-process Postgres. It checks the access rules as separate accounts
(anonymous, members, manager, candidate, revoked manager, backup reviewer, owner), and drives the
real API through sign-in codes, invitations, document review, two-step login and the purge job,
with email/SMS captured and files kept in memory. CI runs it too.

## Staff accounts

```sh
npm run staff -w @fh/api -- add --email owner@example.lk --name "Owner Name" --role owner
```

Run it together with the owner; the password is typed at a hidden prompt. The other commands are
`revoke --email …` and `reset-2fa --email …` (see docs/ARCHITECTURE.md, "Staff").

## Run locally

```sh
cp apps/api/.env.example apps/api/.env   # fill DATABASE_URL(_DIRECT) from a Neon dev branch, Resend key
npm run db:generate                      # first time: creates the auth/staff migration in drizzle/
npm run db:migrate
npm run dev:api                          # http://localhost:8787/health
```

Sign-in codes by email reach only the Resend account owner's inbox until the domain is
verified in Resend. For SMS during development set `SMS_PROVIDER=log` (code printed in the console).

## Deploy (Fly.io or Railway)

Build `apps/api/Dockerfile` from the repo root. Set every variable from `.env.example` as a
secret, with `NODE_ENV=staging|production`, HTTPS `API_URL`, and `ALLOWED_ORIGINS` set to the
member app origin. Run `npm run db:migrate` (direct connection) before releasing a new version.
Run exactly one instance with `RUN_JOBS=true` (others `false`).
