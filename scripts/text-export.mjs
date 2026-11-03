// Writes the reviewer's spreadsheet: every text members see, in English and the translation, with columns for the
// reviewer's corrections (OWNER-DECISIONS section 10: "the reviewer never touches code"). See scripts/text/catalogue.mjs.
// Run via `npm run text:export` (optional: -- --language si --out <folder>; the default folder is dist/text/).
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { exportWorkbook } from './text/catalogue.mjs';

const { values } = parseArgs({ options: { language: { type: 'string', default: 'si' }, out: { type: 'string' } } });
const outDir = values.out ?? fileURLToPath(new URL('../dist/text/', import.meta.url));
const { file, counts, bytes } = await exportWorkbook({ language: values.language, outDir });
console.log(`Wrote ${file} (${Math.round(bytes / 1024)} KB).`);
console.log(`${counts.total} texts: ${counts.translated} translated, ${counts.approved} approved, ${counts.changed} with changed English.`);
