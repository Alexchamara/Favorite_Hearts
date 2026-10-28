# Favorite Hearts — integrated matrimony website and interactive demo

Open the private hosted preview supplied with this package, or extract the ZIP and open `START-HERE.html`.

This combines the supplied marketing website with the supplied **matrimony-only** interactive product. All 24 Join now / Get started controls use the same complete entry flow. No dating application, dating route, or mode picker is included.

## Run the supplied build

No installation or build is needed to serve the included files:

```sh
node scripts/serve.mjs
```

Then open **http://localhost:8080**. Node 22 or newer is recommended. Serve `dist/` as the website root on any static web host. Both `/` and `/matrimony/index.html` work directly. Do not deploy this source directory as the document root.

For a desktop file preview, open `dist/index.html`. Links and assets are relative. Mobile file viewers may not execute JavaScript or allow navigation between extracted files; use the hosted preview for phones. A local server is the supported engineer preview.

## Edit and rebuild

Requirements: Node 22+, npm, Python 3.10+ (`python3` on PATH). Initial dependency installation requires internet access.

```sh
npm ci
npm run build
npm test
npm start
```

- `website/src/pages/`: the landing page and 20 information/article pages.
- `website/src/partials/`: shared navigation, footer and dialogs.
- `website/src/scripts/` and `website/src/styles/`: website behaviour and design.
- `website/site.config.json`: site URL, join destination, contacts and social links.
- `product/preview/entry.tsx`: matrimony account entry, mounting, logout and website return.
- `product/preview/matrimony.tsx`: the original portable matrimony product UI.
- `product/app/matrimony/`: account screens and matrimony subcomponents.
- `product/lib/`: profile, privacy, membership, matching and verification simulation logic.
- `product/components/ui/`: the UI components actually used by the product.
- `scripts/build.mjs`: reproducible website and product build; compiles both Tailwind versions and bundles React locally.
- `dist/`: complete ready-to-serve output, with local images, fonts, CSS and JavaScript.
- `tests/`: integration checks and adapted original matrimony regression tests.
- `docs/`: handover, source inventory, validation and dependency licences.

The marketing site retains Tailwind 3 and the product retains Tailwind 4. Each runs on its own page, avoiding conflicting resets and component styles. The root package-lock pins both. No CDN is needed to run the compiled output.

## Explore

Click **Join now**, select country/language and continue. Sign up with invented test details, or choose **Explore sample accounts**. The simulated verification code is **246810**. Sample login: `demo@favoritehearts.test` / `LoveDemo123`.

Within the sample product use the account selector and Review workspace to inspect both sides of interests, verification and payment approval. These controls intentionally simulate multiple roles.

## Status

This is an integrated interactive DEMO, not a production account service. Account data, password entries, uploaded sample files and product changes live in page memory and are cleared on reload or when leaving the app. Theme/language preferences can use browser storage. Use fictional data only.

There is no deployed database, real email/SMS, real identity check, real payment processing or server-enforced admin authorization. Contact forms/social destinations retain the supplied website behaviour. Horoscope screens remain as supplied demonstrations, not a validated matching service. See `docs/ENGINEERING-HANDOVER.md` before production development.
