import type { APIRoute } from 'astro';
import { base } from '../lib/site';

// Every page under src/pages except 404 and endpoints.
const files = Object.keys(import.meta.glob('./**/*.astro'));
const routes = files
  .filter((f) => !f.endsWith('/404.astro'))
  .map((f) => f.replace(/^\.\//, '/').replace(/index\.astro$/, '').replace(/\.astro$/, '/'))
  .sort();

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const GET: APIRoute = () =>
  new Response(
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      routes.map((r) => `<url><loc>${escape(base + r)}</loc></url>\n`).join('') +
      '</urlset>\n',
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
