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
  db/schema/          Drizzle tables (auth_* for Better-Auth, staff_member, domain tables later)
  db/client.ts        pooled Neon connection
  db/rls.ts           withActor(): sets app.user_id / app.role for RLS policies
  messaging/          Resend email, SMS adapter (provider TBD), code templates
  storage/            R2 private buckets + signed URLs, sharp photo processing/blur
  jobs/boss.ts        pg-boss queues: document purge, retention sweep, notifications
drizzle/              generated SQL migrations (commit them; never edit an applied one)
```

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
