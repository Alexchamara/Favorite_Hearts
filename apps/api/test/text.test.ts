/**
 * Stage 5c: English and Sinhala (OWNER-DECISIONS section 10). The catalogues are complete and consistent: every text
 * members see has Sinhala with the same placeholders and tags as the English, and every value list has its labels.
 * Through the real HTTP API: errors and field messages come in the language the request asks for; a new member
 * account starts in the sign-up's language and the member can change it (not to hidden Tamil); codes are emailed in
 * the screen's language; queued emails use the member's saved language.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, describe, test } from 'node:test';
import { eq } from 'drizzle-orm';
import {
  CHILDREN_PLANS,
  COMMUNITY_OPENNESS,
  CONTACT_KINDS,
  CONTACT_PERSONS,
  DIETS,
  DOCUMENT_TYPES,
  formatDate,
  FAMILY_INVOLVEMENT,
  GENDERS,
  HABIT_FREQUENCIES,
  HOROSCOPE_IMPORTANCE,
  INCOME_RANGES,
  INTEREST_STATUSES,
  languageFromHeader,
  MANAGER_RELATIONSHIPS,
  MARITAL_STATUSES,
  OFFERED_LANGUAGES,
  PAYMENT_CHANNELS,
  PAYMENT_STATUSES,
  PROFILE_STATUSES,
  PROFILE_VALUES,
  REFUND_REASONS,
  RELIGIONS,
  RELOCATION_PREFERENCES,
  REPORT_CATEGORIES,
  SOCIAL_PLATFORMS,
  TEXT_CONSTANTS,
  textFor,
  TIMELINES,
  VERIFICATION_STATUSES,
} from '@fh/shared';
import { user } from '../src/db/schema/auth.ts';
import { memberAccount } from '../src/db/schema/members.ts';
import { notificationOutbox } from '../src/db/schema/operations.ts';
import { sendNotifications } from '../src/jobs/notifications.ts';
import { createTestApp, type Res } from './harness.ts';

const AREAS = ['app', 'shared', 'api', 'validation', 'email', 'website'] as const;
const root = new URL('../../../packages/shared/src/i18n/', import.meta.url);
const catalogue = (language: string, area: string): Record<string, string> =>
  JSON.parse(readFileSync(new URL(`${language}/${area}.json`, root), 'utf8'));
const isStaff = (key: string) => key.startsWith('api.staff.') || key.startsWith('validation.staff.');
/** Texts waiting for a translator (owner decision T-1, 9 Nov 2026): blank Sinhala allowed, English shown meanwhile. */
const waiting = (language: string): { new: string[]; englishChanged: Record<string, string> } => {
  try {
    return { new: [], englishChanged: {}, ...JSON.parse(readFileSync(new URL(`waiting/${language}.json`, root), 'utf8')) };
  } catch {
    return { new: [], englishChanged: {} };
  }
};
const marks = (text: string) => [...(text.match(/\{\w+\}/g) ?? []), ...(text.match(/<\/?\w+\/?>/g) ?? [])].sort();

const ok = (res: Res, status = 200) => {
  assert.equal(res.status, status, JSON.stringify(res.body));
  return res.body;
};

