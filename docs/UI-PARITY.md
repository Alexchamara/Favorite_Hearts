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
| Member: More sheet rows | Rows that open a page are links (`<a>`), not the demo's buttons; `parity.css` gives them the demo row look. Contact channels (WhatsApp, call, email) are rows here; the demo has a Contact page (ui-8) | Link semantics; X06 support channels |
| Member: More sheet focus | Opening the sheet focuses the sheet itself (the demo focuses nothing), so keyboard and screen-reader users are inside it; no ring on the panel | WCAG 2.4.3 |
| Member: menu badge | The More button and Verification row show "1" with the words for screen readers; the demo counts several kinds of attention, the app has one (verification) | Real data |
| Member: field labels | `.m-field` keeps the demo look, but the label is a `<label for>` around the words only; hints and errors are linked with `aria-describedby` and errors are announced (the demo wraps hint text inside the label) | WCAG 1.3.1, 3.3.1 |
| Member: invalid fields | Danger border and an inline error under the field | WCAG 3.3.1 |
| Member: tabs | Inactive tab text uses the muted colour (demo: 60% text, about 3.4:1); tab lists may grow taller with larger text (`min-h-9`); the tab panel shows a focus ring | WCAG 1.4.3, 1.4.4, 2.4.7 |
| Member: skip link | "Skip to content" appears on focus (not in the demo) | WCAG 2.4.1 |
| Member: trust badges | Same chips, icons and order as the demo, with the decided wording ("Candidate identity verified", never "· demo"); member and own-profile pages add each badge's meaning under the chips | OWNER-DECISIONS §5 |
| Member: signed-in footer | Copyright only, as in the demo; help, terms and privacy moved into the More sheet | Demo layout |
| Member: dialogs and sheets | Keep Stage 5e scrolling (`max-h`, `overflow-y-auto`) and focus return | WCAG 1.4.10, 2.4.3 |
| Member: entry header | Beside the demo's "Matrimony" label: the other language (සිංහල / English), as on every app screen; brand and controls are 44 px tall (demo: brand 39 px, theme button 42 px) | Stage 5d language links; WCAG 2.5.8 and the 44 px rule |
| Member: entry footer | "Need help?" with WhatsApp, call, email and the policies under the entry page (not in the demo) | Help before anyone has an account (X06) |
| Member: language step | English and Sinhala only (Tamil hidden); no ⓘ note (it described Tamil coverage); the country list is the app's own, in the language on screen | OWNER-DECISIONS §10 |
| Member: sign-in | One code-based form instead of the demo's Sign up / Log in tabs and passwords; the demo's tab look carries the Email / Phone (SMS) choice; "Send me a code" instead of "Create account" / "Log in"; the security check (Turnstile) on the contact and code steps | OWNER-DECISIONS §5 (passwordless), D7 |
| Member: entry aside | The decided steps and note ("Sign in with a code…", "Browsing opens once you are verified…") instead of the demo's ("Verify your account…", "Browse free after setup…") | OWNER-DECISIONS §2, §5 |
| Member: entry brand | A link home (the demo's is a button); it takes the font the demo button ends up with | Link semantics |
| Member: wizard, Your role | No manager-name or candidate-email fields (the account holder's name is the manager's; the candidate is invited later from the profile); the self or manager declaration is the box to tick; the role cannot be changed once the profile exists, so its step label is not a link afterwards; no "Save and finish later" (nothing is saved yet) | OWNER-DECISIONS §4, §5 |
| Member: wizard, The essentials | Date of birth instead of the demo's age wheel (SCREEN-070 not built); the app's own field labels, lists and limits; no "Use sample details" | Decision B3; RULE-AUDIT |
| Member: wizard, Your story | The about, family and lifestyle parts keep their own headings, and photos come at the end of this step (the demo adds photos later, on the profile) | Photos are part of setup (owner, 5 Nov 2026) |
| Member: wizard, Privacy | The private contacts plus the account holder's own phone and document checks (the demo has contact fields, social links and horoscope options here) | OWNER-DECISIONS §1, §5 |
| Member: wizard, Review | The publishing panel (publish when the checks allow it, plan, delete) instead of the demo's read-back and agreement box; the agreement was given when the profile was created | OWNER-DECISIONS §2 |
| Member: wizard and dialog panels | Contact, photo, verification and publishing panels lose their card frame inside a wizard step or a dialog, so it reads as one page as in the demo | Demo layout |
| Member: profile page | "← Your profiles" above the heading (the demo has one profile per account); the right column adds this app's interests/connections card, the manager/candidate card, and the publishing, plan, "found a match" and delete panels; no horoscope or selfie cards (decided out); the photos section opens the photo manager instead of showing the cover switch inline | OWNER-DECISIONS §1, §4, §5 |
| Member: profile sections | Private contacts open the wizard's Privacy step (the demo edits them inline, with a sharing box); no "Contact & social handles" section (social links are contact entries here) | OWNER-DECISIONS §5 |
| Member: photo dialog | The app's photo manager (up to 5, cover, delete, cover switch) instead of the demo's single-file upload; its kicker and title follow the demo | Real uploads (R2), section 6 |
| Member: culture dialog | The app's lifestyle and community fields, with caste "prefer not to say" by default, instead of the demo's district, mother tongue and family fields (those are in The essentials and Your story here) | Section 6 |
| Member: delete dialog | Tick to confirm and a recent sign-in, instead of typing DELETE; the demo's "Keep profile" and primary-button confirm | RULE-AUDIT; OWNER-DECISIONS |
| Member: removal buttons | "Delete this profile" and similar are the demo's red text button (`.m-text.m-danger`); the final confirm in a dialog is the demo's primary button | Demo markup |
| Member: 44 px targets | The own-photo camera button (demo 34 px) and text actions in pages, steps and dialogs are at least 44 px | Stage 5e |
| Member: Discover shelves | No "Featured profiles" or "Boosted profiles" shelves (no decision on paid visibility, RULE-AUDIT N01/N02); every profile is in one list | Decision list, ui-1 plan |
| Member: Discover sorts | Newest published, age (both ways), name, district; no "Your priorities" or "Shared values" (they need a matching score: Q-030, Q-032) | Decision B4 |
| Member: Discover cards | No "Send interest" on the card: requests are sent from the profile, where the sharing confirmation is; no online status, compatibility button, values chips or "Compare profile" (not in the card data, or undecided); the line under the badges is "Private until mutual acceptance" | OWNER-DECISIONS §4; B4 |
| Member: Discover rail | The acting-profile card shows the profile's status instead of the demo's "Profile readiness" percentage (the demo's figure is invented); its rows are Membership and Trust & access (Privacy & safety arrives with ui-8) | Real data |
| Member: Discover count | The result count counts the profiles loaded so far ("20+ profiles" while more pages wait); the API returns no total | API paging |
| Member: preferences dialog | The app's filters (age, height, religion, marital status, caste with consent, culture and lifestyle) in the demo's dialog and folding sections; location lives in the toolbar's location filter; no "selfie-verified only", horoscope or "what matters most" choices | OWNER-DECISIONS §1, §6 |

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

### ui-3 member foundation (9 Nov 2026)

- **Cascade:** `scripts/ui-parity/port-css.mjs` copies the demo's member stylesheets into
  `apps/member/src/styles/source/` with the demo build's own scoping function: `product.css` prefixed with
  `#favorite-hearts-product`, then `overrides.css`, `contrast.css`, `combined-overrides.css`, `design-system.css`
  unscoped, and the build's trailing base rule. `main.tsx` imports them in that order after Tailwind and the tokens,
  then `styles/parity.css` (this repository's corrections, each listed above). The app renders inside the demo's
  `#favorite-hearts-preview > #favorite-hearts-product` wrappers.
- **Portals:** the demo's build rewrote every Radix portal (dialog, sheet, select, alert dialog, popover) to render
  inside `#favorite-hearts-product`, so its scoped styles reach overlays. `components/ui` now passes the same container
  (`portalContainer()` in `lib/utils.ts`). Dialogs, alert dialogs and sheets carry the demo's `m-app m-dialog` /
  `m-app` classes and `data-theme` by default, as every demo dialog did.
- **Font:** Inter 4.1 (400/500/600/700, OFL) self-hosted from `src/assets/fonts/inter/` (`styles/fonts.css`).
- **Shell:** `components/layout.tsx` is the demo's markup: `.m-app[data-theme]` > `header.m-header` (`.m-brand`,
  `.m-more-button` with `.m-menu-count`), `nav.m-primary-nav.m-floating-nav` (buttons, `.selected`,
  `.m-dock-icon`), `main.m-main`, `footer.m-footer`; the More sheet is `.m-app.m-more-sheet` with the demo's language
  `<select>` (`.fh-language`), theme button (`.m-btn.m-secondary.m-menu-theme`), rows and `.m-menu-bottom` sign-out.
  Signed-out and staff headers keep the theme button (`.ma-theme`) and the language switch; the sign-in screen itself
  is ui-4.
- **Shared pieces:** `Button` variants map to `.m-btn`, `.m-btn.m-secondary`, `.m-btn.m-danger` and `.m-text`;
  `Card` is `.m-surface`; `PageTitle` is `.m-page-heading` with `.m-kicker`; `Notice` is `.m-note` / `.m-error`;
  form fields are `.m-field` and `.m-check`; trust badges are `.m-earned-badges`; the phone country button uses
  `.m-choice`. Tabs went back to the demo's classes (two accessibility exceptions above).
- **Computed styles** (`scripts/ui-parity/styles.py`): at 390 and 1440 px the header, dock, dock items (normal and
  selected), footer, kicker and page title compute identically to the demo; the More sheet differs only where its
  words differ (T-1).
- **Pixel diff against the demo** (share of pixels changed, before → after ui-3): Interests 18.0 → 8.9% (320 px),
  4.0 → 2.2% (1440); Connected 20.7 → 13.9%, 4.9 → 4.0%; Shortlist 18.6 → 13.3%, 6.6 → 5.4%; Discover 34.6 → 27.8%
  (390), 12.1 → 9.4% (1440); Trust 26.6 → 23.4% (390), 14.2 → 15.6% (1440). What remains is each screen's own
  layout, rebuilt in ui-4 to ui-9.
- **Checks:** typecheck clean; 179 tests pass (API 165, website 5, text tools 9); `build:site` and the site check
  pass; keyboard: skip link, brand, More button, five dock buttons (67×54 px), More sheet focus inside, Escape returns
  focus to the More button.
- **Known, later phases:** the sign-in panel still overflows at 320 px (ui-4); screens not yet rebuilt keep a narrow
  inner column inside `.m-main` (removed screen by screen); toasts render outside `.m-app` (ui-10). The member CSS
  bundle is 732 KB (156 KB gzipped); about 470 KB of it is the `flag-icons` stylesheet the phone picker already used.

### T-1 translations (decided 9 Nov 2026)

The owner chose a waiting list and the demo's wording:

- `packages/shared/src/i18n/waiting/si.json` lists texts waiting for a Sinhala translator. `new`: no Sinhala yet (the
  value is blank and members see the English; `textFor` treats a blank translation as missing). `englishChanged`: the
  English changed to the demo's wording (value: the English before); the earlier Sinhala stays on screen as a draft.
  A text whose placeholders changed is blanked instead, since the old Sinhala would not fit.
- The test "members see nothing untranslated" allows blank Sinhala only for listed texts; a second test keeps the list
  exact (listed texts exist, `new` ones are still blank, changed ones still have a translation and really changed).
- `npm run text:status` reports the list; the reviewer's spreadsheet marks changed texts "English changed";
  `npm run text:import` takes a text off the list once its Sinhala is imported or approved.
- First entries (ui-4): 8 new (entry and sign-in texts, the More sheet description) and 16 changed (the shell's
  wording now follows the demo: "Your Matrimony space", "Use dark mode", "Log out", "Interests", "Profile",
  "More options", "Trust & access", "Website language", "Resend code", "Change details", "Verification code", and
  "Matrimony navigation" / "More Matrimony options" for screen readers).

### ui-4 entry and sign-in (9 Nov 2026)

SCREEN-022, 023/024 (one passwordless sign-in), 026. SCREEN-025 and 027 (passwords) are not built (decided).

- **Entry page** (`features/auth/Entry.tsx`): the demo's `.m-app.ma-entry` page, outside the app frame:
  `header.ma-header` (`.ma-brand`, "Matrimony", the language switch, `.ma-theme`), `main.ma-layout` with
  `section.ma-panel` and `aside.ma-info` (kicker, the serif promise, lead, `ol.ma-steps`, `.ma-note`).
- **Language and country** (SCREEN-022, decision B2c): shown on a first visit when this browser has no country yet
  (someone who chose on the website skips it). Language as the demo's `.fh-language-buttons`, country as the demo's
  searchable field with a list. Saved only as a preference in `fh-visitor-preferences`, shared with the website; it
  sets the language on screen and changes nothing about billing or profiles.
- **Sign-in** (`features/auth/SignIn.tsx`): the demo's panel markup: `.ma-tabs` (Email / Phone (SMS)), the grid form,
  `.m-btn`, `.ma-notice`, `.m-error`; the code step has the demo's title "Verify it’s you.", one code field,
  "Verify & continue", "Resend code" and "Change details" (`.m-text`). The name step uses the same panel.
- **Code field** (decision B2a): `CodeInput` is now one `.m-field` input (it replaces the one-box-per-digit design of
  6 Nov) for sign-in, the phone check, invitations and the staff authenticator code; it still checks itself when the
  sixth digit is in, fills from an SMS where the phone offers it, and says "Checking…", "Verified" or what was wrong.
- **Fixed:** the 320 px overflow (WCAG 1.4.10): the security check uses Turnstile's compact size when its column is
  narrower than 300 px. No member page scrolls sideways at 320 px now.
- **Pixel diff against the demo** (before → after): sign-in vs the demo's log-in 25.4 → 17.7% (320 px), 22.8 → 18.9%
  (390), 16.4 → 9.4% (768), 15.1 → 10.7% (1024), 11.8 → 8.2% (1440); the remainder is the demo's password fields and
  tabs, which the decided sign-in does not have, plus the footer. Language step 2.4% (1440) to 8.9% (320); code step
  5.6% (1440) to 12.5% (390). The code step at 1024 px was not captured (the sandbox limits code requests per minute).
- **Checks:** typecheck clean; 180 tests pass (API 166 with the new waiting-list test, website 5, text tools 9);
  `build:site` and the site check pass; keyboard order on the entry page: skip link, brand, language, theme, the two
  language buttons, country, Continue, all with visible focus and at least 44 px; Sinhala: new texts show in English,
  changed ones in their earlier Sinhala.

### ui-5a setup wizard (9 Nov 2026)

SCREEN-028 to 032 (decision B3). SCREEN-070 (age wheel) is not built: the profile keeps its date of birth.

- **The wizard** (`features/profile/Onboarding.tsx`): the demo's `main.m-onboarding`, with the editorial aside
  (`.m-onboard-aside`, `.m-onboard-quote`) and the content (`.m-onboard-content`): "Step n of 5", the progress bar
  (`.m-progress`), the step labels (`.m-step-labels`, current one `aria-current="step"`, steps not open yet
  disabled), the step's kicker and title, the step, `.m-error`, `.m-wizard-actions` (Back, Continue) and
  `.m-save-draft` ("Save and finish later"). The dock is hidden meanwhile, as in the demo.
- **Steps on this app's endpoints:** Your role is the new page `/profiles/new` (POST /profiles; it replaces the
  "Create a profile" dialog), with the demo's role cards (`.m-role-grid`, `.m-role-option`). The essentials
  (`…/details`) and Your story (`…/story`, the old `…/photos` address opens it) are the details form in parts (PATCH
  /profiles/:id): Continue saves each part in turn, stops at the first problem, then opens the next step; every save
  reads the newest profile version, so parts saved one after another never conflict. Privacy (`…/verify`) and Review
  (`…/publish`) are the existing contacts, checks and publishing panels. A step opens once the steps before it are
  complete (Your story once the essentials are). Opening a step moves focus to its title.
- **Only while setting up:** the wizard is the page of a draft its viewer can edit; a published profile, and a
  draft's plan and manager/candidate sections, keep the profile page (ui-5b).
- **Shared pieces:** the value chips are the demo's `.m-value-picker` (pressed buttons with a tick).
- **Fixed:** `parity.css` rules lost to the demo's `#favorite-hearts-product`-scoped rules on specificity; every
  rule now starts with that id. The 44 px theme button from ui-4 only takes effect from here.
- **Texts:** 27 new wizard texts added through `scripts/ui-parity/texts.py` (blank Sinhala, on the waiting list).
- **Pixel diff against the demo:** The essentials 4.6% (1440 px), 9.6% (390); Your role 7.6% (1440), 17.7% (390),
  mostly the demo's manager-name and candidate-email fields.
- **Checks:** typecheck clean; tests pass (API 166, website 5, text tools 9); `build:site` and the site check pass;
  walked end to end in the sandbox: role and declaration (error without it), essentials saved, story saved, privacy
  (contact from the verified number), review opened; no step scrolls sideways at 320 or 390 px.

### ui-5b own profile and its dialogs (9 Nov 2026)

SCREEN-042, 059, 062, 069.

- **Profile page** (`ProfileDashboard` in `features/profile/ProfilePage.tsx`): a published profile's page is the demo's
  "My profile": `.m-page-heading` ("Your story, your way", "{name}’s next chapter.", Edit profile), then
  `.m-two-columns`: the profile (`.m-surface`: `.m-own-profile` with the cover photo and camera button, name and age,
  occupation and city, who manages it, its status; the earned badges; `.m-profile-section`s for photos, culture and
  everyday life, private contacts, in my own words with the values, `.m-detail-grid`, life beyond work, family and
  background) beside the context cards (`.m-context-card`: trust, interests and connections, manager/candidate) and
  the publishing, plan and delete panels.
- **Edit profile** opens the same wizard with every step open (as the demo does for an existing profile); its Review
  step and "Save and finish later" lead back to the profile page.
- **Dialogs:** photos (SCREEN-062) and culture and lifestyle (059) open from the page in the demo's dialog; the delete
  confirmation (069) keeps the decided tick and recent sign-in with the demo's buttons.
- **Buttons:** the `danger` variant is now the demo's red text button; `destructive` (a dialog's final confirm) the
  demo's primary button. The cover-photo switch is the demo's `.m-toggle`.
