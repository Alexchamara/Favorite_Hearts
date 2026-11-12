import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Development only: which API the dev server proxies /api/admin to, and its own port (docs/ADMIN-PANEL-PLAN.md).
const apiOrigin = process.env.API_ORIGIN ?? 'http://localhost:8787';
const port = Number(process.env.ADMIN_PORT ?? 5190);

/**
 * The built admin site's Content Security Policy as the page's first tag (layer 7). The host's _headers sends the
 * same policy as a header, with frame-ancestors, which a meta tag cannot carry. Everything comes from this site
 * itself: the API is reached through the site's own /api/admin proxy, so connect-src is 'self' only. Images: the
 * short-lived signed document and receipt links from R2 (data: URLs in the sandbox). Scripts: this site and
 * Cloudflare Turnstile only, never inline. The dev server leaves it out (React Fast Refresh needs inline code).
 */
function contentSecurityPolicy(): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self' https://challenges.cloudflare.com",
    'frame-src https://challenges.cloudflare.com',
    "connect-src 'self'",
    "img-src 'self' data: blob: https://*.r2.cloudflarestorage.com",
    // Radix adds small style elements while a dialog is open; scripts stay strict.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join('; ');
  return {
    name: 'fh-admin-content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' }],
  };
}

/**
 * The admin site reuses the member app's design system and building blocks (its stylesheets, Radix wrappers, form
 * fields, labels) under `@/` (apps/member/src), and keeps its own sign-in, API client and screens under `@admin/`.
 * Nothing from the member app's sign-in or queries is imported here.
 */
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
  resolve: {
    alias: {
      '@admin': fileURLToPath(new URL('./src', import.meta.url)),
      '@': fileURLToPath(new URL('../member/src', import.meta.url)),
    },
  },
  server: {
    port,
    strictPort: true,
    fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] },
    hmr: { clientPort: port },
    // Same origin as the built site behind its proxy (functions/api/admin): cookies stay on this host.
    proxy: { '/api/admin': { target: apiOrigin, changeOrigin: false } },
  },
  preview: { port, strictPort: true, proxy: { '/api/admin': { target: apiOrigin, changeOrigin: false } } },
  build: { outDir: 'dist', sourcemap: true },
});
