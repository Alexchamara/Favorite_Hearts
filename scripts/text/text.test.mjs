// The reviewer's spreadsheet (scripts/text): the .xlsx writer and reader, reading files other programs saved (openpyxl,
// and Excel's own layout with a shared-strings table and rich text), and the export → review → import round trip on a
// small catalogue in a temporary folder. Run by `npm test` at the root.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { buildWorkbook, importWorkbook, status } from './catalogue.mjs';
import { readWorkbook, unzip, writeWorkbook, zip } from './xlsx.mjs';

const fixture = (name) => readFile(new URL(`./fixtures/${name}`, import.meta.url));

/** A catalogue folder like packages/shared/src/i18n, with a few texts. */
async function catalogueRoot(english = { 'demo.hello': 'Hello {name}', 'demo.save': 'Save', 'demo.close': 'Close', 'demo.loading': 'Loading…', 'demo.bold': 'Sent to <strong>{contact}</strong>.' }) {
  const root = await mkdtemp(join(tmpdir(), 'fh-text-'));
  for (const language of ['en', 'si']) await mkdir(join(root, language));
  const sinhala = { 'demo.hello': 'ආයුබෝවන් {name}', 'demo.save': 'සුරකින්න', 'demo.close': 'වසන්න', 'demo.loading': 'පූරණය…', 'demo.bold': '<strong>{contact}</strong> වෙත යැව්වා.' };
  const files = {
    en: { app: english, api: { 'api.signIn': 'Please sign in.', 'api.staff.notAllowed': 'Not allowed.' }, validation: {}, email: {} },
    si: { app: sinhala, api: { 'api.signIn': 'කරුණාකර පිවිසෙන්න.' }, validation: {}, email: {} },
  };
  for (const [language, areas] of Object.entries(files)) {
    for (const [area, texts] of Object.entries(areas)) await writeFile(join(root, language, `${area}.json`), JSON.stringify(texts));
  }
  return root;
}

describe('xlsx', () => {
  test('zip and unzip round trip, with Unicode names and contents', () => {
    const files = unzip(zip([{ name: 'a.txt', data: Buffer.from('plain') }, { name: 'සිංහල/b.xml', data: Buffer.from('<x>ආයුබෝවන්</x>') }]));
    assert.equal(files.get('a.txt').toString(), 'plain');
    assert.equal(files.get('සිංහල/b.xml').toString(), '<x>ආයුබෝවන්</x>');
  });

  test('what the writer writes, the reader reads back exactly', () => {
    const rows = [
      ['demo.a', 'ආයුබෝවන්, {name}! <strong>bold</strong>', 'Tom & "Jerry" <3', ''],
      ['demo.b', '', 'line one\nline two', 'ends with spaces  '],
      ['demo.c', 'emoji 😊 and tamil தமிழ்', 'control\u0007char', 'x'],
    ];
    const [sheet] = readWorkbook(writeWorkbook([{ name: 'App & more', columns: [{ title: 'Key', width: 10 }, { title: 'A', width: 10 }, { title: 'B', width: 10, editable: true, choices: ['Draft', 'Approved'] }, { title: 'C', width: 10 }], rows }]));
    assert.equal(sheet.name, 'App & more');
    assert.deepEqual(sheet.rows[0], ['Key', 'A', 'B', 'C']);
    assert.deepEqual(sheet.rows[1], rows[0]);
    assert.deepEqual(sheet.rows[2], ['demo.b', '', 'line one\nline two', 'ends with spaces  ']);
    assert.deepEqual(sheet.rows[3], ['demo.c', 'emoji 😊 and tamil தமிழ்', 'controlchar', 'x'], 'characters XML forbids are dropped');
  });

  test('a file openpyxl saved (inline strings, rich text, empty cells) reads correctly', async () => {
    const sheets = readWorkbook(await fixture('reviewed-by-openpyxl.xlsx'));
    assert.deepEqual(sheets.map((s) => s.name), ['Read me', 'App']);
    const app = sheets[1].rows;
    assert.deepEqual(app[1].slice(0, 6), ['demo.hello', 'Test', 'Hello {name}', 'ආයුබෝවන් {name}', 'ආයුබෝවන්, {name}!', '']);
    assert.equal(app[2][1], '', 'an empty cell stays in its column');
    assert.equal(app[2][5], 'Approved');
    assert.equal(app[3][4], 'වසා දමන්න', 'rich text runs are joined');
  });

  test('Excel’s layout (shared strings, rich text, phonetic hints, numbers, an empty string) reads correctly', async () => {
    const [app] = readWorkbook(await fixture('reviewed-excel-style.xlsx'));
    assert.equal(app.name, 'App');
    assert.deepEqual(app.rows[0], ['Key', 'Where it appears', 'English', 'Sinhala now', 'Your Sinhala', 'Status', 'Your notes']);
    assert.deepEqual(app.rows[1], ['demo.hello', '', 'Hello {name}', 'ආයුබෝවන් {name}', 'ආයුබෝවන්, {name} & පවුල']);
    assert.deepEqual(app.rows[2], ['demo.save', '', 'Save', 'සුරකින්න', '', 'Approved', '']);
    assert.deepEqual(app.rows[3], ['demo.close', '', 'Close', 'වසන්න', 'වසා දමන්න', '', '42']);
  });
});

