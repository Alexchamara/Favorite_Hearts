# Demo UI parity

Branch `feat/demo-ui-parity` (from `9bb198d`, tag `ui-0-baseline`). Goal: the member app and the public site look and
behave like the original Favorite Hearts demo (the UI clone kit, `Favorite-Hearts-Complete-UI-Clone-Kit`), while
[OWNER-DECISIONS.md](OWNER-DECISIONS.md) and the real API keep deciding business rules.

## Ground rule

- **The demo decides UI/UX:** DOM structure, class names, CSS cascade, spacing, type, colour, icons, states, motion,
  screen grouping and flow.
- **Owner decisions and the API decide rules:** prices, gates, limits, sign-in method, verification, retention, staff
  roles.
- Stage 5e accessibility fixes win where the demo fails WCAG 2.2 AA; each one is listed under intended differences.
- Demo-only logic is never copied: `window.__heartsNetwork`, the 246810 code, sample/staff account switching,
  simulated payments, in-memory accounts. The demo's sample accounts are used only to reach its screens for
  reference screenshots.

## Decisions (approved 9 Nov 2026)

| # | Decision |
| --- | --- |
| B1 | Member font: self-host Inter 400/500/600/700 (SIL OFL 1.1, rsms/inter v4.1). |
| B2 | Sign-in: single code field as in the demo; keep the phone flag and dial-code picker, styled like the demo's fields; add the demo's language and country screen before sign-in, saved as a preference only. |
| B3 | Profile setup: the demo's 5-step flow over the existing endpoints; keep date of birth, no age wheel. |
| B4 | Discovery: add text search, sort, location modes and culture filters as read-only server filters (no schema change). Compare and the shared-values score stay out until decided (Q-030, Q-032). |
| B5 | History tab: add one read-only endpoint (no schema change). |
| B6 | Plan cards: the demo's three public tiers (cream, lavender, plum) map by plan level to Starter, Premium 3 months, Premium 6 months; the app uses the demo's `m-plan` card. |
| B7 | No floating language switch exists in the demo. The member app uses the demo's language `<select>` in the More menu; the website keeps its header language link. |
| B9 | Intended public-site differences are kept (see below). |
| C-1 | Member colours follow the demo's final `product/app/design-system.css`, not spec 01's older table. |

### Demo screens not built (removed by owner decisions)

- Forgot / reset password (SCREEN-025, 027): members have no passwords.
- Horoscope workspace and birth details (045, 067): out of scope.
- Boost (063) and Featured shelf (053): no decision on prices or rules (RULE-AUDIT N01, N02).
- Staff consent queue (051): consent is the candidate's own action.
- Ownership-transfer fee, 48-hour invitations, typing "DELETE": replaced by the decided flows (free takeover, 24 hours,
  tick plus recent sign-in), drawn in the demo's style.

### Open, not blocking the visual work

Q-014 Sinhala font · Q-013 Sinhala reviewer · Q-004/Q-005 tax and invoicing · Q-007 SMS provider ·
Q-010/Q-011 age rule and retention · Q-016 re-verification after edits or transfer. Existing Sinhala drafts stay; new
keys get an English value and a blank Sinhala value.

## Intended differences from the demo

| Where | Difference | Why |
| --- | --- | --- |
| Website header | Language link (English / සිංහල) | Sinhala site at `/si/` |
| Home | No testimonial carousel | Testimonials were invented; removed in Stage 0 |
| Legal pages | Draft notices; body grey #6b6b6b instead of #777 | Lawyer review pending; AA contrast |
| Pricing | Live plans and owner-decided copy ("Free to publish. A plan when you're ready.", Starter / Premium 3 months / Premium 6 months, plan card text, bank-transfer steps, FAQ) | OWNER-DECISIONS §2, §5 |
| Help | Questions and answers rewritten for the decided rules | OWNER-DECISIONS |
| Labs | "We are love scientists." hero and "The lab." research section removed; hero reads "Ideas for a shared life." | Owner, 31 Oct 2026 (BUILD-PROGRESS X03) |
| Newsroom | Category "Research & Advice" is "Advice" | Owner, 31 Oct 2026 |
| Terms, Privacy | Longer: the decided legal drafts | Lawyer review pending (Q-010, Q-011) |
| Contact | "Call us" card; payments in the intro; "staff never ask for a password or code"; Facebook/TikTok cards only once an address is set in `site.config.json` | W12, W15; BUILD-PROGRESS 31 Oct (proposed) |
| Trust & Safety, Security | Decided wording (sign-in codes, private storage, "what stays private until you both accept") | W12, W15 |
| Menu overlay | Items sized to the screen height so the menu never scrolls; Sinhala link inside the menu below 600 px; no social icons until addresses are set | Stage 5d |
| Grey text | #777 → #6b6b6b in contact hours, plan notes, currency labels, legal contents | AA contrast |
| Join now | Opens the member app at `/app/` instead of the demo's `/matrimony/` | Real app |

More rows are added as each phase finds them.

## Screenshots

Tools in `scripts/ui-parity/` (development only, Python + Playwright + Pillow, not part of any build):

- `capture.py`: reference and repo screenshots at 320, 390, 768, 1024 and 1440 px, light theme, reduced motion,
  English.
