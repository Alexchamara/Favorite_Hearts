# Favorite Hearts: Owner Decisions

Draft v1, 19 October 2026. Every rule below is a provisional default until the owner, a lawyer and an accountant have approved it. Items marked [RECOMMENDED, NOT YET DECIDED] are suggestions, not decisions.

This file overrides anything that conflicts with it in the demo, the pricing page, the FAQs and the terms. Transcribed from Appendix A of `docs/Favorite-Hearts.pdf` (Parts 1 and 2). Engineering detail, conflicts and open questions are in that handbook (chapters 14–15).

## Part 1: Owner decisions

### 1. Business model

- Matrimony only. No dating, no chat. Horoscope features are out of scope for launch (the "how important is horoscope matching" preference field stays).
- Creating and publishing a profile is free, once verification is complete (see section 5).
- Payment unlocks sending requests, seeing who sent interest, and accepting requests.
- Unpaid verified members can browse all published profiles and receive interests, but sender identities stay blurred, they cannot send requests, and they see no contact details.
- The old pricing page, FAQ text and terms that say a paid subscription is needed to publish are wrong and must be replaced. The old Essential/Signature/Premier tiers and their human services (profile presentation help, personal profile review, priority support, onboarding guidance) are dropped.

### 2. Plans and prices

| Plan | Length | Limits | Local price | Diaspora price |
| --- | --- | --- | --- | --- |
| Starter | 1 month | 5 requests/day, 30/month | LKR 3,000 | USD 20 |
| Premium | 3 months | "Unlimited", fair-use cap 30/day | LKR 8,500 | USD 55 |
| Premium | 6 months | "Unlimited", fair-use cap 30/day | LKR 15,000 | USD 100 |

- Store money in minor units with currency and a price version. Prices must be configurable, never hard-coded.
- Advertise Premium as "unlimited requests (fair use applies)" and state the real daily cap in the terms.
- Who gets which price: the member selects their country of residence. Staff compare it with the payment source (local LKR bank transfer vs international transfer, Wise or PayPal) and with the verified document. A Sri Lankan NIC does not show residence, so any mismatch is a flag for staff review, not an automatic rejection.
- Each profile has its own plan and its own limits. A manager running several profiles buys a plan per profile.

### 3. Plan rules

- No automatic renewal. Payment is manual (see section 9).
- Replacing a plan: a new plan replaces the current one immediately, but only as an upgrade (Starter to Premium). Downgrades are blocked while a plan is active. Unused days on the old plan are lost, and the member must see a clear warning stating exactly what they lose before paying.
- Renewing the same tier is allowed only in the last 7 days of the current plan. The new term is counted from the approval date, even if the old plan has already expired.
- When a plan expires, the member can no longer see anyone's contact details or social handles, including existing connections. Connections stay on record, and details reappear on renewal.
- Show members a clear expiry warning before it happens, with the date and what will be hidden.
- [RECOMMENDED, NOT YET DECIDED] Keep access active for up to 3 days while a renewal with proof is pending, so slow staff review does not penalise a member who paid on time.

### 4. Requests and connections

- A request becomes a connection only when both sides accept. If someone declines, nothing unlocks.
- A connected member can withdraw at any time. Withdrawing removes both sides' access to each other's details from then on. Log every withdrawal.
- After a decline or withdrawal, the same person may send a new request after 7 days.
- [RECOMMENDED, NOT YET DECIDED] Cap re-sends at 2 attempts per pair, and the receiver can always block.
- After both accept, all contact details and social handles are shared by default (the manager's and the candidate's). The candidate can restrict this in privacy settings.
- This applies equally to profiles whose candidate has not confirmed yet, so unconfirmed candidates have their details shared on the manager's word. This is a high-risk decision: the lawyer must approve it, the guardian must confirm in the terms that they have the candidate's permission, the log must record exactly what was shared and when, and the candidate gets a one-click takedown once they appear.
- A candidate's phone number on a guardian-managed profile does not need to be verified, but it must be labelled "not verified by candidate" until the candidate confirms.
- Sender blur is enforced on the server. The browser never receives the sender's identity before payment, and styling-only blur is not acceptable.

