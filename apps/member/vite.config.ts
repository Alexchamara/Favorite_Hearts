import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Development only: which API the dev server proxies to, and its own port. The sandbox
// (npm run dev:sandbox) uses the in-memory API on :8788 and serves this app on :5174.
const apiOrigin = process.env.API_ORIGIN ?? 'http://localhost:8787';
const port = Number(process.env.MEMBER_PORT ?? 5173);

// The member app is served under /app/ next to the Astro website.
// In development /api is proxied to the local API so auth cookies stay same-origin.
export default defineConfig({
  base: '/app/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port,
    strictPort: true,
    // Live reload talks to the dev server directly, also when the app is opened via the website (:4321/app/).
    hmr: { clientPort: port },
    proxy: {
      '/api': { target: apiOrigin, changeOrigin: false },
      '/health': { target: apiOrigin, changeOrigin: false },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
});
