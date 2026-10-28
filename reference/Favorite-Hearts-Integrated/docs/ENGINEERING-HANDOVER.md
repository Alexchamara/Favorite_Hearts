# Engineering handover — 18 October 2026

## Scope and source of truth

Inputs: user-supplied `1 website.zip` and `1. App.zip`. This package preserves the marketing pages and the portable matrimony demo from those archives. It is a new integrated deliverable; neither original ZIP was modified.

The supplied app has multiple historical representations. Its latest exported portable matrimony module (`source/combined-preview/matrimony.tsx`) is the source used here, together with the transitive UI/domain modules it imports. Unused legacy framework builds, dating application code, obsolete hosting identifiers and old deployment documentation are excluded. This is all source required for the integrated demo, not a production backend migration.

## Routing and integration

| Entry | Destination |
| --- | --- |
| Landing and all information-page join controls | `matrimony/index.html` relative to website root |
| Direct matrimony URL | Country/language → signup/login → simulated OTP → product |
| Matrimony logo / account Home | Website `index.html` |
| Matrimony logout | Matrimony account entry |
| Existing marketing navigation | Original information/article pages |

Website `site.js` resolves the configured registration route from its own asset URL, so nested article pages use the same app destination. Generated HTML uses explicit relative asset and index paths. Product CSS is isolated from the marketing pages by a separate document. React portals remain inside the matrimony root.

## Preserved demo capabilities

Country/language entry; signup/login/recovery and simulated OTP; self/family-managed profile setup; required profile fields; discovery/filtering; interests and mutual connections; shortlist; privacy and contact/photo reveal rules; membership and sample bank-transfer proof review; verification badges; candidate/manager access and invitation simulations; ownership transfer; profile boosts; report/block controls; admin/reviewer screens; theme switching; and the supplied horoscope demonstration.

Business rules were preserved from the uploaded version, including its free-publishing / paid-connection model. These may differ from older discussions. No pricing, entitlement or consent policy was silently replaced during this integration. Have the product owner approve those rules before engineering a live service.

## Runtime boundaries

- `window.__heartsNetwork` holds the demo network in memory. There is no shared or durable database.
- The in-memory account map and visible OTP are for walkthroughs. Passwords are not hashed or sent to an identity provider. Do not collect real credentials.
- Uploaded files use FileReader data URLs in page memory. No secure object storage, malware scan, signed access links or retention policy exists.
- Client-side roles and sample account switching are demo controls, not authorization. Never expose them as real admin permissions.
- Payment proof and approval do not verify bank transactions. No payment processor is connected.
- Verification and horoscope results are simulated; no NIC/liveness provider or validated horoscope provider is connected.
- Navigating back to the marketing site or reloading clears the product session. This matches a browser-memory demo; it is not account persistence.

## Production engineering work

Implement durable users/profiles/interests/entitlements and uploads; real authentication/recovery; server-side permission and privacy checks; isolated admin authentication and audit trail; backend validation and rate limiting; private file delivery and abuse handling; real consent/invitation delivery; transactional payment review; backups, monitoring and deployment configuration. Replace demo network mutations with API calls while preserving the UI and approved rules. Verify marketing claims, testimonials, contacts, terms and policy pages before public launch.

## Build and delivery

Use root `npm ci`, `npm run build`, `npm test`. Node 22+ and Python 3.10+ required. Website Tailwind 3 is installed under alias `tailwindcss3`; the React product uses Tailwind 4. `dist/` is the deployment artifact. `docs/bundle-inputs.json` lists every actual bundle input. Dependency licences are included under `docs/licenses/`.

The ZIP omits node_modules, Git history, credentials and internal hosting identity. Restore dependencies from package-lock.json. The already-built website runs without npm installation.

## Verification limits

Automated tests exercise DOM events in jsdom and business logic in Node. This environment did not provide the supported browser QA capability; no claim of actual mobile/Safari/Chrome visual testing is made. Engineers should verify layout, focus, uploads and modal scrolling in real browsers at 360, 390, 768 and 1440px before launch.
