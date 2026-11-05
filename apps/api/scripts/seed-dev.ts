/**
 * Ten synthetic candidates (and one family manager) in the DEVELOPMENT database, for trying the member, staff and owner
 * screens with real data shapes. Never for staging or production: it refuses unless NODE_ENV is development.
 *
 *   npm run seed:dev -- --inbox you@gmail.com
 *
 * Sign-in codes are emailed, so every account uses a plus-address of `--inbox` (you+fh-seed-amaya@gmail.com, …): all
 * of them land in that one inbox. Running it again does nothing if the seed accounts exist already.
 *
 * What it makes, so each screen has something to show:
 *   - published, verified members with and without plans, one living abroad, one managed by her mother;
 *   - a draft that is half filled in (the setup guide); a document waiting for review, with sample front and back
 *     photos (staff queue); a rejected document; a reported profile (reports queue); a paused profile.
 * Photos and document images are generated placeholders marked "sample", stored in the R2 buckets of apps/api/.env.
 */
import { parseArgs } from 'node:util';
import { eq, like } from 'drizzle-orm';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { createDb } from '../src/db/client.ts';
import * as schema from '../src/db/schema/index.ts';
import { env } from '../src/env.ts';
import { processDocument, processPhoto } from '../src/storage/images.ts';
import { createR2Storage } from '../src/storage/r2.ts';
import { newObjectKey } from '../src/storage/storage.ts';

if (env.NODE_ENV !== 'development') {
  console.error(`Refusing: NODE_ENV is ${env.NODE_ENV}. The seed is for the development database only.`);
  process.exit(1);
}
const { values } = parseArgs({ options: { inbox: { type: 'string' } } });
const inbox = values.inbox?.trim() ?? '';
const at = inbox.indexOf('@');
if (at < 1) {
  console.error('Give the inbox the sign-in codes should go to: npm run seed:dev -- --inbox you@gmail.com');
  process.exit(1);
}
const address = (name: string) => `${inbox.slice(0, at)}+fh-seed-${name.toLowerCase()}${inbox.slice(at)}`;

const { db, pool } = createDb(env.DATABASE_URL_DIRECT);
const storage = createR2Storage({
  accountId: env.R2_ACCOUNT_ID,
  accessKeyId: env.R2_ACCESS_KEY_ID,
  secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  privateBucket: env.R2_BUCKET_PRIVATE,
  derivedBucket: env.R2_BUCKET_DERIVED,
  signedUrlTtlSeconds: env.SIGNED_URL_TTL_SECONDS,
});

const already = await db.select({ id: schema.user.id }).from(schema.user).where(like(schema.user.email, '%+fh-seed-%')).limit(1);
if (already.length) {
  console.log('The seed accounts exist already; nothing was changed.');
  await pool.end();
  process.exit(0);
}

