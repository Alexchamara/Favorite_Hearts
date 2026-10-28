# Rule audit (Stage 0)

28 October 2026. Baseline: tag `stage-0-baseline` (commit `560bf2a`). Rules: [`OWNER-DECISIONS.md`](OWNER-DECISIONS.md), draft v1.

This lists every place where the original demo conflicts with `OWNER-DECISIONS.md`: its public pages (pricing, help/FAQ,
terms, privacy and the rest) and its member product. **Nothing has been fixed.** Stage 0 only records; each row names
the stage that fixes it.

**How it was checked.** The visible text of all 21 public pages and the shared partials was extracted and read in full.
The member product's rule code was read line by line: `product/lib/*.ts`, `product/preview/matrimony.tsx` and
`product/app/matrimony/*`. Both were compared with sections 1–10 of the owner decisions. Every row was confirmed in the
source. Spec IDs (G01–G28, spec chapter 14; O01–O20, chapter 15) are given where the spec already names the same issue.

**Where things are.**

- Demo paths are relative to `reference/Favorite-Hearts-Integrated/`, and site paths to `apps/website/`.
- `apps/website` was converted from the demo "with no content changes". Its visible text is identical to the demo on all
  21 pages, checked page by page, so every website row applies to both copies. Astro page line = demo line + 11.
- The product source is minified into very long lines. Search for the quoted text on the line given.
- `§n` means section n of `OWNER-DECISIONS.md` Part 1.

**Summary:**

| Part | Items |
| --- | --- |
| Public website | 16 conflicts |
| Member product | 29 conflicts |
| Demo features no decision covers | 6 |
| Other accuracy issues | 7 |

Section 5 lists what was checked and already matches.

## 1. Public website: pricing, help/FAQ, terms, privacy and other pages