### 5. Profiles, managers and verification

**Self-managed profile.** Published only after both: staff approve an identity document, and the member verifies their phone by SMS code.

Accepted documents: NIC, passport, or driving licence. Badge wording must say "identity document reviewed", never "government verified".

Signup: by SMS or by email, the member's choice.

**Guardian-managed profile:**

- A manager may publish for a candidate. Only the manager's identity document is reviewed, and the manager verifies their own phone.
- Each manager may run up to 3 profiles. More only with the owner's approval. Agencies are not supported in v1.
- The manager invites the candidate by link. The link is single-use, expires in 24 hours, and requires a code sent to the phone or email the manager entered for the candidate. The candidate contact must differ from the manager's. Sending a new link cancels the old one, with a limit on resends.
- The candidate can accept and confirm, verify their identity later, set privacy options, decline, or take over the profile by removing the manager.
- On takeover, the manager's paid time carries over to the candidate until it expires. The manager loses all access to that profile immediately, including requests, connections and contact details. This needs its own test.
- Three badges, each meaning exactly one thing: Manager verified, Candidate confirmed, Candidate identity verified.
- Age: minimum 18. For guardian-managed profiles age is enforced by the manager's declaration only, backed by the terms and the report system. This is HIGH RISK: nothing technical stops a minor being listed. The lawyer must approve this before launch.
- [RECOMMENDED, NOT YET DECIDED] Ask the candidate to confirm their date of birth when they join via the invite link.

### 6. Profile fields and sensitive data

- Religion, marital status: kept as in the demo, optional where possible.
- Caste: optional, shown on the profile if the member chooses, and others can filter by it. Requires explicit consent when entered, a "prefer not to say" option, never visible to anonymous visitors, removable any time. Likely special-category data: lawyer to confirm.
- Income: optional, entered as a range, shown on the profile, labelled "self-declared".
- Photos: up to 5 per profile, one of them the cover photo.

### 7. Photos, reporting and moderation

- The member can switch the cover photo on or off for others. The other photos stay blurred until both sides accept.
- The blur is real: the server sends a separate blurred image to anyone not yet allowed, and originals stay in private storage.
- No photo is visible to anonymous visitors.
- Photos appear immediately. Staff review only reported photos. During document review, the reviewer may glance at the cover photo at no extra cost.
- Reports: serious categories (explicit content, minors, threats, scam) hide the content after 1 report. All others hide after 3 reports from different verified members. Staff review every auto-hide quickly, and wrongly hidden content is restored. Repeated false reporting has consequences.
- Involving minors: staff need a written procedure, and the lawyer advises on reporting obligations.
- Pause and finish: a member can pause or hide their profile at any time. A member can also mark themselves "engaged or married", which hides the profile and ends the plan. Warn them clearly that remaining plan time is forfeited.

### 8. Data retention and deletion

- Verification documents: kept 90 days after approval, then deleted automatically. Rejected documents and documents of members who delete their account follow the same limit. A scheduled job does this, and every run is logged.
- After approval keep only: document type, reviewer, date and decision.
- Account deletion: the profile disappears immediately. Profile text, photos, contact details, social handles and documents are deleted. A limited set of records is kept for 6 months: payment records, reports and blocks, the audit log of staff actions, and a scrambled form of email and phone to stop banned users re-registering.
- The accountant must confirm whether payment records need to be kept longer than 6 months. Keep them separate from member profiles, with no photos or documents.
- The privacy policy must list exactly what is kept and for how long, and state that details already shared with connections cannot be recalled.
- Never accept documents by WhatsApp or email. Members upload only through the secure form.

### 9. Payments and refunds

- Manual bank transfer. Local: LKR transfer. Diaspora: international transfer into a USD account (SWIFT), or manual Wise/PayPal-style payment, with proof uploaded.
- Each member gets a unique payment reference. A plan activates only after staff match the payment to the reference in the actual bank or Wise statement, not just the uploaded image.
- Only the owner approves payments. The backup reviewer has no access to payment screens. This is enforced by permissions in the database, not by hidden buttons.
- Approval must be transactional and idempotent. A duplicate approval can never activate a plan twice.
- PayPal-style payments can be disputed later. The terms must say what happens to the plan if that occurs.
- Refunds: none once a plan is activated, except duplicate payments, mistaken payments, and failures on our side. Say this on the pricing page and at the payment step, and have the member confirm they read it. If a member is suspended for breaking the rules, remaining time is lost, and the terms say so.
- Do not invent bank details. The owner supplies real ones.

