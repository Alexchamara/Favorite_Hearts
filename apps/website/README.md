# Public website (Astro)

Static marketing site: 21 pages (incl. 10 newsroom articles) + 404, sitemap and robots.
Converted from the demo (`reference/Favorite-Hearts-Integrated/website/`) with **no content
changes**: same HTML, CSS, scripts and images. No client framework or islands — the only
JavaScript is the small page scripts the design already had.

```
src/pages/**/index.astro   one file per route (page HTML kept as-is)
src/components/            Header, Navigation, Footer, Dialogs (old partials) + Seo (meta/JSON-LD)
src/lib/site.ts            site.config.json + css()/js() versioned asset URLs
src/pages/sitemap.xml.ts   sitemap from the page files
src/pages/robots.txt.ts    Disallow all while site.config.json "indexable" is false
src/pages/assets/js/site-config.js.ts   public config for site.js (Join button target)
src/styles/tailwind.css    Tailwind 3 input (tw- prefix, preflight off)
public/assets/             images, fonts, page CSS (css/) and scripts (js/)
public/_headers, _redirects  security headers + legacy redirects (Cloudflare Pages format)
```

```sh
npm run dev:website                 # http://localhost:4321
npm run build -w @fh/website        # -> apps/website/dist
```

Follow-ups (Stage 5, not part of scaffolding):

- `siteUrl` still points at the old preview host — change when the domain is bought.
- Join buttons now go to `/app/` (the new member app) instead of the old demo.
- Pricing, Help, Terms and Privacy copy conflict with `docs/OWNER-DECISIONS.md` (spec 11.3).
- Sample testimonials must go before launch (spec 11.2, G22).
- Optional later: move the page CSS from Tailwind 3 to Tailwind 4 like the member app.
