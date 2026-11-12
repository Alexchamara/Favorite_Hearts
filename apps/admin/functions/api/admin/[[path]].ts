/**
 * The admin site's only way to the API (docs/ADMIN-PANEL-PLAN.md): a Cloudflare Pages Function on
 * admin.favoritehearts.com that forwards /api/admin/* to the API (API_ORIGIN, set in the Pages project) and nothing
 * else. So the admin site and its API share one origin: no CORS, and the admin cookie is host-only on this site.
 *
 * Cloudflare Access sits in front of the whole site, so every request that reaches this function already carries
 * Access's signed Cf-Access-Jwt-Assertion header; it is forwarded unchanged and the API checks it again.
 */
interface Env {
  /** e.g. https://api.favoritehearts.com (no path). */
  API_ORIGIN: string;
}

const HOP_BY_HOP = ['host', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'proxy-connection'];

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.API_ORIGIN) return Response.json({ code: 'NOT_CONFIGURED', message: 'The admin site has no API configured.' }, { status: 503 });
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/admin/') && url.pathname !== '/api/admin') {
    return Response.json({ code: 'NOT_FOUND', message: 'Not found.' }, { status: 404 });
  }
  const target = new URL(`${url.pathname}${url.search}`, env.API_ORIGIN);
  const headers = new Headers(request.headers);
  for (const name of HOP_BY_HOP) headers.delete(name);
  // The visitor's own address, for the API's rate limits and its audit trail (the API trusts only the header named by
  // its CLIENT_IP_HEADER setting; see docs/ADMIN-RUNBOOK.md).
  const visitor = request.headers.get('cf-connecting-ip');
  if (visitor) headers.set('x-fh-client-ip', visitor);
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const response = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    redirect: 'manual',
  });
  // Set-Cookie and every other header come back as the API sent them; cookies are set on this host.
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: response.headers });
};
