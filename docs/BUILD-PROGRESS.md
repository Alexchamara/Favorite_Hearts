# Build progress

Rules (D6): one stage at a time; commit + tag at the end of each; paste real test output here
as evidence; stop after 3 failed attempts and record the blocker. Never mark something passed
without output.

## Setup steps

| Step | Status | Notes |
| --- | --- | --- |
| 1–4 Accounts and tooling | done (owner) | GitHub repo `Alexchamara/Favorite_Hearts`; Resend for email codes. |
| 5 Scaffold project structure | **in review** | Monorepo with website / member / api / shared. Evidence below. |

## Stages (spec ch. 17)

| Stage | Status |
| --- | --- |
| 0 Baseline and rule audit (`docs/RULE-AUDIT.md`) | **done, awaiting owner review.** Rollback tag `stage-0-baseline`; evidence below. |
| 1 Foundation: member app migration, Drizzle schema + RLS, Neon staging/production | **done, awaiting owner review.** Staging/production projects **BLOCKED** until the owner creates them; evidence below. |
| 2 Accounts and verification (codes, invites, takeover, badges, staff 2FA, documents) | **done (2a server, 2b screens), awaiting owner review.** SMS **BLOCKED** until a provider is chosen; evidence below. |
| 3 Requests, connections and privacy | **3a (server) done, awaiting owner review**; 3b (screens) next. Evidence below. |
| 4 Plans, payments, email, Turnstile | not started |
| 5 Content, safety and quality | not started |
| 6 Test, harden and hand over | not started |

## Decisions recorded during setup

| Date | Decision | By |
| --- | --- | --- |
| 2026-10-27 | Stack: Astro website; Vite/React/TS member app with Tailwind, Radix, TanStack Query, Zod; Hono API on Node (Fly.io or Railway); Better-Auth self-hosted; Neon Postgres + Drizzle; RLS as second layer; Cloudflare R2 + sharp + signed URLs; pg-boss jobs. Replaces the Supabase suggestion in D6. | Owner |
| 2026-10-27 | Email login codes via Resend now; SMS codes built in from the start behind a provider adapter, provider chosen later. | Owner |
| 2026-10-27 | Domain not bought yet. Until verified in Resend, email codes only reach the Resend account owner's inbox. | Owner |
| 2026-10-27 | Members sign in passwordless (codes). Staff use email + password + TOTP; no public password sign-up. | Proposed — confirm |
| 2026-10-27 | Better-Auth pinned to ≥ 1.6.22 (fixes a high-severity email-OTP account-takeover advisory, GHSA-qq9h-g4jm-xgf3). | Engineering |
| 2026-10-27 | Drizzle kept on the stable 0.x line (v1.0 is still beta). | Engineering |
| 2026-10-28 | Row-level security works through the role `fh_app`: every member/staff transaction switches to it (`SET LOCAL ROLE`). No FORCE RLS, because Neon's owner role has BYPASSRLS anyway; code on the owner connection is kept minimal. | Engineering |
| 2026-10-28 | Access-rule tests run on PGlite (PostgreSQL 18.6 in-process, the same version as Neon dev) and in CI. | Engineering |
| 2026-10-28 | Plan catalogue seeded with the provisional §2 prices, in minor units, as versioned rows (never edited). | Engineering (per §2) |
| 2026-10-28 | Kept out of the schema until the owner decides: boosts, featured profiles, shortlist limits (audit N01–N03). Horoscope reduced to the importance preference (§1). | Engineering |
| 2026-10-28 | Profiles store a date of birth, to show age and check 18+. The spec (5.3) leaves this open. | Proposed — confirm |
| 2026-10-28 | Contact details hide for the member whose own plan ended; the other member's expiry does not hide them (spec O03). | Owner (confirmed 29 Oct 2026) |
| 2026-10-28 | ~~Any active member may browse published profiles, verified or not (audit N04).~~ Replaced on 29 Oct 2026: verified members only. | Owner |
| 2026-10-28 | After a takeover the candidate does not see the former manager's payment records (spec 6.3). | Proposed — confirm |
| 2026-10-28 | Astro 7 upgrade deferred to Stage 5. The critical advisory needs `define:vars` or server islands, and the static site uses neither. | Proposed — confirm |
| 2026-10-28 | Stage 2 split: 2a builds the server, 2b the member and staff screens. | Owner |
| 2026-10-28 | SMS stays BLOCKED until a provider is chosen. In development, codes print to the API console (`SMS_PROVIDER=log`); nothing pretends an SMS was sent. | Owner |
| 2026-10-28 | No takeover fee and no selfie (§5). Before takeover, a joined candidate confirms or declines, sets the manager's permissions and what is shared, withdraws consent or takes over, but does not edit profile fields. | Engineering (per §5) |
| 2026-10-28 | After a takeover, a published profile pauses until the candidate's own document and phone are verified. Manager evidence never counts for the candidate (spec 6.3, O07). | Proposed — confirm |
| 2026-10-28 | Invitation limits: 3 invitations per profile per day; 3 codes per link; each code lasts 10 minutes and allows 5 tries. §5 asks for "a limit on resends" without a number (spec O16). | Proposed — confirm |
| 2026-10-28 | After a candidate declines, the manager cannot send further invitations for that profile. | Proposed — confirm |
| 2026-10-28 | A person can be the candidate of only one live profile (spec O14). | Proposed — confirm |
| 2026-10-28 | Identity documents are accepted as photos (JPEG, PNG or WebP, at most 5 MB), not PDF. | Proposed — confirm |
| 2026-10-28 | sharp upgraded to 0.35.5 in the API (libvips, libheif and librsvg advisories). Astro's build-time copy stays until the Astro upgrade. | Engineering |
| 2026-10-29 | Staff screens live in the member app at `/app/staff`, not in a separate admin app. They share sign-in, design and the API contract; the server and database decide what staff may do. | Engineering |
| 2026-10-29 | The two-step login QR code is drawn in the browser (`uqr`), so the secret never goes to a QR service. | Engineering |
| 2026-10-29 | `npm run dev:sandbox` runs the real API on an in-memory database for trying the screens; codes print to its console. It is a development tool only and never deployed. | Engineering |
| 2026-10-29 | Stage 3 split: 3a builds the server, 3b the screens. | Owner |
| 2026-10-29 | Only verified members browse: their own checks (SMS-verified phone and approved document), or an operated profile whose publisher passed them (audit N04). | Owner |
| 2026-10-29 | Family details: browsing members see the family story, parents' jobs and siblings; parents' names only after both accept (audit N06, spec O13). | Owner |
| 2026-10-29 | 7-day wait: after a decline, a withdrawn request or an ended connection, neither profile may send the other a new request for 7 days, counted from that event (spec O05). | Proposed — confirm |
| 2026-10-29 | Request limits: a day starts at midnight Sri Lanka time; Starter's 30 a month counts within each 30-day block of the plan. Each request is charged once and not refunded when withdrawn or declined (spec O05). | Proposed — confirm |
| 2026-10-29 | The 2-re-sends-per-pair cap is not built: it is only recommended (§4, spec O04). The receiver can always block. | Engineering |
| 2026-10-29 | A receiver without a plan sees previews only and cannot answer (accept or decline) until they have a plan (§1). | Proposed — confirm |
| 2026-10-29 | Accepting needs both profiles published: a paused profile forms no new connections (spec O12). | Proposed — confirm |
| 2026-10-29 | "Engaged or married" closes open requests (sent ones withdrawn, received ones declined); connections stay; the profile may be published again without the forfeited plan (spec O12). | Proposed — confirm |
| 2026-10-29 | A profile hidden by reports is frozen until staff decide: out of discovery, and it neither shows nor sees private details. Only verified members report; the 3 reporters are counted by account (spec O11). | Proposed — confirm |
| 2026-10-29 | Original photos for a connection follow the contact rule: the viewer's own plan must be active (spec O03, photo expiry). | Proposed — confirm |

## Step 5 evidence

_Paste `npm install`, `npm run typecheck` and `npm run build` output here._

