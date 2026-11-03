// The text catalogues (packages/shared/src/i18n, see packages/shared/src/text.ts) and the reviewer's spreadsheet:
// exporting every text members see with its current translation, and reading the reviewer's corrections back in.
// A text counts as reviewed when the review record (i18n/review/<language>.json) holds the English it was reviewed
// against; when the English changes later, it is a draft again.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWorkbook, writeWorkbook } from './xlsx.mjs';

export const DEFAULT_ROOT = fileURLToPath(new URL('../../packages/shared/src/i18n/', import.meta.url));
export const AREAS = ['app', 'shared', 'api', 'validation', 'email'];
export const LANGUAGE_NAMES = { si: 'Sinhala', ta: 'Tamil' };
export const STATUSES = ['Draft', 'Approved', 'Needs discussion'];

/** Staff screens stay in English (owner, 3 Nov 2026): their texts are not sent for translation. */
export const isStaffKey = (key) => key.startsWith('api.staff.') || key.startsWith('validation.staff.');

const readJson = async (path, fallback) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
};

export async function loadCatalogues(root = DEFAULT_ROOT, languages = ['en']) {
  const out = {};
  for (const language of languages) {
    out[language] = {};
    for (const area of AREAS) out[language][area] = await readJson(join(root, language, `${area}.json`), {});
  }
  return out;
}

export const loadReview = (root, language) => readJson(join(root, 'review', `${language}.json`), {});

/** Writes a translation in the English order, so the files stay easy to compare. */
async function saveArea(root, language, area, english, texts) {
  const ordered = Object.fromEntries(Object.keys(english).filter((key) => key in texts).map((key) => [key, texts[key]]));
  await writeFile(join(root, language, `${area}.json`), `${JSON.stringify(ordered, null, 2)}\n`);
}

/** Placeholders ({name}) and tags (<strong>) a translation must keep, as in the English. */
export function marks(text) {
  const placeholders = [...new Set(text.match(/\{\w+\}/g) ?? [])].sort();
  const tags = [...new Set(text.match(/<\/?\w+>/g) ?? [])].sort();
  return { placeholders, tags, all: [...placeholders, ...tags.filter((tag) => !tag.startsWith('</'))] };
}
const sameMarks = (a, b) => JSON.stringify(marks(a).placeholders) === JSON.stringify(marks(b).placeholders) && JSON.stringify(marks(a).tags) === JSON.stringify(marks(b).tags);

const areaOf = (key) =>
  key.startsWith('api.') ? 'api' : key.startsWith('validation.') ? 'validation' : key.startsWith('email.') ? 'email' : key.startsWith('date.') ? 'shared' : 'app';

// --- Where each text appears, for the reviewer ------------------------------------------------------------------------

const PLACES = {
  common: 'Used in many places', layout: 'Header and footer of every screen', errorPage: 'When a screen fails',
  notFound: 'Page not found', badges: 'Trust badges', botCheck: 'Security check (Turnstile)', signIn: 'Sign-in screen',
  name: 'First sign-in: your name', home: 'Start page (signed out)', dashboard: 'Start page: your profiles',
  card: 'Profile cards on the start page', create: 'Create a profile', account: 'Your account: download or delete',
  retention: 'What deleting removes and keeps', recentSignIn: 'Sign in again before deleting', format: 'Dates and times',
  invite: 'Invitation page for the candidate', verify: 'Verification page', fields: 'Form fields', profile: 'Profile page',
  standing: 'Profile overview', engaged: 'Engaged or married', deleteProfile: 'Delete a profile',
  details: 'Profile details form', contacts: 'Profile contact details', photos: 'Profile photos',
  people: 'Candidate and manager tab', handOver: 'Hand the profile over', inviteForm: 'Invite the candidate',
  consent: 'Candidate consent', takeOver: 'Take over the profile', requests: 'Requests tab', connections: 'Connections tab',
  blocks: 'Blocked profiles', member: 'Member cards', acting: 'Acting for (when you run several profiles)',
  report: 'Report a profile or photo', browse: 'Browse profiles', memberPage: 'Another member’s profile',
  relation: 'Another member’s profile: your request', send: 'Send a request', plan: 'Plan tab',
  change: 'Plan tab: what buying a plan does', checkout: 'Payment step', open: 'Payment in progress',
  receipt: 'Receipt upload', history: 'Past payments', option: 'Choices in lists', field: 'Field names',
  billing: 'Plans and payments', country: 'Country names', date: 'Dates (app and emails)',
};