| ID | Where (demo → site) | What it says now | Owner decision | Stage |
| --- | --- | --- | --- | --- |
| W01 | `website/src/pages/pricing/index.html:53–121` → `src/pages/pricing/index.astro:64–132` | Three plans: Essential / Signature / Premier at LKR 3,000 / 5,000 / 8,000. Overseas toggle shows USD 29 / 49 / 69 (`data-price-diaspora` on lines 65, 88, 112 → 76, 99, 123). | §2: Starter 1 month LKR 3,000 / USD 20; Premium 3 months LKR 8,500 / USD 55; Premium 6 months LKR 15,000 / USD 100. §1: old tiers dropped. | 5 |
| W02 | pricing `:67, :90, :114` → `:78, :101, :125` | "Plan duration to be confirmed" on every plan. | §2: 1, 3 and 6 months. | 5 |
| W03 | pricing `:93–95, :117–119` → `:104–106, :128–130` | Paid human services: profile presentation guidance, help reviewing your introduction, priority support, dedicated onboarding, family-managed setup guidance, personal profile review. | §1: these services are dropped. | 5 |
| W04 | pricing `:205` → `:216` | FAQ "Do men and women both need a paid account?" says yes: "a paid subscription to publish a profile", LKR 3,000/5,000/8,000, USD 29/49/69. | §1: creating and publishing a profile is free once verified. Payment unlocks sending, seeing who sent interest and accepting. | 5 |
| W05 | `website/src/pages/help/index.html:172–175` → `src/pages/help/index.astro:183–186` | FAQ "Do I need to pay to publish a profile?": "requires a paid subscription to publish a profile, for both men and women". | §1, as W04. | 5 |
| W06 | pricing `:226`, `:139`; help `:196` → `:237`, `:150`, `:207` | Refund conditions "have not been published" or "must be confirmed before payment". | §9: no refunds once a plan is active, except duplicate payments, mistaken payments and failures on our side. Say so on the pricing page and at the payment step. | 5 |
| W07 | pricing `:219` → `:230` | "Renewal arrangements have not been published. Do not assume automatic renewal." | §3 is decided: no automatic renewal; same-tier renewal only in the last 7 days; upgrades only; expiry hides contact details. | 5 |
| W08 | `website/src/pages/terms/index.html:94` (section 06) → `src/pages/terms/index.astro:105` | Prices, periods, cancellation and refund conditions "will need to be provided". | §9 refunds, §3 renewal and §2 Premium cap are decided and belong in the terms. | 5, lawyer |
| W09 | terms, whole page ("Website edition") | Covers the information website only. None of the statements the decisions assign to the terms appear. | Terms must state: the real Premium daily cap (§2); that the guardian has the candidate's permission (§4); age by manager declaration (§5); what happens to a plan after a PayPal-style dispute (§9); that suspension forfeits remaining time (§9). Terms are needed in English and Sinhala with one official version (§10). | 5, lawyer |
| W10 | `website/src/pages/privacy/index.html:88` → `src/pages/privacy/index.astro:99` | "there is no single published retention period". | §8: documents deleted 90 days after approval, and rejected documents on the same limit. After account deletion, payment records, reports, blocks, the staff audit log and scrambled email/phone are kept 6 months. The policy must list exactly this. | 5, lawyer |
| W11 | privacy, whole page | Information website only. Does not say that details already shared with connections cannot be recalled, and has no caste/religion consent wording. | §8 (cannot be recalled), §6 (caste consent). | 5, lawyer |
| W12 | help `:119` → `:130`; privacy `:68` → `:79`; contact `:161` → `:172` | "Avoid sending identity documents … in your first message". "Do not send … identity documents in an initial message". "Never share … identity documents through social messages". All imply documents may be sent later, or by email. | §8: never accept documents by WhatsApp or email. Members upload only through the secure form. | 5 |
| W13 | `website/src/pages/index.html:71–77` → `src/pages/index.astro:82–88`; `website/src/scripts/landing.js:6–14` → `public/assets/js/landing.js:6–14` | "What our users say": three fictional testimonials (Nethmi & Kavindu, Anjali & Dilan, Tharushi & Sameera), labelled "Illustrative sample reviews". | §10: invented testimonials are forbidden. | 5 (G22) |
| W14 | `website/src/partials/dialogs.html:31` → `src/components/Dialogs.astro:34`; privacy `:114` → `:125` | Sinhala can be chosen, but "Website content is currently in English". | §10: English and Sinhala at launch, with all Sinhala reviewed by a native speaker. | 5 (G19) |
| W15 | contact `:44–90` → `:55–101`; help `:306` → `:317` | Lists WhatsApp 076 676 9894 and email; no phone-call channel. Pages tell members not to share passwords or codes (security `:44` → `:55`) but never say staff will not ask for them. | §10: email, WhatsApp and phone on a new dedicated SIM. The site lists the official numbers and states that staff never ask for passwords or codes. Whether 076 676 9894 is that SIM is not recorded. | 5, owner |
| W16 | all pages and the product | No review-time promise anywhere. | §10: promise document and payment review within 48 hours at launch. | 5 |

## 2. Member product (the demo app at `/matrimony/`)

