import type { APIRoute } from 'astro';
import { site } from '../../../lib/site';

// Public config read by site.js (Join buttons, social links). Public values only.
export const GET: APIRoute = () =>
  new Response(
    'window.FH_CONFIG = ' + JSON.stringify({ registrationUrl: site.registrationUrl, social: site.social }) + ';\n',
    { headers: { 'Content-Type': 'text/javascript; charset=utf-8' } },
  );