- `compare.py`: side-by-side sheets (reference | repo | amplified difference) and a `report.md` sorted worst first.
- `sandbox-login.py`: signs a synthetic sandbox member in for signed-in member screenshots.
- `capture_states.py`: public interaction states (welcome dialog, menu, newsroom and help filters).

Capture one target at a time. Two captures running together slow the dev servers enough that some lazy images are
still blank when the screenshot is taken, which shows up as 5–20% differences that move between runs. Two sequential
runs of the same page are pixel-identical. `website-dev` needs the sandbox API on :8787 (launch name `website-api`)
for live pricing.

The reference is `reference/Favorite-Hearts-Integrated/dist` served on :8080 (launch name `reference-demo`); it
includes DM Sans. The demo asks for Inter but ships no file, so member reference shots are taken with Inter injected
(`--inter`), matching decision B1.

## Phase log

| Tag | Phase | Result |
| --- | --- | --- |
| `ui-0-baseline` | Branch point | `9bb198d` |
| `ui-1` | Baseline and reference capture | See below |

### ui-1 baseline (9 Nov 2026)

Captured: 21 public routes × 5 widths from the reference and from `website-dev`; 14 demo member screens × 5 widths
(reference, Inter injected, the demo's paid sample state) and 8 member screens × 5 widths from the sandbox (signed in
as the synthetic member Bina, Premium 3 months). Light theme, English, reduced motion, Chromium 148 headless.

**Public site** (worst width per page; "changed" = share of pixels differing by more than 12/255):

| Page | Changed | Cause |
| --- | ---: | --- |
| mission | 0.01% | Same |
| 10 newsroom articles | ≤ 0.10% | Same (anti-aliasing) |
| newsroom article "a-thoughtful-beginning" 320/390 | 6.13% | Category label "Advice" wraps differently; 768+ same |
| newsroom | 19.20% (320) | Category "Advice" changes the chip rows; 768+ ≤ 0.15% |
| trust-and-safety, security | 12.23%, 18.83% | About 110–200 px of extra text; to check in ui-2 |
| pricing | 19.93% | Decided copy and plans; card colours already map by level (B6) |
| contact | 24.54% | Decided copy, 100–400 px shorter; to check in ui-2 |
| help | 25.46% | Decided questions |
| terms, privacy | 28.99% | Legal drafts |
| home | 33.93% | Testimonials removed (about 700 px shorter) |
| labs | 34.67% | Research section removed |
| All pages ≥ 390 px | — | Header language link (සිං) beside "Join now" |

Styling, layout, fonts, colours and images match wherever the content is the same. ui-2 checks each remaining
difference line by line and fixes any that are not explained by the table above.

**Member app**: the shell already follows the demo (header with heart brand, kicker, serif headings, floating dock,
purple secondary buttons). Gaps found:

- Discovery: no search / location / priorities toolbar, no profile-readiness rail card, no "Sorted by", result count
  or section headings; cards lack tags, badges row, online state and "Send interest"; 34.6% changed at 390 px.
- Sign-in: the entry header uses the badge brand instead of the demo's text brand with "Matrimony" label; no
  language-and-country step (B2c); the code step uses 6 boxes (B2a).
- Trust, Interests, Connected, Shortlist: page structure differs (demo surfaces, tabs, rows); 4–27% changed.
- Not yet comparable (no matching repo screen): profile (repo has a dashboard), membership, privacy & safety,
  contact, staff workspace, onboarding wizard.
- **Bug:** at 320 px the sign-in panel is 350 px wide (horizontal scroll), because the Turnstile widget needs 300 px
  plus the panel padding. Fails WCAG 1.4.10 reflow; fix in ui-4.
- The demo renders Inter only where it is installed; this Mac has no Inter, so un-injected reference shots fall back
  to the system font. Inter files are not yet added to the app (ui-3).

### ui-2 public site parity (9 Nov 2026)

Every public difference was traced; none needed a code change.

- **Text:** the visible text of each page that differs was compared line by line with the reference. Every changed
  line is decided content (table "Intended differences" above, now including Contact, Trust & Safety, Security, the
  menu, grey text and Join now).
- **CSS:** all six differing stylesheets were compared rule by rule. The only changes are the header language link
  (and `header>.pill` becoming `header .header-end>.pill` to make room for it), #777 → #6b6b6b, the legal draft
  styles and the Stage 5d menu sizing. Page stylesheets for articles, help, labs, mission, newsroom, welcome and
  Tailwind are byte-identical.
- **Same-content areas:** with the header excluded, pages match the reference until the first decided change
  (home: identical down to where the testimonials were; trust-and-safety, help: 0.00% in the first screen; mission and
  9 of 10 articles ≤ 0.10% over the whole page). The header's left half is identical on every page and width.
- **States:** welcome (language/country) dialog ≤ 0.07%; help search ≤ 0.22%; newsroom filter and search identical at
  1024 px and above, and below that differ only by the "Advice" chip; menu overlay differs only as listed above.
- **Reflow:** no English or Sinhala (`/si/`) page scrolls sideways at 320 or 390 px.
- **Kept as found:** the reference's `scripts/serve.mjs` answers `/` with 403 (its root check drops the trailing
  slash), so the reference home is captured from `/index.html`.

Screenshots and diff reports stay outside the repository; rerun the tools above to reproduce them.