### 10. Staff, support and launch

- Reviewers: the owner plus one trusted backup. Each has a separate account with two-step login. The backup signs a confidentiality agreement and access is removed immediately if they leave.
- The backup handles documents and reports, not payments.
- Promise review of documents and payments within 48 hours at launch, and tighten it only after real volume shows it is realistic.
- The admin side needs a control to pause new signups or document submissions if the review queue is overwhelmed.
- Plan a recovery path for the owner's own admin account if the phone with two-step login is lost.
- Support channels: email, WhatsApp (WhatsApp Business app, two-step verification on) and phone, all on a new dedicated SIM. The site lists the official numbers and states that staff never ask for passwords or verification codes.
- Launch: open to everyone from day one. The site will look empty at first. Fake profiles or invented testimonials are forbidden. Plan a real founding group before opening if possible, and load-test before launch.
- Languages: English and Sinhala at launch. Tamil is hidden (not deleted) until fully translated. A trusted native Sinhala speaker reviews all Sinhala text before launch. Export all text to a spreadsheet (English and Sinhala columns) so the reviewer never touches code. Terms and privacy wording in Sinhala also go to the lawyer, and one language is named the official version.

## Part 2: Risks and items needing a human

### Lawyer must review before launch

1. Age rule for guardian-managed profiles (manager's declaration only).
2. Default sharing of an unconfirmed candidate's details after mutual acceptance.
3. Retention periods (90 days documents, 6 months other records) and the deletion list.
4. Caste and religion as sensitive data, and consent wording.
5. Terms, privacy policy and refund terms, in English and Sinhala.
6. Obligations if content involving a minor is reported.
7. Whether Sri Lanka's data protection law applies and what registration or duties follow.

### Accountant must confirm

1. How long payment records must be kept.
2. Tax treatment of receiving member payments, especially into a personal account.

### Business risks to decide knowingly

- Business is not registered and registration is planned after launch. Terms and policies must name a legal operator, service accounts and contracts will need transferring later, and the owner is personally liable until then.
- Payments go into a personal bank account. This can cause tax and compliance problems, and banks may question many incoming transfers. Wise and PayPal personal accounts often forbid business use. Check each provider's terms and confirm they can receive these payments.
- Budget under USD 500 for building and reviewing, against an open day-one launch holding identity documents, private photos and payment proofs. The owner ranked priorities: (1) independent developer security review, (2) enough Replit credits, (3) developer account setup, (4) lawyer review. Recommendation: move the lawyer above account setup, at least for a short review of the lawyer points above.
- Single payment approver. If the owner is unavailable, paid members wait.
- Account ownership rule: every account (Supabase, Cloudflare, GitHub, email provider, domain) is created under the owner's email or business with the owner as owner. The developer is added as a collaborator and removed when the job ends.

### Developer review checklist (independent, before launch)

- Database access rules tested with real separate accounts: anonymous, member A, member B, candidate, manager, revoked manager, reviewer, owner.
- The blur and the sender-hiding cannot be bypassed from the browser.
- Contact details and private photos are never sent before mutual acceptance.
- Blocks, withdrawals, expiry and takeover remove future access immediately.
- The backup reviewer cannot open payment screens, even by calling the API directly.
- Payment approval is idempotent under simultaneous clicks.
- Upload spoofing, oversize files and unauthorised file paths fail safely.
- Admin two-step login is enforced by the backend, not only the interface.
- Invite links are single-use, expire in 24 hours, and cannot be replayed.
- Rate limits on sign-in, codes, requests, invitations, reports and uploads.
- Document deletion at 90 days actually runs, and backups restore both the database and the files.
- Real emails and real SMS arrive, including to Sri Lankan and overseas numbers.