| ID | Where | What it does now | Owner decision | Stage |
| --- | --- | --- | --- | --- |
| P01 | `product/lib/matrimony.ts:15–20`; `product/lib/domain.ts:27`; `product/preview/matrimony.tsx:155` | One paid plan, "Matrimony membership": LKR 2,990 "per 30 days". LKR only, and the price is hard-coded. | §2: Starter, Premium 3 months and Premium 6 months, with LKR and USD prices. Store money in minor units with a currency and price version, and keep it configurable. | 4 (G02, O02) |
| P02 | `product/lib/matrimony-network.ts:64` (`interest`) | No request counting or caps. | §2: Starter 5 per day and 30 per month; Premium fair-use cap of 30 per day. | 3 (G03) |
| P03 | `matrimony-network.ts:63, 64, 66, 67, 69` | After a decline the sender can never re-send unless the person who declined "reopens", and then they can re-send at once. A withdrawn pending interest is deleted, so it can be re-sent at once. An ended connection can never be requested again ("An interest already exists"). | §4: the same person may send a new request 7 days after a decline or withdrawal. | 3 (G09, O05) |
| P04 | `matrimony-network.ts:69` (`revokeConnection`) | Ending a connection writes no log entry. | §4: log every withdrawal. | 3 |
| P05 | `matrimony-network.ts:20` (`unlocked`), `:65` (`accept`) | Contact details stay unlocked only while both members are paid: if either plan expires, both lose access. Accepting needs the sender to still be paid. | §3: the member whose plan expired loses contact details. The decisions do not say the still-paid member loses theirs too; the owner needs to answer this. | 3 (G10, O03) |
| P06 | `product/preview/matrimony.tsx:69`; `matrimony-network.ts:23–24, 38` | The view hides senders from unpaid members, but the whole network (names, contacts, photos, interests) sits in the browser as `window.__heartsNetwork`. | §4: sender blur is enforced on the server, and the browser never receives the sender's identity before payment. | 1–3 (G01, G14) |
| P07 | `matrimony-network.ts:28` (`photo:shared?p.photo:-1`); `matrimony.tsx:74` | Photo privacy is decided in the browser, and uploads are kept as data URLs in page memory. There is no separate blurred image. | §7: the server sends a separate blurred image, and originals stay in private storage. | 2–3 (G14) |
| P08 | `matrimony-network.ts:53–54`; `domain.ts:25–26`; `matrimony.tsx:177` | Reports are only "Open" or "Reviewed", with no auto-hide. Reasons offered: scam, harassment, false identity, consent concern, inappropriate content, other. There are no separate explicit content, minors or threats categories. | §7: serious categories (explicit content, minors, threats, scam) hide after 1 report; others after 3 reports from different verified members. Staff review every auto-hide, restore wrong ones and act on false reporting. | 3 (G15, O11) |
| P09 | `matrimony-network.ts:76` (`paymentReview`), `:54`; `product/lib/matrimony-trust.ts:25`; `matrimony.tsx:41` ("Review workspace") | One "reviewer" seat, picked from an in-page switcher, approves payments, documents and reports. No separate login and no two-step. | §9–10: only the owner approves payments, and the backup reviewer cannot open payment screens, enforced in the database. Each staff member has a separate account with two-step login. | 2, 4 (G05) |
| P10 | `matrimony.tsx:175` ("Transfer reference *", e.g. "FH-DEMO-1042"), `:74` | The member types any reference of 3+ characters, and approval is based on the uploaded receipt. | §9: each member gets a unique payment reference, and a plan activates only after staff match it in the actual bank or Wise statement. | 4 (G06) |
| P11 | `matrimony.tsx:175` (checkout dialog) | Payment instructions are for an LKR bank transfer only. | §9: diaspora members pay by international transfer to a USD account (SWIFT), or by Wise/PayPal-style payment with proof. | 4 |
| P12 | `matrimony.tsx:155` (button disabled when `s.paid&&s.plan===p.id`) | The same plan cannot be paid for while it is active. No upgrade, no last-7-days renewal, no lost-days warning, no expiry warning. | §3: an upgrade replaces the plan at once, after a lost-days warning; downgrades are blocked; same-tier renewal only in the last 7 days; warn before expiry. | 4 (G27, O06) |
| P13 | nothing about refunds anywhere in `product/` | The payment step has no refund statement and no confirmation. | §9: state the refund policy at the payment step and have the member confirm it. | 4 |
| P14 | `matrimony.ts:19`; `matrimony-network.ts:55, 79–80`; `product/app/matrimony/trust-workspace.tsx:23`; `matrimony.tsx:147, 155` | "Take ownership" costs a one-time LKR 1,500 fee. Removing the manager is free, but the candidate then only reaches the Trust, Membership and Contact pages, with the profile paused, until staff approve the fee (`matrimony-network.ts:26, 34`; `matrimony.tsx:76`). | §5: the candidate can take over by removing the manager. The manager loses access immediately and the paid time carries over. The decisions set no fee. | 2 (G07, O07) |
| P15 | `matrimony-trust.ts:15–16, 23`; `trust-workspace.tsx:15` | Invitations last 48 hours, with no single-use link. The candidate uses the fixed demo code, not a code sent to the contact the manager entered. There is no check that the candidate contact differs from the manager's, and no limit on "Renew demo invitation". | §5: single-use link, 24 hours, code sent to that phone or email, contacts must differ, a new link cancels the old one, and resends are limited. | 2 (G04) |
| P16 | `matrimony-network.ts:91` (`createDemoAccount`) | One account holds exactly one profile, so a manager cannot run several. There is no cap. | §5: up to 3 profiles per manager, more only with owner approval; one plan and one set of limits per profile. | 1–2 (G23) |
| P17 | `matrimony.tsx:141, 145, 149, 154`; `trust-workspace.tsx:14` | Publishing copy says "NIC approval". The manager's document step says "NIC / passport". No driving licence option. | §5: NIC, passport or driving licence. | 2 (G12) |
| P18 | `matrimony.tsx:128–129`; `matrimony-trust.ts:9` | A fourth badge, "Selfie reviewed" (from the seed `verified` flag), and an "Identity verified · demo" badge that needs a selfie. | §5: exactly three badges (Manager verified, Candidate confirmed, Candidate identity verified), worded "identity document reviewed". | 2 (G12, O09) |
| P19 | `matrimony.ts:50` (`candidatePhone`); `product/app/matrimony/profile-fields.tsx:14` | The candidate's phone, entered by the manager, has no "not verified by candidate" label. | §4: label it until the candidate confirms. | 2–3 |
| P20 | `matrimony-network.ts:5` (`contact:{email,phone}`), `:61`; `matrimony-trust.ts:59` (`canReadShared`) | One contact record per profile. The candidate's `privateDetails` switch controls what the manager can read, not what connections receive. No per-field restriction. | §4: both the manager's and the candidate's details are shared after mutual acceptance by default, and the candidate can restrict this in privacy settings. | 3 (G11, G26) |
| P21 | `matrimony.tsx:122–123`; `matrimony-network.ts:65` | Accepting records only the status and time. Nothing records which details were shared. | §4: the log records exactly what was shared and when. | 3 |
| P22 | `matrimony.tsx:49` (field), `:167` (filter) | Caste is a free-text field, "Caste / community (optional)", with no consent step and no "Prefer not to say" option. | §6: explicit consent when entered, "prefer not to say", never shown to anonymous visitors, removable any time. Filtering is allowed. | 2–3 (G13) |
| P23 | `profile-fields.tsx:14, 16` | Income is shown as plain "Income". | §6: labelled "self-declared". The ranges already match. | 3 |
| P24 | no "engaged" or "married" status anywhere in `product/` | Pausing exists (`matrimony.tsx:156`), but there is no "engaged or married" option. | §7: marking engaged or married hides the profile and ends the plan, after a clear warning that remaining time is forfeited. | 3 (G16) |
| P25 | `matrimony-network.ts:82`; `matrimony.ts:81`; `matrimony.tsx:180` | "Delete profile" wipes the account and its interests immediately; nothing is kept. | §8: keep payment records, reports, blocks, the staff audit log and scrambled email/phone for 6 months. Delete documents 90 days after approval with a logged scheduled job. | 2, 5 (G17, O10) |
| P26 | `matrimony.tsx:41` ("Horoscope" menu item); `product/app/matrimony/horoscope-workspace.tsx`; `matrimony-network.ts:56–58`; `matrimony-trust.ts:57`; `matrimony.ts:66` | Horoscope workspace with birth details, compatibility requests and a fixed sample chart. | §1: horoscope features are out of scope for launch. Only the "how important is horoscope matching" preference stays. | 1 (G18) |
| P27 | `product/lib/site-locale.ts:1–2`; `product/app/matrimony/account-entry.ts:15` | Member entry offers English, සිංහල and தமிழ். "Sinhala and Tamil currently cover core navigation and setup labels." | §10: Tamil hidden until fully translated; English and Sinhala complete and reviewed at launch. | 5 (G19) |
| P28 | `domain.ts:1–8`; `matrimony.ts:5–14`; `matrimony.tsx:136` | Six fictional members, sample receipts, seeded boosts and featured profiles, and a "Private test · Sample accounts" switcher. | §10: no fake profiles at launch; synthetic data in staging only. | 1–2 (G01, G22) |
| P29 | `matrimony.tsx:41` ("Review workspace") | No control to pause new signups or document submissions. | §10: the admin side can pause signups or submissions when the review queue is overwhelmed. | 5 |

