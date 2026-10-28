import type { APIRoute } from 'astro';
import { base, site } from '../lib/site';

// Not indexable until launch is approved (site.config.json "indexable").
export const GET: APIRoute = () =>
  new Response(
    'User-agent: *\n' + (site.indexable ? `Allow: /\nSitemap: ${base}/sitemap.xml\n` : 'Disallow: /\n'),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