describe('text catalogues', () => {
  test('every translation exists in English, keeps its placeholders and tags, and members see nothing untranslated', () => {
    const problems: string[] = [];
    for (const area of AREAS) {
      const en = catalogue('en', area);
      for (const language of ['si', 'ta']) {
        for (const [key, text] of Object.entries(catalogue(language, area))) {
          if (!(key in en)) problems.push(`${language}/${area}: ${key} is not in English`);
          else if (JSON.stringify(marks(text)) !== JSON.stringify(marks(en[key]!))) problems.push(`${language}/${area}: ${key} changes placeholders`);
        }
      }
      const si = catalogue('si', area);
      const listed = new Set(waiting('si').new);
      for (const key of Object.keys(en)) if (!isStaff(key) && !si[key]?.trim() && !listed.has(key)) problems.push(`si/${area}: ${key} has no Sinhala`);
    }
    assert.deepEqual(problems, []);
  });

  test('the waiting list is exact: listed texts exist, new ones are still blank, changed ones still have the old translation', () => {
    const problems: string[] = [];
    const all = Object.assign({}, ...AREAS.map((area) => catalogue('en', area))) as Record<string, string>;
    const si = Object.assign({}, ...AREAS.map((area) => catalogue('si', area))) as Record<string, string>;
    const list = waiting('si');
    for (const key of list.new) {
      if (!(key in all)) problems.push(`${key} is waiting but not in English`);
      else if (si[key]?.trim()) problems.push(`${key} has Sinhala now: take it off the waiting list`);
    }
    for (const [key, before] of Object.entries(list.englishChanged)) {
      if (!(key in all)) problems.push(`${key} is waiting but not in English`);
      else if (all[key] === before) problems.push(`${key}: its English has not changed`);
      else if (!si[key]?.trim()) problems.push(`${key} has no Sinhala: list it as new instead`);
    }
    assert.deepEqual(problems, []);
  });

  test('each catalogue keeps to its own keys, and staff texts are only in English', () => {
    for (const key of Object.keys(catalogue('en', 'app'))) assert.ok(!/^(api|email|validation|web)\./.test(key), key);
    for (const area of ['api', 'email', 'validation'] as const) {
      for (const key of Object.keys(catalogue('en', area))) assert.ok(key.startsWith(`${area}.`), key);
    }
    for (const key of Object.keys(catalogue('en', 'website'))) assert.ok(key.startsWith('web.'), key);
    for (const key of Object.keys(catalogue('en', 'shared'))) assert.ok(key.startsWith('date.'), key);
    for (const area of AREAS) for (const key of Object.keys(catalogue('si', area))) assert.ok(!isStaff(key), key);
  });

  test('every value the app shows from a list has a label, and so does every language the switch offers', () => {
    const app = catalogue('en', 'app');
    const lists: Record<string, readonly string[]> = {
      gender: GENDERS, marital: MARITAL_STATUSES, religion: RELIGIONS, timeline: TIMELINES, relocation: RELOCATION_PREFERENCES,
      income: INCOME_RANGES, horoscope: HOROSCOPE_IMPORTANCE, diet: DIETS, habit: HABIT_FREQUENCIES, children: CHILDREN_PLANS,
      involvement: FAMILY_INVOLVEMENT, community: COMMUNITY_OPENNESS, value: PROFILE_VALUES, relationship: MANAGER_RELATIONSHIPS,
      status: PROFILE_STATUSES, document: DOCUMENT_TYPES, caseStatus: VERIFICATION_STATUSES, contactKind: CONTACT_KINDS,
      contactPerson: CONTACT_PERSONS, interestStatus: INTEREST_STATUSES, reportCategory: REPORT_CATEGORIES, platform: SOCIAL_PLATFORMS,
    };
    const missing = Object.entries(lists).flatMap(([group, values]) => values.map((v) => `option.${group}.${v}`).filter((key) => !(key in app)));
    for (const [group, values] of [['channel', PAYMENT_CHANNELS], ['channelPhrase', PAYMENT_CHANNELS], ['paymentStatus', PAYMENT_STATUSES], ['refundReason', REFUND_REASONS]] as const) {
      missing.push(...values.map((v) => `billing.${group}.${v}`).filter((key) => !(key in app)));
    }
    missing.push(...OFFERED_LANGUAGES.map((language) => `layout.languageTo.${language}`).filter((key) => !(key in app)));
    for (const badge of ['managerVerified', 'candidateConfirmed', 'candidateIdentityVerified']) {
      missing.push(...[`badges.${badge}`, `badges.${badge}.explains`].filter((key) => !(key in app)));
    }
    assert.deepEqual(missing, []);
  });

  test('limits named in the texts come from the rules themselves', () => {
    const en = { ...catalogue('en', 'api'), ...catalogue('en', 'validation'), ...catalogue('en', 'email') };
    assert.equal(textFor({ en }, 'en', 'validation.ageRange'), `Enter an age between ${TEXT_CONSTANTS.minAge} and ${TEXT_CONSTANTS.maxAge}.`);
    assert.equal(textFor({ en }, 'en', 'api.photos.limit'), `A profile can have up to ${TEXT_CONSTANTS.maxPhotos} photos.`);
    assert.equal(textFor({ en }, 'en', 'email.code.expires'), `It expires in ${TEXT_CONSTANTS.codeMinutes} minutes.`);
  });

  test('dates read the Sri Lanka clock and use the catalogue’s month names and order, not the browser’s', () => {
    const catalogues = { en: catalogue('en', 'shared'), si: catalogue('si', 'shared') };
    const lateEvening = '2026-12-03T18:45:00Z'; // already 4 December in Sri Lanka (UTC+5:30)
    assert.equal(formatDate(catalogues, 'en', lateEvening, 'day'), '4 December 2026');
    assert.equal(formatDate(catalogues, 'en', lateEvening, 'when'), '4 Dec 2026, 00:15');
    assert.equal(formatDate(catalogues, 'si', lateEvening, 'day'), '2026 දෙසැම්බර් 4');
    assert.equal(formatDate(catalogues, 'si', lateEvening, 'whenLong'), '2026 දෙසැම්බර් 4, 00:15');
  });

  test('every country has a name in both languages', () => {
    const [en, si] = [catalogue('en', 'app'), catalogue('si', 'app')];
    const countries = Object.keys(en).filter((key) => key.startsWith('country.'));
    assert.equal(countries.length, 249);
    assert.deepEqual(countries.filter((key) => !si[key] || si[key] === en[key]), []);
  });

  test('the best offered language is picked from Accept-Language; Tamil is hidden', () => {
    assert.equal(languageFromHeader('si-LK,si;q=0.9,en;q=0.8'), 'si');
    assert.equal(languageFromHeader('en-GB,en;q=0.9,si;q=0.8'), 'en');
    assert.equal(languageFromHeader('ta-LK,ta;q=0.9,si;q=0.5'), 'si');
    assert.equal(languageFromHeader('ta'), 'en');
    assert.equal(languageFromHeader('fr;q=0.9, si;q=0'), 'en');
    assert.equal(languageFromHeader(null), 'en');
  });

  test('plural forms and the English fallback', () => {
    const catalogues = { en: { 'x.left_one': '{count} left', 'x.left_other': '{count} left in all', 'x.only': 'English only' }, si: { 'x.left_one': 'එකක් {count}', 'x.left_other': '{count}ක්' } };
    assert.equal(textFor(catalogues, 'en', 'x.left', { count: 1 }), '1 left');
    assert.equal(textFor(catalogues, 'en', 'x.left', { count: 0 }), '0 left in all');
    assert.equal(textFor(catalogues, 'si', 'x.left', { count: 0 }), 'එකක් 0', 'Sinhala counts 0 as one');
    assert.equal(textFor(catalogues, 'si', 'x.left', { count: 4 }), '4ක්');
    assert.equal(textFor(catalogues, 'si', 'x.only'), 'English only');
    assert.equal(textFor(catalogues, 'si', 'x.unknown'), 'x.unknown');
    // A text waiting for a translator is blank in Sinhala: members see the English, never an empty label.
    const waiting = { en: { 'x.new': 'New text' }, si: { 'x.new': '' } };
    assert.equal(textFor(waiting, 'si', 'x.new'), 'New text');
  });
});

