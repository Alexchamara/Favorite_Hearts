# API (Hono on Node)

The single security boundary: every request passes the same session and permission checks
before touching data. Postgres row-level security sits underneath as a second layer.

```
src/
  index.ts            starts the server (+ pg-boss workers when RUN_JOBS=true)
  app.ts              Hono app: security headers, CORS, body limits, routes, error shape
  env.ts              validated environment (Zod) — the app refuses to start on bad config
  auth.ts             Better-Auth: email/SMS codes for members, password + TOTP for staff
  middleware/         session loading, requireUser, requireStaff(role) (+ 2FA enforced)
  routes/             /health, /api/v1/me  (domain routes added per stage)
  db/schema/          Drizzle tables: auth_* (Better-Auth), members, trust, connections, billing, operations, staff
  db/client.ts        pooled Neon connection
  db/actor.ts         runAsActor(): role fh_app + app.user_id / app.role for row-level security
  db/rls.ts           withActor(): runAsActor on the API's connection — use it for every member/staff query
  messaging/          Resend email, SMS adapter (provider TBD), code templates
  storage/            R2 private buckets + signed URLs, sharp photo processing/blur
  jobs/boss.ts        pg-boss queues: document purge, retention sweep, notifications
drizzle/              SQL migrations (commit them; never edit an applied one). 0003_access_rules.sql is
                      hand-written: RLS policies, helper functions, triggers, fh_app grants, plan prices
test/                 access-rule tests on PGlite (in-process Postgres, no network needed)
```

## Tests

```sh
npm test -w @fh/api
```

Runs every migration in an in-process Postgres and checks the access rules as separate accounts
(anonymous, members, manager, candidate, revoked manager, backup reviewer, owner). CI runs it too.

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