describe('export and import', () => {
  test('the export has one row per text members see, with status and what to keep', async () => {
    const root = await catalogueRoot();
    const { buffer, counts } = await buildWorkbook({ root, language: 'si' });
    const sheets = readWorkbook(buffer);
    assert.deepEqual(sheets.map((s) => s.name), ['Read me', 'App', 'Messages', 'Emails and texts', 'Glossary']);
    const app = sheets[1].rows;
    assert.deepEqual(app[0], ['Key', 'Where it appears', 'English', 'Sinhala now', 'Your Sinhala', 'Status', 'Your notes', 'Keep as is']);
    assert.deepEqual(app[1].slice(0, 6), ['demo.hello', 'demo', 'Hello {name}', 'ආයුබෝවන් {name}', '', 'Draft']);
    assert.match(app[5][7], /\{contact\} becomes an email address or phone number; keep it exactly\. Keep <strong>…<\/strong>/);
    assert.deepEqual(sheets[2].rows.map((r) => r[0]), ['Key', 'api.signIn'], 'staff texts stay out');
    assert.deepEqual(counts, { total: 6, translated: 6, approved: 0, changed: 0 });
  });

  test('corrections and approvals come back in; broken rows are refused with a reason', async () => {
    const root = await catalogueRoot();
    const report = await importWorkbook(await fixture('reviewed-by-openpyxl.xlsx'), { root, today: '2026-11-03' });
    assert.deepEqual(report.corrected, ['demo.hello', 'demo.close']);
    assert.deepEqual(report.approved, ['demo.save']);
    assert.deepEqual(report.discuss, [{ key: 'demo.loading', english: 'Loading…', note: '“පූරණය” හරිද?' }]);
    assert.equal(report.problems.length, 1);
    assert.match(report.problems[0], /App row 5 \(demo\.loading\): the text must keep no placeholders as in the English; it has \{x\}\. Not imported\./);
    const si = JSON.parse(await readFile(join(root, 'si', 'app.json'), 'utf8'));
    assert.equal(si['demo.hello'], 'ආයුබෝවන්, {name}!');
    assert.equal(si['demo.close'], 'වසා දමන්න');
    assert.equal(si['demo.loading'], 'පූරණය…', 'the refused row keeps the old text');
    const review = JSON.parse(await readFile(join(root, 'review', 'si.json'), 'utf8'));
    assert.deepEqual(Object.keys(review), ['demo.close', 'demo.hello', 'demo.save']);
    assert.deepEqual(review['demo.save'], { english: 'Save', at: '2026-11-03' });
    assert.deepEqual((await status({ root })).find((row) => row.area === 'app'), { area: 'app', total: 5, translated: 5, approved: 3, changed: 0 });
  });

  test('a dry run reports without writing, and Excel’s layout imports the same way', async () => {
    const root = await catalogueRoot();
    const report = await importWorkbook(await fixture('reviewed-excel-style.xlsx'), { root, dryRun: true });
    assert.deepEqual(report.corrected, ['demo.hello', 'demo.close']);
    assert.deepEqual(report.approved, ['demo.save']);
    const si = JSON.parse(await readFile(join(root, 'si', 'app.json'), 'utf8'));
    assert.equal(si['demo.hello'], 'ආයුබෝවන් {name}', 'nothing written');
  });

  test('when the English changes after a review, the text is a draft again and old rows are skipped', async () => {
    const root = await catalogueRoot();
    await importWorkbook(await fixture('reviewed-by-openpyxl.xlsx'), { root, today: '2026-11-03' });
    const english = JSON.parse(await readFile(join(root, 'en', 'app.json'), 'utf8'));
    await writeFile(join(root, 'en', 'app.json'), JSON.stringify({ ...english, 'demo.save': 'Save changes' }));
    assert.deepEqual((await status({ root })).find((row) => row.area === 'app'), { area: 'app', total: 5, translated: 5, approved: 2, changed: 1 });
    const app = readWorkbook((await buildWorkbook({ root })).buffer)[1].rows;
    assert.equal(app.find((row) => row[0] === 'demo.save')[5], 'English changed');
    const again = await importWorkbook(await fixture('reviewed-by-openpyxl.xlsx'), { root, dryRun: true });
    assert.ok(again.problems.some((problem) => /App row 3 \(demo\.save\): the English has changed since this file was made/.test(problem)));
  });
});
