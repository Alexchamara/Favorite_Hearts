/**
 * Local sandbox: the real API on an in-memory Postgres (PGlite) with every migration applied.
 * Emails and SMS (codes, invitation links) are printed to this console instead of being sent,
 * and files are kept in memory. It never reads apps/api/.env and never touches Neon, Resend,
 * an SMS provider or R2; everything is gone when it stops. For trying the screens only.
 *
 *   npm run dev:sandbox      → member app at http://localhost:5174/app/ (API on :8788)
 *
 * Two staff accounts are created at start-up with a random password printed below (it changes
 * on every start). Staff set up two-step login on first sign-in, as on a real environment.
 *
 * Four synthetic test members are seeded (verified, published, "Sandbox test member" in their bio),
 * so discovery and requests can be tried at once. They log in with their email address and a random password printed
 * below (one for all four, new on every start), as members do since 11 Nov 2026. Buying a plan needs the owner to enter payment details
 * first (nothing is pre-filled), so a sandbox-only route also grants a test plan directly:
 * POST http://127.0.0.1:8788/sandbox/plans.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { Hono } from 'hono';
import sharp from 'sharp';
import { createApp } from '../src/app.ts';
import { createAuth } from '../src/auth.ts';
import type { Config } from '../src/config.ts';
import * as schema from '../src/db/schema/index.ts';
import type { Deps } from '../src/http.ts';
import { addStaff } from '../src/lib/staff-accounts.ts';
import type { Messenger } from '../src/messaging/messenger.ts';
import { createTurnstile } from '../src/middleware/turnstile.ts';
import { processPhoto } from '../src/storage/images.ts';
import { newObjectKey, type Storage } from '../src/storage/storage.ts';

// Ports can be moved (e.g. to run a second sandbox): SANDBOX_API_PORT and SANDBOX_MEMBER_ORIGIN.
const API_PORT = Number(process.env.SANDBOX_API_PORT ?? 8788);
const MEMBER_ORIGIN = process.env.SANDBOX_MEMBER_ORIGIN ?? 'http://localhost:5174';
// Optional bot check: TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA is Cloudflare's always-passing test
// secret (pair it with VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA for the member app). Off by default.
const turnstileSecret = process.env.TURNSTILE_SECRET_KEY || null;

const db = drizzle({ client: new PGlite(), schema });
await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });

const line = '─'.repeat(72);
const messenger: Messenger = {
  smsEnabled: true,
  async sendEmail({ to, subject, text }) {
    console.log(`\n${line}\n[sandbox email] to ${to}\nSubject: ${subject}\n\n${text}\n${line}`);
  },
  async sendSms({ to, body }) {
    console.log(`\n${line}\n[sandbox sms] to ${to}\n${body}\n${line}`);
  },
};

// Files stay in memory; staff get a data: URL instead of a signed storage link.
const files = new Map<string, Buffer>();
const storage: Storage = {
  configured: true,
  async put(bucket, key, body) {
    files.set(`${bucket}/${key}`, body);
  },
  async get(bucket, key) {
    return files.get(`${bucket}/${key}`) ?? null;
  },
  async delete(bucket, key) {
    files.delete(`${bucket}/${key}`);
  },
  async signedGetUrl(bucket, key) {
    const body = files.get(`${bucket}/${key}`);
    return body ? `data:image/jpeg;base64,${body.toString('base64')}` : 'data:,';
  },
};

const config: Config = {
  nodeEnv: 'development',
  apiUrl: `http://localhost:${API_PORT}`,
  memberAppUrl: `${MEMBER_ORIGIN}/app`,
  allowedOrigins: [MEMBER_ORIGIN],
  authSecret: randomBytes(32).toString('base64'),
  rateLimit: true,
  clientIpHeader: null,
  signedUrlTtlSeconds: 120,
  // The admin site arrives in phase admin-2 (docs/ADMIN-PANEL-PLAN.md); the sandbox keeps the member-app staff screens.
  adminOrigin: null,
  cloudflareAccess: null,
  securityAlertEmail: null,
};
const auth = createAuth({ db, config, messenger });
const deps: Deps = { config, db, auth, storage, messenger, turnstile: turnstileSecret ? createTurnstile(turnstileSecret) : null };

const staffPassword = randomBytes(12).toString('base64url');
await addStaff(deps, { email: 'owner@sandbox.test', name: 'Sandbox Owner', role: 'owner', password: staffPassword });
const { userId: reviewerId } = await addStaff(deps, {
  email: 'reviewer@sandbox.test',
  name: 'Sandbox Reviewer',
  role: 'backup_reviewer',
  password: staffPassword,
});

// --- Synthetic test members (sandbox only; never seeded anywhere else) ---------------------------------

const SEED = [
  { first: 'Amal', last: 'Perera', gender: 'man', birthDate: '1993-05-10', city: 'Colombo', region: 'Colombo', occupation: 'Software engineer', education: 'BSc Computer Science', heightCm: 175, religion: 'buddhist', plan: 'starter_1m', color: '#5b4a7a' },
  { first: 'Bina', last: 'Silva', gender: 'woman', birthDate: '1996-08-21', city: 'Kandy', region: 'Kandy', occupation: 'Teacher', education: 'BEd', heightCm: 160, religion: 'christian', plan: 'premium_3m', color: '#9a6a4f', family: { motherName: 'Kamala', fatherName: 'Sunil', motherOccupation: 'Nurse', fatherOccupation: 'Accountant' } },
  { first: 'Chathu', last: 'Fernando', gender: 'woman', birthDate: '1990-01-15', city: 'Galle', region: 'Galle', occupation: 'Doctor', education: 'MBBS', heightCm: 165, religion: 'buddhist', caste: 'Govigama' },
  { first: 'Dinesh', last: 'Kumar', gender: 'man', birthDate: '1997-03-03', city: 'Jaffna', region: 'Jaffna', occupation: 'Accountant', education: 'BCom', heightCm: 170, religion: 'hindu' },
] as const;

/** A generated placeholder photo (a colour and an initial), stored like an uploaded one. */
async function placeholderPhoto(profileId: string, initial: string, color: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="${color}"/><text x="300" y="470" font-size="300" font-family="sans-serif" fill="#ffffff" text-anchor="middle">${initial}</text><text x="300" y="740" font-size="34" font-family="sans-serif" fill="#ffffff" text-anchor="middle">Sandbox photo</text></svg>`;
  const processed = await processPhoto(await sharp(Buffer.from(svg)).png().toBuffer());
  const originalKey = newObjectKey('photos');
  const blurredKey = `${originalKey}-blurred`;
  await storage.put('private', originalKey, processed.original, 'image/jpeg');
  await storage.put('derived', blurredKey, processed.blurred, 'image/jpeg');
  const [created] = await db
    .insert(schema.photo)
    .values({ profileId, slot: 0, isCover: true, blurredKey, width: processed.width, height: processed.height })
    .returning({ id: schema.photo.id });
  await db.insert(schema.photoOriginal).values({ photoId: created!.id, objectKey: originalKey });
}

const days = (n: number) => new Date(Date.now() + n * 86_400_000);
// A random password for the test members (sandbox only), hashed by Better-Auth like any member's.
const memberPassword = `member-${randomBytes(9).toString('base64url')}`;
const authContext = await auth.$context;
const memberPasswordHash = await authContext.password.hash(memberPassword);
const seeded: { email: string; name: string; plan: string }[] = [];
for (const [index, member] of SEED.entries()) {
  const userId = randomUUID();
  const email = `${member.first.toLowerCase()}@sandbox.test`;
  const phone = `+9477000${String(index + 1).padStart(4, '0')}`;
  await db.insert(schema.user).values({ id: userId, name: `${member.first} ${member.last}`, email, emailVerified: true, phoneNumber: phone, phoneNumberVerified: true });
  await authContext.internalAdapter.linkAccount({ userId, providerId: 'credential', accountId: userId, password: memberPasswordHash });
  await db.insert(schema.memberAccount).values({ userId });
  await db.insert(schema.verificationCase).values({ subjectUserId: userId, documentType: 'nic', status: 'approved', reviewedByUserId: reviewerId, reviewedAt: new Date() });
  const [created] = await db
    .insert(schema.profile)
    .values({
      management: 'self',
      createdByUserId: userId,
      candidateUserId: userId,
      displayName: member.first,
      gender: member.gender,
      birthDate: member.birthDate,
      countryCode: 'LK',
      region: member.region,
      city: member.city,
      occupation: member.occupation,
      education: member.education,
      heightCm: member.heightCm,
      maritalStatus: 'never_married',
      religion: member.religion,
      languages: ['Sinhala', 'English'],
      bio: `Sandbox test member. ${member.first} is calm, curious and close to family, and hopes for an honest, shared future.`,
      adultDeclaredAt: new Date(),
      ...('family' in member ? member.family : {}),
      ...('caste' in member ? { caste: member.caste, casteConsentedAt: new Date() } : {}),
    })
    .returning({ id: schema.profile.id });
  const profileId = created!.id;
  await db.update(schema.profile).set({ status: 'published' }).where(eq(schema.profile.id, profileId));
  await db.insert(schema.privateContact).values({ profileId, person: 'candidate', kind: 'phone', value: phone, verifiedAt: new Date() });
  if ('color' in member) await placeholderPhoto(profileId, member.first[0]!, member.color);
  if ('plan' in member) {
    await db.insert(schema.entitlementEvent).values({ profileId, kind: 'grant', planId: member.plan, startsAt: days(-1), endsAt: days(29) });
  }
  seeded.push({ email, name: `${member.first} ${member.last}`, plan: 'plan' in member ? member.plan : 'no plan' });
}

// --- Sandbox-only routes, next to the real API ---------------------------------------------------------

const PLAN_IDS = ['starter_1m', 'premium_3m', 'premium_6m'];
const sandboxApp = new Hono();
/**
 * A shortcut for testing: grants a plan directly. The real path is a payment the owner approves in the owner
 * workspace (the owner first enters the payment details; none are pre-filled). Not reachable through the member app.
 */
sandboxApp.post('/sandbox/plans', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { profileId?: string; planId?: string };
  const planId = body.planId ?? 'starter_1m';
  if (!body.profileId || !PLAN_IDS.includes(planId)) {
    return c.json({ message: `Send {"profileId": "...", "planId": one of ${PLAN_IDS.join(', ')}}.` }, 400);
  }
  const endsAt = days(planId === 'starter_1m' ? 30 : planId === 'premium_3m' ? 90 : 180);
  await db.insert(schema.entitlementEvent).values({ profileId: body.profileId, kind: 'grant', planId, startsAt: new Date(), endsAt });
  return c.json({ granted: planId, endsAt });
});
sandboxApp.route('/', createApp(deps));

// Loopback only: the sandbox prints codes and the staff password, so keep it off the local network.
serve({ fetch: sandboxApp.fetch, port: API_PORT, hostname: '127.0.0.1' }, () => {
  console.log(`${line}
Favorite Hearts sandbox (in-memory, nothing is sent or stored for real)
  Member app : ${MEMBER_ORIGIN}/app/      Staff: ${MEMBER_ORIGIN}/app/staff
  Staff      : owner@sandbox.test, reviewer@sandbox.test
  Password   : ${staffPassword}   (both staff accounts; new on every start)
  Test members (verified and published; log in with the email address and this password):
  Password   : ${memberPassword}   (all four test members; new on every start)
${seeded.map((m) => `    ${m.email.padEnd(22)} ${m.name.padEnd(16)} ${m.plan}`).join('\n')}
  Payments   : sign in as the owner first and enter test payment details (nothing is pre-filled).
  Test plan  : curl -X POST http://127.0.0.1:${API_PORT}/sandbox/plans -H 'content-type: application/json' \\
                 -d '{"profileId":"<id from /app/profiles/<id>>","planId":"starter_1m"}'
  Bot check  : ${turnstileSecret ? 'on (Turnstile, checked with Cloudflare)' : 'off (set TURNSTILE_SECRET_KEY to try it)'}
Sign-up codes, reset links, phone codes and invitation links appear below.
${line}`);
});