- **Texts:** 22 new (blank Sinhala, on the waiting list).
- **Pixel diff against the demo's profile page:** 10.8% (1440 px), 20.7% (390): the demo shows more fields inline
  (contact form, cover switch) and has the horoscope and selfie cards; the rest is real data in place of the demo's.
- **Checks:** typecheck clean; tests pass (API 166, website 5, text tools 9); `build:site` passes; no sideways scroll
  at 390 or 1440 px; keyboard order: brand, More, dock, back, Edit profile, camera, the section buttons, all visible
  and at least 44 px; the photo dialog returns focus to the camera button; Edit profile → wizard → Review → profile
  page.

### ui-6a Discover, filters and shortlist (10 Nov 2026)

SCREEN-033, 034, 035, 057, 058. SCREEN-055/056 (profile sheet) and 066 (report) follow in ui-6b.

- **API (decision B4, read-only, no schema change):** `GET /api/v1/discover` takes `q` (first name, city or
  occupation; `%` and `_` literal), `sort` (`newest`, `age_asc`, `age_desc`, `name`, `district`), `location`
  (`everywhere`, `sri_lanka` with optional `regions`, `abroad` with optional `countries`), and the culture filters
  `diet`, `smoking`, `drinking`, `childrenPlan`, `familyInvolvement`, `communityOpenness`, `motherTongue`. Paging is
  keyset per sort (the cursor carries its sort; a cursor from another sort is refused). Shared schema in
  `packages/shared/src/requests.ts`; test "decision B4 …" in `apps/api/test/requests.test.ts`.
