// Checks the built site (dist/site) for the SEO basics, so a broken page fails the build instead of reaching search
// engines and link previews:
//   pages     a unique title and description, a canonical link to the page's own address on siteUrl, a robots tag that
//             follows "indexable", Open Graph and Twitter tags that repeat the title, description and address, a preview
//             image that exists at the size the tags state, one h1, a language, and structured data that parses;
//   languages every page is in English at its address and in Sinhala under /si/ (lang en or si to match), and names
//             both versions and English as the default with hreflang links that exist and name it back;
//   links     every link and asset on the site's own domain resolves, and every #anchor exists on its page;
//   sitemap   lists every page except the 404 page, once, at its canonical address;
//   robots    robots.txt follows "indexable" in site.config.json, and the member app (/app/) is never indexed;
//   accessibility  images have alt text; links, buttons and form fields have a name, and a name set with aria-label
//             contains the visible words (WCAG 2.5.3); every id is unique and every id reference exists; zoom is
//             not blocked; no positive tabindex; inline lang values are en or si. Contrast, focus and keyboard use need
//             a browser: see docs/ARCHITECTURE.md, "Accessibility".
// A title or description longer than search results show is reported as a note, not a failure.
// Run via `npm run check:site` (also the last step of `npm run build:site`).
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/site/', import.meta.url));
const config = JSON.parse(await readFile(new URL('../apps/website/site.config.json', import.meta.url), 'utf8'));
const base = config.siteUrl.replace(/\/$/, '');
// What search results show before cutting text off (an approximation: they measure in pixels).
const TITLE_SHOWN = 70;
const DESCRIPTION_SHOWN = 160;

const problems = new Map();
const notes = [];
const fail = (area, where, message) => {
  if (!problems.has(area)) problems.set(area, []);
  problems.get(area).push(`${where}: ${message}`);
};

try {
  await stat(join(root, 'index.html'));
} catch {
  console.error('The site has not been built yet. Run `npm run build:site`.');
  process.exit(1);
}

const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) =>
  s.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (m, e) =>
    e[0] !== '#' ? (entities[e.toLowerCase()] ?? m) : String.fromCodePoint(Number(e[1] === 'x' || e[1] === 'X' ? `0${e.slice(1)}` : e.slice(1))),
  );

/** The page without comments, scripts and styles, so text inside them is not read as tags. */
const markup = (html) =>
  html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');