alexchamara@Alexs-MacBook-Pro Favorite_Hearts % npm install
npm warn deprecated cron-parser@4.9.0: v4 is no longer maintained, upgrade to v5
npm warn deprecated @esbuild-kit/core-utils@3.3.2: Merged into tsx: https://tsx.hirok.io
npm warn deprecated tsconfck@3.1.6: unmaintained
npm warn deprecated @esbuild-kit/esm-loader@2.6.5: Merged into tsx: https://tsx.hirok.io

added 673 packages, and audited 678 packages in 3m

197 packages are looking for funding
  run `npm fund` for details

8 vulnerabilities (4 moderate, 3 high, 1 critical)

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.
alexchamara@Alexs-MacBook-Pro Favorite_Hearts % npm run typecheck

> favorite-hearts@0.1.0 typecheck
> npm run typecheck --workspaces --if-present


> @fh/api@0.1.0 typecheck
> tsc -p tsconfig.json


> @fh/member@0.1.0 typecheck
> tsc -p tsconfig.json


> @fh/website@0.1.0 typecheck
> astro check

▶ Astro collects anonymous usage data.
  This information helps us improve Astro.
  Run "astro telemetry disable" to opt-out.
  https://astro.build/telemetry

11:46:49 [content] Syncing content
11:46:49 [content] Synced content
11:46:49 [types] Generated 65ms
11:46:49 [check] Getting diagnostics for Astro files in /Users/alexchamara/Downloads/Favorite_Hearts/apps/website...
Result (32 files): 
- 0 errors
- 0 warnings
- 0 hints


> @fh/shared@0.1.0 typecheck
> tsc -p tsconfig.json

alexchamara@Alexs-MacBook-Pro Favorite_Hearts % npm run build

> favorite-hearts@0.1.0 build
> npm run build --workspaces --if-present


> @fh/api@0.1.0 build
> node build.mjs


  dist/index.js      18.9kb
  dist/index.js.map  43.1kb

⚡ Done in 8ms

> @fh/member@0.1.0 build
> tsc -p tsconfig.json && vite build

vite v7.3.7 building client environment for production...
../../node_modules/zod/v4/core/util.js (400:0): A comment

"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a memberaccess on `Number`, so the bare object literal survived into every bundle."

in "../../node_modules/zod/v4/core/util.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
../../node_modules/zod/v4/core/regexes.js (74:0): A comment

"/** Anchors a pattern source. The interpolation lives here rather than at the call site because
 * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it
 * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */"

in "../../node_modules/zod/v4/core/regexes.js" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.
✓ 260 modules transformed.
dist/index.html                   0.47 kB │ gzip:   0.30 kB
dist/assets/index-CMPk-n-d.css    7.83 kB │ gzip:   2.22 kB
dist/assets/index-HYv9vIrp.js   345.29 kB │ gzip: 106.85 kB │ map: 1,814.46 kB
✓ built in 621ms

> @fh/website@0.1.0 build
> npm run build:css && astro build


> @fh/website@0.1.0 build:css
> tailwindcss -c tailwind.config.cjs -i src/styles/tailwind.css -o public/assets/css/tailwind.css --minify

Browserslist: caniuse-lite is outdated. Please run:
  npx update-browserslist-db@latest
  Why you should do it regularly: https://github.com/browserslist/update-db#readme

Rebuilding...

Done in 117ms.
11:47:32 [content] Syncing content
11:47:32 [content] Synced content
11:47:32 [types] Generated 13ms
11:47:32 [build] output: "static"
11:47:32 [build] mode: "static"
11:47:32 [build] directory: /Users/alexchamara/Downloads/Favorite_Hearts/apps/website/dist/
11:47:32 [build] Collecting build info...
11:47:32 [build] ✓ Completed in 20ms.
11:47:32 [build] Building static entrypoints...
11:47:33 [vite] ✓ built in 343ms
11:47:33 [build] ✓ Completed in 355ms.

 generating static routes 
11:47:33 ▶ src/pages/404.astro
11:47:33   └─ /404.html (+4ms) 
11:47:33 λ src/pages/assets/js/site-config.js.ts
11:47:33   └─ /assets/js/site-config.js (+1ms) 
11:47:33 ▶ src/pages/contact/index.astro
11:47:33   └─ /contact/index.html (+2ms) 
11:47:33 ▶ src/pages/help/index.astro
11:47:33   └─ /help/index.html (+1ms) 
11:47:33 ▶ src/pages/index.astro
11:47:33   └─ /index.html (+1ms) 
11:47:33 ▶ src/pages/labs/index.astro
11:47:33   └─ /labs/index.html (+1ms) 
11:47:33 ▶ src/pages/mission/index.astro
11:47:33   └─ /mission/index.html (+1ms) 
11:47:33 ▶ src/pages/newsroom/a-first-conversation/index.astro
11:47:33   └─ /newsroom/a-first-conversation/index.html (+4ms) 
11:47:33 ▶ src/pages/newsroom/a-thoughtful-beginning/index.astro
11:47:33   └─ /newsroom/a-thoughtful-beginning/index.html (+1ms) 
11:47:33 ▶ src/pages/newsroom/across-borders-on-the-same-page/index.astro
11:47:33   └─ /newsroom/across-borders-on-the-same-page/index.html (+1ms) 
11:47:33 ▶ src/pages/newsroom/an-honest-profile/index.astro
11:47:33   └─ /newsroom/an-honest-profile/index.html (+1ms) 
11:47:33 ▶ src/pages/newsroom/before-marriage/index.astro
11:47:33   └─ /newsroom/before-marriage/index.html (+0ms) 
11:47:33 ▶ src/pages/newsroom/belonging-across-borders/index.astro
11:47:33   └─ /newsroom/belonging-across-borders/index.html (+1ms) 
11:47:33 ▶ src/pages/newsroom/beyond-the-checklist/index.astro
11:47:33   └─ /newsroom/beyond-the-checklist/index.html (+0ms) 
11:47:33 ▶ src/pages/newsroom/family-and-your-voice/index.astro
11:47:33   └─ /newsroom/family-and-your-voice/index.html (+0ms) 
11:47:33 ▶ src/pages/newsroom/index.astro
11:47:33   └─ /newsroom/index.html (+1ms) 
11:47:33 ▶ src/pages/newsroom/matrimony-with-more-heart/index.astro
11:47:33   └─ /newsroom/matrimony-with-more-heart/index.html (+0ms) 
11:47:33 ▶ src/pages/newsroom/respect-in-every-introduction/index.astro
11:47:33   └─ /newsroom/respect-in-every-introduction/index.html (+0ms) 
11:47:33 ▶ src/pages/pricing/index.astro
11:47:33   └─ /pricing/index.html (+1ms) 
11:47:33 ▶ src/pages/privacy/index.astro
11:47:33   └─ /privacy/index.html (+0ms) 
11:47:33 λ src/pages/robots.txt.ts
11:47:33   └─ /robots.txt (+0ms) 
11:47:33 ▶ src/pages/security/index.astro
11:47:33   └─ /security/index.html (+0ms) 
11:47:33 λ src/pages/sitemap.xml.ts
11:47:33   └─ /sitemap.xml (+0ms) 
11:47:33 ▶ src/pages/terms/index.astro
11:47:33   └─ /terms/index.html (+0ms) 
11:47:33 ▶ src/pages/trust-and-safety/index.astro
11:47:33   └─ /trust-and-safety/index.html (+0ms) 
11:47:33 ✓ Completed in 49ms.

11:47:33 [build] 22 page(s) built in 430ms
11:47:33 [build] Complete!

## Stage 0 evidence (28 Oct 2026)

Scope (spec 17.1, Part 3 "Stage 0"):

- Run the original demo's install, build and tests, and this repository's checks.
- Record the demo's routes, simulations and dependencies.
- Tag a rollback point.
- List every rule conflict in [`RULE-AUDIT.md`](RULE-AUDIT.md).

Nothing in `reference/`, `apps/` or `packages/` was changed. The demo was built in a scratch copy because `reference/`
is read-only and its build rewrites files in place.

### Rollback point

Tag `stage-0-baseline` points to `560bf2a` ("Step 5: scaffold, website links, database migrations"), the state before
any stage work. To inspect or restore it:

