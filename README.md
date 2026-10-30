# Favorite Hearts

Sri Lankan matrimony platform. **Status: pre-production scaffold** — nothing here is a live service yet.

Read first: [`docs/OWNER-DECISIONS.md`](docs/OWNER-DECISIONS.md) (business rules — overrides the demo),
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/BUILD-PROGRESS.md`](docs/BUILD-PROGRESS.md),
and the developer specification [`docs/Favorite-Hearts.pdf`](docs/Favorite-Hearts.pdf).

## Layout

```
apps/website/      public site — Astro, static pages            http://localhost:4321
apps/member/       member app — Vite + React + TS (+ Tailwind, Radix, TanStack Query, Zod)   :5173/app/
apps/api/          API — Hono on Node, Better-Auth, Drizzle/Neon, R2 + sharp, pg-boss          :8787
packages/shared/   Zod schemas and constants shared by all apps
docs/              decisions, architecture, progress, spec
reference/         original demo — read-only, never deployed
```

## Requirements

Node 22+ (`nvm use`), npm 10+. Accounts (owner-owned, developer as collaborator):
Neon, Resend, Cloudflare (R2 + Pages), Fly.io or Railway, GitHub.

## Getting started

```sh
npm install
cp apps/api/.env.example apps/api/.env              # Neon dev branch URLs, Resend key, auth secret
cp apps/member/.env.example apps/member/.env.local

npm run db:generate      # create SQL migrations from the Drizzle schema (first time)
npm run db:migrate       # apply them to the Neon database in DATABASE_URL_DIRECT
npm run dev              # starts api :8787, member app :5173, website :4321
```

Open **http://localhost:4321** — the website forwards `/app/` to the member app and
`/api/` to the API, so Join buttons and sign-in work from that one address (as in production).

To try the member and staff screens without Neon, Resend, SMS or R2, run `npm run dev:sandbox` and open
**http://localhost:5174/app/** (staff: `/app/staff`). It runs the real API on an in-memory database. Sign-in codes,
invitation links and the staff password print in that terminal; nothing is sent, and everything is gone when it
stops. It can run beside `npm run dev`. Four synthetic test members (verified and published, `@sandbox.test`) are
ready to sign in, and a test plan can be granted to any profile with
`curl -X POST http://127.0.0.1:8788/sandbox/plans -H 'content-type: application/json' -d '{"profileId":"…"}'`.
That is a shortcut: buying a plan for real needs the owner (`owner@sandbox.test`) to enter payment details first, as
nothing is pre-filled. To try the Turnstile widget too, start it with Cloudflare's public test keys:
`TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA` for the sandbox API and
`VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA` for the member app. The API is not reloaded on code changes:
restart the sandbox after pulling.

One deployable folder for static hosting: `npm run build:site` → `dist/site/`
(website at `/`, member app at `/app/`). Preview it with `npm run preview:site` (http://localhost:8080): it applies
`_headers` and `_redirects` the way Cloudflare Pages does, so the security headers and the app's routing can be checked
before a deploy. With `API_ORIGIN=http://127.0.0.1:8788` it also passes `/api` to a running sandbox; that sandbox must
allow the preview's origin (`SANDBOX_MEMBER_ORIGIN=http://localhost:8080`).

Checks: `npm run typecheck`, `npm test` and `npm run build`.

## Secrets

Never commit real keys; only `*.example` files are tracked. Browser-visible values start with
`VITE_` and must be public. Database, auth, Resend, SMS, R2 and Turnstile secrets live only in `apps/api/.env`
locally and in the API host's secret store (Fly.io / Railway) when deployed. The Turnstile bot check stays off while
`TURNSTILE_SECRET_KEY` is empty; production refuses to start without it. Production also needs `CLIENT_IP_HEADER`
(not a secret): the header the host sets to the visitor's address, for rate limits (`cf-connecting-ip` behind
Cloudflare, `fly-client-ip` on Fly.io).
