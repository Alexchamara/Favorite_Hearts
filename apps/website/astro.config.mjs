import { readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';

const site = JSON.parse(readFileSync(new URL('./site.config.json', import.meta.url), 'utf8'));

// Fully static output: plain HTML + the page scripts the design already had. No islands,
// no client framework, so the public site has almost no JavaScript and a tiny attack surface.
export default defineConfig({
  site: site.siteUrl,
  output: 'static',
  trailingSlash: 'ignore',
  build: { format: 'directory', assets: '_astro' },
  compressHTML: true,
  devToolbar: { enabled: false },
});