```sh
git switch -c rollback-check stage-0-baseline
```

### Environment

macOS. Node v25.6.1, npm 11.13.0. `.nvmrc` and CI use Node 22, so CI remains the reference environment.
The default `python3` is 3.9.6; Python 3.12.12 comes from miniforge.

### Original demo (`reference/Favorite-Hearts-Integrated`)

`npm ci`:

```text
npm warn deprecated whatwg-encoding@3.1.1: Use @exodus/bytes instead for a more spec-conformant and faster implementation

added 221 packages, and audited 222 packages in 32s

33 packages are looking for funding
  run `npm fund` for details

2 vulnerabilities (1 moderate, 1 high)
```

`npm run build` with the default Python 3.9.6 **fails**. The demo README says Python 3.10+, but `website/scripts/build.py:54`
puts a backslash inside an f-string expression, which needs Python 3.12+. Excerpt:

```text
  File ".../website/scripts/build.py", line 54
    <script type="application/ld+json">{json.dumps(schema,ensure_ascii=False).replace('</','<\\/')}</script>\n'''
SyntaxError: f-string expression part cannot include a backslash
Error: Command failed: python3 .../website/scripts/build.py
```

`npm run build` with Python 3.12.12 passes:

```text
> favorite-hearts-integrated-matrimony@1.0.0 build
> node scripts/build.mjs

Rebuilding...

Done in 116ms.
Built 21 pages into dist/; indexable=False
Built website plus matrimony-only product. No dating entry or bundle.
```

**Reproducible build:** `diff -rq dist reference/Favorite-Hearts-Integrated/dist` reported no differences (exit 0, 70 files).
The shipped `dist/` matches its source exactly.

`npm test` passes:

```text
> favorite-hearts-integrated-matrimony@1.0.0 test
> node tests/integration.mjs

PASS 23 HTML pages, 24 linked join controls, 730 local asset/navigation targets; matrimony-only bundle.
PASS 24 join-button click handlers across all website pages.
PASS 24 Matrimony account assertions: signup, distinct profiles, validation, OTP, logout, login and recovery.
PASS 70 self/manager full signup → required profile/contact → payment review → publish checks, with required phone and admin NIC approval.
PASS 26 ordered verification, badges, phone-only acceptance, quick edits, height and menu assertions
PASS 34 October 7 access (plus 4 activity boundary checks), free publication, privacy, invitation and profile policy assertions
PASS 9 invitation-order, optional identity, expiry and height validation assertions
PASS 31 delegated permissions, horoscope readiness and ownership payment assertions
PASS 43 October 9 profile privacy, hobbies/socials, boost, featured and safety checks
PASS 24 v7 public family/income, blocked-list privacy and social username checks
All integrated demo checks passed. DOM simulation only; no visual browser verification.
```

**Running it.** `node scripts/serve.mjs` was opened in a browser. The landing page, pricing page and member entry (language → sign-up)
render. Status codes from the demo's own server:

```text
/                        403
/index.html              200
/pricing/                200
/matrimony/              200
/matrimony/index.html    200
/help/                   200
/nope/                   404
```

`/` returns 403 because of a bug in `scripts/serve.mjs`: its root path ends in `/`, so the resolved site root fails the
`startsWith` check. This is a demo-only issue, not fixed.

`npm audit` for the demo found postcss ≤ 8.5.22 (high) and postcss-selector-parser < 6.1.5 (moderate). Both are build tools
and are not shipped in `dist/`.

### This repository at `stage-0-baseline`

`npm run typecheck` passes:

```text
> @fh/api@0.1.0 typecheck
> tsc -p tsconfig.json
> @fh/member@0.1.0 typecheck
> tsc -p tsconfig.json
> @fh/website@0.1.0 typecheck
> astro check
Result (32 files):
- 0 errors
- 0 warnings
- 0 hints
> @fh/shared@0.1.0 typecheck
> tsc -p tsconfig.json
```

`npm run build` passes (route list trimmed):

```text
> @fh/api@0.1.0 build
  dist/index.js      19.2kb
  dist/index.js.map  43.6kb
⚡ Done in 5ms
> @fh/member@0.1.0 build
✓ 260 modules transformed.
dist/index.html                   0.47 kB │ gzip:   0.31 kB
dist/assets/index-CU5WqEdF.css    7.96 kB │ gzip:   2.25 kB
dist/assets/index-B28ZXAgV.js   345.55 kB │ gzip: 107.00 kB │ map: 1,814.82 kB
✓ built in 597ms
> @fh/website@0.1.0 build
16:24:49 [build] 22 page(s) built in 435ms
16:24:49 [build] Complete!
```

There are no automated tests yet: no `test` script exists. The working tree stayed clean after the build.

`npm audit` found 8 vulnerabilities (4 moderate, 3 high, 1 critical). None was fixed in Stage 0.

