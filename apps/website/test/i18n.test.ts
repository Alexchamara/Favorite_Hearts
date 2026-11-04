// The website in two languages (src/lib/i18n.ts): texts as HTML, addresses per language, dates, and that every key the
// pages and their scripts use is in the catalogue, and every catalogue key is used somewhere.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ARTICLES, CATEGORIES } from '../src/lib/articles.ts';
import { pathIn, routeOf, texts } from '../src/lib/i18n.ts';

const site = fileURLToPath(new URL('..', import.meta.url));
const catalogue = (language: string): Record<string, string> =>
  JSON.parse(readFileSync(join(site, `../../packages/shared/src/i18n/${language}/website.json`), 'utf8'));
const files = (dir: string, ext: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(dir, entry.name), ext) : entry.name.endsWith(ext) ? [join(dir, entry.name)] : [],
  );

describe('website texts', () => {
  test('html() escapes the words and puts in only the elements the page gives', () => {
    const { html } = texts('en');
    // A real key with a link, bold and a line break.
    assert.equal(
      html('web.help.payments.a3', { link: '<a href="/pricing/">', link2: '<a href="/terms/">' }),
      'There are no refunds once a plan is active, except for a duplicate payment, a payment made by mistake, or a failure on our side. The details are on the <a href="/pricing/">pricing page</a> and in our <a href="/terms/">terms</a>.',
    );
    assert.match(html('web.legal.draft'), /^<strong>Draft for legal review\.<\/strong> This text/);
    assert.equal(html('web.home.yourPersonYourForever'), 'Your person.<br>Your forever.');
    // A mark the page fills with a whole element, and one it does not give, which stays visible as text.
    assert.match(html('web.terms.law.3', { operator: '<mark>[name]</mark>', email: '<a href="mailto:x@y">x@y</a>' }), /^Questions about these terms: <mark>\[name\]<\/mark>, <a href="mailto:x@y">x@y<\/a>, or/);
    assert.match(html('web.terms.law.3'), /^Questions about these terms: &lt;operator\/&gt;/);
    // Words are never markup: "&" in the English stays an entity.
    assert.equal(html('web.nav.help'), 'Help &amp; FAQ');
  });

  test('addresses: English at the root, Sinhala under /si/, and back', () => {
    assert.equal(pathIn('en', '/pricing/'), '/pricing/');
    assert.equal(pathIn('si', '/pricing/'), '/si/pricing/');
    assert.equal(pathIn('si', '/'), '/si/');
    assert.equal(routeOf('/si/pricing/'), '/pricing/');
    assert.equal(routeOf('/si/'), '/');
    assert.equal(routeOf('/simple/'), '/simple/', 'only the /si/ segment is a language');
    assert.equal(texts('si').path('/help/'), '/si/help/');
    assert.equal(texts('en').other, 'si');
  });

  test('dates and countries come from the catalogues in the page’s order', () => {
    assert.equal(texts('en').monthYear(10, 2026), 'October 2026');
    assert.equal(texts('si').monthYear(10, 2026), '2026 ඔක්තෝබර්');
    assert.equal(texts('en').date(31, 10, 2026), '31 October 2026');
    assert.equal(texts('si').date(31, 10, 2026), '2026 ඔක්තෝබර් 31');
    const countries = texts('si').countries();
    assert.equal(countries.length, texts('en').countries().length);
    assert.equal(countries.find((c) => c.code === 'LK')?.name, 'ශ්‍රී ලංකාව');
  });

  test('the Sinhala pages have Sinhala text, and scripts get only their own words', () => {
    const [en, si] = [texts('en'), texts('si')];
    assert.notEqual(si.t('web.header.join'), en.t('web.header.join'));
    const scripts = si.scriptTexts();
    assert.ok(Object.keys(scripts).every((key) => key.startsWith('web.js.')));
    assert.equal(scripts['web.js.help.found_one'], catalogue('si')['web.js.help.found_one']);
  });

  test('every key the pages and scripts use is in the catalogue, and every catalogue key is used', () => {
    const en = catalogue('en');
    const sources = [...files(join(site, 'src'), '.astro'), ...files(join(site, 'src'), '.ts'), ...files(join(site, 'public/assets/js'), '.js')]
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    const used = new Set([...sources.matchAll(/(?:\bt|\bhtml|\blegal|FH_TEXT|\.t)\(\s*'(web\.[\w.-]+)'/g)].map((m) => m[1]!));
    // Keys built from a pattern: a key with plural forms is used through its stem.
    const missing = [...used].filter((key) => !(key in en) && !(`${key}_one` in en));
    assert.deepEqual(missing, []);
    const dynamic = (key: string) =>
      /^web\.article\.[\w-]+\.(title|intro|summary|s[123]\.(title|text))$/.test(key) ||
      /^web\.(lang\.(name|label|to)|category)\./.test(key) ||
      /^web\.js\./.test(key) ||
      /^web\.(help|pricing|terms|privacy)\./.test(key);
    const unused = Object.keys(en).filter((key) => !used.has(key) && !dynamic(key));
    assert.deepEqual(unused, []);
    for (const { slug, category } of ARTICLES) {
      assert.ok(`web.article.${slug}.title` in en && `web.article.${slug}.s3.text` in en, slug);
      assert.ok(`web.category.${category}` in en, category);
    }
    for (const category of CATEGORIES) assert.ok(`web.category.${category}` in en, category);
    for (const key of ['web.js.help.found', 'web.js.pricing.months']) assert.ok(`${key}_one` in en && `${key}_other` in en, key);
  });
});
