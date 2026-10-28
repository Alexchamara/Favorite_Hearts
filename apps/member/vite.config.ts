import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The member app is served under /app/ next to the Astro website.
// In development /api is proxied to the local API so auth cookies stay same-origin.
export default defineConfig({
  base: '/app/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: false },
      '/health': { target: 'http://localhost:8787', changeOrigin: false },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
});
