// Reads the reviewer's spreadsheet back: corrected texts replace the drafts, approved ones are recorded as reviewed,
// and anything that cannot be used is listed with its row. See scripts/text/catalogue.mjs.
// Run via `npm run text:import -- <file.xlsx>` (add --dry-run to only report; --language si by default).
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { importWorkbook } from './text/catalogue.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { language: { type: 'string', default: 'si' }, 'dry-run': { type: 'boolean', default: false } },
});
if (positionals.length !== 1) {
  console.error('Give the reviewed .xlsx file: npm run text:import -- path/to/file.xlsx');
  process.exit(1);
}
const report = await importWorkbook(await readFile(positionals[0]), { language: values.language, dryRun: values['dry-run'] });
console.log(`${values['dry-run'] ? 'Dry run, nothing written. ' : ''}Corrected: ${report.corrected.length}. Approved: ${report.approved.length}. Unchanged: ${report.unchanged}.`);
for (const item of report.discuss) console.log(`Needs discussion: ${item.key}${item.note ? ` (“${item.note}”)` : ''}`);
for (const problem of report.problems) console.log(`Problem: ${problem}`);
process.exit(report.problems.length ? 1 : 0);
