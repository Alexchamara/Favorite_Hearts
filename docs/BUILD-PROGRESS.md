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
| 3 Requests, connections and privacy | **done (3a server, 3b screens), awaiting owner review.** Evidence below. |
| 4 Plans, payments, email, Turnstile | **done (4a server, 4b screens), awaiting owner review.** Real payment details, Turnstile keys and email to members are **BLOCKED** on the owner; evidence below. |
| 5 Content, safety and quality | **5a (safety), 5b (website text and SEO), 5c (English and Sinhala in the app, emails and the reviewer's spreadsheet), 5d (the website in Sinhala) and 5e (accessibility) done, awaiting owner review.** The terms and privacy policy wait for the owner's lawyer (`docs/LEGAL-REVIEW.md`); all Sinhala waits for the owner's reviewer. Evidence below. |
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
| 2026-10-28 | Astro 7 upgrade deferred to Stage 5. The critical advisory needs `define:vars` or server islands, and the static site uses neither. Done in 5b (31 Oct 2026): Astro 7.4.0. | Proposed — confirm |
| 2026-10-28 | Stage 2 split: 2a builds the server, 2b the member and staff screens. | Owner |
| 2026-10-28 | SMS stays BLOCKED until a provider is chosen. In development, codes print to the API console (`SMS_PROVIDER=log`); nothing pretends an SMS was sent. | Owner |
| 2026-10-28 | No takeover fee and no selfie (§5). Before takeover, a joined candidate confirms or declines, sets the manager's permissions and what is shared, withdraws consent or takes over, but does not edit profile fields. | Engineering (per §5) |
| 2026-10-28 | After a takeover, a published profile pauses until the candidate's own document and phone are verified. Manager evidence never counts for the candidate (spec 6.3, O07). | Proposed — confirm |
| 2026-10-28 | Invitation limits: 3 invitations per profile per day; 3 codes per link; each code lasts 10 minutes and allows 5 tries. §5 asks for "a limit on resends" without a number (spec O16). | Proposed — confirm |
| 2026-10-28 | After a candidate declines, the manager cannot send further invitations for that profile. | Proposed — confirm |
| 2026-10-28 | A person can be the candidate of only one live profile (spec O14). | Proposed — confirm |
| 2026-10-28 | Identity documents are accepted as photos (JPEG, PNG or WebP, at most 5 MB), not PDF. | Proposed — confirm |
| 2026-10-28 | sharp upgraded to 0.35.5 in the API (libvips, libheif and librsvg advisories). Astro's build-time copy stays until the Astro upgrade. Gone in 5b: Astro 7.4.0 uses the same sharp 0.35.5. | Engineering |
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
| 2026-10-29 | The sandbox seeds four synthetic test members and, as plans are bought in Stage 4, has a sandbox-only route to grant a test plan. Neither exists outside the sandbox. | Engineering |
| 2026-10-29 | Stage 4 split: 4a builds the server, 4b the screens. | Owner |
| 2026-10-29 | The owner fully controls plans and payments. Plans: add, edit, re-price (a new price version), retire, and delete one nobody ever bought or was granted (otherwise retire it). Payments: approve, hold, reject, refund, grant or revoke a plan, notes and statement-line corrections, and delete a payment that never had a receipt. The owner types in the real payment details. | Owner |
| 2026-10-29 | Plan changes follow an owner-set level. A higher level is an upgrade: it starts on approval and the unused days are lost, shown first and confirmed by the member. The same level renews only in the last 7 days, counted from approval. A lower level is blocked while a plan is active. Premium 3 → 6 months is an upgrade. | Owner |
| 2026-10-29 | Renewal grace: access continues for up to 3 days after the end while a receipt sent before the end waits for review (in review, or held for more). A rejection ends it at once. | Owner (was recommended in §3) |
| 2026-10-29 | Payment receipts are photos or screenshots (JPEG, PNG or WebP, at most 5 MB), re-encoded on the server. No PDF. | Owner |
| 2026-10-29 | The price band follows the payer's declared country of residence: Sri Lanka pays the local LKR price, anywhere else the diaspora USD price. The owner's queue flags a different profile country or a non-Sri Lankan phone (or the reverse) for review; nothing is rejected automatically. | Proposed — confirm |
| 2026-10-29 | LKR is paid by local bank transfer; USD by SWIFT, Wise or PayPal. A method shows to members only after the owner enters its details and switches it on. | Proposed — confirm |
| 2026-10-29 | One open payment per profile. Repeating the same choice returns it. Before sending a receipt the member can cancel it; it stays on record with its reference, so a transfer made anyway can still be matched. | Proposed — confirm |
| 2026-10-29 | Approval re-checks the plan rules. If the change is no longer allowed at that moment (for example a downgrade, after another plan was granted), approval is refused and the owner rejects or refunds instead (spec 9.4). | Proposed — confirm |
| 2026-10-29 | Plan terms are whole calendar months on the Sri Lanka clock: 31 January plus one month is 28 February, or 29 in a leap year (spec M09). | Proposed — confirm |
| 2026-10-29 | Refunds: the owner chooses whether the plan that payment bought ends now or stays. A duplicate that was never approved is refunded against its statement line. Disputes (for example PayPal) and suspensions use a manual revoke with a reason; the terms must say this (§9). | Proposed — confirm |
| 2026-10-29 | After a takeover, the former manager's payments that never got a receipt are cancelled. Receipts already sent stay with the owner, and an approval still goes to the profile. The candidate never sees the manager's payments (spec 6.3). | Proposed — confirm |
| 2026-10-29 | Expiry emails go to everyone running the profile, 7 days before the end (when renewal opens), on the last day, and once it has ended. Payment decisions are emailed to the payer. | Proposed — confirm |
| 2026-10-29 | Turnstile is checked by our own server code (Cloudflare siteverify) on every endpoint that sends a code or checks a password. It is off while no secret is set, required in production, and fails closed if Cloudflare cannot be reached. | Engineering |
| 2026-10-30 | The payment step shows four draft refund points from §9 that the member must tick. The final wording comes with the lawyer's review of the terms (Stage 5). | Proposed — confirm |
| 2026-10-30 | The owner's Approve button stays off until the statement line is typed and the owner ticks that the transfer was found in the real statement (spec 9.3: a receipt alone is not enough). | Engineering |
| 2026-10-30 | Stage 5 is split in three: 5a safety (rate limits, security headers, pause switches, deletion with the retention list, data export), 5b website text and SEO, 5c Sinhala and accessibility. | Owner |
| 2026-10-30 | Sinhala: the developer writes a first draft of every member screen and website page, marked draft; the owner's native-speaker reviewer corrects it in the spreadsheet. Nothing in Sinhala is final until reviewed (5c). | Owner |
| 2026-10-30 | Deleting, "the candidate decides": a candidate who deletes their account deletes their own profile; a manager who deletes theirs passes each profile whose candidate has joined to that candidate (like a takeover; paid time carries over) and deletes the rest. A manager cannot delete a joined candidate's profile alone. | Owner |
| 2026-10-30 | The website keeps hello@favoritehearts.com, and +94 76 676 9894 for both WhatsApp and calls, as the support contacts (5b). | Owner |
| 2026-10-30 | A manager can also hand a profile over to its joined candidate without deleting their account. Whenever a profile moves to its candidate (takeover, hand-over, the manager's deletion), the manager's own contact details leave it. | Proposed — confirm |
| 2026-10-30 | Deleting an account or a profile needs a tick ("cannot be undone") and a sign-in within the last 15 minutes. Staff accounts are removed by the owner, not deleted by themselves. | Proposed — confirm |
| 2026-10-30 | What a deletion removes at once and keeps (§8): profile text, photos, contacts, social handles, requests, connections, shortlists, the sharing log and identity-document files go at once; payment records with their receipts, plan history, reports, blocks, document decisions, the staff audit trail and a keyed hash of the sign-in email and phone stay 6 months, then the retention sweep removes them. §8 also says deleted members' documents "follow the same limit" (90 days); deleting the files at once keeps within it. Lawyer and accountant to confirm. | Proposed — confirm |
| 2026-10-30 | "Banned" for the kept hashes: the account or one of its profiles was suspended, or a serious report (explicit content, minors, threats, scam) against one of its profiles was upheld, before or after the deletion. A banned address gets no code and no new account for the 6 months. | Proposed — confirm |
| 2026-10-30 | Requests to a profile that is deleted are removed with it, so they no longer count towards the sender's limits. | Proposed — confirm |
| 2026-10-30 | Only the owner switches the sign-up and document pauses (the backup reviewer asks the owner). Each change is audited with its reason. | Proposed — confirm |
| 2026-10-30 | Rate limits (numbers in ARCHITECTURE.md, "Safety"), counted in Postgres. Production requires `CLIENT_IP_HEADER`, the header the host sets to the visitor's address. | Proposed — confirm |
| 2026-10-30 | The data export is one ZIP: `data.json` (everything the account and its profiles hold, as the app shows it) and the original photos. Identity documents are not included. 5 exports a day. | Proposed — confirm |
| 2026-10-30 | The member app carries its own Content-Security-Policy in its page; the static host removes the website's policy under `/app/`. `/app/assets/*` is passed through before the SPA rewrite, because Cloudflare Pages applies `_redirects` even when a file exists. | Engineering |
| 2026-10-31 | The site's domain is favoritehearts.com (`siteUrl`). The site stays out of search engines (`indexable: false`) until the owner approves launch. | Owner |
| 2026-10-31 | Favorite Labs stays as advice only. The research claims (user surveys, cause-and-effect research, behavioural analysis) are removed, and the newsroom's "Research & Advice" category is now "Advice". | Owner |
| 2026-10-31 | The terms and the privacy policy show the operator as a marked placeholder, `[operator’s legal name and address]`, until the owner gives the legal name (the business is not registered yet). | Owner |
| 2026-10-31 | English is the official text of the terms and the privacy policy; the Sinhala translation (5c) is for convenience, and the English applies if they differ. | Owner |
| 2026-10-31 | The pricing page shows the live plans and prices from the API (the catalogue the owner manages in the app), never prices written into the page. If the API cannot be reached it says so and points to the app. | Proposed — confirm |
| 2026-10-31 | Support hours stay as the site already gave them: daily, 8:00 AM–10:00 PM, Sri Lanka time. | Proposed — confirm |
| 2026-10-31 | The Facebook, Instagram and TikTok links stay hidden until the owner sets their addresses in `site.config.json`. | Proposed — confirm |
| 2026-10-31 | The draft terms choose the laws and courts of Sri Lanka, without removing protections of the member's own country. For the lawyer to confirm (`docs/LEGAL-REVIEW.md`). | Proposed — confirm |
| 2026-10-31 | Astro pinned to 7.4.0, the newest release at least two weeks old; the website then has no audit findings. Node 22.22 or newer, as Astro 7.4.0 requires. | Engineering |
| 2026-10-31 | `npm run build:site` ends with the site check (`scripts/check-site.mjs`): an SEO mistake, a broken link or a sitemap that misses a page fails the build. | Engineering |
| 2026-10-31 | The member app shows the support channels from the website's `site.config.json`, so the two never disagree (audit X06). | Engineering |
| 2026-11-03 | The rest of Stage 5 in three parts: 5c English and Sinhala in the member app, the API's messages, emails and texts, with the reviewer's spreadsheet; 5d the website in Sinhala; 5e accessibility. | Owner |
| 2026-11-03 | Sinhala website pages get their own addresses (`/si/…`); the visitor's choice follows them into the app, and the app saves it on the account so emails and texts use it. | Owner |
| 2026-11-03 | The reviewer works in an Excel file (.xlsx), which opens in Excel, Google Sheets and Numbers; one command reads it back. | Owner |
| 2026-11-03 | Staff screens (owner and backup reviewer) stay in English. | Owner |
| 2026-11-03 | A language chosen on a device wins over the account's and is saved to it; a device where nobody chose takes the account's language. The API answers in the request's language; emails use the saved one. | Proposed — confirm |
| 2026-11-03 | An invitation goes out in the inviting manager's language (the candidate has no account yet). | Proposed — confirm |
| 2026-11-03 | Sinhala month names are drafted in the everyday form (ජනවාරි … දෙසැම්බර්), dates as "2026 දෙසැම්බර් 3"; the reviewer may choose the traditional names (දුරුතු … උඳුවප්) instead. Country names are drafted from the Unicode CLDR list. | Proposed — confirm |
| 2026-11-03 | Sinhala uses the phone's or computer's own Sinhala font (no web font is downloaded). | Proposed — confirm |
| 2026-11-03 | Plan names stay exactly as the owner types them in both languages (the owner may write both, e.g. "Premium 3 months / ප්‍රීමියම් මාස 3"). Members' own words and names are never translated. | Proposed — confirm |
| 2026-11-03 | Texts live in catalogues in `packages/shared/src/i18n` (English the source, a missing translation falls back to English); the spreadsheet tools need no dependency; dates and country names come from the catalogues, not the browser. | Engineering |
| 2026-11-04 | The ten newsroom articles and Favorite Labs are translated now, with the rest of the website. | Proposed — confirm |
| 2026-11-04 | The Sinhala terms and privacy policy are drafted now, marked draft like the English, and say the English is the official version; the lawyer reviews both together. | Proposed — confirm |
| 2026-11-04 | A first visit is never redirected by the browser's language: every page links to its other-language version (header, or the menu on phones), and the footer's language dialog opens it. The choice is saved for the app. | Proposed — confirm |
| 2026-11-04 | Each website page is one file built at its English address and under `/si/`; the website's words are a `website` catalogue (`web.*`) in the reviewer's spreadsheet (Website tab); the ten article pages became one template. | Engineering |
| 2026-11-05 | Accessibility target: WCAG 2.2 level AA for the website and the member app, both languages and both themes; checked with axe-core 4.14.0 (a pinned development tool, never deployed) and the site check's accessibility area. | Engineering |
| 2026-11-05 | Identity documents: both sides of an NIC or driving licence, a passport's photo page; photos chosen from files, the phone or computer camera, or a phone via a QR code; previews and removal before sending. | Owner |
| 2026-11-05 | The QR code's phone link needs no sign-in: one-time, 15 minutes, it can only add photos to that member's unsent document. Unsent photos are deleted after 24 hours. Computers may also use the webcam. | Owner |
| 2026-11-05 | A selfie holding the document, with an owner switch to require it or not (new submissions only). | Owner |
| 2026-11-05 | Every identity photo change goes through database functions that queue unused files for deletion; photos under 800 px on the long side are refused; previews are streamed by the API, never storage links. | Engineering |
| 2026-11-06 | The member app takes the demo's look: rose brand mark, Georgia headings, a menu drawer for the account and help, and a floating dock (Discover, Requests, Connected, Profiles); requests and connections moved from profile tabs to their own pages. Left out because the service does not offer them: featured and boosted shelves, horoscope matching, compare, online status and the demo's account switcher. | Owner |
| 2026-11-06 | Shortlist (N03): each profile saves published profiles to look at later, private to the people who operate it. Up to 20 without a plan, no limit with one; saved ones above 20 stay when a plan ends, but none are added until under 20. Saved profiles no longer shown stay listed without details so they can be removed. In the dock as Shortlist and as a bookmark on cards and member pages. | Owner |
| 2026-11-11 | Member sign-in becomes email or phone plus password, with the address confirmed once by a code at sign-up (email code or one-step link; SMS code); no code at log-in. Passwords 8+ characters, common and personal ones refused (list kept on our server); 5 wrong passwords lock an address for 15 minutes; email reset links (60 minutes, one use), phone-only accounts through support; email-code sign-in removed once the app and invitations no longer use it. | Owner |
| 2026-11-12 | Discover opens to every signed-in member, verified or not (it was verified members only); publishing, requests and reports still need verification. A newly confirmed account goes to creating its profile; every log-in goes to Discover. | Owner |

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
- [x] Astro 7 upgrade: deferred to Stage 5, see the decisions table; done in 5b (Astro 7.4.0).
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
- [x] Apply migrations 0006–0007 to the Neon dev database (29 Oct 2026; output in the Stage 3a evidence).

Screens (3b):

- [x] Discovery with filters, the member profile view, and sending a request with the "what will be shared" confirmation.
- [x] Received (blurred without a plan) and sent requests; connections with shared details; blocks.
- [x] Photo manager with the cover toggle; reporting; the staff report queue.
- [x] "Engaged or married" with the forfeit warning; the plan's remaining requests.
- [x] "Prefer not to say" for caste and the "self-declared" label for income on the member view (P22, P23).

Open:

- [ ] Owner decides on boost and featured profiles (N01–N02). Not built.
- [x] Shortlist limits (N03): 20 without a plan, none with one (owner, 6 Nov 2026). Built (drizzle/0015_shortlist.sql).
- [ ] Spec items with no owner rule: country lists and validation (G24), atomic saves (G25). Report data (G28): the
  reported member never sees reports, and reporters see only their own.

**Stage 4: Plans, payments and email**

Server (4a):

- [x] Versioned Starter / Premium 3 months / Premium 6 months catalogue in LKR and USD minor units, managed by the
  owner (P01).
- [x] A unique reference per payment, statement matching, and owner-only idempotent approval (P09, P10).
- [x] LKR bank transfer, USD SWIFT and Wise/PayPal channels, with details only the owner enters (P11). Nothing is
  pre-filled.
- [x] Upgrade, renewal, downgrade and expiry rules, the 3-day renewal grace, and expiry warning emails (P12).
- [x] The member must confirm the refund terms (`refund-v1`) and any lost days before a payment starts (P13).
- [x] Takeover carry-over test with a paid plan; refund exceptions and the audit trail recorded.
- [x] Turnstile server-side check; tested against Cloudflare with its published test keys.

Screens (4b):

- [x] Member: plan choice with what each change does, the payment page (reference, details, refund terms), receipts,
  and the expiry warning in the app.
- [x] Owner: plans and prices, payment details, the payment queue with the residence flag, decisions and plan history.
- [x] Turnstile widget on sign-in, code requests and staff sign-in.

Open:

- [ ] **BLOCKED, owner action:** enter the real bank, SWIFT, Wise and PayPal details (owner screen in 4b).
- [ ] **BLOCKED, owner action:** Turnstile keys from the owner's Cloudflare account. Production refuses to start
  without the secret.
- [ ] **BLOCKED, owner action:** email to members needs the domain verified in Resend. Until then Resend delivers only
  to the account owner's inbox.
- [x] The refund wording on the pricing page and in the terms: drafted in 5b. The lawyer's review is open, see 5b.
- [ ] Apply migrations 0008–0011 to the Neon dev database (on request; 0010–0011 are Stage 5a's).

**Stage 5: Content, safety and quality**

5a, safety (done):

- [x] Admin pause for signups and document submissions (P29), owner only, audited, shown to members in advance.
- [x] Deletion of a profile or an account with the 6-month retention list and the retention sweep (P25); the
  candidate decides; banned addresses kept only as keyed hashes.
- [x] Data export (ZIP with `data.json` and the original photos), read through row-level security.
- [x] Rate limits on sign-in, codes, requests, invitations, reports and uploads (Part 2), counted in Postgres.
- [x] Security headers on the API, the website and the member app; the member app's policy allows Turnstile.
- [x] Fixed: `_redirects` would have answered every member-app script with the page on Cloudflare Pages.

5b, website text and SEO (done):

- [x] Rewrite pricing, help/FAQ, terms and privacy (W01–W12, W16, X01, X02, X04), listing every page changed. The
  privacy policy lists exactly what is kept and for how long (5a's list). The terms and privacy policy are drafts.
- [x] Remove the sample testimonials and the unproven research claims (W13, X03).
- [x] Support channels and a "staff never ask for passwords or codes" statement (W15, X06): hello@favoritehearts.com
  and +94 76 676 9894 for WhatsApp and calls (owner, 30 Oct 2026), on the website and under every member screen.
- [x] SEO basics: unique titles and descriptions, canonical links, social preview tags, sitemap check
  (`npm run check:site`, run by `npm run build:site`).
- [x] Set the real `siteUrl` (X05): https://favoritehearts.com (owner, 31 Oct 2026); not indexable until launch.
- [x] Astro upgrade (deferred from Stage 1): 7.4.0.
- [ ] **Owner action:** the lawyer reviews the terms and the privacy policy, and the owner fills the placeholders
  (operator, governing law, liability, SMS provider and API host): `docs/LEGAL-REVIEW.md` (W08–W11).
- [ ] **Owner action:** the Facebook, Instagram and TikTok addresses, if the owner wants them shown.

5c, English and Sinhala in the app, emails and the spreadsheet (done):

- [x] English and Sinhala with Tamil hidden (P27) in the member app, the API's messages, emails and text messages:
  every text in catalogues, a language switch, the account's saved language, Sinhala drafts of everything members see.
- [x] A spreadsheet of all text (key, where, English, Sinhala, the reviewer's Sinhala, status, notes) for the owner's
  reviewer, read back with `npm run text:import` (OWNER-DECISIONS section 10: "the reviewer never touches code").
- [ ] **Owner action:** the native-speaker reviewer goes through the spreadsheet (1,272 texts); the lawyer reviews the
  rows marked "Legal wording".

5d, the website in Sinhala (done):

- [x] Sinhala pages at `/si/…` with Tamil hidden, the language dialog's "Website content is currently in English"
  removed (W14), the website's text in the spreadsheet, and the Sinhala terms and privacy policy for the lawyer.
- [ ] **Owner action:** the reviewer goes through the spreadsheet's Website tab (712 texts); the lawyer compares the
  Sinhala terms and privacy policy with the English (`docs/LEGAL-REVIEW.md`).

5e, accessibility (done):

- [x] Accessibility fixes on the website and the member app (spec 10.4: keyboard-only use, visible focus, contrast,
  labels and errors, reduced motion, modals that scroll, safe mobile heights, 200% zoom).
- [ ] Stage 6: the same checks on real phones (iOS Safari with VoiceOver, Android Chrome with TalkBack) against
  staging (spec U01, U02).

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

Policies went from 68 to 62 because the six direct-insert policies were removed.

### Applied to the Neon dev database

`npm run db:migrate` (owner's go-ahead, 29 Oct 2026): `[✓] migrations applied successfully!`

Read-only check afterwards. The `fh_app` part ran in a transaction that was rolled back:

```text
migrations: { recorded: 8 }
schema: { app_functions: 67, policies: 62, insert_policies_on_closed_tables: 0, moderation_column: true,
  disclosure_trigger: true,
  action_functions: 'accept_interest, block_profile, end_connection, file_report, mark_engaged, member_cards,
    review_report, send_interest',
  internal_helpers_callable_by_fh_app: 0 }
as fh_app (anonymous, rolled back): { role: 'fh_app', verified: false, profiles_visible: 0 }
direct interest insert: denied: new row violates row-level security policy for table "interest"
send_interest without a member: refused: interest_not_allowed
```

The running dev API serves the new routes against Neon. Without a session they answer `401 UNAUTHENTICATED`:
`/api/v1/discover`, `/api/v1/discover/:id`, `/api/v1/profiles/:id/interests`, `/api/v1/reports`,
`/api/v1/interests/:id/accept` and `/api/v1/staff/reports`. An unknown route answers `404 NOT_FOUND`, and
`GET /health` returned `{"ok":true,"database":true,"email":true,"sms":false,"storage":true}`. Signed-in flows were
not run against Neon: sign-in codes reach only the Resend account owner's inbox. They are covered by the PGlite tests
above.

### `npm run typecheck` and `npm run build`

Both passed (exit 0): `astro check` gave 0 errors, the API bundle `dist/index.js` is 135.3kb, the member app built,
and the website built 22 pages.

### Not done in 3a

- The screens (3b).
- Boosts and featured profiles (N01–N02): not built until the owner decides. The shortlist (N03) is built: 20 without a plan, none with one.
- The 2-re-sends-per-pair cap: recommended only, not built (O04).
- Lock contention under real load: Stage 6.

## Stage 3b evidence (29 Oct 2026): screens for requests, connections and privacy

Scope: the Stage 3 screens on top of the 3a server, for members and staff.

### What was built

- **Member app.**
  - `/browse`: filters applied by the server and kept in the address, an "acting for" picker for accounts that run
    several profiles, and "Show more".
  - `/members/:id`:
    - photos, blurred unless allowed, and where the acting profile stands with this member;
    - sending a request after a dialog lists exactly what would be shared;
    - withdrawing, accepting and declining a request, and ending a connection;
    - blocking, and reporting a profile or one photo.
  - New profile tabs:
    - Photos: upload, cover, delete, and "show my cover photo to members".
    - Requests: received ones as previews without a plan, or with a plan who sent them plus Accept and Decline; sent
      ones with their status, Withdraw, and the 7-day date.
    - Connections: shared contacts, End connection, and the blocked list with Unblock.
  - Overview adds the plan card (requests left today and this month) and "Found a match?" ("engaged or married",
    with the forfeit warning and the plan's end date).
  - Caste is an explicit choice, "Prefer not to say" (the default) or "Share it on the profile" (P22). Income shows
    as "self-declared" on the member view (P23).
  - Header links "Profiles" and "Browse".
- **Staff.** A "Reports" area beside identity documents. The queue lists hidden content first and shows each
  reporter's earlier dismissed reports. "Show the reported content (logged)" opens the content, and staff Uphold or
  Dismiss with an optional note.
- **API.**
  - `GET /api/v1/staff/reports/:id/content`: the reported profile as members see it, every photo included, audited.
  - `coverPublic` on the owner's own profile view.
  - ISO 8601 for every timestamp read through raw SQL.
- **Sandbox.** Four synthetic test members, `POST /sandbox/plans` for test plans, and ports that can be moved.

### Browser walkthrough

The owner's own sandbox was running, so the walkthrough used a second one on ports 8798 and 5184 with the seeded
test members.

1. **Browse.** Amal (Starter) saw Bina, Chathu and Dinesh but not himself. Bina's cover was the blurred copy, labelled.
   Filtering women aged up to 32 left only Bina, and the address kept the filters.
2. **Request.** Amal opened Bina's profile and sent a request. The dialog listed "Your phone" and "Your photos,
   unblurred". The panel then showed "waiting for Bina to answer" with Withdraw. The plan card counted it: today 1 of
   5, this month 1 of 30.
3. **Accept.** Bina (Premium) saw Amal, 33, under Received, with his cover still the blurred copy (`blurred: true`).
   She accepted ("You are now connected"). Her Connections tab showed Amal's shared phone and his unblurred photo.
4. **Sender blur.** Bina's dialog listed her phone, photos and parents' names, and she sent Chathu (no plan) a
   request. Chathu saw "Someone, 30, Teacher, sent a request on 29/10/2026" and "A plan shows who sent them". The raw
   response held neither Bina's name nor her profile id. After a test plan was granted, Chathu saw Bina with Accept and
   Decline, and declined. Bina's Sent list then showed "Declined, new request possible from 05/11/2026".
5. **Report and review.** Chathu reported Dinesh as a scam, and Dinesh left her browse list at once. The staff owner
   set up two-step login and opened Reports. The queue showed Dinesh as "Hidden now" with Chathu's note; staff viewed
   the content (logged) and dismissed the report: "The content is visible again".
6. **Photos and caste.** Chathu uploaded a photo, which became the cover, and turned on "show my cover photo"; Bina then
   saw it unblurred. Chathu chose "Prefer not to say" for caste and saved; the server cleared it.
7. **Block.** Chathu blocked Dinesh after the confirmation, and he left her browse list. She unblocked him from
   Connections.
8. **Engaged or married.** Bina marked herself engaged or married. The confirmation said the plan's remaining time
   until 27/11/2026 is lost and not refunded. Afterwards the status read "Engaged or married", the plan card showed no
   active plan, and "Publish again" was offered.
9. **Phone width (375 px).** Browse and a member page had no sideways scroll after the header fix below. On desktop
   the header stays one row.

### Problems the walkthrough found, all fixed

1. The label "Own profile" on another member's page could be read as the viewer's own. It is now "Manages their own
   profile".
2. "The other photos stay blurred" appeared when there was only one photo. It is now "Photos stay blurred until you
   both accept".
3. The send dialog said "Candidate phone" on a self-managed profile. It is now "Your phone", and "The manager's
   phone" and so on for managed profiles.
4. The blur label was crammed into list thumbnails. Thumbnails now skip it.
5. The unblock message promised a 7-day wait that does not always apply. It is now "Unblocked. You can see each
   other again."
6. Timestamps read through raw SQL arrived in the driver's own text format, e.g. `2026-10-29 16:33:16.146+05`, which
   some browsers do not parse. They are now ISO 8601. The tests assert it and fail without the fix:

   ```text
   ℹ pass 15
   ℹ fail 1
     AssertionError [ERR_ASSERTION]: dates are ISO 8601 whatever the database driver
   ```
7. At 375 px the new header links made the page 400 px wide. The links now wrap onto their own row on phones. Measured
   afterwards: `scrollWidth` 375, no element past the edge, on browse and on a member page.

### `npm test`: 73 tests, all passing

The Stage 3 flow tests now also check two things:
- staff see the reported photo (hidden) as the original, with the view audited, and members are refused;
- dates are ISO 8601.

```text
ℹ tests 73
ℹ suites 22
ℹ pass 73
ℹ fail 0
```

### `npm run typecheck` and `npm run build`

Both passed (exit 0): `astro check` gave 0 errors, the API bundle `dist/index.js` is 136.4kb, and the website built
22 pages. The new screens load on demand:

```text
dist/assets/MemberCard-….js      3.13 kB │ gzip:   1.25 kB
dist/assets/BrowsePage-….js      3.84 kB │ gzip:   1.70 kB
dist/assets/MemberPage-….js     12.09 kB │ gzip:   4.41 kB
dist/assets/StaffApp-….js       25.60 kB │ gzip:   8.48 kB
dist/assets/ProfilePage-….js    40.26 kB │ gzip:  11.52 kB
dist/assets/index-….js         536.70 kB │ gzip: 168.96 kB
```

The main chunk is still over Vite's 500 kB warning; splitting it is in Stage 6.

### Not done in 3b

- Not clicked through in the browser, but covered on the server by the API tests:
  - staff "Uphold", and reporting a photo;
  - ending a connection and withdrawing a request from the screens;
  - the "verify first" notice on Browse;
  - the "acting for" picker, which needs an account running two profiles.
- The walkthrough's API process predates the ISO-date fix, so its dates were the old format. The tests cover the fix.
- No database changes in 3b, so there is nothing to apply to Neon.
- The owner's own sandbox, started before Stage 3, runs the old API. Restart it to try these screens.

## Stage 4a evidence (29 Oct 2026): server for plans, payments and email

Scope (Part 3 "Stage 4", server half; the owner chose to split the stage again):
- the three plans and their LKR/USD prices as configurable, versioned values, now managed by the owner;
- manual payment: a unique payment reference, receipt upload, owner-only approval, and activation that cannot happen
  twice;
- the replace, renew and upgrade rules, expiry warnings, takeover carry-over, refund exceptions and an audit trail;
- payment details only from the owner, email through Resend, a Turnstile check on the server, and the residence
  (pricing-band) mismatch flag for the reviewer.

The screens come in 4b.

### Owner decisions taken at the start

- The owner fully controls plans and payments (add, edit, delete plans, and every payment decision).
- Plan changes follow an owner-set level; Premium 3 → 6 months is an upgrade.
- Up to 3 days of renewal grace while a receipt sent in time waits; a rejection ends it.
- Receipts are photos or screenshots only.

The decisions table lists these and the engineering choices marked "Proposed — confirm".

### What was built

- **Migrations.**
  - `0008_plans_and_payments.sql` (generated, plus a hand-added step that names and ranks the three seeded plans
    before the new columns become required):
    - plan name, description, level and position;
    - each payment keeps its quote (plan name, level, length and limits), the change it makes, the lost days the
      member confirmed, the refund terms version, the first receipt time and the owner's own note;
    - `payment_proof` keeps every receipt; `payment_channel_setting` holds the owner's payment details per method;
    - one open payment per profile, a `cancelled` status, and a claim time on the email outbox.
  - `0009_payment_rules.sql` (hand-written):
    - plan access with the 3-day renewal grace; `plan_change` (what buying a plan would do now) and Sri Lanka
      calendar months;
    - one function per action, each checking its actor: `start_payment`, `attach_payment_proof` and
      `cancel_payment` for members; `approve_payment`, `hold_payment`, `reject_payment`, `refund_payment`,
      `delete_payment`, `set_payment_note`, `correct_settlement`, `grant_plan`, `revoke_plan`, `set_price` and
      `delete_plan` for the owner only;
    - `owner_payments`, the owner's queue with the residence flags;
    - takeover now cancels the former manager's payments that never got a receipt.

    Direct writes to payments and plan history are closed, even for the owner. The new tables have row-level
    security, the backup reviewer cannot read payment entries in the audit trail, and the internal helpers cannot be
    called by the API role.
- **API routes.**
  - Public: `GET /api/v1/plans`.
  - Members: `GET /api/v1/profiles/:id/billing`, `POST /api/v1/profiles/:id/payments`, `GET /api/v1/payments/:id`,
    `POST /api/v1/payments/:id/proof` and `POST /api/v1/payments/:id/cancel`. `GET /api/v1/profiles/:id/plan` now
    reports the grace.
  - Owner only, under `/api/v1/owner`: plans (list, add, edit, delete, prices), payment details, the payment queue
    (search by reference or statement line), each payment with its receipts, the decisions above, and a profile's
    plan history with manual grant and revoke.
- **Jobs.** `plans.expiry_warnings` runs daily at 09:00 Sri Lanka time. `notifications.send` runs every 2 minutes:
  it sends queued emails through Resend with the event key as the idempotency key, retries up to 5 times, and skips
  phone-only accounts.
- **Turnstile.** A server-side check (`src/middleware/turnstile.ts`) on every endpoint that sends a code or checks a
  password. It is on once `TURNSTILE_SECRET_KEY` is set, and production refuses to start without it.
- **Shared contract.** `packages/shared/src/billing.ts` holds the input schemas and rule constants; `api-types.ts`
  holds the plan, payment and owner views.
- **Docs.** `docs/ARCHITECTURE.md`, "Plans and payments (Stage 4)"; `.env.example` (Turnstile).

### `npm test`: 106 tests, all passing

The 33 new HTTP flow tests (`test/payments.test.ts`) run as separate signed-in members, the owner and the backup
reviewer, each with two-step login:

```text
▶ the plan catalogue (section 2)
  ✔ anyone can read the three plans with their LKR and USD prices
▶ payments are the owner’s alone (sections 9, 10)
  ✔ the backup reviewer, members and visitors are refused on every owner route
▶ payment details come only from the owner (section 9: never invented)
  ✔ nothing is pre-filled, so members cannot pay until the owner enters real details
  ✔ the owner enters the details and switches a channel on; every change is audited
▶ the owner manages plans (owner decision, 29 Oct 2026: full control)
  ✔ adds, renames, re-prices, retires and deletes a plan nobody bought
  ✔ a new price never changes a payment already started (spec M01); a used plan is retired, not deleted
▶ starting a payment (sections 2, 3, 9)
  ✔ the price follows the declared residence, and the channel must carry that currency
  ✔ only someone running a published profile can pay for it, and only they see the payment
▶ receipts (owner decision, 29 Oct 2026: photos and screenshots only)
  ✔ a PDF, a fake image or an oversize file is refused; images are re-encoded and kept privately
  ✔ screenshots are accepted too, and every receipt is kept, up to five
▶ the owner’s queue (sections 2, 9)
  ✔ waiting payments come first, with signs that the declared residence may not match
  ✔ each receipt opens through a short-lived link, and every look is audited
▶ approval (section 9): matched in the statement, used once, never twice
  ✔ the owner records the statement line; the plan starts now for whole months on the Sri Lanka clock
  ✔ simultaneous or repeated approvals give one plan term (spec M05)
  ✔ one statement line pays for one payment only
▶ plan levels (owner decision, 29 Oct 2026)
  ✔ an upgrade replaces the plan on approval, after the member confirms the days lost (M07)
  ✔ Premium 3 months to 6 months is an upgrade; a lower level is blocked while a plan is active (M08)
  ✔ the same plan renews only in its last 7 days, and the new term counts from approval (M08)
  ✔ a plan approved after the old one ended starts from the approval
  ✔ terms are whole months on the Sri Lanka clock: short months and leap years clamp (M09)
▶ renewal grace (owner decision, 29 Oct 2026: up to 3 days)
  ✔ access continues while a receipt sent before the end waits; a rejection ends it at once
  ✔ no grace for a receipt sent after the end, or more than 3 days after it
▶ hold, correction and rejection (spec 9.3, M06)
  ✔ the owner can ask for a clearer receipt; the next one puts the payment back in review
  ✔ a rejection is final and tells the member why; they can start again
▶ refunds (section 9: duplicate, mistaken or our failure only)
  ✔ refunding an approved payment can end its plan, with the reason on record
  ✔ a duplicate payment that was never approved is refunded against its statement line; the plan stays
▶ manual grant and revoke (compensation, disputes, suspension)
  ✔ the owner can grant a plan without a payment and end one, always with a reason
▶ owner record keeping
  ✔ notes and statement-line corrections are audited; a payment with a receipt cannot be deleted
▶ takeover keeps the paid plan (section 5)
  ✔ the candidate keeps the paid time; the manager loses access and their unsent payment stops
▶ expiry warnings and email (section 3, spec 12.3)
  ✔ warnings are queued once per stage, for everyone running the profile
  ✔ queued emails are sent once, with the event key for idempotency; accounts without email are skipped
  ✔ a failed send is retried, and given up after five attempts
▶ Turnstile bot check on the server (D7)
  ✔ once a secret is set, code and password endpoints need a valid token
ℹ tests 33
ℹ suites 17
ℹ pass 33
ℹ fail 0
```

Whole suite: `ℹ tests 106`, `ℹ pass 106`, `ℹ fail 0` (38 access rules, 19 accounts, 16 requests, 33 payments).

Five access-rule tests now go through the new functions instead of writing rows directly. They also check that
direct writes are refused and that every payment function refuses the backup reviewer, a member who claims to be the
owner, and an owner without two-step login:

```text
  ✔ the backup reviewer cannot approve a payment or grant a plan
  ✔ the owner approves a payment exactly once
  ✔ claiming a staff role is not enough
  ✔ members see only their own payments, and a payment always takes the current price
  ✔ the payer can attach proof but not approve
```

A few tests place a plan's end in the past or near future by writing the plan event directly, because the clock
cannot be moved. One grace test also backdates a receipt time for the same reason.

**Mutation checks.** Each rule was broken on purpose, the tests were rerun, and the file was restored. Every break was
caught:

| Rule broken | Result (first failing test) |
| --- | --- |
| repeat approval adds a second term | 1 failing (simultaneous or repeated approvals give one plan term (spec M05)) |
| statement lines compared with case | 4 failing (simultaneous or repeated approvals give one plan term (spec M05)) |
| any staff member may approve | 1 failing (the backup reviewer cannot approve a payment or grant a plan) |
| downgrade allowed while active | 1 failing (Premium 3 months to 6 months is an upgrade; a lower level is blocked while a plan is active (M08)) |
| renewal window 8 days | 1 failing (the same plan renews only in its last 7 days, and the new term counts from approval (M08)) |
| grace 5 days | 1 failing (no grace for a receipt sent after the end, or more than 3 days after it) |
| grace without paying on time | 1 failing (no grace for a receipt sent after the end, or more than 3 days after it) |
| rejection keeps the grace | 1 failing (access continues while a receipt sent before the end waits; a rejection ends it at once) |
| lost days not confirmed | 3 failing (an upgrade replaces the plan on approval, after the member confirms the days lost (M07)) |
| takeover leaves the manager payment open | 1 failing (the candidate keeps the paid time; the manager loses access and their unsent payment stops) |
| refund keeps the plan when asked to end it | 2 failing (refunding an approved payment can end its plan, with the reason on record) |
| no residence phone flag | 1 failing (waiting payments come first, with signs that the declared residence may not match) |
| receipt stored without re-encoding | 1 failing (a PDF, a fake image or an oversize file is refused; images are re-encoded and kept privately) |
| Turnstile lets a missing token through | 1 failing (once a secret is set, code and password endpoints need a valid token) |
| expiry warnings repeat | 1 failing (warnings are queued once per stage, for everyone running the profile) |
| sender retries forever | 1 failing (a failed send is retried, and given up after five attempts) |

**Concurrency.** Two approvals of the same payment are sent at once: one approves, the other answers
`already_approved`, and there is one plan term. The database also refuses a second grant for a payment from its owner
role. As in Stage 3, PGlite runs one connection, so this proves the logic and the idempotency; lock contention under
load is for Stage 6.

### Turnstile against Cloudflare (published test keys)

`createTurnstile(secret).verify(token)` called Cloudflare's real siteverify endpoint. Cloudflare publishes these
secrets for testing; no real keys exist yet:

```text
test secret that always passes       -> verify() = true
{"time":"2026-10-29T17:04:43.571Z","level":"warn","event":"turnstile.rejected","codes":"invalid-input-response"}
test secret that always fails        -> verify() = false
{"time":"2026-10-29T17:04:43.628Z","level":"warn","event":"turnstile.rejected","codes":"timeout-or-duplicate"}
test secret: token already spent     -> verify() = false
```

### Neon dry run (dev database, rolled back)

`0008` and `0009` were applied inside one transaction on the Neon dev database, checked, then rolled back. This also
shows that the new `cancelled` status works within the same migration run on real Postgres:

```text
server: 18.6 (4e5fd08)
recorded migrations before: 8
rows that 0008/0009 touch: {"plans":3,"payments":0,"plan_events":0,"outbox":0}
applied 0008_plans_and_payments.sql: 29 statements
applied 0009_payment_rules.sql: 42 statements
plans: [{"id":"starter_1m","name":"Starter","level":1,"sort_order":1,"active":true},{"id":"premium_3m","name":"Premium 3 months","level":2,"sort_order":2,"active":true},{"id":"premium_6m","name":"Premium 6 months","level":3,"sort_order":3,"active":true}]
payment details: [{"channel":"lkr_bank_transfer","enabled":false,"instructions":null},{"channel":"usd_swift","enabled":false,"instructions":null},{"channel":"wise","enabled":false,"instructions":null},{"channel":"paypal","enabled":false,"instructions":null}]
payment_status values: awaiting_proof,pending_review,approved,rejected,held,refunded,cancelled
checks: {"app_functions":88,"policies":60,"direct_write_policies":0,"proof_rls":true,"settings_rls":true,"fh_app_calls_approve":true,"fh_app_calls_notify":false,"fh_app_calls_active_entitlement":false,"fh_app_calls_lock_profiles":false,"public_calls_start_payment":false}
Sri Lanka months: {"jan31":"2027-02-28 10:15","leap":"2028-02-29 10:15","mar1":"2027-04-01 02:00"}
statement line normalised: BOC 2026-10-29 FT1001
reference sample: FH······
owner_payments as a fake owner: refused, payment_owner_only
rolled back; recorded migrations now: 8 | payment_channel_setting exists: false
```

Policies went from 62 to 60: five direct-write policies were removed and three were added for the new tables.

### `npm run typecheck` and `npm run build`

Both passed (exit 0): `astro check` gave 0 errors and 0 warnings; the API bundle `dist/index.js` is 182.9kb; the member
app built (main chunk 539.91 kB, over Vite's 500 kB warning, noted for Stage 6); the website built 22 pages.

The sandbox (`scripts/sandbox.ts`, run on spare ports 8799/5185) started on the new migrations. `GET /api/v1/plans`
returned the three plans with their prices, and `GET /api/v1/owner/payments` without a session answered 401.

### Not done in 4a

- The screens (4b): plan choice, payment page, receipts, expiry warning in the app, the owner's plan, payment-detail
  and payment screens, and the Turnstile widget.
- **BLOCKED (owner):** real payment details; Turnstile keys; email to members until the domain is verified in Resend.
  No email was sent to a real address in 4a; delivery is tested with a fake messenger.
- Payment disputes have no automatic rule: the owner revokes the plan with a reason (§9 asks the terms to say what
  happens). The refund wording itself is Stage 5 with the lawyer.
- Migrations 0008–0009 are not applied to Neon dev yet (on request).

## Stage 4b evidence (30 Oct 2026): screens for plans, payments and the bot check

Scope (Part 3 "Stage 4", screens half): the member's plan and payment screens, the owner's payment, plan and
payment-detail screens, and the Turnstile widget. The server is from 4a.

### What was built

- **Member** (`apps/member/src/features/billing/`):
  - a **Plan** tab on each profile, showing:
    - the plan in force, with the expiry warning (date, what will be hidden, renewal open) and the requests left;
    - every plan on sale with its LKR and USD price and what buying it would do now: start, upgrade or renew (with
      the days lost), or wait (with the date renewal opens);
  - the **payment step**, which asks:
    - where the payer lives, setting the currency and price;
    - which of the owner's switched-on methods to use;
    - for ticks on the draft refund terms and on any lost days;
  - the **payment card**: amount, the owner's details, the reference with a copy button, receipt upload (photos or
    screenshots, checked in the browser and on the server), the owner's message when held, and cancel before a
    receipt;
  - past payments;
  - the overview's plan card now carries the expiry warning and a button to the Plan tab.
- **Owner** (`apps/member/src/features/staff/`), three tabs only the owner sees:
  - **Payments**, in `PaymentsQueue.tsx`:
    - lists the payments needing a decision first, filters by status, and finds a payment by reference or statement
      line;
    - each payment shows its residence flags explained, its receipts (each look logged), and approve (statement line
      plus "found in the real statement" tick), hold, reject, refund, notes, statement-line correction and delete
      (without a receipt only);
    - the profile's plan history, with grant and revoke.
  - **Plans**, in `PlansAdmin.tsx`: add a plan (code suggested from the name), edit, re-price, retire or put back on
    sale, delete if never used, and the price history.
  - **Payment details**, in `PaymentDetailsAdmin.tsx`: the four methods, each with its details and an on/off tick.
- **Bot check:** `src/components/turnstile.tsx` loads Cloudflare's widget when `VITE_TURNSTILE_SITE_KEY` is set and
  sends its token with the email-code, SMS-code, invitation-code and staff password requests.
- **Server:** the owner's list also takes `status=waiting` (in review or held). The sandbox can turn Turnstile on with
  `TURNSTILE_SECRET_KEY`.

### Browser walkthrough

My own sandbox ran on spare ports (API 8798, member app 5184), with Cloudflare's published test keys, so the widget
and its server check were real. The owner's sandbox on 8788/5174 was not touched. All accounts were the sandbox's
synthetic ones.

| Checked | Result |
| --- | --- |
| Staff sign-in with the widget | The widget produced Cloudflare's test token; sign-in passed the server check. Two-step login set up. |
| Payment details | All four methods empty and off. "Switch on" without details refused; test details saved and "shown to members", with the change time. |
| Plans | Added "Festival offer" (code suggested, LKR 5,000 / USD 35). Re-priced LKR to 4,500: the old version is kept and closed. Retired: no longer in the public catalogue. Deleted (never bought). |
| Member sign-in with the widget | The test widget showed; the code request passed the server check. |
| Plan tab, no plan | Three plans with prices, limits and "Starts on the day we approve your payment". |
| Payment step | Residence Sri Lanka: LKR 3,000, bank transfer only. Changed to the UK: USD 20, Wise offered, SWIFT and PayPal "not set up yet". "Get payment details" off until the terms are ticked. |
| Payment card | Owner's details, reference `FHQYS4M7` with copy, receipt upload (a PNG screenshot). Status "Receipt received, being checked"; other plans wait. |
| Owner queue | The payment listed as "To review · waiting under an hour". Detail: payer, declared residence, no flags, the receipt (re-encoded to JPEG by the server). |
| Approval | Approve off until the statement line and the tick. Approved; the plan runs "until 30 Nov 2026, 01:18 (Sri Lanka time)", one calendar month. |
| Plan history and grant | History "Plan started … payment approved". Granted Starter for 5 days with a reason: "Plan replaced … until 4 Nov 2026". |
| Member, plan ending soon | Overview: "Your plan ends on 4 Nov 2026, 01:20 (Sri Lanka time)" with what will be hidden. Plan tab: Starter offered as a renewal and both Premium plans as upgrades, each saying the 5 unused days are lost. The renewal's button stays off until the lost-days box is ticked. |
| Phones (375 px) | Plan tab and the owner's payment screen: no sideways scrolling (page width 375). |

### Problems the walkthrough found, all fixed

- The payment card said "bank transfer in sri lanka": the method name was lower-cased. It now uses wording written
  for the sentence.
- The Plan tab did not show the plan already in force. It now starts with it (the same summary as the overview).
- After approving, the payment left the "needs a decision" list and its page closed. It now stays open beside the
  list.
- The plan history showed `payment_approved`. System reasons are now in words; the owner's reasons stay as written.
- On phones, wrapped tab bars spilled their second and third rows over the page. This came from the shared tab
  component, not from this stage: it had a fixed height, so it broke whenever a tab bar wrapped. It now has a minimum
  height instead, which fixes the profile and staff tab bars.

### `npm test`, `npm run typecheck` and `npm run build`

- `npm test`: `ℹ tests 106`, `ℹ pass 106`, `ℹ fail 0`. One assertion was added: the owner's `status=waiting` list
  holds held payments and only waiting ones.
- `npm run typecheck`: exit 0; `astro check` gave 0 errors.
- `npm run build`: exit 0. The API bundle is 183.1kb. The member app's Profile chunk is 52.69 kB and Staff 55.64 kB.
  The main chunk is 542.88 kB, over Vite's 500 kB warning (noted for Stage 6). The website built 22 pages.

### Not done in 4b

- Not tried in the browser (covered by the HTTP tests in 4a):
  - hold, reject, refund, delete and statement-line correction;
  - a payment with residence flags;
  - cancelling a payment;
  - the takeover payment rules.
- Emails are not sent in the sandbox: it runs no scheduled jobs. Delivery to members stays **BLOCKED** until the
  domain is verified in Resend.
- **BLOCKED (owner):**
  - real payment details (to enter in the Payment details tab);
  - Turnstile keys (site key in the member app, secret in the API);
  - the refund wording's legal review (Stage 5).
- When security headers come in Stage 5, they must allow `challenges.cloudflare.com` for scripts and frames.
- No database changes in 4b; migrations 0008–0009 are still waiting to be applied to Neon dev (on request).

## Stage 5a evidence (30 Oct 2026): safety

Scope (Part 3 "Stage 5", split in three at the owner's choice): rate limits, security headers, the admin control to
pause sign-ups, deletion with the 6-month retention list, and data export. 5b (website text and SEO) and 5c (Sinhala
and accessibility) follow.

### Owner decisions taken at the start

- Stage 5 in three parts: 5a safety, 5b website text and SEO, 5c Sinhala and accessibility.
- Sinhala: I write the first draft, the owner's native-speaker reviewer corrects it in the spreadsheet (5c).
- Deleting: the candidate decides (decisions table, 30 Oct 2026).
- Support contacts stay hello@favoritehearts.com and +94 76 676 9894 for WhatsApp and calls (5b).

### What was built

- **Database** (`drizzle/0010_safety_tables.sql`, generated; `drizzle/0011_safety_rules.sql`, hand-written):
  - tables `retained_identity` (keyed hashes of deleted accounts' sign-in email and phone), `storage_deletion` (files
    to delete) and `rate_limit_counter`, all closed to `fh_app`; `deleted_at` on accounts and profiles, with checks;
  - `app.erase_profile`, `app.delete_profile`, `app.hand_over_profile`, `app.delete_account`, `app.deletion_outcomes`
    and the system-only `app.retention_purge`; takeover, hand-over and a manager's deletion share
    `app.move_to_candidate`, which now also removes the manager's own contact details from the profile;
  - a serious report upheld after an account was deleted bans its kept hashes (`app.review_report`); the owner's
    payment list and the document queue say when a profile or account was deleted and hide placeholder addresses;
  - append-only history (plan events, audit, sharing log) may lose a link to a deleted record outside the app role,
    never change otherwise.
- **API**:
  - rate limits (`src/lib/rate-limit.ts`, `src/auth.ts`): counted in Postgres for Better-Auth and our routes; a
    per-address code limit; `CLIENT_IP_HEADER`, required in production;
  - security headers on every answer (`src/app.ts`): a policy that allows nothing, `no-store`, `noindex`;
  - `GET /api/v1/service-status`; the owner's `GET/PUT /api/v1/owner/operations` (audited);
  - `GET /api/v1/account/deletion`, `POST /api/v1/account/delete`, `GET /api/v1/account/export`,
    `POST /api/v1/profiles/:id/delete` and `/hand-over`; deleting needs a sign-in in the last 15 minutes;
  - banned addresses get no code and no new account; the export ZIP (`src/lib/data-export.ts`, `src/lib/zip.ts`);
  - jobs: `retention.sweep` implemented, `storage.cleanup` added; two new emails (profile handed over, profile
    deleted by the candidate); `Storage.get` for the export.
- **Member app**: the "Your account" card (download, delete with what happens to each profile), "Delete this
  profile" on the overview, "Hand the profile over" for managers, pause notices on sign-in and document upload, the
  owner's Service tab, "Deleted account" labels for staff, and the app's own Content-Security-Policy in its built page.
- **Static host**: `_headers` (the website keeps its policy, `/app/` brings its own; HSTS, COOP, Permissions-Policy,
  `noindex` for the app, immutable app files), `_redirects` (the `/app/assets/*` fix below), and
  `scripts/serve-site.mjs` behind `npm run preview:site`.

### `npm test`: 131 tests, all passing

The 25 new ones (`test/safety.test.ts`):

```text
▶ security headers on every API answer
  ✔ nothing the API sends can run, be framed, be indexed or be cached
✔ security headers on every API answer
▶ rate limits (Part 2: sign-in, codes, requests, invitations, reports, uploads)
  ✔ a burst past one of our limits gets 429 with Retry-After; another address is not affected
  ✔ simultaneous requests cannot slip past a limit together
  ✔ per account: the data export, 5 a day
  ✔ codes: 3 a minute per IP address (Better-Auth), counted in the same Postgres table
  ✔ codes: at most 5 an hour to one address, whatever IP addresses ask; no address is stored
✔ rate limits (Part 2: sign-in, codes, requests, invitations, reports, uploads)
▶ the owner pauses sign-ups and document submissions (section 10)
  ✔ only the owner switches them, each change is audited with its reason, and the app can read them
  ✔ while sign-ups are paused, members already signed up sign in, but no new account is made
  ✔ while document submissions are paused, an upload is refused before anything is stored
✔ the owner pauses sign-ups and document submissions (section 10)
▶ deleting a profile (section 8)
  ✔ it disappears at once for everyone; payments, reports and blocks stay for the retention period
  ✔ deleting needs a confirmation and a sign-in within the last 15 minutes
  ✔ the candidate decides: a manager hands a joined candidate’s profile over, and deletes only one nobody joined
  ✔ a candidate can delete the profile their manager runs, and the manager is told
✔ deleting a profile (section 8)
▶ deleting an account (section 8)
  ✔ everything personal goes at once; payment records, reports and blocks stay, and the person may join again
  ✔ a manager’s account: a profile its candidate joined passes to them with its plan, the others are deleted
  ✔ a candidate’s account: the profile their manager ran is deleted and the manager is told
  ✔ staff accounts are not deleted here
✔ deleting an account (section 8)
▶ banned addresses cannot sign up again (section 8)
  ✔ a serious report upheld before deletion bans the hashed email and phone until the retention period ends
  ✔ a serious report upheld after the account was deleted still bans it
  ✔ a profile handed to its candidate is theirs: a report upheld later does not ban the former manager
✔ banned addresses cannot sign up again (section 8)
▶ the retention sweep (section 8)
  ✔ six months after a deletion everything kept for it goes; younger deletions stay
  ✔ a file deletion that fails stays queued, the member’s request still succeeds, and the retry deletes it
✔ the retention sweep (section 8)
▶ the data export
  ✔ one ZIP with the account, profiles, contacts and original photos, exactly as the app shows them
  ✔ another member’s export holds none of the first member’s private details
  ✔ the ZIP writer round-trips stored and deflated entries with UTF-8 names
✔ the data export
```

Whole run (`npm test`):

```text
ℹ tests 131
ℹ suites 47
ℹ pass 131
ℹ fail 0
ℹ cancelled 0
```

### Mutation check: every deliberate break caught

Each line breaks one rule on purpose, runs the tests, and puts the code back (script in the session scratchpad, as in
4a). The export's own row-level-security read cannot be broken that way in the tests: PGlite has one connection, so
reading outside the request's transaction deadlocks. That break was replaced by one that drops hidden senders.

```text
manager may delete a joined candidate profile  | caught: 1 failing, first "the candidate decides: a manager hands a joined candidate’s profile over, and deletes only one nobody joined"
photo files not queued for deletion            | caught: 3 failing, first "it disappears at once for everyone; payments, reports and blocks stay for the retention period"
contact details survive deletion               | caught: 1 failing, first "it disappears at once for everyone; payments, reports and blocks stay for the retention period"
plan not ended on deletion                     | caught: 1 failing, first "it disappears at once for everyone; payments, reports and blocks stay for the retention period"
manager deletion deletes joined profiles       | caught: 2 failing, first "a manager’s account: a profile its candidate joined passes to them with its plan, the others are deleted"
sign-in email kept on the empty identity       | caught: 1 failing, first "everything personal goes at once; payment records, reports and blocks stay, and the person may join again"
banned never recorded at deletion              | caught: 1 failing, first "a serious report upheld before deletion bans the hashed email and phone until the retention period ends"
handed-over profiles remembered for bans       | caught: 1 failing, first "a profile handed to its candidate is theirs: a report upheld later does not ban the former manager"
report upheld later does not ban               | caught: 1 failing, first "a serious report upheld after the account was deleted still bans it"
sweep keeps payment records                    | caught: 1 failing, first "six months after a deletion everything kept for it goes; younger deletions stay"
sweep runs before 6 months                     | caught: 1 failing, first "six months after a deletion everything kept for it goes; younger deletions stay"
manager contacts stay after hand-over          | caught: 1 failing, first "the candidate decides: a manager hands a joined candidate’s profile over, and deletes only one nobody joined"
takeover leaves the manager payment open       | caught: 1 failing, first "the candidate keeps the paid time; the manager loses access and their unsent payment stops"
deleting without a recent sign-in              | caught: 1 failing, first "deleting needs a confirmation and a sign-in within the last 15 minutes"
rate limit never refuses                       | caught: 5 failing, first "a burst past one of our limits gets 429 with Retry-After; another address is not affected"
codes per address unlimited                    | caught: 1 failing, first "codes: at most 5 an hour to one address, whatever IP addresses ask; no address is stored"
banned address still gets a code               | caught: 2 failing, first "a serious report upheld before deletion bans the hashed email and phone until the retention period ends"
export drops requests whose sender is hidden   | caught: 1 failing, first "one ZIP with the account, profiles, contacts and original photos, exactly as the app shows them"
API answers may be cached                      | caught: 2 failing, first "nothing the API sends can run, be framed, be indexed or be cached"
failed file deletion forgotten                 | caught: 1 failing, first "a file deletion that fails stays queued, the member’s request still succeeds, and the retry deletes it"
signups pause ignored at account creation      | caught: 16 failing, first "while sign-ups are paused, members already signed up sign in, but no new account is made"
```

### Neon dry run (dev database, rolled back)

Migrations 0008–0011 applied in one transaction on Neon dev, a made-up member deleted and swept, then ROLLBACK.
Postgres refuses an enum value in the transaction that adds it (`cancelled`, from 0008), so for this run only the three
"cancel unsent payments" statements were made no-ops; a real deploy commits the migrations first, and the tests cover
those statements.

```text
server: 18.6 (4e5fd08)
recorded migrations before: 8
applied 0008_plans_and_payments.sql: 29 statements
applied 0009_payment_rules.sql: 42 statements
applied 0010_safety_tables.sql: 11 statements
dry run only: 3 "cancel unsent payments" statements in 0011 neutralised (enum value not committed yet)
applied 0011_safety_rules.sql: 20 statements
checks: {"app_functions":96,"new_tables_rls":true,"fh_app_grants_on_new_tables":0,"member_delete_account":true,"member_delete_profile":true,"member_hand_over":true,"member_erase":false,"member_move":false,"member_outcomes_of_anyone":false,"member_purge":false}
delete_account as the member: {"banned":false,"profilesDeleted":1,"profilesHandedOver":0}
after deletion: {"profile_status":"deleted","profile_name":null,"contacts":0,"photos":0,"files_queued":2,"identity_emptied":true,"phone":null,"banned":false,"kept_days":"182"}
retention_purge(6): {"reports":0,"accounts":1,"payments":0,"profiles":1,"receipts":0,"auditEvents":0}
after the sweep: {"identity_rows":0,"hashes":0,"profile_rows":0,"plan_event_link_cleared":true,"plan_events_of_b":1}
editing a plan event as the system: refused, entitlement_event rows are append-only
rate-limit counter hits: 1,2,3,4
rolled back; recorded migrations now: 8 | retained_identity exists: false | dry-run users left: 0
```

### Security headers on the built site

`npm run build:site` with Cloudflare's test site key, served by `npm run preview:site` (port 8099) with the sandbox API
behind it (port 8799):

```text
=== GET /pricing/
HTTP/1.1 200 OK
x-frame-options: DENY
strict-transport-security: max-age=31536000; includeSubDomains
content-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://images.pexels.com; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'
=== GET /app/profiles/123
HTTP/1.1 200 OK
x-frame-options: DENY
x-robots-tag: noindex, nofollow
body: <!doctype html> <html lang="en">   <head>     <meta http-equiv="Content-Security-Policy" content="de
=== GET /app/assets/index-CM_11ges.js
HTTP/1.1 200 OK
cache-control: public, max-age=31536000, immutable
Content-Type: text/javascript; charset=utf-8
body: const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/ProfilePage-Bqspm3ye.js","assets/la
=== GET /api/v1/service-status
HTTP/1.1 200 OK
cache-control: no-store
content-security-policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'
x-robots-tag: noindex
body: {"signupsPaused":false,"documentSubmissionsPaused":false}
```

In the browser, the app's policy let Turnstile load and issue its test token, and blocked a script and an image from
another host while allowing R2 photo links and `data:` images (the `securitypolicyviolation` events listed only the
two foreign ones).

### Export ZIP against independent tools

```text
Archive:  export.zip
    testing: README.txt               OK
    testing: data.json                OK
    testing: photos/profile-1/photo-1-cover.jpg   OK
No errors detected in compressed data of export.zip.
python testzip: None
[('README.txt', 8, 540), ('data.json', 8, 1759), ('photos/profile-1/photo-1-cover.jpg', 0, 619942)]
data.json name: නිමාලි
```

### Browser walkthrough

On the built site (production files, with their headers and policy), ports 8099/8799, Cloudflare's test keys, the
sandbox's synthetic accounts. The owner's sandbox on 8788/5174 was not touched.

| Checked | Result |
| --- | --- |
| Member app under its own policy | Loads; Turnstile shows "Success!" with Cloudflare's test banner; no policy errors in the console. |
| Owner's Service tab | Both switches "Open". Paused sign-ups with a reason: "Paused", the reason and time shown. Paused document submissions. |
| Sign-in while sign-ups are paused | Notice "New sign-ups are paused for now". A new email got a code but no account: "New sign-ups are paused for now. Please try again later." Chathu (existing) signed in. |
| Download my data | `favorite-hearts-data-2026-10-30.zip`, 1,578 bytes, `application/zip`, ZIP signature `504b0304`; toast "Your data is downloading as a ZIP file." (caught before saving to disk). |
| Delete my account | The dialog listed "Chathu is deleted now", what goes now and what is kept 6 months; the button stayed off until the tick. Deleted: "Your account has been deleted." and back at sign-in. |
| Sign-ups open again, documents still paused | A new member signed up; the verification page showed "Document submissions are paused for now" with the upload button off. |
| Delete this profile | A draft profile deleted after the dialog: "The profile was deleted.", "No profiles yet". |
| Candidate joins, then hand-over | Invitation, code and the candidate's own sign-in; the candidate's delete dialog says the manager will be told. The manager's overview says only the candidate can delete; "Hand over to the candidate" worked and the manager lost the profile. |
| Phones (375 px) | The account card and the delete dialog fit the screen (the dialog scrolls inside), no sideways scrolling. |

### Problems found while building and walking through, all fixed

- **Would have broken the member app in production:** Cloudflare Pages follows `_redirects` even when a file exists,
  so the Stage 1 rule `/app/* /app/index.html 200` would have answered every app script and style with the page.
  `/app/assets/*` now passes through first.
- **Would have blocked Turnstile, the API and photos in production:** the website's policy on `/*` also applied to
  `/app/`. It is now removed there, and the app brings its own.
- A deleted manager's kept hashes remembered profiles handed to the candidate, so a serious report upheld later about
  the candidate would have banned the former manager. Only profiles deleted with the account are remembered now; a
  new test covers it.
- After "Use a different email", the previous error stayed on the sign-in form. It is cleared now.
- The delete card suggested pausing even for a draft, which cannot be paused. Shown only for published profiles now.
- With no profile name yet, the hand-over said "the candidate is told by email" in lower case. Fixed.

### `npm run typecheck` and `npm run build`

- `npm run typecheck`: exit 0; `astro check` gave 0 errors.
- `npm run build`: exit 0. The API bundle is 214.8kb. The member app's Profile chunk is 56.63 kB and Staff 58.18 kB;
  the main chunk is 549.94 kB, over Vite's 500 kB warning (noted for Stage 6). The website built 22 pages.

### Not done in 5a

- Migrations 0010–0011 (with 0008–0009) are not applied to Neon dev: on request.
- **BLOCKED (owner):** `CLIENT_IP_HEADER` and the other production settings wait for the hosting choice (Fly.io or
  Railway, Cloudflare in front); Turnstile keys, the Resend domain and real payment details as before.
- To confirm (decisions table): the rate-limit numbers, what "banned" means, the 15-minute sign-in rule, the
  hand-over, and whether payment records and receipts may be kept 6 months (accountant) and documents of deleted
  members deleted at once (lawyer).
- The privacy policy must list what is kept and for how long: 5b, with the lawyer's review.

## Stage 5b evidence (31 Oct 2026): website text and SEO

Scope (Part 3 "Stage 5", second part): replace the pricing page, FAQs, terms, privacy and help text with versions that
match `OWNER-DECISIONS.md`, list every page changed, remove fictional testimonials and unverified claims, and the SEO
basics. 5c (Sinhala with Tamil hidden, the spreadsheet for the reviewer, accessibility fixes) follows.

### Owner decisions taken at the start

- Domain: favoritehearts.com. The site stays out of search engines until launch is approved.
- Favorite Labs: advice only; the research claims go.
- The operator in the terms and privacy policy: a marked placeholder for now.
- The official text of the terms and privacy policy: English.

### Every page changed

| Page | What changed | Audit rows |
| --- | --- | --- |
| `/pricing/` | Rewritten. The plan cards come from the live catalogue (`GET /api/v1/plans`) in LKR or USD, with each plan's length and request limits; the page itself holds no price. Free to publish; four payment steps (choose in the app, pay with the reference, upload the receipt, the plan starts when we find the payment, within 48 hours); ten plan rules: free publishing, what a plan includes, which price, family paying, no automatic renewal (the last 7 days, the 3-day grace), upgrades and lost days, what happens when a plan ends, refunds (the three exceptions, disputes, suspension, engaged or deleted), payment questions, and no chat or horoscope matching. The Essential/Signature/Premier tiers, "duration to be confirmed" and the paid human services are gone. | W01–W07, W16 |
| `/help/` | Rewritten as 40 questions in six groups (getting started, profiles and family, introductions, payments, privacy and safety, not-so-frequent questions): free publishing, refunds, renewal, documents only through the app, the 48-hour reviews, sign-up open (no more "registration is not available"), WhatsApp, calls and email with the hours, and "staff never ask for passwords or codes". | W04–W07, W12, W15, W16, X01 |
| `/terms/` | A draft in 16 sections for the lawyer: who may use it, accounts and the three badges, profiles run by family (the manager's declaration, the candidate's rights), requests and sharing, plans and caps, paying, changing and renewing, refunds and disputes, conduct, reports, content, leaving, responsibility, law. The operator is a placeholder. | W08, W09, X02 |
| `/privacy/` | A draft in 11 sections: what is collected (caste only with consent), how it is used, who sees what (shared details cannot be taken back), providers and where data is processed, protection, exactly what is kept and for how long after a deletion (5a's list), rights (download, correct, delete, limit sharing), under 18s, and browser storage (one sign-in cookie; language, country and theme kept in the browser; Turnstile). | W10, W11, W12, X02, X04 |
| `/` | The three fictional testimonials ("Illustrative sample reviews") and their script (`landing.js`) are removed; the Labs teaser reads "Ideas for a shared life." | W13 |
| `/labs/` | "Favorite Hearts user surveys", "Cause and effect research" and "Behavioral analysis" are removed; the page says its articles are ideas to talk about together, not research findings. | X03 |
| `/newsroom/` and 8 articles | The category "Research & Advice" is now "Advice" (in the pages and `newsroom.js`); Labs is described as sharing ideas. | X03 |
| `/contact/` | A "Call us" card; social cards only when an address is set; staff never ask for passwords or codes; documents only through the app. | W12, W15 |
| `/security/` | Sign-in codes instead of passwords, how information is protected, what each badge means, what to do after sharing a code. | W15, X02 |
| `/trust-and-safety/` | What stays private until both accept; staff never ask; documents only in the app; ending, blocking and reporting in the app. | W12, W15 |
| `/mission/` | Its own description. | SEO |
| Every page | Canonical links, the sitemap and social tags on https://favoritehearts.com; a 1200×630 preview photo with its size and description; social buttons only when an address is set; Astro 7.4.0. | X05 |
| Member app, every screen | The "Need help?" footer: WhatsApp and calls, email, "staff never ask", and links to help, terms and privacy. | W15, X06 |

New files: `src/components/LegalPage.astro`, `public/assets/js/pricing.js`, `public/assets/og-image.jpg`,
`scripts/check-site.mjs` and `docs/LEGAL-REVIEW.md` (what the lawyer and the accountant must check, section by section).

### Site check (`npm run build:site`)

```text
Site check of dist/site for https://favoritehearts.com ("indexable": false), 21 pages and the 404 page:
  ✓ titles           21 unique
  ✓ descriptions     21 unique
  ✓ canonical links  21 point to the page's own address on https://favoritehearts.com
  ✓ robots tags      noindex on every page (not indexable yet)
  ✓ social previews  Open Graph and Twitter tags on 21 pages, preview image 1200×630
  ✓ headings         one h1 on each of 21 pages
  ✓ language         lang set on 22 pages
  ✓ structured data  valid JSON-LD on 21 pages
  ✓ links            673 links and assets on this site resolve, 48 anchors found
  ✓ sitemap          21 pages listed once each, the 404 page left out
  ✓ robots.txt       Disallow: / while not indexable; /app/ noindex
Notes, not failures: search results may shorten these (titles over 70, descriptions over 160 characters):
  - /newsroom/a-first-conversation/ description: 162 characters
  - /newsroom/a-thoughtful-beginning/ description: 216 characters
  - /newsroom/across-borders-on-the-same-page/ description: 185 characters
  - /newsroom/an-honest-profile/ title: 74 characters
  - /newsroom/an-honest-profile/ description: 189 characters
  - /newsroom/before-marriage/ title: 72 characters
  - /newsroom/before-marriage/ description: 165 characters
  - /newsroom/belonging-across-borders/ description: 178 characters
  - /newsroom/beyond-the-checklist/ title: 74 characters
  - /newsroom/beyond-the-checklist/ description: 189 characters
  - /newsroom/family-and-your-voice/ title: 76 characters
  - /newsroom/family-and-your-voice/ description: 178 characters
  - /newsroom/matrimony-with-more-heart/ title: 77 characters
  - /newsroom/matrimony-with-more-heart/ description: 197 characters
  - /newsroom/respect-in-every-introduction/ description: 197 characters
No problems found.
```

The notes are the owner's article headlines and opening paragraphs, kept as written.

### The site check catches what it should

Each break was made on a fresh copy of `dist/site` (and of `site.config.json` for "indexable"), then the check ran on
that copy:

```text
CAUGHT 404_index        exit 1  ✗ robots tags      1 problem  | /404.html: "index" lets search engines index the not-found page
CAUGHT app_noindex      exit 1  ✗ robots.txt       1 problem  | _headers: /app/* has no X-Robots-Tag: noindex
CAUGHT broken_anchor    exit 1  ✗ links            1 problem  | /privacy/: #keeping has no element with that id
CAUGHT broken_link      exit 1  ✗ links            1 problem  | /terms/: /privacy-policy/ does not exist
CAUGHT canonical        exit 1  ✗ canonical links  1 problem  | /labs/: points to http://localhost:4321/labs/, not https://favoritehearts.com/labs/
CAUGHT dup_desc         exit 1  ✗ descriptions     1 problem; ✗ social previews  2 problems  | /help/, /security/: share the description "Answers about joining Favorite Hearts, verification, family-managed
CAUGHT dup_title        exit 1  ✗ titles           1 problem; ✗ social previews  2 problems  | /help/, /pricing/: share the title "Help & FAQ — Favorite Hearts"
CAUGHT indexable        exit 1  ✗ robots tags      21 problems; ✗ robots.txt       2 problems  | /contact/: "noindex, nofollow" but site.config.json has "indexable": true
CAUGHT jsonld           exit 1  ✗ structured data  1 problem  | /help/: JSON-LD does not parse (Expected double-quoted property name in JSON at position 33 (line 1 column 34)
CAUGHT lang             exit 1  ✗ language         1 problem  | /newsroom/: the html element has no lang
CAUGHT og_missing       exit 1  ✗ social previews  21 problems  | /contact/: og:image https://favoritehearts.com/assets/og-image.jpg does not exist
CAUGHT og_size          exit 1  ✗ social previews  21 problems  | /contact/: og:image is 1800×1200, the tags say 1200×630
CAUGHT og_title         exit 1  ✗ social previews  1 problem  | /mission/: og:title is "Mission", not "Our Mission — Favorite Hearts"
CAUGHT robots_meta      exit 1  ✗ robots tags      1 problem  | /: "index, follow" but site.config.json has "indexable": false
CAUGHT robots_txt       exit 1  ✗ robots.txt       1 problem  | robots.txt: allows search engines although "indexable" is false
CAUGHT sitemap_extra    exit 1  ✗ sitemap          1 problem  | https://favoritehearts.com/404.html: listed but there is no such page
CAUGHT sitemap_missing  exit 1  ✗ sitemap          1 problem  | https://favoritehearts.com/pricing/: not listed
CAUGHT two_h1           exit 1  ✗ headings         1 problem  | /contact/: 2 h1 headings
18/18 mutations caught
```

### Astro 7.4.0

- Same pages as on Astro 5: comparing the 22 HTML files tag by tag, the only differences are `&` written as `&amp;`
  inside attributes (`&#38;` before) and one whitespace change in `404.html`. Browsers read both the same way.
- `astro check`: 33 files, 0 errors, 0 warnings, 0 hints.
- `npm audit --workspace @fh/website`: "found 0 vulnerabilities". Astro's build-time sharp is now the API's 0.35.5.
- `npm audit` for the whole repository: "5 moderate severity vulnerabilities", from two findings that were already
  there at `stage-5a`, with the same versions:
  - `@hono/node-server` 1.19.17 (GHSA-rmxm-3fg6-px4f): `serveStatic` decodes a path twice. The API does not use
    `serveStatic` (only `serve` and `getConnInfo`). The fix is in 2.1.3, a new major version: a change of its own,
    see "Not done in 5b".
  - `esbuild` ≤ 0.24.2 inside `drizzle-kit` 0.31.11 (GHSA-67mh-4wv8-2f99): esbuild's development server. drizzle-kit
    is a developer tool that never starts it; npm's only fix would downgrade drizzle-kit to 0.18.1.

### Browser walkthrough

On the built site (`dist/site` served with its headers and policies, ports 8099/8799, the sandbox API with its
catalogue of the §2 plans). The owner's sandbox on 8788/5174 was not touched.

| Checked | Result |
| --- | --- |
| Pricing, plans | Three cards from the API, in LKR first: Starter LKR 3,000 (1 month, "5 requests a day, 30 a month") and Premium 3 months LKR 8,500 ("Unlimited requests (fair use applies: up to 30 a day)"), then Premium 6 months. No console errors under the website's policy. |
| Pricing, LKR/USD | The switch showed USD 20, 55 and 100 and "For members living outside Sri Lanka. Prices in USD." |
| Pricing, carousel | A dash moved the cards to "Position 2 of 2"; the third dash stays hidden while only two positions exist. |
| Pricing, API down | "We could not load today’s prices. You will see them in the app when you choose a plan, or you can ask us." No cards. |
| Help | Searching "refund" found 2 answers and announced "2 answers found."; the Payments filter showed its 5 questions; the refund answer matches §9. |
| Contact | WhatsApp, "Call 076 676 9894" (`tel:+94766769894`) and email; no social cards; "Favorite Hearts staff will never ask for your password or a code." |
| Terms and privacy | 16 and 11 sections with matching contents links, "Draft · 31 October 2026", the draft notice and two highlighted placeholders each; the contents link to Refunds lands on it. |
| Home and Labs | No reviews section and no `landing.js`; Labs opens with "Ideas for a shared life." |
| Claims | A scan of every built page for testimonial, research, statistic and guarantee wording found only disclaimers ("cannot guarantee", "not research findings"). |
| Phones (375 px) | No sideways scrolling on pricing, help, terms, privacy, contact, home, Labs, security, trust and safety, mission and the newsroom. |
| Member app | "Need help?" under the sign-in page (desktop and 375 px) with WhatsApp (new tab), call, email, Help, Terms and Privacy; not on the staff sign-in. |
| Framing | Loading a page inside a frame was refused by the site's policy (`frame-ancestors 'none'`). |

### Problems found while building and walking through, all fixed

- The member app showed no support channels at all (X06). It now has the footer.
- The Node requirement had been set to 22.23.4, stricter than any installed package needs. It is now 22.22.0, Astro
  7.4.0's own minimum.
- Six descriptions written in this stage were longer than search results show (161–182 characters). Now 146–157.
- The trust and safety page had two different descriptions (the meta tag and the social tags). Now one.
- `astro check` hinted at an unused variable on the pricing page. Renamed.

### `npm test`, `npm run typecheck` and `npm run build:site`

- `npm test`: 131 tests, all passing (5b changes no server code):

  ```text
  ℹ tests 131
  ℹ suites 47
  ℹ pass 131
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 15019.192709
  ```

- `npm run typecheck`: exit 0 (API, member app and shared with `tsc`; `astro check` 0 errors, 0 warnings, 0 hints).
- `npm run build:site`: exit 0. The website built 22 pages. The member app's main chunk is 551.36 kB (549.94 kB in
  5a; the difference is the footer). The site check passed (above).

### Not done in 5b

- Sinhala with Tamil hidden, the spreadsheet for the reviewer, accessibility fixes, and the language dialog's
  "Website content is currently in English" (W14): 5c.
- **Owner action:** the lawyer's review and the placeholders (`docs/LEGAL-REVIEW.md`); the social addresses, if wanted.
- The newsroom headlines and opening paragraphs stay as the owner wrote them, although search results may shorten 15
  of them (the notes above).
- `@hono/node-server` 2.x, which fixes an advisory this API cannot reach: proposed as its own change, with the API
  tests.
- Migrations 0008–0011 on Neon dev and pushing to GitHub: on request, as before.

## Stage 5c evidence (3 Nov 2026): English and Sinhala in the app, emails and the reviewer's spreadsheet

Scope (Part 3 "Stage 5": "Implement English and Sinhala with Tamil hidden, and export all text to a spreadsheet for my
reviewer"), for the member app, the API's messages, emails and text messages. The website in Sinhala is 5d;
accessibility is 5e.

### Owner decisions taken at the start

- The rest of Stage 5 in three parts: 5c (this), 5d website in Sinhala, 5e accessibility.
- Sinhala website pages at their own addresses (`/si/…`); the choice follows the visitor into the app and is saved on
  the account, so emails and texts use it.
- The reviewer's spreadsheet is an Excel file.
- Staff screens stay in English.

### What was built

- **Catalogues** (`packages/shared/src/i18n`): every text members see, in five areas (app 1,022 texts including 249
  country names; shared 27 month and date texts; API messages 156, of which 126 members can see; form checks 61, of
  which 37; emails and text messages 60). Sinhala drafts for all 1,272 member-facing texts; Tamil hidden with the 5
  words the demo had translated, and the demo's 80 phrases kept in `glossary.json`.
- **Shared** (`packages/shared/src/text.ts`): languages (English and Sinhala offered, Tamil hidden), Accept-Language
  parsing, placeholders and plural forms, limits filled from the rules (`TEXT_CONSTANTS`), Zod problems as keys
  (`issueText`), and dates on the Sri Lanka clock from the catalogue (`formatDate`). Every schema message is a key.
- **API:** errors, field messages, the database rule answers, image checks, the rate-limit answer and Better-Auth's
  hook refusals in the request's language; codes, invitations and queued emails in the right language (see
  ARCHITECTURE "Languages"); a new member account starts in the sign-up's language; `PUT /api/v1/me/language`.
- **Member app:** `lib/i18n.tsx` (provider, `t`, `rich`, the language switch, the account's language, `EnglishOnly`
  for staff), every member screen and shared component on catalogue keys (36 files), value lists through `useLabels()`, dates
  and countries from the catalogue, `<html lang>` and `Accept-Language` on every request.
- **Spreadsheet tools** (`scripts/text/`, `npm run text:export`, `text:import`, `text:status`), with no dependency.

### `npm test`: 152 tests, all passing

144 API tests (131 before, and 13 new in `apps/api/test/text.test.ts`) and 8 spreadsheet tests
(`scripts/text/text.test.mjs`, now part of the root `npm test`):

```text
▶ text catalogues
  ✔ every translation exists in English, keeps its placeholders and tags, and members see nothing untranslated
  ✔ each catalogue keeps to its own keys, and staff texts are only in English
  ✔ every value the app shows from a list has a label, and so does every language the switch offers
  ✔ limits named in the texts come from the rules themselves
  ✔ dates read the Sri Lanka clock and use the catalogue’s month names and order, not the browser’s
  ✔ every country has a name in both languages
  ✔ the best offered language is picked from Accept-Language; Tamil is hidden
  ✔ plural forms and the English fallback
▶ the API in Sinhala
  ✔ errors come in the language the request asks for, English otherwise
  ✔ field messages are translated, with the limit filled in
  ✔ a new account starts in the sign-up language; the member can change it, but not to hidden Tamil
  ✔ sign-in codes are emailed in the language of the screen that asked
  ✔ queued emails use the language the member saved; plan names stay as the owner wrote them
ℹ tests 144
ℹ suites 49
ℹ pass 144
ℹ fail 0

▶ xlsx
  ✔ zip and unzip round trip, with Unicode names and contents
  ✔ what the writer writes, the reader reads back exactly
  ✔ a file openpyxl saved (inline strings, rich text, empty cells) reads correctly
  ✔ Excel’s layout (shared strings, rich text, phonetic hints, numbers, an empty string) reads correctly
▶ export and import
  ✔ the export has one row per text members see, with status and what to keep
  ✔ corrections and approvals come back in; broken rows are refused with a reason
  ✔ a dry run reports without writing, and Excel’s layout imports the same way
  ✔ when the English changes after a review, the text is a draft again and old rows are skipped
ℹ tests 8
ℹ pass 8
ℹ fail 0
```

### Mutation check: every deliberate break caught

```text
CAUGHT api answers ignore Accept-Language
CAUGHT queued emails ignore the saved language
CAUGHT new accounts lose the sign-up language
CAUGHT codes always emailed in English
CAUGHT field messages lose their key
CAUGHT dates on the wrong clock
CAUGHT plural forms ignored
CAUGHT a Sinhala text missing
CAUGHT a Sinhala text drops a placeholder
CAUGHT hidden Tamil can be chosen
CAUGHT import skips the placeholder check
CAUGHT import ignores changed English
CAUGHT staff texts exported
CAUGHT rich text read as its first run only
14/14 caught
```

### The spreadsheet

`npm run text:export` → `dist/text/favorite-hearts-text-si-2026-11-03.xlsx` (102 KB): "1272 texts: 1272 translated, 0
approved, 0 with changed English." Python's `zipfile` and XML parser read every part; macOS Quick Look rendered it,
Sinhala included; `openpyxl` 3.1.5 (installed only in a scratch folder) opened it. Acting as the reviewer, `openpyxl`
then corrected three rows, approved two, marked one "Needs discussion", broke one placeholder and changed one English
cell, and saved; the import (on a copy of the catalogues) reported:

```text
corrected: common.cancel, signIn.sent, api.signIn   approved: common.loading, email.code.intro
discuss: layout.help (“උදව්” හෝ “සහාය”?)          unchanged: 988
problem: App row 5 (common.close): the English has changed since this file was made, so the row was skipped.
problem: App row 253 (dashboard.kicker): the text must keep {name} as in the English; it has none. Not imported.
```

`npm run text:status` now:

```text
Language: si
  app         1022 texts  1022 translated     0 approved
  shared        27 texts    27 translated     0 approved
  api          126 texts   126 translated     0 approved
  validation    37 texts    37 translated     0 approved
  email         60 texts    60 translated     0 approved
  all         1272 texts  1272 translated     0 approved
```

### Browser walkthrough

The built site (ports 8099/8799, the sandbox's synthetic members, Cloudflare's test keys). The owner's sandbox was not
touched.

| Checked | Result |
| --- | --- |
| Sign-in page, switch to සිංහල | `<html lang="si">`, "අර්ථවත් ආරම්භයක්.", the choice saved in `fh-visitor-preferences`; the button then offers "English". |
| Code email | The sandbox printed "Subject: ඔබේ Favorite Hearts පිවිසුම් කේතය" and the Sinhala body. |
| Signed in as Bina | The switch saved Sinhala to the account (`memberAccount.locale: si`); clearing the browser's choice and reloading (a new device) came back in Sinhala from the account. |
| Profile, all 7 tabs | No English left but the owner's plan name "Starter"; dates "2026 දෙසැ 2, 10:55 (ශ්‍රී ලංකා වේලාව)". |
| Browse and another member's profile | No English left except the members' own words; countries in Sinhala ("ශ්‍රී ලංකාව"), sorted by their Sinhala names. |
| Phones (375 px) | No sideways scrolling on the dashboard, profile, browse and verification pages; the header wraps to two rows. |
| Staff sign-in | Stays English (`lang="en"`, no language switch, no help footer) while the browser's choice stays Sinhala; back in the member app it is Sinhala again. |

### Problems found while building and walking through, all fixed

- After signing in, the app switched to the account's English although the visitor had just chosen Sinhala. A choice
  made on the device now wins and is saved to the account.
- The browser used here has no Sinhala calendar or country data and quietly showed "Dec" and English country names.
  Dates and countries now come from the catalogues.
- Two screens still said buying a plan "opens in a later update"; they now point to the Plan tab.
- A badly typed address on the sign-in page would have shown Zod's raw error; it now shows the translated message.
- The toasts' screen-reader label was English ("Notifications"); now translated.

### `npm run typecheck` and `npm run build:site`

- `npm run typecheck`: exit 0 (`astro check` 0 errors, 0 warnings, 0 hints).
- `npm run build:site`: exit 0; the site check found "No problems found." The member app's main chunk is 710.01 kB
  (210.90 kB compressed; 551.36 kB in 5b): both languages' texts, country names included, are in it. Loading Sinhala
  only when chosen is noted for Stage 6.

### Not done in 5c

- **Owner action:** the native-speaker reviewer reviews the 1,272 Sinhala drafts in the spreadsheet; the lawyer reviews
  the rows marked "Legal wording" (also listed in `docs/LEGAL-REVIEW.md`).
- 5d: the website in Sinhala at `/si/…`, its text in the spreadsheet, the Sinhala terms and privacy policy (W14).
- 5e: accessibility. Seen while walking through: the sign-in email field is announced by its placeholder.
- Opening the spreadsheet in Microsoft Excel itself was not tried (it would open Excel on the owner's Mac); files saved
  by `openpyxl` and Excel's own layout are covered by tests.
- Pushing to GitHub and Neon migrations 0008–0011: on request, as before (5c adds no migration).

## Stage 5d evidence (4 Nov 2026): the website in Sinhala

Scope (Part 3 "Stage 5": "Implement English and Sinhala with Tamil hidden, and export all text to a spreadsheet for my
reviewer"), for the public website. Accessibility is 5e.

### Defaults used (proposed, to confirm)

The owner said "Continue" without choosing, so the recommended options were used and recorded as "Proposed — confirm"
in the decisions table: the ten newsroom articles and Favorite Labs are translated now; the Sinhala terms and privacy
policy are drafted now, marked draft, with the English official; a first visit is not redirected, every page links to
its other-language version.

### What was built

- **Addresses.** All 21 pages moved to `apps/website/src/pages/[...lang]/` and are built twice: 21 English pages at
  their old addresses and 21 Sinhala pages under `/si/` (43 HTML files with the 404 page, which shows both
  languages). The ten article pages, which shared one layout, are now one template (`newsroom/[article]/`) with their
  list in `src/lib/articles.ts`.
- **Words.** A `website` catalogue (`web.*`, 712 texts, about 61,000 characters) with a Sinhala draft for every text,
  including the articles, Labs, help (40 questions), pricing, and the terms and privacy policy. `src/lib/i18n.ts`
  turns keys into text or safe HTML (links, bold, line breaks, and marks such as `<email/>` filled by the page).
  The English pages' text is unchanged: before committing, the text of every English page was compared with the
  previous build; the only differences were the language link, the Sinhala alternates, the filter codes and the Join
  link's `?lang=en`.
- **Scripts.** Menus, dialogs, help and newsroom search, Labs, pricing cards and carousels take their words from the
  page (`FH_TEXT`), with Sinhala plural forms. The newsroom's search reads the articles from the page rather than an
  English copy in `newsroom.js`.
- **Choosing a language.** A link to the other version beside the menu button (in the menu on phones); the footer's
  language dialog opens the other version when chosen, and the old note "Website content is currently in English" is
  gone (W14). The choice is saved for the app; Join opens the app with `?lang=`; the app's footer links to the help,
  terms and privacy pages in its own language.
- **Search engines.** Canonical per language, `hreflang` en / si / x-default, `og:locale` si_LK with the other as an
  alternate, JSON-LD `inLanguage`, and a sitemap with both versions and their alternates. The site check has a new
  "languages" area.
- **Spreadsheet.** A Website tab (where each text appears, notes for links, marks, legal wording and search-result
  texts); the import files website rows into the website catalogue and refuses a row that drops a mark.
- **Tests.** A website test file (5 tests: HTML escaping and marks, addresses, Sinhala dates and countries, script
  texts, and every key used exists and every key is used); the catalogue tests now cover the website catalogue; two
  spreadsheet tests cover the Website tab.

### `npm test`: 158 tests, all passing

```text
api:      ℹ tests 144  ℹ suites 49  ℹ pass 144  ℹ fail 0
website:  ℹ tests 5    ℹ suites 1   ℹ pass 5    ℹ fail 0
scripts:  ℹ tests 9    ℹ suites 2   ℹ pass 9    ℹ fail 0

▶ website texts
  ✔ html() escapes the words and puts in only the elements the page gives
  ✔ addresses: English at the root, Sinhala under /si/, and back
  ✔ dates and countries come from the catalogues in the page’s order
  ✔ the Sinhala pages have Sinhala text, and scripts get only their own words
  ✔ every key the pages and scripts use is in the catalogue, and every catalogue key is used
▶ export and import
  ✔ the export has one row per text members see, with status and what to keep
  ✔ corrections and approvals come back in; broken rows are refused with a reason
  ✔ website rows import into the website catalogue, and a correction that drops a mark like <email/> is refused
  ✔ a dry run reports without writing, and Excel’s layout imports the same way
  ✔ when the English changes after a review, the text is a draft again and old rows are skipped
```

### Mutation check: every deliberate break caught

Each break was made alone, the matching check run, and the file restored:

```text
CAUGHT html() stops escaping words
CAUGHT routeOf treats /simple/ as Sinhala
CAUGHT a page uses a misspelled key
CAUGHT a catalogue key nobody uses
CAUGHT Sinhala month order lost
CAUGHT a Sinhala text missing
CAUGHT a Sinhala text drops a link mark
CAUGHT a Sinhala text drops <email/>
CAUGHT a website key in the app catalogue
CAUGHT spreadsheet ignores self-closing marks
CAUGHT spreadsheet files website rows under app
CAUGHT a Sinhala page says lang="en"
CAUGHT a page loses its Sinhala alternate
CAUGHT the sitemap misses a Sinhala page
CAUGHT a Sinhala page is missing
CAUGHT a Sinhala page keeps an English title
16/16 caught
```

### Site check (`npm run build:site`)

```text
Site check of dist/site for https://favoritehearts.com ("indexable": false), 42 pages and the 404 page:
  ✓ titles           42 unique
  ✓ descriptions     42 unique
  ✓ canonical links  42 point to the page's own address on https://favoritehearts.com
  ✓ robots tags      noindex on every page (not indexable yet)
  ✓ social previews  Open Graph and Twitter tags on 42 pages, preview image 1200×630
  ✓ headings         one h1 on each of 42 pages
  ✓ language         lang set on 43 pages
  ✓ languages        21 pages in English and 21 in Sinhala, lang matches; 126 hreflang links resolve to each other
  ✓ structured data  valid JSON-LD on 42 pages
  ✓ links            1556 links and assets on this site resolve, 96 anchors found
  ✓ sitemap          42 pages listed once each, the 404 page left out
  ✓ robots.txt       Disallow: / while not indexable; /app/ noindex
No problems found.
```

Titles and descriptions over the lengths search results show are listed as notes, as before; the Sinhala ones are
the same kind (article summaries used as descriptions). A scan of every built Sinhala page found no English words
outside names (Favorite Hearts, WhatsApp, Wise, PayPal, Starter, Premium…) and meta values.

### The spreadsheet

`npm run text:export` → `dist/text/favorite-hearts-text-si-2026-11-04.xlsx` (194 KB), tabs Read me, App, Messages,
Emails and texts, Website, Glossary: "1984 texts: 1984 translated, 0 approved, 0 with changed English."

```text
Language: si
  app         1022 texts  1022 translated     0 approved
  shared        27 texts    27 translated     0 approved
  api          126 texts   126 translated     0 approved
  validation    37 texts    37 translated     0 approved
  email         60 texts    60 translated     0 approved
  website      712 texts   712 translated     0 approved
  all         1984 texts  1984 translated     0 approved
```

Acting as the reviewer, `openpyxl` corrected one Website row, approved one, and dropped `<email/>` from a terms row;
`npm run text:import -- <file> --dry-run` reported:

```text
Dry run, nothing written. Corrected: 1. Approved: 1. Unchanged: 1981.
Problem: Website row 642 (web.terms.law.3): the text must keep <email/> <operator/> as in the English; it has <operator/>. Not imported.
```

### Browser walkthrough

The built site (`scripts/serve-site.mjs` on 8099, a sandbox API on 8799 with its sample plans). The owner's servers
were not touched.

| Checked | Result |
| --- | --- |
| `/si/` | `<html lang="si">`, "ඔබේ කෙනා. ඔබේ සදාකාලය."; the hand-drawn circle sits on "සදාකාලය" mid-sentence ("ඔබේ සදාකාලය ගොඩනඟන්න."). |
| `/si/pricing/` | Live plans in Sinhala ("මාස 3", "දිනකට ඉල්ලීම් 5ක්, මසකට 30ක්", "අසීමිත ඉල්ලීම් (සාධාරණ භාවිතය අදාළයි: දිනකට 30 දක්වා)"); plan names as the owner wrote them. |
| Footer dialog on `/si/pricing/` | Opens in Sinhala with Sinhala selected and countries in Sinhala; choosing English and Continue opened `/pricing/` in English and saved `{"language":"en","country":"LK"}`. |
| Header link on `/pricing/` | "සිංහල" opened `/si/pricing/` and saved Sinhala. |
| Join on `/si/pricing/` | Opened `/app/?lang=si`; the app came up in Sinhala and its footer links to `/si/help/`, `/si/terms/`, `/si/privacy/`. |
| `/si/help/` | "පිළිතුරු 40ක් හමු විය."; searching "කේන්දර" found the horoscope question; the Payments filter ("ගෙවීම්") shows 5. |
| `/si/newsroom/` | "ලිපි 10න් 3ක් පෙන්වයි.", Show more / less, the Advice filter, "Our Stories" empty text, and a search for "මුදල්" found the respect article. |
| An article at 375 px | "2026 ඔක්තෝබර්", "Favorite Hearts විසින්"; no sideways scrolling; the header link hidden and "English" at the end of the menu. |
| `/si/terms/` | "කෙටුම්පත · 2026 ඔක්තෝබර් 31", the draft notice with the English-official sentence, the operator placeholder and the email link in place. |

### Problems found while building and walking through, all fixed

- The site check failed on its first run: Labs had the same title in both languages ("Favorite Labs" is a name). The
  Sinhala page now has its own title.
- Wrapping the Join button in a new header group would have dropped its existing styles (`header>.pill`); the language
  link sits with the menu button instead.
- The footer dialog's two language cards were staggered in both languages (before 5d too): the floated legend took
  the first grid cell. It now spans the row.
- Stylesheets and scripts changed, so `release` is now `5d-1` and browsers fetch new copies.

### `npm run typecheck` and `npm run build:site`

- `npm run typecheck`: exit 0 (`astro check`: 0 errors, 0 warnings, 0 hints).
- `npm run build:site`: exit 0, "No problems found." The member app's main chunk is 710.04 kB (210.92 kB compressed),
  as in 5c.

### Not done in 5d

- **Owner action:** the reviewer goes through the Website tab (712 drafts); the lawyer compares the Sinhala terms and
  privacy policy with the English. The three "Proposed — confirm" defaults above are the owner's to confirm.
- Wording to settle in review: the app's footer says "පෞද්ගලිකත්වය" for Privacy while the website says "රහස්‍යතා
  ප්‍රතිපත්තිය" (Privacy Policy); the help status says "පිළිතුරු 0ක් හමු විය." when nothing matches.
- 5e: accessibility.
- Pushing to GitHub and Neon migrations 0008–0011: on request, as before (5d adds no migration).

## Stage 5e evidence (5 Nov 2026): accessibility

Scope (Part 3 "Stage 5": "accessibility fixes"; spec 10.4: "keyboard-only navigation, visible focus, readable
contrasts, labels/errors, reduced motion, modals with internal scrolling, safe mobile viewport heights and 200% zoom";
U02: "focus retained/restored, errors announced… no trapped modal"). Real phones with screen readers are Stage 6
(U01, U02 against staging).

### How it was checked

- **axe-core 4.14.0** (a pinned development tool) in the browser, against WCAG 2.2 A and AA and axe's best practices,
  on every website page in English and Sinhala, the 404 page, the menu, the language dialog and an open help answer;
  and in the member app (signed in as the sandbox's synthetic member Bina) on the sign-in page, dashboard, each of the
  profile's 7 tabs, browse, another member's profile, the report dialog, the verification page, the create-profile,
  download and delete dialogs, the invitation page, staff sign-in and the app's not-found page, in English and
  Sinhala and in the dark theme.
- **Keyboard** with real key presses: Tab order and a visible focus ring at every stop, Escape and focus return in the
  menu and dialogs, focus kept inside open dialogs, arrow keys in the profile tabs.
- **Widths and zoom**: 360 px (the spec's smallest phone) and 640×400 (a 1280×800 screen at 200%); dialogs and the
  menu checked for scrolling inside at that height.

### Problems found, all fixed

| Found | Fix |
| --- | --- |
| The language link and the logo were named apart from their visible words ("Read this page in Sinhala" for "සිංහල", "Favorite Hearts home" for "favorite hearts"), on all 42 pages; the app's language button the same (WCAG 2.5.3). | The name now starts with the visible words, the hint in an `sr-only` span: "සිංහල, read this page in Sinhala", "favorite hearts, home page", "සිංහල, show the app in Sinhala". |
| Grey small text at 4.47:1 (#777 on white): the legal pages' contents list, the pricing currency labels and plan details, a contact note. | #6b6b6b (5.33:1). |
| Links inside the terms and privacy text were told apart from the words around them only by colour (1.1:1). | Underlined. |
| The app's unselected tabs at 3.73:1 (60% transparent text). | The muted text colour, 4.64:1. |
| The app's dialogs had no height limit: at 200% zoom or on a phone held sideways their end, often the buttons, was off screen with no way to scroll. | Every dialog, confirmation and sheet is at most the screen's height and scrolls inside itself. |
| Closing an app dialog (Escape, Cancel) dropped focus to the top of the page, because the dialogs open from state rather than a Radix trigger. | `lib/return-focus.ts` returns focus to what opened the dialog; checked with real key presses on the delete-account dialog. |
| The app's tab panel took focus with no ring (its outline was switched off). | A focus ring like every other control. |
| The app ignored "reduce motion" except for one switch. | All animations and transitions are off when it is on. |
| The invitation page had no heading when the link is incomplete. | "This invitation cannot be used" as its heading. |
| The footer's language dialog: its two cards were staggered (found in 5d). | Fixed in 5d. |

Checked and found fine: field labels (the 5c note that the sign-in email field is "announced by its placeholder"
came from the inspection tool's own tree; axe-core computes its name as "Email address", from its `<label>`), errors
announced (`role="alert"`, linked with `aria-describedby`), no sideways scrolling at 360 px or 640 px on any page
checked, the website's menu and language dialog scroll inside themselves at 400 px tall, and the website already
honoured "reduce motion".

### axe-core after the fixes

```text
/ => none                /contact/ => none            /help/ => none               /labs/ => none
/mission/ => none        /newsroom/ => none           /newsroom/belonging-across-borders/ => none
/pricing/ => none        /privacy/ => none            /security/ => none           /terms/ => none
/trust-and-safety/ => none                            /si/ => none                 /si/contact/ => none
/si/help/ => none        /si/labs/ => none            /si/mission/ => none         /si/newsroom/ => none
/si/newsroom/before-marriage/ => none                 /si/pricing/ => none         /si/privacy/ => none
/si/security/ => none    /si/terms/ => none           /si/trust-and-safety/ => none
/si/nowhere/ (404) => none                            language dialog => none      help answer open => none
app (si) /app/ sign-in => none     dashboard => none  browse => none               another member => none
report dialog => none    verify => none               create / download / delete dialogs => none
profile tabs (7, light and dark) => none              staff sign-in (en) => none   not found => none
```

With the menu open, axe reports "no main landmark" and "no h1": the page behind the menu is made inert on purpose
while it is open, which hides both.

### Site check, now with an accessibility area

```text
  ✓ accessibility    1406 links and buttons named, 132 form fields labelled, ids unique and references found on 43 pages
No problems found.
```

Each break below was made alone in a built page, the site check run, and the page restored:

```text
CAUGHT the language link is named apart from its words again  — /: a "සිංහල" is named "Read this page in Sinhala", which does not contain the words on screen
CAUGHT the logo link loses its text
CAUGHT a photo has no alt text
CAUGHT two elements share an id  — /help/: id "help-search" is used 2 times
CAUGHT aria-controls names a missing element  — /newsroom/: button aria-controls="news-list" names no element
CAUGHT the viewport blocks zoom  — /terms/: the viewport blocks zoom (width=device-width,initial-scale=1,maximum-scale=1)
CAUGHT the newsroom search loses its label  — /si/newsroom/: input#news-search has no label
CAUGHT a positive tabindex  — /contact/: a has tabindex 2
CAUGHT an unknown inline language  — /si/help/: lang="english"
CAUGHT a button with no name  — /pricing/: a button has no name ((empty))
10/10 caught
```

### `npm test`, `npm run typecheck` and `npm run build:site`

- `npm test`: 158 tests, all passing (api 144, website 5, scripts 9).
- `npm run typecheck`: exit 0 (`astro check`: 0 errors, 0 warnings, 0 hints).
- `npm run build:site`: exit 0, "No problems found." Member app main chunk 710.56 kB (211.08 kB compressed).
- `release` is now `5e-1`, so browsers fetch the changed stylesheets.

### Not done in 5e

- Real phones with VoiceOver and TalkBack, against staging: Stage 6 (U01, U02).
- The app's screens have no automated accessibility test (the app has no browser test runner); they were audited by
  hand as above. A browser test runner for both is a Stage 6 candidate.
- `npm audit` still reports the two moderate findings noted before (`@hono/node-server`, and esbuild inside
  drizzle-kit's development tools); the `@hono/node-server` upgrade is proposed for Stage 6.
- Pushing to GitHub and Neon migrations 0008–0011: on request, as before (5e adds no migration).
