import type { APIRoute } from 'astro';
import { base } from '../lib/site';
import { LANGS, pathIn } from '../lib/i18n';
import { ARTICLES } from '../lib/articles';

// Every page under src/pages except 404 and endpoints, in each language: pages under [...lang] exist in English and
// under /si/, and [article] is each newsroom article. Each entry names its other-language version (hreflang).
const files = Object.keys(import.meta.glob('./**/*.astro'));
const routes = files
  .filter((f) => !f.endsWith('/404.astro'))
  .map((f) => f.replace(/^\.\//, '/').replace('/[...lang]', '').replace(/index\.astro$/, '').replace(/\.astro$/, '/'))
  .flatMap((r) => (r.includes('[article]') ? ARTICLES.map((a) => r.replace('[article]', a.slug)) : [r]))
  .sort();

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const alternates = (route: string) =>
  [...LANGS.map((lang) => [lang, pathIn(lang, route)]), ['x-default', route]]
    .map(([hreflang, path]) => `<xhtml:link rel="alternate" hreflang="${hreflang}" href="${escape(base + path)}"/>`)
    .join('');

export const GET: APIRoute = () =>
  new Response(
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
      LANGS.flatMap((lang) =>
        routes.map((r) => `<url><loc>${escape(base + pathIn(lang, r))}</loc>${alternates(r)}</url>\n`),
      ).join('') +
      '</urlset>\n',
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