describe('the API in Sinhala', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  before(async () => {
    t = await createTestApp();
  });
  const sinhala = () => {
    const client = t.client();
    client.headers['accept-language'] = 'si-LK,si;q=0.9,en;q=0.8';
    return client;
  };

  test('errors come in the language the request asks for, English otherwise', async () => {
    const res = await sinhala().get('/api/v1/profiles');
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { code: 'UNAUTHENTICATED', message: 'කරුණාකර පිවිසෙන්න.' });
    assert.equal((await t.client().get('/api/v1/profiles')).body.message, 'Please sign in.');
    assert.equal((await sinhala().get('/api/v1/nowhere')).body.message, 'හමු නොවීය.');
  });

  test('field messages are translated, with the limit filled in', async () => {
    const member = await sinhala().signIn('nadeesha@example.test', 'Nadeesha');
    const created = ok(await member.post('/api/v1/profiles', { management: 'self', adultDeclared: true }), 201);
    const res = await member.patch(`/api/v1/profiles/${created.id}`, { version: created.version, displayName: 'N', bio: 'short' });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'VALIDATION');
    assert.equal(res.body.message, 'කරුණාකර උද්දීපනය කළ ක්ෂේත්‍ර පරීක්ෂා කරන්න.');
    assert.deepEqual(res.body.fields, { displayName: 'අවම වශයෙන් අක්ෂර 2ක් ලියන්න.', bio: 'අවම වශයෙන් අක්ෂර 20ක් ලියන්න.' });
  });

  test('a new account starts in the sign-up language; the member can change it, but not to hidden Tamil', async () => {
    const member = await sinhala().signIn('kasun@example.test', 'Kasun');
    ok(await member.get('/api/v1/profiles'));
    assert.equal(ok(await member.get('/api/v1/me')).memberAccount.locale, 'si');
    ok(await member.put('/api/v1/me/language', { language: 'en' }), 204);
    assert.equal(ok(await member.get('/api/v1/me')).memberAccount.locale, 'en');
    const tamil = await member.put('/api/v1/me/language', { language: 'ta' });
    assert.equal(tamil.status, 400);
    assert.equal(tamil.body.fields.language, 'විකල්පවලින් එකක් තෝරන්න.', 'messages follow the request, here Sinhala');
    const english = await t.client().signIn('ruwan@example.test', 'Ruwan');
    ok(await english.get('/api/v1/profiles'));
    assert.equal(ok(await english.get('/api/v1/me')).memberAccount.locale, 'en');
  });

  test('sign-in codes are emailed in the language of the screen that asked', async () => {
    await sinhala().signIn('dilini@example.test');
    const si = t.outbox.emails.filter((m) => m.to === 'dilini@example.test').at(-1)!;
    assert.equal(si.subject, 'ඔබේ Favorite Hearts පිවිසුම් කේතය');
    assert.match(si.html, /<html lang="si">/);
    assert.match(si.text, /^ඔබේ කේතය \d{6}\n\nඑය මිනිත්තු 10කින් කල් ඉකුත් වේ\./);
    await t.client().signIn('amal@example.test');
    assert.equal(t.outbox.emails.filter((m) => m.to === 'amal@example.test').at(-1)!.subject, 'Your Favorite Hearts sign-in code');
  });

  test('queued emails use the language the member saved; plan names stay as the owner wrote them', async () => {
    const member = await sinhala().signIn('tharindu@example.test', 'Tharindu');
    ok(await member.get('/api/v1/profiles'));
    const [account] = await t.db.select({ id: user.id }).from(user).where(eq(user.email, 'tharindu@example.test'));
    const [saved] = await t.db.select({ locale: memberAccount.locale }).from(memberAccount).where(eq(memberAccount.userId, account!.id));
    assert.equal(saved!.locale, 'si');
    await t.db.insert(notificationOutbox).values({
      eventKey: 'test.sinhala-plan-ended',
      recipientUserId: account!.id,
      channel: 'email',
      template: 'plan_ended',
      payload: { planName: 'Premium 3 months', profileName: 'Tharindu', endsAt: '2026-12-01T10:30:00Z' },
    });
    const sent: { subject: string; text: string }[] = [];
    const messenger = { ...t.deps.messenger, sendEmail: async (message: { subject: string; text: string }) => void sent.push(message) };
    assert.deepEqual(await sendNotifications({ db: t.db, messenger, config: t.deps.config }, 50), { sent: 1, failed: 0, skipped: 0 });
    assert.equal(sent[0]!.subject, 'ඔබේ සැලැස්ම අවසන් වී ඇත');
    assert.match(sent[0]!.text, /^Tharindu සඳහා වූ Premium 3 months 2026 දෙසැම්බර් 1, 16:00 \(ශ්‍රී ලංකා වේලාව\) දින අවසන් විය\./);
    assert.match(sent[0]!.text, /Favorite Hearts කාර්ය මණ්ඩලය කිසි විටෙකත් ඔබෙන් මුරපදයක් හෝ කේතයක් ඉල්ලන්නේ නැත\.$/);
  });
});