- **Discover page** (`features/browse/BrowsePage.tsx`): the demo's markup: `.m-page-heading` with "Your
  preferences", `.m-discover-layout` with the toolbar (`.m-discover-toolbar`: `.m-search`, the location filter
  `.m-location-trigger` and popover, the sort `.m-choice`), `.m-discovery-summary`, `.m-result-head`, the
  `.m-profile-grid` of cards, `.m-empty`, `.m-discovery-end`, and `.m-right-rail` (`.m-context-card` with
  `.m-rail-head`, `.m-intention-card`, `.m-rail-links`, `.m-rail-caption`). Every filter stays in the address. The
  verification gate (SCREEN-033) is the demo's `.m-access-gate`.
- **Cards** (`DiscoverCard`): `.m-card` with `.m-card-identity` (portrait, name and age, place, work, bookmark
  `.m-bookmark`), `.m-card-body` (who manages the profile, badges, `.m-common`, "View profile").
- **Preferences dialog** (SCREEN-057): the demo's dialog with `.m-form-grid` and folding `.m-filter-section`s.
- **Shortlist** (SCREEN-035): the same cards and grid, the demo's empty state.
- **Texts:** 42 new and 1 changed (the dialog's line now reads as the demo's).
- **Pixel diff against the demo's Discover** (before → after): 1440 px 12.1 → 10.5%; 390 px 34.6 → 34.7%. The
  structure now follows the demo, but the demo page starts with its Featured and Boosted shelves (not built), so the
  shared list sits lower there and the phone-width comparison stays high.
- **Checks:** typecheck clean; tests pass (API 167 with the B4 test, website 5, text tools 9); `build:site`
  passes; in the sandbox: search "chat" → Chathu only, age sort 29/33/36, location "Kandy" → none, clear → all;
  no sideways scroll at 390 or 1440 px.
- **Sandbox note:** `scripts/ui-parity/sandbox-login.py` now sets the visitor preference first, since the entry page
  asks for language and country on a first visit (ui-4).