export function whereOf(key) {
  if (key.startsWith('validation.')) return 'Form check message';
  if (key.startsWith('email.sms.')) return 'Text message (SMS)';
  if (key.startsWith('email.')) return 'Email';
  if (key.startsWith('api.')) return 'Message from the server';
  const [group, second] = key.split('.');
  if (group === 'option') return `Choices in lists: ${second}`;
  return PLACES[group] ?? group;
}

const PLACEHOLDER_MEANINGS = {
  name: 'a name', candidate: 'the candidate’s name', manager: 'the manager’s name', managerName: 'the manager’s name',
  candidateName: 'the candidate’s name', count: 'a number', date: 'a date', time: 'a date and time', expires: 'a date and time',
  phone: 'a phone number', contact: 'an email address or phone number', plan: 'the plan’s name (the owner’s words)',
  profile: 'the profile’s name', amount: 'an amount of money', price: 'an amount of money', reference: 'the payment reference',
  currency: 'LKR or USD', channel: 'a way to pay', term: 'a length, such as “3 months”', lost: 'a number of days',
  relationship: 'mother, father, guardian…', document: 'a document type', status: 'a status', reason: 'a reason',
  value: 'a contact detail', item: 'an item', tab: 'the name of a tab', who: 'a name and relationship',
  occupation: 'an occupation', age: 'an age', height: 'a height', link: 'a web link', appUrl: 'a web link',
  min: 'a number', max: 'a number', used: 'a number', cap: 'a number', daily: 'a number', monthly: 'a number',
  number: 'a number', kind: 'phone, email or social link', person: 'candidate or manager', months: 'a number of months',
  hours: 'a number of hours', code: 'the code', endsAt: 'a date and time',
};

const LEGAL = /^(create\.(self|manager)\.declare|details\.caste\.consent|billing\.refundTerm\.\d|checkout\.termsRead|account\.dialog\.understand)$/;

export function notesFor(key, english) {
  const notes = [];
  for (const placeholder of marks(english).placeholders) {
    const name = placeholder.slice(1, -1);
    notes.push(`${placeholder} becomes ${PLACEHOLDER_MEANINGS[name] ?? 'a value the app fills in'}; keep it exactly.`);
  }
  for (const tag of marks(english).tags.filter((tag) => !tag.startsWith('</'))) {
    notes.push(`Keep ${tag}…${tag.replace('<', '</')} around the same words (bold or a link).`);
  }
  if (/_one$/.test(key)) notes.push('Used when the number is 1 (in Sinhala also 0).');
  if (/_other$/.test(key)) notes.push('Used for other numbers.');
  if (LEGAL.test(key)) notes.push('Legal wording: the lawyer reviews this too.');
  if (key.startsWith('email.sms.')) notes.push('A text message: keep it short (Sinhala texts cost more per message).');
  if (key.startsWith('country.')) notes.push('The draft is the Unicode CLDR country name; change it only if members would say it differently.');
  if (/^date\.(day|when|whenLong)$/.test(key)) notes.push('The order of a date: move the parts, keep each {part}.');
  return notes.join(' ');
}

// --- Export -----------------------------------------------------------------------------------------------------------

const TABS = [
  { name: 'App', areas: ['app', 'shared'] },
  { name: 'Messages', areas: ['api', 'validation'] },
  { name: 'Emails and texts', areas: ['email'] },
];

