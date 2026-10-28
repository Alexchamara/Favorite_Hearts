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
| 0 Baseline and rule audit (`docs/RULE-AUDIT.md`) | not started |
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
