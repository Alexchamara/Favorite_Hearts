import type { APIRoute } from 'astro';
import { site } from '../../../lib/site';

// Public config read by site.js (Join buttons, social links) and pricing.js (the API that serves the live plans).
// `apiUrl` is the same VITE_API_URL the member app is built with: empty means the API is served on this site's origin.
const apiUrl = (process.env.VITE_API_URL ?? '').replace(/\/$/, '');

export const GET: APIRoute = () =>
  new Response(
    'window.FH_CONFIG = ' + JSON.stringify({ registrationUrl: site.registrationUrl, social: site.social, apiUrl }) + ';\n',
    { headers: { 'Content-Type': 'text/javascript; charset=utf-8' } },
  );
