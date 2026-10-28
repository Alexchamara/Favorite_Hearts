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
| 1 Foundation: member app migration, Drizzle schema + RLS, Neon staging/production | scaffold only |
| 2 Accounts and verification (codes, invites, takeover, badges, staff 2FA, documents) | auth wiring only |
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

### Task checklist

Built from [`RULE-AUDIT.md`](RULE-AUDIT.md); IDs refer to its rows.

**Stage 0**

- [x] Run the demo install, build and tests, and this repo's typecheck and build, with output above.
- [x] Record routes, simulations and dependencies.
- [x] Tag the rollback point `stage-0-baseline`.
- [x] Write `docs/RULE-AUDIT.md`, with no fixes.
- [ ] Owner reviews the audit and says "continue".

**Stage 1: Foundation**

- [ ] Schema and RLS keep private contacts separate from profile fields (P20) and allow up to 3 profiles per manager (P16).
- [ ] Use synthetic staging data only: no fictional members, account switcher or demo codes (P06, P28).
- [ ] Do not port the horoscope workspace; keep only the preference field (P26).
- [ ] Correct the Supabase comment in `packages/shared/src/contact.ts` (X07).
- [ ] Decide the astro 7 upgrade for the critical advisory.

**Stage 2: Accounts and verification**

- [ ] 24-hour single-use invitations with a code to the nominated contact, contacts that differ, and limited resends (P15).
- [ ] Takeover without a fee: the manager loses access immediately and the plan carries over. The owner confirms the fee is dropped (P14, O07).
- [ ] Accept NIC, passport or driving licence. Use exactly three badges with approved wording, and decide on the selfie (P17, P18, N05).
- [ ] Add the "not verified by candidate" label (P19).
- [ ] Owner and backup reviewer accounts with two-step login. The backup has no payment rights, enforced in the database (P09).
- [ ] Private photo storage with server-made blurred copies; upgrade sharp first (P07).
- [ ] 90-day document deletion job with logging (P25).

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
