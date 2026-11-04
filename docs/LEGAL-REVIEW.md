# Legal and accounting review

31 October 2026. What the owner's lawyer and accountant must check before launch (OWNER-DECISIONS Part 2). The
drafts are the website's [terms](../apps/website/src/pages/[...lang]/terms/index.astro) and
[privacy policy](../apps/website/src/pages/[...lang]/privacy/index.astro) (live at `/terms/` and `/privacy/`, marked "Draft for
legal review"; their words are `web.terms.*` and `web.privacy.*` in `packages/shared/src/i18n/<language>/website.json`), and the refund points members confirm at the payment step
([`labels.ts`](../apps/member/src/features/billing/labels.ts), version `refund-v1`). English is the official version
(owner, 31 October 2026). Sinhala drafts of the legal wording inside the app are in the reviewer's spreadsheet
(`npm run text:export`, rows noted "Legal wording": the manager's declaration, the self-declaration, the caste consent,
the four refund points and the "cannot be undone" tick). The Sinhala terms and privacy policy (4 November 2026, Stage
5d) are at `/si/terms/` and `/si/privacy/`, marked draft like the English, with a notice that the English text is the
official version; the terms (§1) also say a Sinhala translation is provided for convenience and the English applies if
they differ. They are drafts by the developer, not a certified translation: the reviewer checks the Sinhala in the
spreadsheet's Website tab (rows noted "Legal wording"), and the lawyer then checks both versions say the same.

## To fill in

| Where | What |
| --- | --- |
| Terms §1 and §16, privacy §1 and §11 | The operator's legal name and address, shown as `[operator’s legal name and address]`. The business is not registered yet, so this is the owner personally until it is (Part 2, "Business risks"). |
| Terms §16 | Governing law and courts: the draft says Sri Lanka, keeping the protections of the member's own country. |
| Terms §15 | Any limit of liability: the draft only says limits apply as far as the law allows. |
| Privacy §5 | The SMS provider and the API host, once chosen (both BLOCKED on the owner). |

## Lawyer (Part 2, items 1–7)

| # | Point | Where it is in the drafts |
| --- | --- | --- |
| 1 | Age of a guardian-managed candidate rests on the manager's declaration only. | Terms §3 and §5; the manager ticks "The candidate is 18 or older, and I have their permission to create this profile and share their details after mutual acceptance." when creating the profile. |
| 2 | An unconfirmed candidate's details are shared on the manager's word after mutual acceptance; the candidate has a one-click takedown. | Terms §5 and §6; privacy §4. |
| 3 | Retention: documents 90 days after the decision; after a deletion, payment records with receipts, plan history, reports, blocks, the staff audit trail and a keyed hash of the sign-in email and phone kept 6 months. Documents of a deleted account are deleted at once (§8 says they "follow the same limit"). | Privacy §7; the rules are in `apps/api/drizzle/0011_safety_rules.sql`. |
| 4 | Caste and religion as sensitive data. The app's consent text: "I agree that this is shown on the profile to signed-in members and can be used in their filters." | Privacy §2, §4 and §8; the app's details form. |
| 5 | The terms, the privacy policy and the four refund points at the payment step, in English and Sinhala. | Terms §7–§10; privacy; the refund points are `billing.refundTerm.1`–`4` in `packages/shared/src/i18n/<language>/app.json`. |
| 6 | Obligations when content involving a minor is reported; the staff procedure. | Terms §12 (a report about a minor hides the profile at once). |
| 7 | Whether Sri Lanka's data protection law applies, and any registration or duties. | Privacy §8 points members to the data protection authority of their country; adjust once confirmed. |

## Accountant (Part 2)

| # | Point | Where |
| --- | --- | --- |
| 1 | How long payment records must be kept: the drafts and the retention sweep use 6 months after a deletion (`RETENTION_MONTHS` in `packages/shared/src/safety.ts`). | Privacy §7. |
| 2 | Tax treatment of member payments received into a personal account. | Not in the drafts. |