| Severity | Package | Path | Fix |
| --- | --- | --- | --- |
| critical | astro 5.18.2 | direct (website) | astro 7, a major upgrade |
| high | sharp 0.34.5 | direct (API); libvips CVEs | sharp 0.35.x. Do this before Stage 2, because the API decodes untrusted uploads. |
| high | zod, zod-to-ts | inside astro | comes with astro 7 |
| moderate | drizzle-kit, @esbuild-kit/*, esbuild | dev tools | upstream; dev only |

### Demo inventory

**Routes.** There are 23 HTML files: 21 marketing pages, the member app and a 404 page.

- Main pages: `/`, `/mission/`, `/labs/`, `/newsroom/`, `/contact/`, `/help/`, `/pricing/`, `/trust-and-safety/`,
  `/security/`, `/terms/`, `/privacy/`.
- Ten articles under `/newsroom/…/`.
- `/matrimony/`, the member app.
- `/404.html`.
- Redirects: `/approach/`→`/mission/`, `/explore/`→`/labs/`, `/journal/*`→`/newsroom/`, `/safety/`→`/trust-and-safety/`.

The member app's own screens: Discover, Interests, Connected, Shortlist, Profile, Trust & access, Horoscope,
Membership, Privacy & safety, Boost profile, Contact us and Review workspace. The 21 marketing routes exist in
`apps/website` with identical text; there, `/matrimony/` is replaced by the new member app at `/app/`.

**Simulations.** Nothing in the demo is a real service.

| What | Where (demo paths) |
| --- | --- |
| All accounts, profiles, interests and payments live in page memory and are cleared on reload. | `window.__heartsNetwork`, `product/preview/matrimony.tsx:69` |
| Sign-up and log-in keep plain-text passwords in memory. A sample login is listed in the demo README. | `product/app/matrimony/account-entry.ts:5–6, 31` |
| Phone codes use one fixed demo code; no SMS or email is sent. | `product/lib/matrimony-trust.ts:23` |
| Identity checks are sample-only: no document is collected, and the selfie is simulated. | `matrimony-trust.ts:24–25` |
| Six fictional members with seeded boosts, featured profiles and pending sample receipts. | `product/lib/domain.ts:1–8`, `matrimony.tsx:136` |
| Role switching between manager, candidate and reviewer, with a sample-account switcher. | `matrimony.tsx:58, 136`, `matrimony-trust.ts:8` |
| Payments use a sample PDF receipt; there are no bank details and no gateway. | `matrimony.tsx:136, 175` |
| Uploads are browser data URLs, with no storage, scanning or signed links. | `matrimony.tsx:74` |
| Candidate invitations are never delivered. | `matrimony-trust.ts:15–16` |
| Horoscope comparison shows a fixed fictional chart. | `product/app/matrimony/horoscope-workspace.tsx` |
| Landing testimonials are fictional. | `website/src/scripts/landing.js:6–14` |

**Demo dependencies.** All are pinned in its `package.json` and lockfile.

- Runtime: react / react-dom 19.2.0, radix-ui 1.4.3, lucide-react 0.468.0, sonner 2.0.7, next-themes 0.4.6,
  class-variance-authority 0.7.1, clsx 2.1.1, tailwind-merge 3.3.1.
- Build: esbuild 0.25.11, tailwindcss 4.1.16 (product), tailwindcss 3.4.17 (website, as `tailwindcss3`), postcss 8.5.6,
  @tailwindcss/postcss 4.1.16, tw-animate-css 1.4.0, jsdom 27.0.1 (tests).
- Tools: Node 22+ and Python 3.12+.

## Task checklist

Built from [`RULE-AUDIT.md`](RULE-AUDIT.md); IDs refer to its rows. Ticked items have evidence in their stage section.

**Stage 0**

- [x] Run the demo install, build and tests, and this repo's typecheck and build, with output above.
- [x] Record routes, simulations and dependencies.
- [x] Tag the rollback point `stage-0-baseline`.
- [x] Write `docs/RULE-AUDIT.md`, with no fixes.
- [ ] Owner reviews the audit and says "continue".

**Stage 1: Foundation**

- [x] Schema and RLS keep private contacts separate from profile fields (P20) and allow up to 3 profiles per manager (P16).
- [x] Use synthetic data only: test accounts are created inside the tests; no fictional members, account switcher or demo codes (P06, P28).
- [x] Do not port the horoscope workspace; keep only the preference field (P26).
- [x] Correct the Supabase comment in `packages/shared/src/contact.ts` (X07).
- [x] Astro 7 upgrade: deferred, see the decisions table (proposed).
- [x] Apply migrations 0002–0003 to the Neon dev database (28 Oct 2026; output in the Stage 1 evidence).
- [ ] **BLOCKED, owner action:** create the Neon staging and production projects (`docs/ARCHITECTURE.md`, "Environments").

**Stage 2: Accounts and verification**

Server (2a):

- [x] Use `withActor` for every member and staff query; set `app.role` from `staff_member` (the database re-checks it).
- [x] Invitation consumption and takeover as reviewed SECURITY DEFINER functions. The API role cannot change `candidate_user_id` itself.
- [x] Provision the owner and backup reviewer with a script the developer runs with the owner (`npm run staff`).
- [x] 24-hour single-use invitations with a code to the nominated contact, contacts that differ, and limited resends (P15).
- [x] Takeover without a fee: the manager loses access immediately and the plan carries over (P14).
- [x] Accept NIC, passport or driving licence. Exactly three badges; no selfie (P17, P18, N05). Badge wording is part of 2b.
- [x] Add the "not verified by candidate" label (`notVerifiedByCandidate` in the API, P19).
- [x] Owner and backup reviewer accounts with two-step login, enforced by the server and the database (P09).
- [x] Upgrade sharp before decoding uploads. Photo storage and blurred copies move to Stage 3, as in spec 17.1 (P07).
- [x] 90-day document deletion job with logging and retry (P25).

Screens (2b):

- [x] Member:
  - sign-in with an email code
  - the profile wizard and edit, and contacts
  - phone verification and document upload
  - inviting the candidate
  - the candidate's invitation page (code, accept, decline) and controls
  - badges with the approved wording ("identity document reviewed")
- [x] Staff: password sign-in with two-step login, including enrolment with backup codes, and the document review queue.
- [ ] Owner action: create the owner and backup reviewer accounts on each environment (`npm run staff`).
- [ ] **BLOCKED:** SMS provider. Phone verification for publishing and SMS invitations wait for it.
- [ ] With the SMS provider: let a joined candidate confirm a phone number the manager entered. Until then it keeps the
  "not verified by candidate" label, unless the candidate accepted an SMS invitation to that number.
- [ ] Before the first deploy, with the host choice: tell Better-Auth which header carries the client IP (see "Not done
  in 2b"). Otherwise the code and sign-in limits fall back to one bucket shared by many members.

**Stage 3: Requests, connections and privacy**

Server (3a):

- [x] Server-side discovery and sender masking (P06).
- [x] Quotas: Starter 5 per day and 30 per month; Premium 30 per day (P02).
- [x] 7-day re-send rule and withdrawal log (P03, P04).
- [x] The expired member loses contact details; the owner decided the still-paid member keeps seeing them (P05, O03).
- [x] Per-contact sharing chosen by the candidate (from 2a), and a disclosure log of what was shared and when (P20, P21).
- [x] Caste only with consent and never to visitors; caste filter matches consenting profiles only (P22, server side).
- [x] Report categories and thresholds, with staff review (P08). "Engaged or married" ends the plan after confirmation (P24).
- [x] Server-side blurred photos, the cover toggle, and up to 5 photos (P07).
- [x] Owner decided unverified browsing and family-detail visibility (N04, N06).
- [x] Concurrent requests: one database function per action, with locks on the profile or the pair.

Screens (3b):

- [ ] Discovery with filters, the member profile view, and sending a request with the "what will be shared" confirmation.
- [ ] Received (blurred without a plan) and sent requests; connections with shared details; blocks.
- [ ] Photo manager with the cover toggle; reporting; the staff report queue.
- [ ] "Engaged or married" with the forfeit warning; the plan's remaining requests.
- [ ] "Prefer not to say" for caste and the "self-declared" label for income on the member view (P22, P23).

Open:

- [ ] Owner decides on boost, featured profiles and shortlist limits (N01–N03). Not built.
- [ ] Spec items with no owner rule: country lists and validation (G24), atomic saves (G25). Report data (G28): the
  reported member never sees reports, and reporters see only their own.

**Stage 4: Plans, payments and email**

- [ ] Versioned Starter / Premium 3 months / Premium 6 months catalogue in LKR and USD minor units (P01).
- [ ] A unique reference per member, statement matching, and owner-only idempotent approval (P09, P10).
- [ ] USD SWIFT and Wise/PayPal-style instructions, with real bank details from the owner (P11).
- [ ] Upgrade, renewal and expiry rules with warnings (P12).
- [ ] Refund statement and confirmation at the payment step (P13).

**Stage 5: Content, safety and quality**

- [ ] Rewrite pricing, help/FAQ, terms and privacy (W01–W12, W16, X01, X02, X04). The lawyer reviews W08–W11.
- [ ] Remove the sample testimonials and the unproven research claims (W13, X03).
- [ ] English and Sinhala with Tamil hidden (W14, P27).
- [ ] Support channels and a "staff never ask for passwords or codes" statement. The owner confirms the dedicated SIM (W15, X06).
- [ ] Admin pause for signups and submissions (P29). Deletion with the 6-month retention list (P25).
- [ ] Set the real `siteUrl` once the domain is bought (X05).

**Stage 6: Harden and hand over.** Unchanged from spec 17.1.

## Stage 1 evidence (28 Oct 2026)

Scope (spec 17.1 and Part 3 "Stage 1", adapted to the chosen stack):

- Versioned SQL migrations for the data model in spec 12.1, with row-level access rules in the same migrations, deny by default.
- Rule tests with several real accounts, not only the privileged connection.
- Staging and production as separate projects.
- The member app moved incrementally, keeping the public pages and styling.

### What was built

**Data model.** Migration `apps/api/drizzle/0002_domain_tables.sql` adds 22 tables:

- **Members and profiles:** `member_account`, `profile`, `profile_manager`, `private_contact`, `photo`, `photo_original`, `invitation`.
- **Trust:** `verification_case`.
- **Connections and safety:** `interest`, `connection`, `shortlist`, `block`, `quota_ledger`, `disclosure_event`, `report`.
- **Billing:** `plan`, `price_version`, `payment_submission`, `entitlement_event`.
- **Operations:** `audit_event`, `notification_outbox`, `operations_flag`.

Value lists are shared from `packages/shared/src/domain.ts`. A published profile must be complete (check constraint),
and caste needs a consent time.

**Access rules.** Migration `apps/api/drizzle/0003_access_rules.sql` is hand-written. It contains:

- the `fh_app` role, with grants for only what the policies use
- 68 row-level security policies on 23 tables
- SECURITY DEFINER helper functions
- invariant triggers
- the provisional price seed and the pause switches

`apps/api/src/db/actor.ts` holds the transaction wrapper that every API request will use.

**Member app.** It now has the demo's design tokens (light and dark), the 12 demo UI components unchanged apart from
two necessary edits, a theme toggle, and the existing status page restyled. Screens move with their stages.

**Documentation.** The "Database access" and "Environments" sections in `docs/ARCHITECTURE.md`.

### `npm test` (new: access rules on PGlite, PostgreSQL 18.6)

```text
> @fh/api@0.1.0 test
> node --import tsx --test test/*.test.ts
▶ the API database role
  ✔ runs as fh_app with the actor settings for that transaction only (2.392583ms)
▶ anonymous visitor
  ✔ sees no member data, only the public price list (7.903958ms)
  ✔ cannot create anything (1.683584ms)
▶ members browsing
  ✔ see published profiles, never drafts or paused ones of others (2.608709ms)
  ✔ a suspended member browses nothing (1.0995ms)
  ✔ see blurred photos; an original only when it is a cover shown publicly (2.060459ms)
▶ private details: contacts and gallery (OWNER-DECISIONS sections 3, 4, 7)
  ✔ a paid, connected member sees what the other side shares, and nothing more (4.377958ms)
  ✔ members without a connection see none (2.056709ms)
  ✔ ending the connection hides them at once (3.22275ms)
  ✔ the member's own plan ending hides them (section 3) (2.227958ms)
  ✔ a block hides them, and hides each profile from the other (3.8355ms)
▶ interests and the sender blur (sections 1, 4)
  ✔ an unpaid receiver cannot see who sent an interest, only an anonymous preview (3.660333ms)
  ✔ once the receiver has a plan, the sender is visible (2.106958ms)
  ✔ sending needs an active plan and a published, unblocked receiver (2.796583ms)
  ✔ only the receiver answers, only the sender withdraws, and only while pending (6.677333ms)
▶ managers and candidates (section 5)
  ✔ the candidate sets the manager permissions; the manager cannot (3.232583ms)
  ✔ a revoked manager has no access to the profile and cannot restore it (2.337625ms)
  ✔ removing the manager takes effect immediately (3.351458ms)
  ✔ a manager runs at most 3 profiles unless the owner raises the limit (6.449208ms)
  ✔ a manager cannot attach to someone else's profile (1.232875ms)
▶ publishing (section 5)
  ✔ needs the publisher's approved document and verified phone (4.553625ms)
▶ staff (sections 9, 10)
  ✔ the backup reviewer handles documents and reports but sees no payments (3.025333ms)
  ✔ the backup reviewer cannot approve a payment or grant a plan (2.55275ms)
  ✔ the owner approves a payment exactly once (5.339958ms)
  ✔ claiming a staff role is not enough (2.681542ms)
  ✔ members see only their own payments and must use the current price (6.82875ms)
  ✔ the payer can attach proof but not approve (3.217875ms)
▶ history, prices and switches
  ✔ plan history and the audit trail are append-only, even for the owner (1.713084ms)
  ✔ the append-only triggers also stop the database owner (0.5065ms)
  ✔ a price can only be closed and replaced, never edited (2.587ms)
  ✔ the owner can pause new signups and document submissions (4.168667ms)
▶ invariants
  ✔ invitations: a different contact, 24 hours at most, one live at a time (7.393458ms)
  ✔ photos: at most five, one cover (2.101083ms)
  ✔ caste needs explicit consent (section 6) (2.0435ms)
  ✔ members cannot change their own account status or manager capacity (2.731959ms)
  ✔ reports stay hidden from the reported member (1.981709ms)
ℹ tests 36
ℹ suites 10
ℹ pass 36
ℹ fail 0
```

The first run failed 1 of 36 tests. The cause was in the design: the invitation expiry had been computed from the
test machine's clock, while the 24-hour limit is measured on the database clock. The expiry is now a column default
(`now() + 24 hours`), and the migration was regenerated before it had been applied anywhere.

**Mutation check.** These policies were weakened on purpose to prove the tests catch broken rules:

- **Payments readable by anyone:** 4 tests failed (anonymous, backup reviewer, spoofed owner, member isolation).
- **The plan check removed from private details:** the "own plan ending hides them" test failed.

The original file was then restored and compared.

### Neon dry run (dev database, rolled back)

Migrations 0002–0003 ran inside one transaction on the Neon dev database, which was then rolled back. Nothing
persisted. Script output, with connection details never printed:

```text
server: { postgres: '18.6', role: 'neondb_owner', superuser: false, createrole: true, bypassrls: true,
  profile_exists: false, fh_app_exists: false, applied_migrations: 2 }
applied 288 statements inside the transaction
checks: { tables_with_rls: 23, policies: 68, prices: 6 }
as fh_app (anonymous): { role: 'fh_app', profiles: 0, prices: 6 }
anonymous insert: denied: new row violates row-level security policy for table "member_account"
after rollback: { profile_exists: false, fh_app_exists: false }
```

### Applied to the Neon dev database

`npm run db:migrate` (owner's go-ahead, 28 Oct 2026):

```text
> @fh/api@0.1.0 db:migrate
> drizzle-kit migrate
Using 'pg' driver for database querying
[✓] migrations applied successfully!
```

Read-only check afterwards. The `fh_app` part ran in a transaction that was rolled back:

```text
migrations recorded: 4
schema: { public_tables: 28, tables_with_rls: 23, policies: 68, app_functions: 32, triggers: 12,
  fh_app_role: true, owner_can_switch_to_fh_app: true }
seed: { current_prices: 'premium_3m LKR 850000, premium_3m USD 5500, premium_6m LKR 1500000,
  premium_6m USD 10000, starter_1m LKR 300000, starter_1m USD 2000',
  switches: 'signups_paused=false, document_submissions_paused=false' }
as fh_app (anonymous): { role: 'fh_app', profiles: 0, prices: 6 }
fh_app reading auth_user: denied: permission denied for table auth_user
```

The running dev API stayed healthy: `{"ok":true,"database":true,"email":true,"sms":false,"storage":true}`.

### `npm run typecheck` and `npm run build`

Both passed (exit 0). Excerpts:

```text
> @fh/website@0.1.0 typecheck
> astro check
Result (32 files):
- 0 errors
- 0 warnings
- 0 hints

> @fh/api@0.1.0 build
  dist/index.js       53.5kb
> @fh/member@0.1.0 build
✓ 1926 modules transformed.
dist/index.html                   0.47 kB │ gzip:   0.30 kB
dist/assets/index-CRZM2y93.css   42.07 kB │ gzip:   8.06 kB
dist/assets/index-CKwHPc9K.js   412.66 kB │ gzip: 127.19 kB │ map: 2,075.35 kB
✓ built in 1.01s
> @fh/website@0.1.0 build
17:13:48 [build] 22 page(s) built in 447ms
```

**Member app in the browser.** At `localhost:5173/app/`, the shell renders with the demo palette. The dark toggle
switches the page background to `#1d1b18` and remembers the choice. The status list shows the API reachable and the
database, email and storage ready.

### Not done in Stage 1

- Neon staging and production projects are **BLOCKED**: they must be created in the owner's account. The steps are in
  `docs/ARCHITECTURE.md`, "Environments".
- No API routes use the new tables yet; that starts in Stage 2. The rules are enforced in the database and tested,
  but no member-facing feature changes.

## Stage 2a evidence (28 Oct 2026): server for accounts and verification

Scope (Part 3 "Stage 2", server half; the owner chose to split the stage): real authentication, self-managed and
guardian-managed profiles, the 24-hour invitation with a code, candidate takeover, the three badges, the 3-profile
limit, document upload with staff review, the 90-day deletion job, and staff roles with two-step login. The screens
come in 2b.

### What was built

- **API restructure.** `createApp(deps)` takes the database, Better-Auth, storage and messaging, so the tests run
  the real API on PGlite. Every member and staff query goes through `withActor(c, fn)` (role `fh_app`).
- **Routes** (`apps/api/src/routes/`):
  - `/api/v1/me`
  - `/api/v1/profiles`: create, view, edit with a version check, publish and pause, contacts, the candidate's
    permission switches, takeover, and withdraw or restore consent
  - invitations: from the manager, and preview, code, accept and decline for the candidate
  - `/api/v1/verification`: document upload and own cases
  - `/api/v1/staff/verification`: queue, audited document link, decision
- **Migrations.**
  - `0004_candidate_consent.sql` adds candidate confirmation and objection, one profile per candidate, and invitation
    code fields.
  - `0005_accounts_and_trust.sql` is hand-written:
    - editing and interests follow the candidate's permissions
    - contact verification can't be self-claimed
    - functions for badges, invitations, takeover and consent
    - document decisions stamped with a 90-day purge date
    - the staff queue function
- **Jobs.** `documents.purge` deletes due files, retries failures the next run, and is logged and audited with counts
  only.
- **Staff.** `scripts/staff.ts` adds or revokes staff and resets two-step login. Validation lives in shared schemas
  (`packages/shared/src/profile.ts`).

### `npm test`: 56 tests (37 access rules, 19 HTTP flows)

```text
▶ accounts (A01, A02, S06)
  ✔ sign up and sign in with an email code; wrong and reused codes fail
  ✔ anonymous visitors get nothing
  ✔ the owner can pause new sign-ups; existing members keep working (S06)
▶ profiles (P01, A04, A05)
  ✔ one own profile per person; fields are validated on the server (P01)
  ✔ a stale edit is refused instead of overwriting (A05)
  ✔ a manager runs up to 3 profiles (A04)
▶ documents, staff review and publishing (P02, P05, P09, S04)
  ✔ staff powers need two-step login, checked by the server (S04)
  ✔ a fake image is refused and nothing is stored (P09)
  ✔ publishing needs a complete profile, a verified phone and an approved document (P02, P05)
  ✔ viewing a document is audited and gives a short-lived link
▶ invitations and the candidate (I01–I09)
  ✔ a manager prepares a profile and invites the candidate; own contact is refused (I01)
  ✔ the link shows only who invited whom; the code goes to the nominated address (I02, I04)
  ✔ the manager cannot accept; a wrong code is counted; the candidate accepts once (I03, I05)
  ✔ the candidate controls the manager’s permissions and sharing (I07)
  ✔ withdrawing consent takes the profile down; the manager cannot override (I06, I09)
  ✔ takeover: the manager loses access at once and the plan carries over (I08)
  ✔ declining with the code needs no account and takes the profile down (I06)
▶ document retention (X01, S05)
  ✔ files are deleted 90 days after the decision; a failed delete is retried
  ✔ revoking a staff member ends their access at once (S05)
▶ invariants
  ✔ no invitations once the candidate has joined
  … the 36 Stage 1 access-rule tests, all passing (list in the Stage 1 evidence)
ℹ tests 56
ℹ suites 15
ℹ pass 56
ℹ fail 0
```

These are real flows, not mocks of the rules:

- sign-in uses Better-Auth email codes
- two-step login uses real TOTP codes computed from the authenticator link
- documents are real JPEGs decoded by sharp

Only delivery and file storage are replaced: messages go to an outbox, and files are kept in memory.

**First runs.** The first run failed on a SQL alias bug in the new `app.profile_people` function: inside a subquery,
`id` meant the document case's id. It was fixed before any commit. The server log of the final run has no unhandled
errors, only the expected refusals.

One existing Stage 1 test changed: its invitation used a profile whose candidate had already joined. That is refused
now, so the test uses a profile still waiting for its candidate. A new test checks the refusal.

### Neon dry run (dev database, rolled back)

```text
applied 43 statements inside the transaction
checks: { tables_with_rls: 23, policies: 68, prices: 6 }
as fh_app (anonymous): { role: 'fh_app', profiles: 0, prices: 6 }
anonymous insert: denied: new row violates row-level security policy for table "member_account"
after rollback: { objection_column_exists: false, app_functions: 32 }
```

### Applied to the Neon dev database

`npm run db:migrate` (owner's go-ahead, 28 Oct 2026): `[✓] migrations applied successfully!`

Read-only check afterwards. The `fh_app` part ran in a transaction that was rolled back:

```text
migrations recorded: 6
schema: { tables_with_rls: 23, policies: 68, app_functions: 48, triggers: 14,
  profile_consent_columns: 'candidate_confirmed_at, candidate_objection_at',
  invitation_code_columns: 'code_expires_at, code_sends',
  one_profile_per_candidate_index: true }
as fh_app (anonymous): { role: 'fh_app', preview_for_unknown_link: null, profiles: 0 }
```

The running dev API serves the new routes against Neon:

- `GET /health` returned `{"ok":true,"database":true,"email":true,"sms":false,"storage":true}`.
- `POST /api/v1/invitations/preview` with an unknown link returned `INVITATION_INVALID`, from the new database function.
- `GET /api/v1/profiles` without a session returned `UNAUTHENTICATED`.

### `npm run typecheck` and `npm run build`

Both passed (exit 0): `astro check` gave 0 errors, the API bundle `dist/index.js` is 99.0kb, the member app built, and
the website built 22 pages. The running dev API reloaded with the new code: `/health` returned
`{"ok":true,"database":true,"email":true,"sms":false,"storage":true}`.

`npm audit`: the API's sharp is now 0.35.5. The remaining sharp advisory is Astro's build-time copy (0.34.5), which
goes with the deferred Astro upgrade.

### Not done in 2a

- The screens, in 2b.
- Creating the staff accounts on any real environment, an owner action with `npm run staff`.
- **BLOCKED:** SMS (provider not chosen). Phone verification works in tests and in development with
  `SMS_PROVIDER=log` only. Publishing on staging or production needs a provider.
- Email invitations and codes reach only the Resend account owner until the domain is verified in Resend.

## Stage 2b evidence (29 Oct 2026): member and staff screens

Scope: the Stage 2 screens on top of the 2a server. Members sign in, build and publish a profile, verify a phone and
send a document, invite a candidate, and the candidate accepts, declines, sets permissions or takes over. Staff sign
in with two-step login and review documents.

### What was built

- **Member app** (`apps/member/src/features/`): `home` (sign-in, name, dashboard), `profile` (overview, four-step
  details, contacts, the manager's and the candidate's panels), `trust` (phone and document checks), `invite` (the
  candidate's page) and `staff` (sign-in, two-step enrolment, review queue). Routes and conventions are in
  `docs/ARCHITECTURE.md`, "Member app screens".
- **One contract.** `packages/shared/src/api-types.ts` holds the API's response shapes; the API annotates its
  responses with them and the app reads them. Validation messages in `packages/shared/src/profile.ts` are now written
  for members ("Write at least 20 characters.").
- **Sandbox.** `npm run dev:sandbox` runs the real API on PGlite with console delivery, for trying the screens
  without any service (README, ARCHITECTURE).
- **Error boundary.** A screen that fails to render shows a reload notice instead of a blank page.

### Browser walkthrough (sandbox, synthetic accounts)

Run in the in-app browser against `npm run dev:sandbox`: the real API and every migration on PGlite. Codes and links
were read from the sandbox console.

Self-managed member:

1. Signed in with an email code, gave a name, created an own profile with the adult declaration.
2. Saved Essentials (version 2). A too-short bio was refused before sending ("Write at least 20 characters."), then
   About saved with values (version 3). "Still needed" then listed only the phone contact.
3. Added a phone contact; it was stored as `+94700000001`.
4. Publish was refused: "Before publishing, you need a phone number verified by SMS code and an approved identity
   document."
5. On `/verify`: phone verified with the SMS code; a passport photo uploaded and shown as "Waiting for review".
6. Staff: password sign-in led to the two-step setup; until then the API refused the queue
   (`403 TWO_FACTOR_REQUIRED`). After setup (QR code, key, backup codes, authenticator code) the queue showed the case.
   "Show the document (logged)" displayed the re-encoded image, then Accept.
7. Member again: the dashboard showed "Passport: reviewed and accepted" and the "Candidate identity verified" badge.
   Publish, Pause and "Publish again" all worked.

Guardian-managed profile:

1. A manager (relationship: father) created a profile for a family member with the declaration, and added the
   candidate's phone, labelled "Not verified by candidate".
2. Inviting the manager's own email, in capitals, was refused: "Use the candidate's own email or phone, not yours."
   The invitation to the candidate's email showed "waiting, link valid until …"; the email text was checked in the
   console.
3. The candidate opened the link signed out. The page showed "Sunil Fernando (father) has started a matrimony profile
   for Nimali." and the masked address `n•••@sandbox.test`. After the invitation code, Accept asked the candidate to
   sign in on the page, then accepted by itself.
4. As the candidate: the "Candidate confirmed" badge, "You cannot edit this profile", the email proven by the
   invitation shown as Verified.
   - Turning off "Edit the profile" made `manager.canEdit` false in the API.
   - Withdrawing consent (with confirmation) hid the profile; restoring it worked.
   - Taking over (with confirmation) made the profile self-managed. The former manager's dashboard became empty and
     the API returned 404 for the profile.
5. Decline: a second invitation, the code, then Decline with confirmation showed "You declined". The used link then
   showed "This invitation cannot be used".

Also checked:

- Staff daily sign-in: password, then the authenticator code. `/api/v1/me` stayed `401` until the code was entered;
  then the queue loaded (`200`).
- Phone width (375 px): sign-in, dashboard, the create dialog and the details form lay out in one column. Sign-in and
  the details form were measured: no sideways scroll (`scrollWidth` 375, no element past the edge).
- The regular dev API on Neon dev serves the 2b code. `GET /health` returned
  `{"ok":true,"database":true,"email":true,"sms":false,"storage":true}`, and an unknown invitation link returned the new
  `INVITATION_INVALID` message.

### Problems the walkthrough found, all fixed

1. After a correct sign-in code the screen stayed on the code step, and a second try reused the spent code ("Invalid
   OTP"). Signing in cleared the query cache instead of refetching. It now resets and refetches.
2. A self-managed profile showed a "Manager and consent" tab. It now shows only on guardian-managed profiles.
3. "plus the your identity document" on the overview. Fixed wording.
4. The API labelled every unverified candidate phone "not verified by candidate", also on self-managed profiles.
   OWNER-DECISIONS section 4 limits the label to guardian-managed profiles; `contactView` now checks that. The
   publishing test asserts it, and fails without the fix (below).
5. The overview went blank for an account with no document: the shared type missed `documentStatus: 'none'`. Fixed
   the type and the screen. The new error boundary was then tried by forcing a bad response; it showed the reload
   notice.
6. After a takeover the open "Manager and consent" tab disappeared and left an empty panel. Tabs now fall back to the
   overview. Checked by switching the page's data from managed to self-managed with that tab open.
7. The invitation page had two fields called "Code", and "create one with the same code" was ambiguous. The first is
   now "Invitation code", and the sign-in step says a separate code comes.
8. A used invitation link said "Ask for a new one", which is wrong after a decline or an accept. The API now gives one
   message for every unusable link (so a link reveals nothing), and the page adds "If you accepted it, sign in".
9. "You declined … only you can change that" was untrue for a candidate without an account. It now says the manager
   cannot publish the profile or invite again, as the confirmation said.
10. Document status read "approved" on the dashboard but "Reviewed and accepted" elsewhere. One shared wording now.
11. The sandbox API listened on every network interface. It now listens on 127.0.0.1 only.

### `npm test`: 56 tests, all passing

The 37 access-rule tests are unchanged (list in the Stage 1 and 2a evidence). The 19 HTTP flow tests:

```text
▶ accounts (A01, A02, S06)
  ✔ sign up and sign in with an email code; wrong and reused codes fail
  ✔ anonymous visitors get nothing
  ✔ the owner can pause new sign-ups; existing members keep working (S06)
▶ profiles (P01, A04, A05)
  ✔ one own profile per person; fields are validated on the server (P01)
  ✔ a stale edit is refused instead of overwriting (A05)
  ✔ a manager runs up to 3 profiles (A04)
▶ documents, staff review and publishing (P02, P05, P09, S04)
  ✔ staff powers need two-step login, checked by the server (S04)
  ✔ a fake image is refused and nothing is stored (P09)
  ✔ publishing needs a complete profile, a verified phone and an approved document (P02, P05)
  ✔ viewing a document is audited and gives a short-lived link
▶ invitations and the candidate (I01–I09)
  ✔ a manager prepares a profile and invites the candidate; own contact is refused (I01)
  ✔ the link shows only who invited whom; the code goes to the nominated address (I02, I04)
  ✔ the manager cannot accept; a wrong code is counted; the candidate accepts once (I03, I05)
  ✔ the candidate controls the manager’s permissions and sharing (I07)
  ✔ withdrawing consent takes the profile down; the manager cannot override (I06, I09)
  ✔ takeover: the manager loses access at once and the plan carries over (I08)
  ✔ declining with the code needs no account and takes the profile down (I06)
▶ document retention (X01, S05)
  ✔ files are deleted 90 days after the decision; a failed delete is retried
  ✔ revoking a staff member ends their access at once (S05)
ℹ tests 56
ℹ suites 15
ℹ pass 56
ℹ fail 0
```

The publishing test now also checks that a self-managed profile's phone has no "not verified by candidate" label.
With the fix removed, it fails as it should:

```text
ℹ pass 0
ℹ fail 1
  AssertionError [ERR_ASSERTION]: the label is for guardian-managed profiles only (section 4)
```

### `npm run typecheck` and `npm run build`

Both passed (exit 0): `astro check` gave 0 errors, the API bundle `dist/index.js` is 99.7kb and the website built 22
pages. The member app splits each area into its own chunk:

```text
dist/assets/InvitePage-….js       4.43 kB │ gzip:   1.90 kB
dist/assets/VerifyPage-….js       5.11 kB │ gzip:   2.12 kB
dist/assets/StaffApp-….js        20.08 kB │ gzip:   7.34 kB
dist/assets/ProfilePage-….js     28.06 kB │ gzip:   8.72 kB
dist/assets/index-….js          529.37 kB │ gzip: 166.61 kB
(!) Some chunks are larger than 500 kB after minification.
```

### Not done in 2b

- No database changes, so nothing to apply to Neon.
- Not clicked through in the browser: staff rejection with a reason (the API test covers it and the member seeing the
  reason), staff sign-in with a backup code, and SMS invitations. The new "You declined" wording was type-checked but
  not seen on screen. The dark theme was not reviewed screen by screen.
- The main member chunk is 529 kB (167 kB gzipped), over Vite's 500 kB warning. Split the vendor code in Stage 6.
- **Before the first deploy:** tell Better-Auth which header carries the client IP. The sandbox log showed "Rate
  limiting could not determine a client IP and is falling back to a single shared per-path bucket". Better-Auth 1.7
  trusts `X-Forwarded-For` only when it holds a single address. Members behind proxies that add their own would share
  one bucket, so the 3-codes-a-minute limit would apply to them together. The setting depends on the host: on Fly.io
  `advanced.ipAddress.ipAddressHeaders: ['fly-client-ip']`; behind another proxy, `trustedProxies`.
- With the SMS provider: let a joined candidate confirm a phone number the manager entered.
- Owner actions, unchanged: staff accounts on each real environment (`npm run staff`), the SMS provider (**BLOCKED**),
  the Neon staging and production projects (**BLOCKED**), and the decisions marked "Proposed — confirm".

### Fix after review: sign-in from `localhost:4321` (29 Oct 2026)

The owner tried to sign in on the regular dev stack (Neon dev, Resend) at `http://localhost:4321/app/`, the address
the README gives. The first code request failed with `403`, and the retries with `429 Too Many Requests`. The screen
showed only the last error, "Too many requests".

**Cause.** `ALLOWED_ORIGINS` listed only `http://localhost:5173`, in `.env.example` and so in the local `.env`.
Better-Auth compares the browser's `Origin` header with that list and refused the website's address. Each refused
request still counted towards the limit of 3 code requests a minute, so the retries were blocked as well. The 2b
walkthrough used the sandbox, which has its own settings, so it did not catch this.

Probe with a wrong code for a made-up address (no email sent), before the fix:

```text
http://localhost:4321 -> {"message":"Invalid origin","code":"INVALID_ORIGIN"} [403]
http://localhost:5173 -> {"message":"Invalid OTP","code":"INVALID_OTP"} [400]
```

**Fix.**

- `apps/api/.env.example` (and the local `.env`): `ALLOWED_ORIGINS=http://localhost:4321,http://localhost:5173`.
- `apps/api/src/env.ts`: the API refuses to start when `ALLOWED_ORIGINS` lacks the origin of `MEMBER_APP_URL`, so a
  staging or production setup cannot repeat this.
- `docs/ARCHITECTURE.md`, "Domains and cookies": why the proxy's same-origin is not enough.

**Checked.** The running dev API restarted on its own and gave:

```text
http://localhost:4321 -> {"message":"Invalid OTP","code":"INVALID_OTP"} [400]
http://localhost:5173 -> {"message":"Invalid OTP","code":"INVALID_OTP"} [400]
http://evil.example -> {"message":"Invalid origin","code":"INVALID_ORIGIN"} [403]
```

The start-up check, both ways:

```text
ALLOWED_ORIGINS must include http://localhost:4321, the origin of MEMBER_APP_URL.
without :4321 -> exit 1
settings accepted
with the fixed .env -> exit 0
```

In the in-app browser at `http://localhost:4321/app/`, through the website's proxy with the browser's own `Origin`:
`/health` gave `{"ok":true,"database":true,"email":true,"sms":false,"storage":true}`, and the same wrong-code
request got `400 INVALID_OTP`, so it passed the origin check. `npm run typecheck` (0 errors), `npm test` (56 of 56)
and `npm run build` all passed. A real sign-in code was not sent; the owner signs in themself.

## Stage 3a evidence (29 Oct 2026): server for requests, connections and privacy

Scope (Part 3 "Stage 3", server half; the owner chose to split the stage again):
- discovery, interests (send, accept, decline, withdraw), connections, blocks and reports, all on the server;
- mutual acceptance, the sender blur, the 7-day wait, Starter and Premium limits;
- the cover-photo toggle and server-side blurred photos;
- expiry hiding contact details for the expired member;
- report thresholds, withdraw, pause, and "engaged or married";
- consistent results for simultaneous requests.

The screens come in 3b.

### Owner decisions taken at the start

- Browsing is for verified members only (N04).
- When one plan ends, only that member loses the details (O03).
- Parents' names are shown only after both accept (N06).

The decisions table also lists the engineering choices marked "Proposed — confirm".

### What was built

- **Migrations.** `0006_moderation_hidden.sql` (generated) adds `profile.moderation_hidden_at`.
  `0007_requests_and_privacy.sql` is hand-written. It adds:
  - verified-member browsing and the profile-row access for connections;
  - one function per action: `send_interest`, `accept_interest`, `end_connection`, `block_profile`, `file_report`,
    `review_report` and `mark_engaged`, each with advisory locks;
  - the 7-day wait, the request limits and the report thresholds;
  - the sharing log (on accept, on end, and a trigger for contact changes);
  - photo editing restricted to editors.

  Direct inserts into interests, connections, request charges, the sharing log, reports and blocks are closed. The
  internal helpers cannot be called by the API role.
- **API routes.**
  - `GET /api/v1/discover` and `GET /api/v1/discover/:id`.
  - Under `/api/v1/profiles/:id`: requests (send and lists), connections, blocks, plan usage, "engaged or married",
    photos (upload, delete, cover) and cover visibility.
  - `/api/v1/interests/:id/accept`, `/decline` and `/withdraw`; `/api/v1/connections/:id/end`; `/api/v1/reports`.
  - Staff: `/api/v1/staff/reports` and its decision route.
- **Shared contract.** `packages/shared/src/requests.ts` holds the input schemas; `api-types.ts` holds the cards,
  views, requests, connections, plan usage and the report queue.
- **Docs.** `docs/ARCHITECTURE.md`, "Requests, connections and privacy (Stage 3)".

### `npm test`: 73 tests, all passing

The 16 new HTTP flow tests run as real signed-in, SMS-verified members with reviewed documents:

```text
▶ discovery (owner decision 29 Oct 2026: verified members only; sections 1, 6)
  ✔ anonymous and unverified members cannot browse
  ✔ verified members see published profiles, never their own; filters run on the server
  ✔ cards and profiles carry only the member allowlist; parents’ names wait for a connection
▶ requests: plan, limits and the 7-day wait (sections 1, 2, 4)
  ✔ sending needs a plan and a published profile, never to your own
  ✔ a retry with the same key sends and charges once; a withdrawal starts the 7-day wait
  ✔ Starter allows 5 a day and 30 a month; Premium 30 a day
▶ the sender blur and connections (sections 1, 3, 4)
  ✔ without a plan the receiver gets previews only; the sender never leaves the server
  ✔ accepting opens one connection, logs what each side shares, and shows contacts and names
  ✔ when one plan ends only that member loses the details (owner decision 29 Oct 2026, O03)
  ✔ ending a connection hides details both ways, is logged, and starts the 7-day wait
▶ blocks (sections 4, 7)
  ✔ a block hides both profiles from each other and closes open requests; lifting it restores no connection
▶ photos (sections 6, 7)
  ✔ the original stays private and members get a separate blurred copy; at most 5
▶ reports and moderation (section 7)
  ✔ a serious category hides the profile at once; staff dismissing it restores it
  ✔ other categories need 3 different verified members; an upheld report keeps it hidden
  ✔ a photo report hides only that photo
▶ engaged or married (section 7)
  ✔ needs the forfeit confirmation; hides the profile, ends the plan and closes open requests
ℹ tests 73
ℹ suites 22
ℹ pass 73
ℹ fail 0
```

The access-rule tests are now 38. One test is new:

```text
  ✔ an unverified member sees only their own profile (owner decision, audit N04)
```

Three existing tests now go through the new functions instead of inserting rows directly, and also check that
direct inserts are refused. They cover blocking, sending, and answering.

Plans are granted directly in the database, because buying one arrives in Stage 4. The limit tests add earlier
sends directly too, since sending 30 real requests in a test is not practical.

**Mutation checks.** Each rule was broken on purpose, the tests were rerun, and the file was restored. Every
break was caught:

| Rule broken | Result |
| --- | --- |
| No daily limit | 1 test fails |
| No 7-day wait | 5 fail |
| Unverified members may browse | 1 fails |
| API skips the preview path for unpaid receivers | 1 fails |
| Parents' names always shown | 2 fail |
| Report threshold 2 instead of 3 | 1 fails |
| Expired member keeps contact details | 4 fail |
| Accepting not logged | 1 fails |
| Original photos for any browsing member | 2 fail |

**Concurrency.** The tests send three identical requests at once (one goes through) and accept twice at once (one
connection). PGlite runs a single connection, though, so this proves the logic and the idempotency, not lock
contention. Real contention under load is for the Stage 6 load test.

### Neon dry run (dev database, rolled back)

`0006` and `0007` were applied inside one transaction on the Neon dev database (PostgreSQL 18.6), checked, then
rolled back:

```text
migrations recorded before: 6
applied inside the transaction: 44 statements
app functions before: 48
checks: { app_functions: 67, policies: 62, insert_policies_on_closed_tables: 0, moderation_column: true,
  disclosure_trigger: true, internal_helpers_callable_by_fh_app: 0 }
as fh_app (anonymous): { role: 'fh_app', verified: false, profiles_visible: 0 }
direct interest insert: denied: new row violates row-level security policy for table "interest"
send_interest without a member: refused: interest_not_allowed
advisory lock: { advisory_lock_calls: 1 }
after rollback: { moderation_column: false, send_interest_exists: false, app_functions: 48 }
```

Policies went from 68 to 62 because the six direct-insert policies were removed. Migrations 0006 and 0007 are **not
applied** to Neon dev. Until they are, the new routes fail on the regular dev stack (`npm run dev`); the sandbox
applies every migration on start.

### `npm run typecheck` and `npm run build`

Both passed (exit 0): `astro check` gave 0 errors, the API bundle `dist/index.js` is 135.3kb, the member app built,
and the website built 22 pages.

### Not done in 3a

- The screens (3b).
- Applying 0006–0007 to Neon dev, on the owner's go-ahead.
- Boosts, featured profiles and shortlist limits (N01–N03): not built until the owner decides.
- The 2-re-sends-per-pair cap: recommended only, not built (O04).
- Lock contention under real load: Stage 6.