/** The reviewer's workbook for `language`, and counts for the export report. */
export async function buildWorkbook({ root = DEFAULT_ROOT, language = 'si' } = {}) {
  const languageName = LANGUAGE_NAMES[language] ?? language;
  const catalogues = await loadCatalogues(root, ['en', language]);
  const review = await loadReview(root, language);
  const counts = { total: 0, translated: 0, approved: 0, changed: 0 };
  const columns = [
    { title: 'Key', width: 26 },
    { title: 'Where it appears', width: 24 },
    { title: 'English', width: 48 },
    { title: `${languageName} now`, width: 48 },
    { title: `Your ${languageName}`, width: 48, editable: true },
    { title: 'Status', width: 16, editable: true, choices: STATUSES },
    { title: 'Your notes', width: 30, editable: true },
    { title: 'Keep as is', width: 36 },
  ];
  const sheets = TABS.map((tab) => ({
    name: tab.name,
    columns,
    rows: tab.areas.flatMap((area) =>
      Object.entries(catalogues.en[area])
        .filter(([key]) => !isStaffKey(key))
        .map(([key, english]) => {
          const current = catalogues[language][area][key] ?? '';
          const reviewed = review[key];
          const status = reviewed ? (reviewed.english === english ? 'Approved' : 'English changed') : 'Draft';
          counts.total += 1;
          if (current) counts.translated += 1;
          if (status === 'Approved') counts.approved += 1;
          if (status === 'English changed') counts.changed += 1;
          return [key, whereOf(key), english, current, '', status, '', notesFor(key, english)];
        }),
    ),
  }));
  const glossary = await readJson(join(root, 'glossary.json'), { terms: [] });
  const readMe = {
    name: 'Read me',
    plain: true,
    columns: [{ title: `Favorite Hearts: ${languageName} text for review`, width: 120 }],
    rows: [
      [`Exported ${new Date().toISOString().slice(0, 10)}. Every text members see in the app, in messages from the server, and in emails and text messages.`],
      [''],
      ['How to review'],
      [`1. In the tabs App, Messages and Emails and texts, read the English and the ${languageName} now.`],
      [`2. If the ${languageName} is right, set Status to Approved and leave “Your ${languageName}” empty.`],
      [`3. If it needs changing, write the whole corrected text in “Your ${languageName}”. You do not need to change Status.`],
      ['4. If you are unsure, set Status to Needs discussion and explain in “Your notes”.'],
      ['5. Keep everything named in “Keep as is”: words in {curly brackets} are filled in by the app (a name, a date, a number), and words between <strong> and </strong> are shown in bold or as a link.'],
      ['6. Do not change the Key, Where it appears or English columns, and do not add or remove rows. Save as .xlsx and send the file back.'],
      [''],
      ['Status: Draft = not reviewed yet. Approved = reviewed. English changed = reviewed before, but the English has changed since, so please check it again.'],
      ['The Glossary tab lists words the earlier demo used, for consistency. Names of people, plans and places that members type themselves are never translated.'],
      [''],
      ['සමාලෝචනය කරන ආකාරය: සිංහල නිවැරදි නම් Status තීරුවේ Approved තෝරන්න. වෙනස් කළ යුතු නම් සම්පූර්ණ නිවැරදි පාඨය “Your Sinhala” තීරුවේ ලියන්න. {වරහන් තුළ} ඇති වචන සහ <strong> ලකුණු වෙනස් නොකරන්න.'],
      [''],
      [`Counts at export: ${counts.total} texts, ${counts.translated} with ${languageName}, ${counts.approved} approved, ${counts.changed} with changed English.`],
    ],
  };
  const glossarySheet = {
    name: 'Glossary',
    columns: [
      { title: 'English', width: 34 },
      { title: 'Sinhala (demo)', width: 40 },
      { title: 'Tamil (demo, hidden for now)', width: 40 },
    ],
    rows: glossary.terms.map((term) => [term.en, term.si, term.ta]),
  };
  return { buffer: writeWorkbook([readMe, ...sheets, glossarySheet]), counts };
}

