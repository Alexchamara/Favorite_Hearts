import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Development only: which API the dev server proxies to, and its own port. The sandbox
// (npm run dev:sandbox) uses the in-memory API on :8788 and serves this app on :5174.
const apiOrigin = process.env.API_ORIGIN ?? 'http://localhost:8787';
const port = Number(process.env.MEMBER_PORT ?? 5173);

/**
 * The built app's Content Security Policy, as the first tag in its page, so it travels with the files wherever they are
 * hosted (the static host removes the website's own policy under /app/, see apps/website/public/_headers). Scripts come
 * only from this site and Cloudflare Turnstile; API calls go to this site or VITE_API_URL; photos are short-lived signed
 * links straight from R2 (data: URLs in the sandbox). The dev server leaves it out: React Fast Refresh needs inline code.
 */
function contentSecurityPolicy(apiUrl: string | undefined): Plugin {
  const api = apiUrl ? new URL(apiUrl).origin : null;
  const policy = [
    "default-src 'self'",
    "script-src 'self' https://challenges.cloudflare.com",
    'frame-src https://challenges.cloudflare.com',
    `connect-src 'self'${api ? ` ${api}` : ''}`,
    "img-src 'self' data: blob: https://*.r2.cloudflarestorage.com",
    // Radix adds small style elements while a dialog is open; scripts stay strict.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  return {
    name: 'fh-content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' }],
  };
}

// The member app is served under /app/ next to the Astro website.
// In development /api is proxied to the local API so auth cookies stay same-origin.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), 'VITE_');
  return {
    base: '/app/',
    plugins: [react(), tailwindcss(), contentSecurityPolicy(env.VITE_API_URL)],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port,
      strictPort: true,
      // Cloudflare quick tunnels (cloudflared tunnel --url ...) are shared with testers during development.
      allowedHosts: ['.trycloudflare.com'],
      // Live reload talks to the dev server directly, also when the app is opened via the website (:4321/app/).
      hmr: { clientPort: port },
      proxy: {
        '/api': { target: apiOrigin, changeOrigin: false },
        '/health': { target: apiOrigin, changeOrigin: false },
      },
    },
    // `vite preview` (the built app, with its security policy) uses the same proxy.
    preview: { port, strictPort: true },
    build: { outDir: 'dist', sourcemap: true },
  };
});