type State = 'published' | 'paused' | 'draft' | 'incomplete' | 'pending' | 'rejected';
type Seed = {
  first: string; last: string; gender: 'man' | 'woman'; birthDate: string; country: string; region?: string; city: string;
  occupation: string; education: string; heightCm: number; religion: string; state: State; plan?: string; color: string;
  manager?: { first: string; last: string; relationship: 'mother' };
};
const SEED: Seed[] = [
  { first: 'Amaya', last: 'Fernando', gender: 'woman', birthDate: '1996-04-12', country: 'LK', region: 'Colombo', city: 'Dehiwala', occupation: 'Pharmacist', education: 'BPharm', heightCm: 160, religion: 'christian', state: 'published', plan: 'premium_3m', color: '#7a5a8c' },
  { first: 'Ravindu', last: 'Perera', gender: 'man', birthDate: '1994-09-03', country: 'LK', region: 'Kandy', city: 'Peradeniya', occupation: 'Civil engineer', education: 'BSc Engineering', heightCm: 176, religion: 'buddhist', state: 'published', plan: 'starter_1m', color: '#3f6b7d' },
  { first: 'Ishara', last: 'Wijesinghe', gender: 'woman', birthDate: '1998-01-25', country: 'LK', region: 'Galle', city: 'Galle', occupation: 'Teacher', education: 'BEd', heightCm: 158, religion: 'buddhist', state: 'published', color: '#9a6a4f' },
  { first: 'Kasun', last: 'Jayawardena', gender: 'man', birthDate: '1992-06-30', country: 'AU', city: 'Melbourne', occupation: 'Software developer', education: 'MSc Computing', heightCm: 174, religion: 'buddhist', state: 'published', plan: 'starter_1m', color: '#4f6d3a' },
  { first: 'Nethmi', last: 'Rajapaksha', gender: 'woman', birthDate: '1997-11-08', country: 'LK', region: 'Kurunegala', city: 'Kurunegala', occupation: 'Accountant', education: 'BCom', heightCm: 162, religion: 'buddhist', state: 'published', plan: 'premium_3m', color: '#8c4f5e', manager: { first: 'Sunethra', last: 'Rajapaksha', relationship: 'mother' } },
  { first: 'Dilan', last: 'Silva', gender: 'man', birthDate: '1995-03-17', country: 'LK', region: 'Gampaha', city: 'Negombo', occupation: 'Chef', education: 'Diploma', heightCm: 171, religion: 'christian', state: 'incomplete', color: '#6b5a3f' },
  { first: 'Hiruni', last: 'Gunasekara', gender: 'woman', birthDate: '1999-07-21', country: 'LK', region: 'Matara', city: 'Matara', occupation: 'Nurse', education: 'BSc Nursing', heightCm: 157, religion: 'buddhist', state: 'pending', color: '#5a7a8c' },
  { first: 'Sahan', last: 'Kumar', gender: 'man', birthDate: '1993-12-02', country: 'LK', region: 'Jaffna', city: 'Jaffna', occupation: 'Doctor', education: 'MBBS', heightCm: 173, religion: 'hindu', state: 'rejected', color: '#7d5a3f' },
  { first: 'Tharushi', last: 'Bandara', gender: 'woman', birthDate: '1996-05-14', country: 'GB', city: 'London', occupation: 'Researcher', education: 'PhD', heightCm: 163, religion: 'buddhist', state: 'published', color: '#3f5a7d' },
  { first: 'Chamod', last: 'Herath', gender: 'man', birthDate: '1991-10-09', country: 'LK', region: 'Colombo', city: 'Nugegoda', occupation: 'Lawyer', education: 'LLB', heightCm: 178, religion: 'buddhist', state: 'paused', color: '#5e3f7d' },
];