export async function exportWorkbook({ root = DEFAULT_ROOT, language = 'si', outDir }) {
  const { buffer, counts } = await buildWorkbook({ root, language });
  await mkdir(outDir, { recursive: true });
  const file = join(outDir, `favorite-hearts-text-${language}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  await writeFile(file, buffer);
  return { file, counts, bytes: buffer.length };
}

// --- Import -----------------------------------------------------------------------------------------------------------

/**
 * Reads a reviewed workbook. A row with text in "Your <language>" replaces the translation (after checking it keeps
 * the English placeholders and tags) and counts as reviewed; a row marked Approved keeps the current translation and
 * counts as reviewed. A row whose English no longer matches is skipped: it was reviewed against old English.
 */
export async function importWorkbook(buffer, { root = DEFAULT_ROOT, language = 'si', dryRun = false, today = new Date().toISOString().slice(0, 10) } = {}) {
  const languageName = LANGUAGE_NAMES[language] ?? language;
  const catalogues = await loadCatalogues(root, ['en', language]);
  const review = await loadReview(root, language);
  const report = { corrected: [], approved: [], discuss: [], unchanged: 0, problems: [] };
  const seen = new Set();
  for (const sheet of readWorkbook(buffer)) {
    const [header = [], ...rows] = sheet.rows;
    const col = (title) => header.findIndex((cell) => cell.trim().toLowerCase() === title.toLowerCase());
    const at = { key: col('Key'), english: col('English'), yours: col(`Your ${languageName}`), status: col('Status'), notes: col('Your notes') };
    if (at.key < 0 || at.yours < 0) continue;
    rows.forEach((row, index) => {
      const key = (row[at.key] ?? '').trim();
      if (!key) return;
      const where = `${sheet.name} row ${index + 2} (${key})`;
      const area = areaOf(key);
      const english = catalogues.en[area][key];
      if (english === undefined) return report.problems.push(`${where}: this key does not exist any more.`);
      if (seen.has(key)) return report.problems.push(`${where}: this key appears twice; the second row was skipped.`);
      seen.add(key);
      if (at.english >= 0 && (row[at.english] ?? '') !== english) {
        return report.problems.push(`${where}: the English has changed since this file was made, so the row was skipped. Export a new file for it.`);
      }
      const yours = (row[at.yours] ?? '').trim();
      const status = (row[at.status] ?? '').trim();
      if (status === 'Needs discussion') report.discuss.push({ key, english, note: (row[at.notes] ?? '').trim() });
      if (yours) {
        if (!sameMarks(yours, english)) {
          return report.problems.push(
            `${where}: the text must keep ${marks(english).all.join(' ') || 'no placeholders'} as in the English; it has ${marks(yours).all.join(' ') || 'none'}. Not imported.`,
          );
        }
        catalogues[language][area][key] = yours;
        review[key] = { english, at: today };
        report.corrected.push(key);
      } else if (status === 'Approved') {
        if (!catalogues[language][area][key]) return report.problems.push(`${where}: marked Approved, but there is no ${languageName} text to approve.`);
        if (review[key]?.english !== english) {
          review[key] = { english, at: today };
          report.approved.push(key);
        } else report.unchanged += 1;
      } else report.unchanged += 1;
    });
  }
  if (!dryRun) {
    for (const area of AREAS) await saveArea(root, language, area, catalogues.en[area], catalogues[language][area]);
    await mkdir(join(root, 'review'), { recursive: true });
    const ordered = Object.fromEntries(Object.keys(review).sort().map((key) => [key, review[key]]));
    await writeFile(join(root, 'review', `${language}.json`), `${JSON.stringify(ordered, null, 2)}\n`);
  }
  return report;
}

// --- Status -----------------------------------------------------------------------------------------------------------

export async function status({ root = DEFAULT_ROOT, language = 'si' } = {}) {
  const catalogues = await loadCatalogues(root, ['en', language]);
  const review = await loadReview(root, language);
  return AREAS.map((area) => {
    const keys = Object.keys(catalogues.en[area]).filter((key) => !isStaffKey(key));
    const translated = keys.filter((key) => catalogues[language][area][key]).length;
    const approved = keys.filter((key) => review[key]?.english === catalogues.en[area][key]).length;
    const changed = keys.filter((key) => review[key] && review[key].english !== catalogues.en[area][key]).length;
    return { area, total: keys.length, translated, approved, changed };
  });
}
