// How far the translation is: per area, the texts members see, how many are translated, and how many the reviewer has
// approved against the current English. Run via `npm run text:status` (optional: -- --language si).
import { parseArgs } from 'node:util';
import { status } from './text/catalogue.mjs';

const { values } = parseArgs({ options: { language: { type: 'string', default: 'si' } } });
const rows = await status({ language: values.language });
console.log(`Language: ${values.language}`);
for (const row of rows) {
  console.log(`  ${row.area.padEnd(11)} ${String(row.total).padStart(4)} texts  ${String(row.translated).padStart(4)} translated  ${String(row.approved).padStart(4)} approved${row.changed ? `  ${row.changed} need another look (English changed)` : ''}`);
}
const total = rows.reduce((sum, row) => ({ total: sum.total + row.total, translated: sum.translated + row.translated, approved: sum.approved + row.approved }), { total: 0, translated: 0, approved: 0 });
console.log(`  all         ${String(total.total).padStart(4)} texts  ${String(total.translated).padStart(4)} translated  ${String(total.approved).padStart(4)} approved`);