/** Every element in `html` (or only those named `name`) as {name, attrs}, attribute values decoded. */
function elements(html, name = '[a-z][\\w-]*') {
  const found = [];
  for (const m of html.matchAll(new RegExp(`<(${name})\\b((?:[^>"']|"[^"]*"|'[^']*')*)>`, 'gi'))) {
    const attrs = {};
    for (const a of m[2].matchAll(/([^\s"'=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
      attrs[a[1].toLowerCase()] = decode(a[2] ?? a[3] ?? a[4] ?? '');
    }
    found.push({ name: m[1].toLowerCase(), attrs });
  }
  return found;
}

/** Width and height from a JPEG's frame header, or null. */
function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  for (let i = 2; i + 9 < buf.length; ) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

async function exists(file) {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

async function htmlFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    // The member app is a single page of its own, checked only for being kept out of search (below).
    if (entry.isDirectory() && full !== join(root, 'app')) out.push(...(await htmlFiles(full)));
    else if (entry.isFile() && entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

const pages = [];
for (const file of (await htmlFiles(root)).sort()) {
  const rel = relative(root, file).split(sep).join('/');
  const html = await readFile(file, 'utf8');
  pages.push({ rel, route: `/${rel.replace(/(^|\/)index\.html$/, '$1')}`, html, tags: elements(markup(html)) });
}
const notFound = pages.find((p) => p.rel === '404.html');
const listed = pages.filter((p) => p !== notFound);

/** The path of a file on disk for an address on this site, or null for an address that is not a file here. */
function fileFor(path) {
  if (path.startsWith('/app/') || path === '/app') return join(root, 'app', 'index.html');
  const decoded = decodeURI(path);
  return join(root, decoded.endsWith('/') ? `${decoded}index.html` : decoded);
}

/** A page's language and its address without it: /si/pricing/ is the Sinhala version of /pricing/. */
const langOf = (route) => (/^\/si(\/|$)/.test(route) ? 'si' : 'en');
const routeOf = (route) => route.replace(/^\/si(?=\/)/, '');
const LANGUAGES = { en: (route) => route, si: (route) => `/si${route}`, 'x-default': (route) => route };
let alternateCount = 0;

const idsOf = new Map(pages.map((p) => [p.route, new Set(p.tags.map((t) => t.attrs.id).filter(Boolean))]));
const imageSizes = new Map();
let linkCount = 0;
let anchorCount = 0;

for (const page of pages) {
  const where = page.route;
  const meta = new Map();
  for (const { attrs } of page.tags.filter((t) => t.name === 'meta')) {
    const key = attrs.name ?? attrs.property;
    if (key) meta.set(key, [...(meta.get(key) ?? []), attrs.content ?? '']);
  }
  const one = (area, key) => {
    const values = meta.get(key) ?? [];
    if (values.length !== 1 || !values[0].trim()) {
      fail(area, where, values.length ? `${key} appears ${values.length} times or is empty` : `${key} is missing`);
      return null;
    }
    return values[0];
  };

  const titles = [...markup(page.html).matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)].map((m) => decode(m[1]).trim());
  page.title = titles.length === 1 && titles[0] ? titles[0] : null;
  if (!page.title) fail('titles', where, `${titles.length} titles`);
  const lang = page.tags.find((t) => t.name === 'html')?.attrs.lang;
  if (!lang) fail('language', where, 'the html element has no lang');
  else if (page !== notFound && lang !== langOf(page.route)) fail('languages', where, `lang is ${lang}, the address says ${langOf(page.route)}`);

  const robots = one('robots tags', 'robots');
  if (page === notFound) {
    if (robots && !/\bnoindex\b/.test(robots)) fail('robots tags', where, `"${robots}" lets search engines index the not-found page`);
  } else {
    if (robots && config.indexable === /\bnoindex\b/.test(robots)) {
      fail('robots tags', where, `"${robots}" but site.config.json has "indexable": ${config.indexable}`);
    }

    page.description = one('descriptions', 'description');
    if (page.title && page.title.length > TITLE_SHOWN) notes.push(`${where} title: ${page.title.length} characters`);
    if (page.description && page.description.length > DESCRIPTION_SHOWN) {
      notes.push(`${where} description: ${page.description.length} characters`);
    }

    const url = base + page.route;
    const canonical = page.tags.filter((t) => t.name === 'link' && t.attrs.rel?.split(/\s+/).includes('canonical'));
    if (canonical.length !== 1) fail('canonical links', where, `${canonical.length} canonical links`);
    else if (canonical[0].attrs.href !== url) fail('canonical links', where, `points to ${canonical[0].attrs.href}, not ${url}`);

    const same = (key, expected) => {
      const value = one('social previews', key);
      if (value !== null && expected !== null && value !== expected) fail('social previews', where, `${key} is "${value}", not "${expected}"`);
      return value;
    };
    same('og:title', page.title);
    same('og:description', page.description);
    same('og:url', url);
    same('og:site_name', config.siteName);
    const type = one('social previews', 'og:type');
    const route = routeOf(page.route);
    if (type && type !== (route.startsWith('/newsroom/') && route !== '/newsroom/' ? 'article' : 'website')) {
      fail('social previews', where, `og:type is ${type}`);
    }
    one('social previews', 'og:locale');
    one('social previews', 'og:image:alt');
    same('twitter:card', 'summary_large_image');
    same('twitter:title', page.title);
    same('twitter:description', page.description);
    one('social previews', 'twitter:image:alt');
    const image = one('social previews', 'og:image');
    same('twitter:image', image);
    if (image) {
      if (!image.startsWith(`${base}/`)) fail('social previews', where, `og:image ${image} is not on ${base}`);
      else {
        if (!imageSizes.has(image)) {
          const file = fileFor(new URL(image).pathname);
          imageSizes.set(image, (await exists(file)) ? jpegSize(await readFile(file)) : 'missing');
        }
        const size = imageSizes.get(image);
        const stated = `${meta.get('og:image:width')?.[0]}×${meta.get('og:image:height')?.[0]}`;
        if (size === 'missing') fail('social previews', where, `og:image ${image} does not exist`);
        else if (!size || `${size.width}×${size.height}` !== stated) {
          fail('social previews', where, `og:image is ${size ? `${size.width}×${size.height}` : 'not a JPEG'}, the tags say ${stated}`);
        }
      }
    }

    const alternates = new Map(
      page.tags.filter((t) => t.name === 'link' && t.attrs.rel === 'alternate' && t.attrs.hreflang).map((t) => [t.attrs.hreflang, t.attrs.href]),
    );
    for (const [hreflang, address] of Object.entries(LANGUAGES)) {
      const expected = base + address(route);
      if (alternates.get(hreflang) !== expected) fail('languages', where, `hreflang ${hreflang} is ${alternates.get(hreflang) ?? 'missing'}, not ${expected}`);
      else alternateCount++;
    }
    if (alternates.size !== Object.keys(LANGUAGES).length) fail('languages', where, `${alternates.size} hreflang links`);

    const h1 = page.tags.filter((t) => t.name === 'h1').length;
    if (h1 !== 1) fail('headings', where, `${h1} h1 headings`);

    const data = [...page.html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
    if (!data.length) fail('structured data', where, 'no JSON-LD');
    for (const [, text] of data) {
      try {
        const graph = JSON.parse(text)['@graph'] ?? [];
        if (!graph.some((node) => node.url === url)) fail('structured data', where, `no node has url ${url}`);
      } catch (error) {
        fail('structured data', where, `JSON-LD does not parse (${error.message})`);
      }
    }
  }

  for (const { name, attrs } of page.tags) {
    for (const key of ['href', 'src', 'poster', 'data-stock-fallback']) {
      const value = attrs[key];
      if (!value || (key === 'href' && name === 'link' && attrs.rel === 'canonical')) continue;
      if (value.startsWith('#')) {
        anchorCount++;
        if (value.length > 1 && !idsOf.get(page.route).has(decodeURIComponent(value.slice(1)))) {
          fail('links', where, `${value} has no element with that id`);
        }
        continue;
      }
      const local = value.startsWith(`${base}/`) ? value.slice(base.length) : value.startsWith('/') && !value.startsWith('//') ? value : null;
      if (!local) continue;
      linkCount++;
      const path = local.split(/[?#]/)[0];
      const hash = local.includes('#') ? local.slice(local.indexOf('#') + 1) : '';
      if (!(await exists(fileFor(path)))) {
        fail('links', where, `${value} does not exist`);
        continue;
      }
      if (hash) {
        anchorCount++;
        if (!idsOf.get(path)?.has(decodeURIComponent(hash))) fail('links', where, `${value}: no element with id "${hash}" there`);
      }
    }
  }
}

const routes = new Set(listed.map((p) => p.route));
for (const page of listed) {
  const twin = langOf(page.route) === 'en' ? `/si${page.route}` : routeOf(page.route);
  if (!routes.has(twin)) fail('languages', page.route, `has no ${langOf(twin) === 'si' ? 'Sinhala' : 'English'} version at ${twin}`);
}

for (const [area, key] of [['titles', 'title'], ['descriptions', 'description']]) {
  const seen = new Map();
  for (const page of listed) if (page[key]) seen.set(page[key], [...(seen.get(page[key]) ?? []), page.route]);
  for (const [value, routes] of seen) if (routes.length > 1) fail(area, routes.join(', '), `share the ${key} "${value}"`);
}

const sitemap = await readFile(join(root, 'sitemap.xml'), 'utf8').catch(() => null);
if (sitemap === null) fail('sitemap', 'sitemap.xml', 'missing');
else {
  const locs = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => decode(m[1]).trim());
  const expected = new Set(listed.map((p) => base + p.route));
  for (const loc of new Set(locs.filter((l, i) => locs.indexOf(l) !== i))) fail('sitemap', loc, 'listed more than once');
  for (const loc of new Set(locs)) if (!expected.has(loc)) fail('sitemap', loc, 'listed but there is no such page');
  for (const url of expected) if (!locs.includes(url)) fail('sitemap', url, 'not listed');
}

const robotsTxt = (await readFile(join(root, 'robots.txt'), 'utf8').catch(() => '')).split('\n').map((l) => l.trim());
if (config.indexable) {
  if (!robotsTxt.includes('Allow: /') || robotsTxt.includes('Disallow: /')) fail('robots.txt', 'robots.txt', 'does not allow the site');
  if (!robotsTxt.includes(`Sitemap: ${base}/sitemap.xml`)) fail('robots.txt', 'robots.txt', 'does not name the sitemap');
} else if (!robotsTxt.includes('Disallow: /')) {
  fail('robots.txt', 'robots.txt', 'allows search engines although "indexable" is false');
}

// The member app never belongs in search results, whatever "indexable" says.
const headers = await readFile(join(root, '_headers'), 'utf8').catch(() => '');
const appRule = headers.split(/\n(?=\S)/).find((block) => block.startsWith('/app/*'));
if (!appRule || !/^\s+X-Robots-Tag:.*\bnoindex\b/m.test(appRule)) fail('robots.txt', '_headers', '/app/* has no X-Robots-Tag: noindex');

// --- Accessibility (what can be read from the HTML; the browser audit covers the rest) --------------------------------

const textOf = (html) =>
  decode(
    html
      .replace(/<(\w+)\b[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<img\b[^>]*\balt="([^"]*)"[^>]*>/gi, ' $1 ')
      .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
const visibleTextOf = (html) => textOf(html.replace(/<(\w+)\b[^>]*class="[^"]*\bsr-only\b[^"]*"[^>]*>[\s\S]*?<\/\1>/gi, ' '));
let namedCount = 0;
let fieldCount = 0;
for (const page of pages) {
  const where = page.route;
  const html = markup(page.html);
  const ids = new Map();
  for (const { attrs } of page.tags) if (attrs.id) ids.set(attrs.id, (ids.get(attrs.id) ?? 0) + 1);
  for (const [id, n] of ids) if (n > 1) fail('accessibility', where, `id "${id}" is used ${n} times`);
  for (const { name, attrs } of page.tags) {
    for (const key of ['aria-labelledby', 'aria-describedby', 'aria-controls', 'for']) {
      if (!attrs[key] || (key === 'for' && name !== 'label')) continue;
      for (const id of attrs[key].split(/\s+/)) if (!ids.has(id)) fail('accessibility', where, `${name} ${key}="${id}" names no element`);
    }
    if (name === 'img' && !('alt' in attrs)) fail('accessibility', where, `an image has no alt text (${attrs.src})`);
    if (Number(attrs.tabindex) > 0) fail('accessibility', where, `${name} has tabindex ${attrs.tabindex}`);
    if ('lang' in attrs && !['en', 'si'].includes(attrs.lang)) fail('accessibility', where, `lang="${attrs.lang}"`);
    if (name === 'meta' && attrs.name === 'viewport' && /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/.test(attrs.content ?? '')) {
      fail('accessibility', where, `the viewport blocks zoom (${attrs.content})`);
    }
  }
  // Links and buttons: a name, and a name that starts from the words on screen.
  for (const m of html.matchAll(/<(a|button)\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/\1>/gi)) {
    const [, tag, rawAttrs, inner] = m;
    const attrs = elements(`<x${rawAttrs}>`, 'x')[0]?.attrs ?? {};
    if (tag.toLowerCase() === 'a' && !('href' in attrs)) continue;
    namedCount++;
    const label = attrs['aria-label']?.trim();
    const visible = visibleTextOf(inner);
    const name = label || (attrs['aria-labelledby'] ? 'labelled' : textOf(inner)) || attrs.title;
    const short = visible.slice(0, 40) || attrs.href || '(empty)';
    if (!name) fail('accessibility', where, `${tag.toLowerCase() === 'a' ? 'a link' : 'a button'} has no name (${short})`);
    // A symbol such as × is not words on screen, so only text with letters must be in the name.
    else if (label && /\p{L}/u.test(visible) && !label.toLowerCase().includes(visible.toLowerCase())) {
      fail('accessibility', where, `${tag} "${visible}" is named "${label}", which does not contain the words on screen`);
    }
  }
  // Form fields: a label, by for/id, by wrapping, or by aria-label.
  const wrapped = [...html.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/gi)].map((m) => m[1]).join('\n');
  for (const { name, attrs } of page.tags.filter((t) => ['input', 'select', 'textarea'].includes(t.name))) {
    if (name === 'input' && ['hidden', 'submit', 'button', 'reset', 'image'].includes(attrs.type)) continue;
    fieldCount++;
    const labelled =
      attrs['aria-label']?.trim() ||
      attrs['aria-labelledby'] ||
      (attrs.id && page.tags.some((t) => t.name === 'label' && t.attrs.for === attrs.id)) ||
      (attrs.name && new RegExp(`<${name}\\b[^>]*name="${attrs.name}"`).test(wrapped));
    if (!labelled) fail('accessibility', where, `${name}${attrs.id ? `#${attrs.id}` : ''} has no label`);
  }
}

const summary = [
  ['titles', `${listed.length} unique`],
  ['descriptions', `${listed.length} unique`],
  ['canonical links', `${listed.length} point to the page's own address on ${base}`],
  ['robots tags', config.indexable ? 'pages may be indexed, the 404 page may not' : 'noindex on every page (not indexable yet)'],
  ['social previews', `Open Graph and Twitter tags on ${listed.length} pages, preview image ${[...imageSizes.values()].map((s) => (s && s !== 'missing' ? `${s.width}×${s.height}` : '?')).join(', ')}`],
  ['headings', `one h1 on each of ${listed.length} pages`],
  ['language', `lang set on ${pages.length} pages`],
  ['languages', `${listed.filter((p) => langOf(p.route) === 'en').length} pages in English and ${listed.filter((p) => langOf(p.route) === 'si').length} in Sinhala, lang matches; ${alternateCount} hreflang links resolve to each other`],
  ['structured data', `valid JSON-LD on ${listed.length} pages`],
  ['accessibility', `${namedCount} links and buttons named, ${fieldCount} form fields labelled, ids unique and references found on ${pages.length} pages`],
  ['links', `${linkCount} links and assets on this site resolve, ${anchorCount} anchors found`],
  ['sitemap', `${listed.length} pages listed once each, the 404 page left out`],
  ['robots.txt', config.indexable ? `Allow: / and Sitemap: ${base}/sitemap.xml; /app/ noindex` : 'Disallow: / while not indexable; /app/ noindex'],
];

console.log(`Site check of dist/site for ${base} ("indexable": ${config.indexable}), ${listed.length} pages and the 404 page:`);
for (const [area, ok] of summary) {
  const found = problems.get(area);
  console.log(`  ${found ? '✗' : '✓'} ${area.padEnd(16)} ${found ? `${found.length} problem${found.length > 1 ? 's' : ''}` : ok}`);
  for (const line of found ?? []) console.log(`      ${line}`);
}
if (notes.length) {
  console.log(`Notes, not failures: search results may shorten these (titles over ${TITLE_SHOWN}, descriptions over ${DESCRIPTION_SHOWN} characters):`);
  for (const note of notes) console.log(`  - ${note}`);
}
const total = [...problems.values()].reduce((n, list) => n + list.length, 0);
console.log(total ? `${total} problem${total > 1 ? 's' : ''} found.` : 'No problems found.');
process.exit(total ? 1 : 0);
