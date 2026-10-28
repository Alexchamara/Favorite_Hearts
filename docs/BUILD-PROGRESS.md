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
| 2 Accounts and verification (codes, invites, takeover, badges, staff 2FA, documents) | **2a (server) done, awaiting owner review**; 2b (member and staff screens) next. SMS **BLOCKED** until a provider is chosen. |
| 3 Requests, connections and privacy | not started |
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
| 2026-10-28 | Contact details hide for the member whose own plan ended; the other member's expiry does not hide them (spec O03). | Proposed — confirm |
| 2026-10-28 | Any active member may browse published profiles, verified or not (audit N04). | Proposed — confirm |
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

- [ ] Member:
  - sign-in with an email code
  - the profile wizard and edit, and contacts
  - phone verification and document upload
  - inviting the candidate
  - the candidate's invitation page (code, accept, decline) and controls
  - badges with the approved wording ("identity document reviewed")
- [ ] Staff: password sign-in with two-step login, including enrolment with backup codes, and the document review queue.
- [ ] Owner action: create the owner and backup reviewer accounts on each environment (`npm run staff`).
- [ ] **BLOCKED:** SMS provider. Phone verification for publishing and SMS invitations wait for it.

**Stage 3: Requests, connections and privacy**

- [ ] Server-side discovery and sender masking (P06).
- [ ] Quotas: Starter 5 per day and 30 per month; Premium 30 per day (P02).
- [ ] 7-day re-send rule and withdrawal log (P03, P04).
- [ ] The expired member loses contact details; the owner answers what the still-paid member sees (P05, O03).
- [ ] Per-field sharing for manager and candidate, candidate restrictions and a disclosure log (P20, P21).
- [ ] Caste consent with "Prefer not to say", and income labelled "self-declared" (P22, P23).
- [ ] Report categories and thresholds (P08). "Engaged or married" with a forfeiture warning (P24).
- [ ] Owner decides on boost, featured profiles, shortlist limits, unverified browsing and family-detail visibility (N01–N04, N06).
- [ ] Spec items with no owner rule: country lists and validation (G24), atomic saves (G25), report-data exposure (G28).

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

Migrations 0004–0005 are **not applied** to Neon dev yet. They wait for a go-ahead, as Stage 1's did.

### `npm run typecheck` and `npm run build`

Both passed (exit 0): `astro check` gave 0 errors, the API bundle `dist/index.js` is 99.0kb, the member app built, and
the website built 22 pages. The running dev API reloaded with the new code: `/health` returned
`{"ok":true,"database":true,"email":true,"sms":false,"storage":true}`.

`npm audit`: the API's sharp is now 0.35.5. The remaining sharp advisory is Astro's build-time copy (0.34.5), which
goes with the deferred Astro upgrade.

### Not done in 2a

- The screens, in 2b.
- Applying 0004–0005 to Neon dev, which waits for a go-ahead.
- Creating the staff accounts on any real environment, an owner action with `npm run staff`.
- **BLOCKED:** SMS (provider not chosen). Phone verification works in tests and in development with
  `SMS_PROVIDER=log` only. Publishing on staging or production needs a provider.
- Email invitations and codes reach only the Resend account owner until the domain is verified in Resend.