## 3. Demo features no owner decision covers

These are not conflicts. They need an owner decision before they are rebuilt or removed (spec G08, O08).

| ID | Where | Feature |
| --- | --- | --- |
| N01 | `matrimony.ts:18`; `matrimony-network.ts:76–77, 96`; `matrimony.tsx:41, 150` | Paid "Profile boost": LKR 700 for 24 hours of highlighted placement. |
| N02 | `matrimony-network.ts:52`; `matrimony.tsx:129, 136` | "Featured" profiles: the reviewer can feature a profile for 7 days. |
| N03 | `matrimony-network.ts:18`; `matrimony.ts:16` | Shortlist limits: 3 before verification, 20 after, unlimited when paid. |
| N04 | `matrimony-network.ts:28, 39` (`canBrowse`) | Any member who has created a profile can browse, verified or not. The decisions only describe verified members browsing. |
| N05 | `matrimony-trust.ts:9, 24` | The candidate identity badge needs a selfie as well as the document. The decisions do not mention selfies (O09). |
| N06 | `matrimony.ts:47`; `matrimony-network.ts:28` | Family details (parents' names and jobs, siblings) are shown to all members. The decisions do not cover their visibility (O13). |

## 4. Other accuracy issues (not owner-decision conflicts)

To fix with the copy in Stage 5 unless noted.

| ID | Where (demo → site) | Issue |
| --- | --- | --- |
| X01 | help `:77` → `:88` | "Account registration is not available on this website yet", but every Join button opens sign-up (demo) or `/app/` (new site). |
| X02 | terms `:79` → `:90`; privacy `:63` → `:74`; security `:72` → `:83` | Legal and security pages say there is no registration, verification or payment. They describe a website only, not the product (G21). |
| X03 | `website/src/pages/labs/index.html:80, 91, 100` → `src/pages/labs/index.astro:91, 102, 111` | "Favorite Hearts user surveys", "Cause and effect research" and "Behavioral analysis" describe research that does not exist yet (spec 11.3). |
| X04 | privacy `:114` → `:125` | Describes a session-storage welcome flag. The site now opens preferences only from the footer (spec 11.3). |
| X05 | `website/site.config.json:3` → `site.config.json:3` | `siteUrl` still points at the old preview host (`…chatgpt.site`), which feeds canonical URLs, the sitemap and social tags. |
| X06 | `product/lib/support-channels.ts:2` | Support channels in the app are empty, while the site lists WhatsApp and email (G20). |
| X07 | `packages/shared/src/contact.ts:17` (new scaffold) | Comment says "the format Supabase Auth expects". The stack uses Better-Auth (doc nit, Stage 1). |

## 5. Checked and already consistent

- **No chat.** The product rejects chat actions (`matrimony-network.ts:68`); pricing `:233` and help `:147` say there is no in-app chat (§1).
- **Free publication after verification.** Publishing needs a phone check and an approved document (`matrimony-network.ts:16, 59`; `matrimony.ts:16`) (§1, §5). Document types are covered in P17.
- **Unpaid members cannot send or accept** (`matrimony-network.ts:49, 64–65`). Unpaid verified members receive interests without seeing who sent them; only age and job are shown (`:24, :38`) (§1, §4). Server enforcement is P06.
- **Mutual acceptance** comes before contact details and the private gallery (`matrimony-network.ts:20, 65`; help `:154`) (§4).
- **Withdrawing or blocking** removes both sides' access (`matrimony-network.ts:50, 69, 70`) (§4). The log is P04 and the cooldown P03.
- **Guardian-managed profiles.**
  - A manager may publish with candidate confirmation optional (`matrimony.ts:51–52`).
  - Profiles must be 18+ and the manager declares authority (`domain.ts:16`; `matrimony.ts:35`).
  - The candidate can decline, withdraw consent or remove the manager, and the manager loses access at once (`matrimony-trust.ts:17, 20–21`; `matrimony-network.ts:25, 32`).
  - Withdrawing consent hides the profile and ends its connections in one step (`matrimony-network.ts:46`), close to the §4 one-click takedown. It works only after the candidate has joined through an invitation.
  - Takeover keeps the plan expiry (`matrimony.ts:19`) (§5). The fee is P14.
- **Photos.**
  - Up to 5, including the cover (`matrimony.tsx:74, 154`).
  - The cover can be shown before acceptance and the gallery only after it (`matrimony-network.ts:21`) (§6, §7). Real blurring is P07.
- **Profile fields.**
  - Income uses ranges with "Prefer not to say" (`profile-fields.tsx:16`).
  - Filtering by caste is allowed (`matrimony.tsx:167`).
  - The horoscope preference field stays (`matrimony.ts:45`) (§1, §6).
- **Pause and renewal.**
  - Members can pause or hide their profile (`matrimony.tsx:156`; `matrimony-network.ts:60`) (§7).
  - There is no automatic renewal ("Manual renewal", `matrimony.tsx:155`) (§3).
- **No invented bank details.** The demo shows "To be confirmed before launch" (`matrimony.tsx:175`) (§9).
- **Badge wording.** "Government verified" appears nowhere (§5).
- **Horoscope copy on the website** says the feature is not available (pricing `:233`, help `:281`) (§1).
- **No Tamil on the website.** The language dialog offers English and Sinhala only (`dialogs.html:18–25`) (§10).
- **New scaffold.** `apps/api`, `apps/member` and `packages/shared` hold no plan, price, invitation or badge rules yet. The job plan matches §8: 90 days and 6 months (`apps/api/src/jobs/boss.ts:6–7`).

## 6. Spec conflict register cross-reference

| Spec | Rows here |
| --- | --- |
| G01 | P06, P09, P28 |
| G02 | P01, W01 |
| G03 | P02 |
| G04 | P15 |
| G05 | P09 |
| G06 | P10 |
| G07 | P14 |
| G08 | N01–N03 |
| G09 | P03 |
| G10 | P05 |
| G11 | P20 |
| G12 | P17, P18, N05 |
| G13 | P22 |
| G14 | P06, P07 |
| G15 | P08 |
| G16 | P24 |
| G17 | P25 |
| G18 | P26 |
| G19 | P27, W14 |
| G20 | W15, X06 |
| G21 | W08–W11, X02 |
| G22 | W13, P28 |
| G23 | P16 |
| G26 | P20 |
| G27 | P12 |

Not rule conflicts, so not repeated here: G24 (country lists and validation bounds), G25 (atomic saves) and G28
(report data visible beyond the reviewer). They stay on the Stage 3 checklist in `BUILD-PROGRESS.md`.
