// Serves dist/site (website at /, member app at /app/) the way Cloudflare Pages does, to check headers and routing
// before a deploy. It follows Pages' documented rules:
//   _redirects  the first matching rule applies, even when a file exists at that path; 200 serves another path.
//   _headers    every matching rule applies; a header set twice is joined with ", "; "! Name" removes one.
// With API_ORIGIN set, /api and /health go to that API, as they would through the production domain.
// It also serves the browser accessibility audit at /__audit/ (scripts/a11y-audit.js and axe-core), which is never
// part of dist/site and so never deployed.
// Run via `npm run preview:site` (PORT, default 8080; API_ORIGIN optional).
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer, request as forward } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/site/', import.meta.url));
const auditFiles = {
  '/__audit/run.js': fileURLToPath(new URL('./a11y-audit.js', import.meta.url)),
  '/__audit/axe.js': fileURLToPath(new URL('../node_modules/axe-core/axe.min.js', import.meta.url)),
};
const port = Number(process.env.PORT ?? 8080);
const api = process.env.API_ORIGIN ? new URL(process.env.API_ORIGIN) : null;
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.map': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
};

/** A Pages path pattern: one * splat, :placeholders up to the next slash. */
function pattern(path) {
  const source = path
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/, '(?<splat>.*)')
    .replace(/:([A-Za-z]\w*)/g, '(?<$1>[^/]+)');
  return new RegExp(`^${source}$`);
}

const lines = async (name) => (await readFile(join(root, name), 'utf8').catch(() => '')).split('\n');

async function headerRules() {
  const rules = [];
  for (const raw of await lines('_headers')) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (!/^\s/.test(raw)) {
      rules.push({ match: pattern(raw.trim()), set: [], unset: [] });
      continue;
    }
    const rule = rules.at(-1);
    const text = raw.trim();
    if (!rule) continue;
    if (text.startsWith('! ')) rule.unset.push(text.slice(2).trim().toLowerCase());
    else rule.set.push([text.slice(0, text.indexOf(':')).trim().toLowerCase(), text.slice(text.indexOf(':') + 1).trim()]);
  }
  return rules;
}

async function redirectRules() {
  return (await lines('_redirects'))
    .map((raw) => raw.trim().split(/\s+/))
    .filter(([from, to]) => from && to && !from.startsWith('#'))
    .map(([from, to, status = '302']) => ({ match: pattern(from), to, status: Number(status) }));
}

function headersFor(rules, path) {
  const headers = new Map();
  for (const rule of rules) {
    if (!rule.match.test(path)) continue;
    for (const name of rule.unset) headers.delete(name);
    for (const [name, value] of rule.set) headers.set(name, headers.has(name) ? `${headers.get(name)}, ${value}` : value);
  }
  return headers;
}

async function fileFor(path) {
  const candidates = path.endsWith('/') ? [`${path}index.html`] : [path, `${path}/index.html`];
  for (const candidate of candidates) {
    const full = normalize(join(root, candidate));
    if (!full.startsWith(root)) return null;
    const info = await stat(full).catch(() => null);
    if (info?.isFile()) return full;
  }
  return null;
}

const [headers, redirects] = await Promise.all([headerRules(), redirectRules()]);

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (api && (url.pathname.startsWith('/api/') || url.pathname === '/health')) {
    const upstream = forward(
      { host: api.hostname, port: api.port, path: req.url, method: req.method, headers: { ...req.headers, host: api.host } },
      (answer) => {
        res.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(res);
      },
    );
    upstream.on('error', () => res.writeHead(502).end('API not reachable'));
    req.pipe(upstream);
    return;
  }

  if (auditFiles[url.pathname]) {
    for (const [name, value] of headersFor(headers, url.pathname)) res.setHeader(name, value);
    res.writeHead(200, { 'Content-Type': types['.js'] });
    createReadStream(auditFiles[url.pathname]).pipe(res);
    return;
  }

  const requested = decodeURIComponent(url.pathname);
  let path = requested;
  for (const rule of redirects) {
    const found = rule.match.exec(requested);
    if (!found) continue;
    const target = rule.to.replace(':splat', found.groups?.splat ?? '').replace(/:([A-Za-z]\w*)/g, (_, key) => found.groups?.[key] ?? '');
    if (rule.status !== 200) {
      res.writeHead(rule.status, { Location: target }).end();
      return;
    }
    path = target;
    break;
  }

  let file = await fileFor(path);
  let status = 200;
  if (!file) {
    file = await fileFor('/404.html');
    status = 404;
  }
  for (const [name, value] of headersFor(headers, requested)) res.setHeader(name, value);
  if (!file) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(status, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(port, () => {
  console.log(`dist/site on http://localhost:${port}${api ? ` (API: ${api.origin})` : ''}`);
});
