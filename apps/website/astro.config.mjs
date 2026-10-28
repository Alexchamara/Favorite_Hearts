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
  // Development only: http://localhost:4321 serves the website and forwards
  // /app/* to the member app (Vite, :5173) and /api/* + /health to the API (:8787),
  // so Join buttons and sign-in work from one address, like in production.
  vite: {
    server: {
      proxy: {
        '/app': { target: 'http://localhost:5173', changeOrigin: false },
        '/api': { target: 'http://localhost:8787', changeOrigin: false },
        '/health': { target: 'http://localhost:8787', changeOrigin: false },
      },
    },
  },
});