const days = (n: number) => new Date(Date.now() + n * 86_400_000);
const card = (lines: string[], color: string, w = 1200, h = 760) =>
  sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${color}"/>${lines
    .map((text, i) => `<text x="60" y="${140 + i * 90}" font-size="${i === 0 ? 64 : 44}" font-family="sans-serif" fill="#ffffff">${text}</text>`)
    .join('')}</svg>`)).png().toBuffer();

async function placeholderPhoto(profileId: string, seed: Seed) {
  const processed = await processPhoto(await card([seed.first, 'Sample photo for testing'], seed.color, 600, 800));
  const originalKey = newObjectKey('photos');
  const blurredKey = `${originalKey}-blurred`;
  await storage.put('private', originalKey, processed.original, 'image/jpeg');
  await storage.put('derived', blurredKey, processed.blurred, 'image/jpeg');
  const [photo] = await db
    .insert(schema.photo)
    .values({ profileId, slot: 0, isCover: true, blurredKey, width: processed.width, height: processed.height })
    .returning({ id: schema.photo.id });
  await db.insert(schema.photoOriginal).values({ photoId: photo!.id, objectKey: originalKey });
}

async function sampleDocument(seed: Seed, side: string) {
  const image = (await processDocument(await card(['SAMPLE - NOT A REAL DOCUMENT', `NIC ${side}`, `${seed.first} ${seed.last}`, 'For testing only'], '#8a8372'))).image;
  const key = newObjectKey('documents');
  await storage.put('private', key, image, 'image/jpeg');
  return key;
}

async function account(first: string, last: string, phone: string | null) {
  const id = randomUUID();
  await db.insert(schema.user).values({ id, name: `${first} ${last}`, email: address(first), emailVerified: true, phoneNumber: phone, phoneNumberVerified: Boolean(phone) });
  await db.insert(schema.memberAccount).values({ userId: id });
  return id;
}

const made: { name: string; email: string; state: string; plan: string; profileId: string; userId: string }[] = [];
for (const [index, seed] of SEED.entries()) {
  const phone = `+9477990${String(index + 1).padStart(4, '0')}`;
  const verifiedPhone = seed.state !== 'incomplete' ? phone : null;
  const candidateId = await account(seed.first, seed.last, seed.manager ? null : verifiedPhone);
  const managerId = seed.manager ? await account(seed.manager.first, seed.manager.last, verifiedPhone) : null;
  const publisher = managerId ?? candidateId;

  // Verification of the account that publishes: approved, waiting (with sample photos), rejected, or none yet.
  if (['published', 'paused'].includes(seed.state)) {
    await db.insert(schema.verificationCase).values({ subjectUserId: publisher, documentType: 'nic', status: 'approved', reviewedAt: new Date(), purgeAfter: days(90) });
  } else if (seed.state === 'pending' && storage.configured) {
    await db.insert(schema.verificationCase).values({
      subjectUserId: publisher, documentType: 'nic', evidenceKey: await sampleDocument(seed, 'front'), evidenceBackKey: await sampleDocument(seed, 'back'),
    });
  } else if (seed.state === 'rejected') {
    await db.insert(schema.verificationCase).values({ subjectUserId: publisher, documentType: 'passport', status: 'rejected', reviewedAt: new Date(), decisionReason: 'The photo is blurred; please send a clearer one.', purgeAfter: days(90) });
  }

  const complete = seed.state !== 'incomplete';
  const [profile] = await db
    .insert(schema.profile)
    .values({
      management: seed.manager ? 'manager' : 'self',
      createdByUserId: publisher,
      candidateUserId: seed.manager ? null : candidateId,
      displayName: seed.first,
      gender: seed.gender,
      birthDate: seed.birthDate,
      maritalStatus: 'never_married',
      adultDeclaredAt: new Date(),
      ...(complete
        ? {
            countryCode: seed.country, region: seed.region ?? null, city: seed.city, occupation: seed.occupation, education: seed.education,
            heightCm: String(seed.heightCm) as never, religion: seed.religion as never, languages: ['Sinhala', 'English'],
            bio: `Test profile. ${seed.first} values honesty and family, enjoys weekends outdoors, and hopes for a kind, shared future.`,
          }
        : {}),
    })
    .returning({ id: schema.profile.id });
  const profileId = profile!.id;
  if (managerId) {
    await db.insert(schema.profileManager).values({ profileId, managerUserId: managerId, relationship: seed.manager!.relationship, authorityDeclaredAt: new Date() });
  }
  if (complete) await db.insert(schema.privateContact).values({ profileId, person: seed.manager ? 'manager' : 'candidate', kind: 'phone', value: phone, verifiedAt: new Date() });
  if (complete && storage.configured) await placeholderPhoto(profileId, seed);
  if (['published', 'paused'].includes(seed.state)) {
    await db.update(schema.profile).set({ status: 'published' }).where(eq(schema.profile.id, profileId));
    if (seed.state === 'paused') await db.update(schema.profile).set({ status: 'paused' }).where(eq(schema.profile.id, profileId));
  }
  if (seed.plan) await db.insert(schema.entitlementEvent).values({ profileId, kind: 'grant', planId: seed.plan, startsAt: days(-1), endsAt: days(29) });
  made.push({ name: seed.manager ? `${seed.first} (managed by ${seed.manager.first}, ${address(seed.manager.first)})` : seed.first, email: address(seed.first), state: seed.state, plan: seed.plan ?? 'no plan', profileId, userId: candidateId });
}

// A report waiting for staff: Ravindu reports Tharushi (not a serious category, so her profile stays visible).
const by = (first: string) => made.find((m) => m.name.startsWith(first))!;
await db.insert(schema.report).values({
  reporterUserId: by('Ravindu').userId, reporterProfileId: by('Ravindu').profileId, targetProfileId: by('Tharushi').profileId,
  category: 'harassment', detail: 'Test report from the seed script.', reporterVerified: true,
});

console.log(`Seeded ${made.length} candidates in the development database${storage.configured ? '' : ' (R2 is not set up, so no photos or document images)'}:`);
for (const m of made) console.log(`  ${m.state.padEnd(10)} ${m.plan.padEnd(11)} ${m.name.padEnd(46)} ${m.email}`);
console.log('Sign in at http://localhost:4321/app/ with any of these addresses; the code arrives in your inbox.');
await pool.end();
