/**
 * Database access rules (drizzle/0003_access_rules.sql) tested with real, separate accounts, as
 * OWNER-DECISIONS Part 2 asks: anonymous, member A, member B, candidate, manager, revoked manager,
 * reviewer and owner. Every migration runs in an in-process Postgres (PGlite); queries go through
 * the same runAsActor path the API uses, as the role fh_app. Each scenario is rolled back.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { runAsActor, setActor, type Actor } from '../src/db/actor.ts';
import * as s from '../src/db/schema/index.ts';

const db = drizzle({ client: new PGlite(), schema: s });
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type As = <T>(actor: Actor | null, fn: (tx: Tx) => Promise<T>) => Promise<T>;

// --- Accounts -------------------------------------------------------------------------------------

const u = {
  alice: 'u-alice', // self-managed member A: verified, published, paid
  bob: 'u-bob', // self-managed member B: verified, published, paid, connected to Alice
  carol: 'u-carol', // verified and published, no plan
  dave: 'u-dave', // unverified, draft profile
  maya: 'u-maya', // manager of profile M (mother)
  chandi: 'u-chandi', // candidate of profile M, joined
  rex: 'u-rex', // former manager of profile R, removed by the candidate
  ruth: 'u-ruth', // candidate of profile R after taking over
  sam: 'u-sam', // suspended member
  vic: 'u-vic', // backup reviewer, two-step login on
  olga: 'u-olga', // owner, two-step login on
  otto: 'u-otto', // owner role on record but two-step login off
  mallory: 'u-mallory', // ordinary member who claims to be the owner
  newbie: 'u-newbie', // signed in, no member account yet
  nadia: 'u-nadia', // manager of profile N, whose candidate has not joined yet
};
const member = (userId: string): Actor => ({ userId, role: 'member' });
const [alice, bob, carol, dave, maya, chandi, rex, sam, newbie, nadia] = [
  u.alice,
  u.bob,
  u.carol,
  u.dave,
  u.maya,
  u.chandi,
  u.rex,
  u.sam,
  u.newbie,
  u.nadia,
].map(member) as [Actor, Actor, Actor, Actor, Actor, Actor, Actor, Actor, Actor, Actor];
const vic: Actor = { userId: u.vic, role: 'backup_reviewer' };
const olga: Actor = { userId: u.olga, role: 'owner' };
const otto: Actor = { userId: u.otto, role: 'owner' };
const mallory: Actor = { userId: u.mallory, role: 'owner' };

const P = {
  A: randomUUID(),
  B: randomUUID(),
  C: randomUUID(),
  D: randomUUID(),
  M: randomUUID(),
  N: randomUUID(),
  R: randomUUID(),
};
const iAB = randomUUID(); // Alice -> Bob, accepted, connected
const iAC = randomUUID(); // Alice -> Carol, pending
const cAB = randomUUID();
const payA = randomUUID();
const photoB0 = randomUUID();
const photoB1 = randomUUID();
let starterLocal: typeof s.priceVersion.$inferSelect;

const days = (n: number) => new Date(Date.now() + n * 86_400_000);
const complete = (displayName: string, gender: 'man' | 'woman') => ({
  displayName,
  gender,
  birthDate: '1996-04-12',
  countryCode: 'LK',
  city: 'Colombo',
  occupation: 'Engineer',
  education: 'BSc',
  heightCm: 170,
  maritalStatus: 'never_married' as const,
  bio: 'Close to family, calm, and ready to talk about a shared future.',
  adultDeclaredAt: new Date(),
});
const grant = (profileId: string, planId = 'starter_1m') => ({
  profileId,
  kind: 'grant' as const,
  planId,
  startsAt: days(-1),
  endsAt: days(29),
  dailyRequestCap: 5,
});

before(async () => {
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });

  const verified = new Set(['alice', 'bob', 'carol', 'maya']);
  await db.insert(s.user).values(
    Object.entries(u).map(([name, id], i) => ({
      id,
      name,
      email: `${name}@example.test`,
      phoneNumber: `+9477000${String(i).padStart(4, '0')}`,
      phoneNumberVerified: verified.has(name),
      twoFactorEnabled: name === 'vic' || name === 'olga',
    })),
  );
  await db.insert(s.memberAccount).values(
    Object.entries(u)
      .filter(([name]) => name !== 'newbie')
      .map(([name, userId]) => ({ userId, status: name === 'sam' ? ('suspended' as const) : ('active' as const) })),
  );
  await db.insert(s.staffMember).values([
    { userId: u.vic, role: 'backup_reviewer' },
    { userId: u.olga, role: 'owner' },
    { userId: u.otto, role: 'owner' },
  ]);
  await db.insert(s.verificationCase).values([
    ...['alice', 'bob', 'carol', 'maya'].map((name) => ({
      subjectUserId: u[name as keyof typeof u],
      documentType: 'nic' as const,
      status: 'approved' as const,
      reviewedByUserId: u.vic,
      reviewedAt: new Date(),
    })),
    { subjectUserId: u.dave, documentType: 'passport' as const, evidenceKey: 'documents/2026/10/dave' },
  ]);

  await db.insert(s.profile).values([
    { id: P.A, management: 'self', createdByUserId: u.alice, candidateUserId: u.alice, status: 'published', ...complete('Alice', 'woman') },
    { id: P.B, management: 'self', createdByUserId: u.bob, candidateUserId: u.bob, status: 'published', coverPublic: true, ...complete('Bob', 'man') },
    { id: P.C, management: 'self', createdByUserId: u.carol, candidateUserId: u.carol, status: 'published', ...complete('Carol', 'woman') },
    { id: P.D, management: 'self', createdByUserId: u.dave, candidateUserId: u.dave, displayName: 'Dave' },
    { id: P.M, management: 'manager', createdByUserId: u.maya, candidateUserId: u.chandi, status: 'published', ...complete('Chandi', 'woman') },
    { id: P.R, management: 'manager', createdByUserId: u.rex, candidateUserId: u.ruth, status: 'paused', ...complete('Ruth', 'woman') },
    { id: P.N, management: 'manager', createdByUserId: u.nadia, displayName: 'Nimali' },
  ]);
  await db.insert(s.profileManager).values([
    { profileId: P.M, managerUserId: u.maya, relationship: 'mother', authorityDeclaredAt: new Date() },
    { profileId: P.N, managerUserId: u.nadia, relationship: 'mother', authorityDeclaredAt: new Date() },
    {
      profileId: P.R,
      managerUserId: u.rex,
      relationship: 'father',
      authorityDeclaredAt: new Date(),
      revokedAt: new Date(),
      revokedReason: 'candidate_removed',
    },
  ]);
  await db.insert(s.privateContact).values([
    { profileId: P.B, person: 'candidate', kind: 'phone', value: '+94770000102', verifiedAt: new Date() },
    { profileId: P.B, person: 'candidate', kind: 'email', value: 'bob@private.test', shareWithConnections: false },
    { profileId: P.M, person: 'manager', kind: 'phone', value: '+94770000105', verifiedAt: new Date() },
    { profileId: P.M, person: 'candidate', kind: 'phone', value: '+94770000106' },
    { profileId: P.R, person: 'candidate', kind: 'phone', value: '+94770000108' },
    { profileId: P.N, person: 'manager', kind: 'phone', value: '+94770000120' },
  ]);
  await db.insert(s.photo).values([
    { id: photoB0, profileId: P.B, slot: 0, isCover: true, blurredKey: 'photos/b0-blur', width: 640, height: 800 },
    { id: photoB1, profileId: P.B, slot: 1, blurredKey: 'photos/b1-blur', width: 640, height: 800 },
  ]);
  await db.insert(s.photoOriginal).values([
    { photoId: photoB0, objectKey: 'photos/b0' },
    { photoId: photoB1, objectKey: 'photos/b1' },
  ]);
  await db.insert(s.entitlementEvent).values([grant(P.A), grant(P.B), grant(P.M, 'premium_3m')]);
  await db.insert(s.interest).values([
    { id: iAB, senderProfileId: P.A, receiverProfileId: P.B, senderUserId: u.alice, status: 'accepted', shareConsentVersion: 'v1', respondedAt: new Date() },
    { id: iAC, senderProfileId: P.A, receiverProfileId: P.C, senderUserId: u.alice, shareConsentVersion: 'v1' },
  ]);
  const [low, high] = [P.A, P.B].sort() as [string, string];
  await db.insert(s.connection).values({ id: cAB, interestId: iAB, profileLow: low, profileHigh: high });

  [starterLocal] = (await db
    .select()
    .from(s.priceVersion)
    .where(and(eq(s.priceVersion.planId, 'starter_1m'), eq(s.priceVersion.residenceBand, 'local')))) as [
    typeof s.priceVersion.$inferSelect,
  ];
  await db.insert(s.paymentSubmission).values({
    id: payA,
    profileId: P.A,
    payerUserId: u.alice,
    priceVersionId: starterLocal.id,
    planId: 'starter_1m',
    currency: 'LKR',
    amountMinor: 300000,
    reference: 'FH-TEST-0001',
    channel: 'lkr_bank_transfer',
    proofKey: 'payment-proofs/2026/10/a1',
    status: 'pending_review',
  });
  await db.insert(s.report).values({
    reporterUserId: u.bob,
    reporterProfileId: P.B,
    targetProfileId: P.M,
    category: 'scam',
    reporterVerified: true,
  });
  await db.insert(s.auditEvent).values([
    { actorUserId: u.olga, actorRole: 'owner', action: 'payment.approved', entityType: 'payment_submission', entityId: 'x' },
    { actorUserId: u.vic, actorRole: 'backup_reviewer', action: 'verification.approved', entityType: 'verification_case', entityId: 'y' },
  ]);
});

// --- Helpers ------------------------------------------------------------------------------------------

class Rollback extends Error {}

/** Runs steps as different actors inside ONE fh_app transaction, then rolls everything back. */
async function scenario(steps: (as: As) => Promise<void>): Promise<void> {
  try {
    await runAsActor(db, null, async (tx) => {
      const as: As = async (actor, fn) => {
        await setActor(tx, actor);
        // Each step gets a savepoint, so an expected denial does not abort the scenario.
        return tx.transaction((sp) => fn(sp));
      };
      await steps(as);
      throw new Rollback();
    });
  } catch (err) {
    if (!(err instanceof Rollback)) throw err;
  }
}

function describeError(err: unknown): string {
  const e = err as { message?: string; cause?: { message?: string; detail?: string } };
  return [e.message, e.cause?.message, e.cause?.detail].filter(Boolean).join(' | ');
}

async function denied(attempt: Promise<unknown>, pattern: RegExp): Promise<void> {
  await assert.rejects(attempt, (err) => {
    assert.match(describeError(err), pattern);
    return true;
  });
}

const RLS = /row-level security|permission denied/;
const sorted = (rows: { id: string }[]) => rows.map((r) => r.id).sort();
const profileIds = (tx: Tx) => tx.select({ id: s.profile.id }).from(s.profile).then(sorted);
const contactsOf = (tx: Tx, profileId: string) =>
  tx.select().from(s.privateContact).where(eq(s.privateContact.profileId, profileId));
const newPayment = (overrides: Partial<typeof s.paymentSubmission.$inferInsert> = {}) => ({
  profileId: P.A,
  payerUserId: u.alice,
  priceVersionId: starterLocal.id,
  planId: 'starter_1m',
  currency: 'LKR' as const,
  amountMinor: 300000,
  reference: `FH-TEST-${randomUUID().slice(0, 8)}`,
  channel: 'lkr_bank_transfer' as const,
  ...overrides,
});

// --- Tests ------------------------------------------------------------------------------------------

describe('the API database role', () => {
  test('runs as fh_app with the actor settings for that transaction only', async () => {
    const seen = await runAsActor(db, alice, (tx) =>
      tx.execute(sql`select current_user as role, app.user_id() as user_id`).then((r) => r.rows[0]),
    );
    assert.deepEqual(seen, { role: 'fh_app', user_id: u.alice });
    const after = await db.execute(sql`select current_user as role, app.user_id() as user_id`);
    assert.deepEqual(after.rows[0], { role: 'postgres', user_id: null });
  });
});

describe('anonymous visitor', () => {
  test('sees no member data, only the public price list', () =>
    scenario(async (as) => {
      const seen = await as(null, async (tx) => ({
        profiles: await profileIds(tx),
        contacts: await tx.select().from(s.privateContact),
        photos: await tx.select().from(s.photo),
        originals: await tx.select().from(s.photoOriginal),
        interests: await tx.select().from(s.interest),
        payments: await tx.select().from(s.paymentSubmission),
        prices: await tx.select().from(s.priceVersion),
      }));
      assert.deepEqual(seen.profiles, []);
      assert.equal(seen.contacts.length + seen.photos.length + seen.originals.length, 0);
      assert.equal(seen.interests.length + seen.payments.length, 0);
      assert.equal(seen.prices.length, 6);
    }));

  test('cannot create anything', () =>
    scenario(async (as) => {
      await denied(as(null, (tx) => tx.insert(s.memberAccount).values({ userId: u.newbie })), RLS);
    }));
});

describe('members browsing', () => {
  test('see published profiles, never drafts or paused ones of others', () =>
    scenario(async (as) => {
      assert.deepEqual(await as(alice, profileIds), [P.A, P.B, P.C, P.M].sort());
      assert.deepEqual(await as(dave, profileIds), [P.A, P.B, P.C, P.D, P.M].sort());
    }));

  test('a suspended member browses nothing', () =>
    scenario(async (as) => {
      assert.deepEqual(await as(sam, profileIds), []);
    }));

  test('see blurred photos; an original only when it is a cover shown publicly', () =>
    scenario(async (as) => {
      const seen = await as(carol, async (tx) => ({
        photos: await tx.select().from(s.photo).then(sorted),
        originals: await tx.select().from(s.photoOriginal),
      }));
      assert.deepEqual(seen.photos, [photoB0, photoB1].sort());
      assert.deepEqual(seen.originals.map((o) => o.photoId), [photoB0]);
    }));
});

describe('private details: contacts and gallery (OWNER-DECISIONS sections 3, 4, 7)', () => {
  test('a paid, connected member sees what the other side shares, and nothing more', () =>
    scenario(async (as) => {
      const contacts = await as(alice, (tx) => contactsOf(tx, P.B));
      assert.deepEqual(contacts.map((c) => c.kind), ['phone']);
      const originals = await as(alice, (tx) => tx.select().from(s.photoOriginal));
      assert.equal(originals.length, 2);
    }));

  test('members without a connection see none', () =>
    scenario(async (as) => {
      assert.equal((await as(carol, (tx) => contactsOf(tx, P.B))).length, 0);
      assert.equal((await as(dave, (tx) => contactsOf(tx, P.B))).length, 0);
    }));

  test('ending the connection hides them at once', () =>
    scenario(async (as) => {
      await as(bob, (tx) =>
        tx.update(s.connection).set({ endedAt: new Date(), endedByUserId: u.bob, endReason: 'withdrawn' }).where(eq(s.connection.id, cAB)),
      );
      assert.equal((await as(alice, (tx) => contactsOf(tx, P.B))).length, 0);
    }));

  test("the member's own plan ending hides them (section 3)", () =>
    scenario(async (as) => {
      await as(alice, (tx) =>
        tx.insert(s.entitlementEvent).values({ profileId: P.A, kind: 'forfeit', actorUserId: u.alice, reason: 'engaged' }),
      );
      assert.equal((await as(alice, (tx) => contactsOf(tx, P.B))).length, 0);
    }));

  test('a block hides them, and hides each profile from the other', () =>
    scenario(async (as) => {
      await as(alice, (tx) => tx.insert(s.block).values({ blockerProfileId: P.A, blockedProfileId: P.B }));
      assert.equal((await as(alice, (tx) => contactsOf(tx, P.B))).length, 0);
      assert.ok(!(await as(bob, profileIds)).includes(P.A));
      assert.equal((await as(bob, (tx) => tx.select().from(s.block))).length, 0, 'the blocked side never sees the block');
    }));
});

describe('interests and the sender blur (sections 1, 4)', () => {
  test('an unpaid receiver cannot see who sent an interest, only an anonymous preview', () =>
    scenario(async (as) => {
      assert.equal((await as(carol, (tx) => tx.select().from(s.interest))).length, 0);
      const previews = await as(carol, (tx) => tx.execute(sql`select * from app.received_interest_previews(${P.C})`));
      assert.equal(previews.rows.length, 1);
      assert.deepEqual(Object.keys(previews.rows[0] as object).sort(), ['interest_id', 'received_at', 'sender_age', 'sender_occupation']);
      const notMine = await as(dave, (tx) => tx.execute(sql`select * from app.received_interest_previews(${P.C})`));
      assert.equal(notMine.rows.length, 0);
    }));

  test('once the receiver has a plan, the sender is visible', () =>
    scenario(async (as) => {
      await as(olga, (tx) => tx.insert(s.entitlementEvent).values({ ...grant(P.C), actorUserId: u.olga }));
      const seen = await as(carol, (tx) => tx.select().from(s.interest));
      assert.deepEqual(seen.map((i) => i.senderProfileId), [P.A]);
    }));

  test('sending needs an active plan and a published, unblocked receiver', () =>
    scenario(async (as) => {
      const send = (actor: Actor, from: string, to: string, userId: string) =>
        as(actor, (tx) =>
          tx.insert(s.interest).values({ senderProfileId: from, receiverProfileId: to, senderUserId: userId, shareConsentVersion: 'v1' }),
        );
      await denied(send(carol, P.C, P.B, u.carol), RLS);
      await denied(send(alice, P.A, P.D, u.alice), RLS);
      await send(alice, P.A, P.M, u.alice);
    }));

  test('only the receiver answers, only the sender withdraws, and only while pending', () =>
    scenario(async (as) => {
      const id = randomUUID();
      await as(alice, (tx) =>
        tx.insert(s.interest).values({ id, senderProfileId: P.A, receiverProfileId: P.M, senderUserId: u.alice, shareConsentVersion: 'v1' }),
      );
      const answer = (actor: Actor, status: 'accepted' | 'withdrawn', interestId = id) =>
        as(actor, (tx) => tx.update(s.interest).set({ status }).where(eq(s.interest.id, interestId)).returning());
      await denied(answer(alice, 'accepted'), /only the receiver can answer/);
      assert.equal((await answer(maya, 'accepted')).length, 1);
      assert.equal((await answer(alice, 'withdrawn')).length, 0, 'an accepted interest cannot be withdrawn');
      assert.equal((await answer(carol, 'withdrawn', iAC)).length, 0, 'the receiver cannot withdraw');
      assert.equal((await answer(alice, 'withdrawn', iAC)).length, 1);
    }));
});

describe('managers and candidates (section 5)', () => {
  test('the candidate sets the manager permissions; the manager cannot', () =>
    scenario(async (as) => {
      const restrict = (actor: Actor) =>
        as(actor, (tx) =>
          tx.update(s.profileManager).set({ canViewPrivateDetails: false }).where(eq(s.profileManager.profileId, P.M)).returning(),
        );
      await denied(restrict(maya), /only the candidate sets manager permissions/);
      assert.equal((await restrict(chandi)).length, 1);
    }));

  test('a revoked manager has no access to the profile and cannot restore it', () =>
    scenario(async (as) => {
      const seen = await as(rex, async (tx) => ({
        profiles: await profileIds(tx),
        contacts: await contactsOf(tx, P.R),
        restored: await tx
          .update(s.profileManager)
          .set({ revokedAt: null, revokedReason: null })
          .where(eq(s.profileManager.profileId, P.R))
          .returning(),
      }));
      assert.ok(!seen.profiles.includes(P.R));
      assert.equal(seen.contacts.length, 0);
      assert.equal(seen.restored.length, 0);
    }));

  test('removing the manager takes effect immediately', () =>
    scenario(async (as) => {
      assert.equal((await as(maya, (tx) => contactsOf(tx, P.M))).length, 2);
      await as(chandi, (tx) =>
        tx
          .update(s.profileManager)
          .set({ revokedAt: new Date(), revokedReason: 'candidate_removed' })
          .where(eq(s.profileManager.profileId, P.M)),
      );
      const after = await as(maya, async (tx) => ({
        contacts: await contactsOf(tx, P.M),
        edited: await tx.update(s.profile).set({ bio: 'Changed by a removed manager.' }).where(eq(s.profile.id, P.M)).returning(),
      }));
      assert.equal(after.contacts.length, 0);
      assert.equal(after.edited.length, 0);
    }));

  test('a manager runs at most 3 profiles unless the owner raises the limit', () =>
    scenario(async (as) => {
      const createManaged = () =>
        as(maya, async (tx) => {
          const id = randomUUID();
          await tx.insert(s.profile).values({ id, management: 'manager', createdByUserId: u.maya });
          await tx.insert(s.profileManager).values({ profileId: id, managerUserId: u.maya, relationship: 'mother', authorityDeclaredAt: new Date() });
        });
      await createManaged();
      await createManaged();
      await denied(createManaged(), /manager_capacity_reached/);
      await as(olga, (tx) => tx.update(s.memberAccount).set({ maxManagedProfiles: 4 }).where(eq(s.memberAccount.userId, u.maya)));
      await createManaged();
    }));

  test("a manager cannot attach to someone else's profile", () =>
    scenario(async (as) => {
      await denied(
        as(maya, (tx) =>
          tx.insert(s.profileManager).values({ profileId: P.A, managerUserId: u.maya, relationship: 'guardian', authorityDeclaredAt: new Date() }),
        ),
        RLS,
      );
    }));
});

describe('publishing (section 5)', () => {
  test("needs the publisher's approved document and verified phone", () =>
    scenario(async (as) => {
      const { displayName: _name, ...fields } = complete('Dave', 'man');
      await denied(
        as(dave, (tx) => tx.update(s.profile).set({ ...fields, status: 'published' }).where(eq(s.profile.id, P.D))),
        RLS,
      );
      const edited = await as(alice, (tx) =>
        tx.update(s.profile).set({ bio: 'Still verified, so a published profile can be edited.' }).where(eq(s.profile.id, P.A)).returning(),
      );
      assert.equal(edited[0]?.version, 2);
    }));
});

describe('staff (sections 9, 10)', () => {
  test('the backup reviewer handles documents and reports but sees no payments', () =>
    scenario(async (as) => {
      const seen = await as(vic, async (tx) => ({
        cases: await tx.select().from(s.verificationCase),
        reports: await tx.select().from(s.report),
        payments: await tx.select().from(s.paymentSubmission),
        plans: await tx.select().from(s.entitlementEvent),
        audit: await tx.select().from(s.auditEvent),
      }));
      assert.equal(seen.cases.length, 5);
      assert.equal(seen.reports.length, 1);
      assert.equal(seen.payments.length, 0);
      assert.equal(seen.plans.length, 0);
      assert.deepEqual(seen.audit.map((a) => a.entityType), ['verification_case']);
    }));

  test('the backup reviewer cannot approve a payment or grant a plan', () =>
    scenario(async (as) => {
      const approved = await as(vic, (tx) =>
        tx.update(s.paymentSubmission).set({ status: 'approved', settlementRef: 'BOC-1' }).where(eq(s.paymentSubmission.id, payA)).returning(),
      );
      assert.equal(approved.length, 0);
      await denied(as(vic, (tx) => tx.insert(s.entitlementEvent).values({ ...grant(P.C), actorUserId: u.vic })), RLS);
    }));

  test('the owner approves a payment exactly once', () =>
    scenario(async (as) => {
      const [approved] = await as(olga, (tx) =>
        tx
          .update(s.paymentSubmission)
          .set({ status: 'approved', settlementRef: 'BOC-2026-10-28-001' })
          .where(eq(s.paymentSubmission.id, payA))
          .returning(),
      );
      assert.equal(approved?.reviewedByUserId, u.olga);
      const activate = () =>
        as(olga, (tx) => tx.insert(s.entitlementEvent).values({ ...grant(P.A), paymentSubmissionId: payA, actorUserId: u.olga }));
      await activate();
      await denied(activate(), /entitlement_event_one_grant_per_payment_idx/);

      const second = randomUUID();
      await as(alice, (tx) => tx.insert(s.paymentSubmission).values(newPayment({ id: second })));
      await denied(
        as(olga, (tx) =>
          tx
            .update(s.paymentSubmission)
            .set({ status: 'approved', settlementRef: 'BOC-2026-10-28-001' })
            .where(eq(s.paymentSubmission.id, second)),
        ),
        /settlement_ref_unique/,
      );
    }));

  test('claiming a staff role is not enough', () =>
    scenario(async (as) => {
      assert.equal((await as(mallory, (tx) => tx.select().from(s.paymentSubmission))).length, 0);
      assert.equal((await as(otto, (tx) => tx.select().from(s.paymentSubmission))).length, 0, 'owner without two-step login');
      assert.equal((await as(olga, (tx) => tx.select().from(s.paymentSubmission))).length, 1);
    }));

  test('members see only their own payments and must use the current price', () =>
    scenario(async (as) => {
      assert.equal((await as(bob, (tx) => tx.select().from(s.paymentSubmission))).length, 0);
      assert.equal((await as(alice, (tx) => tx.select().from(s.paymentSubmission))).length, 1);
      await denied(as(alice, (tx) => tx.insert(s.paymentSubmission).values(newPayment({ amountMinor: 100 }))), RLS);
      await denied(as(alice, (tx) => tx.insert(s.paymentSubmission).values(newPayment({ profileId: P.B }))), RLS);
    }));

  test('the payer can attach proof but not approve', () =>
    scenario(async (as) => {
      const id = randomUUID();
      await as(alice, (tx) => tx.insert(s.paymentSubmission).values(newPayment({ id })));
      const update = (status: 'pending_review' | 'approved') =>
        as(alice, (tx) =>
          tx.update(s.paymentSubmission).set({ status, proofKey: 'payment-proofs/a2' }).where(eq(s.paymentSubmission.id, id)).returning(),
        );
      await denied(update('approved'), /only the owner reviews payments/);
      assert.equal((await update('pending_review')).length, 1);
    }));
});

describe('history, prices and switches', () => {
  test('plan history and the audit trail are append-only, even for the owner', () =>
    scenario(async (as) => {
      await denied(as(olga, (tx) => tx.update(s.entitlementEvent).set({ reason: 'edited' })), RLS);
      await denied(as(olga, (tx) => tx.update(s.auditEvent).set({ reason: 'edited' })), RLS);
    }));

  test('the append-only triggers also stop the database owner', async () => {
    await denied(db.update(s.entitlementEvent).set({ reason: 'edited' }), /append-only/);
    await denied(db.update(s.auditEvent).set({ reason: 'edited' }), /append-only/);
  });

  test('a price can only be closed and replaced, never edited', () =>
    scenario(async (as) => {
      const byId = eq(s.priceVersion.id, starterLocal.id);
      await denied(as(olga, (tx) => tx.update(s.priceVersion).set({ amountMinor: 1 }).where(byId)), /can only be closed/);
      assert.equal((await as(alice, (tx) => tx.update(s.priceVersion).set({ effectiveTo: days(1) }).where(byId).returning())).length, 0);
      assert.equal((await as(olga, (tx) => tx.update(s.priceVersion).set({ effectiveTo: days(1) }).where(byId).returning())).length, 1);
    }));

  test('the owner can pause new signups and document submissions', () =>
    scenario(async (as) => {
      const pause = (key: 'signups_paused' | 'document_submissions_paused') =>
        as(olga, (tx) => tx.update(s.operationsFlag).set({ enabled: true, updatedByUserId: u.olga }).where(eq(s.operationsFlag.key, key)));
      await as(newbie, (tx) => tx.select().from(s.operationsFlag));
      await pause('signups_paused');
      await denied(as(newbie, (tx) => tx.insert(s.memberAccount).values({ userId: u.newbie })), RLS);
      await pause('document_submissions_paused');
      await denied(
        as(carol, (tx) => tx.insert(s.verificationCase).values({ subjectUserId: u.carol, documentType: 'driving_licence' })),
        RLS,
      );
      assert.equal((await as(alice, (tx) => tx.update(s.operationsFlag).set({ enabled: false }).returning())).length, 0);
    }));
});

describe('invariants', () => {
  test('invitations: a different contact, 24 hours at most, one live at a time', () =>
    scenario(async (as) => {
      // The expiry is left to the database default (now + 24 hours) except to test the limit.
      const invite = (contact: string, expiresAt?: ReturnType<typeof sql>) =>
        as(nadia, (tx) =>
          tx
            .insert(s.invitation)
            .values({ profileId: P.N, issuedByUserId: u.nadia, channel: 'email', contact, tokenHash: randomUUID(), ...(expiresAt && { expiresAt }) })
            .returning(),
        );
      await denied(invite('nadia@example.test'), /invitation_contact_matches_manager/);
      await denied(invite('+94770000120'), /invitation_contact_matches_manager/);
      await denied(invite('nimali@example.test', sql`now() + interval '25 hours'`), /invitation_valid_24_hours/);
      const [first] = await invite('nimali@example.test');
      await invite('nimali@example.test');
      const live = await as(nadia, (tx) => tx.select().from(s.invitation).where(eq(s.invitation.profileId, P.N)));
      assert.equal(live.length, 2);
      assert.ok(live.find((i) => i.id === first?.id)?.supersededAt, 'the first invitation is superseded');
      assert.equal((await as(rex, (tx) => tx.select().from(s.invitation))).length, 0);
    }));

  test('no invitations once the candidate has joined', () =>
    scenario(async (as) => {
      await denied(
        as(maya, (tx) =>
          tx.insert(s.invitation).values({ profileId: P.M, issuedByUserId: u.maya, channel: 'email', contact: 'other@example.test', tokenHash: randomUUID() }),
        ),
        RLS,
      );
    }));

  test('photos: at most five, one cover', () =>
    scenario(async (as) => {
      const add = (slot: number, isCover = false) =>
        as(bob, (tx) => tx.insert(s.photo).values({ profileId: P.B, slot, isCover, blurredKey: `photos/b${slot}`, width: 1, height: 1 }));
      await denied(add(5), /photo_slot_range/);
      await denied(add(2, true), /photo_one_cover_idx/);
      await add(2);
    }));

  test('caste needs explicit consent (section 6)', () =>
    scenario(async (as) => {
      const set = (casteConsentedAt: Date | null) =>
        as(alice, (tx) => tx.update(s.profile).set({ caste: 'Not shown here', casteConsentedAt }).where(eq(s.profile.id, P.A)));
      await denied(set(null), /profile_caste_needs_consent/);
      await set(new Date());
    }));

  test('members cannot change their own account status or manager capacity', () =>
    scenario(async (as) => {
      const mine = eq(s.memberAccount.userId, u.alice);
      await denied(as(alice, (tx) => tx.update(s.memberAccount).set({ status: 'active', maxManagedProfiles: 9 }).where(mine)), /only the owner/);
      await denied(as(alice, (tx) => tx.update(s.memberAccount).set({ status: 'deleted' }).where(mine)), /only staff/);
      await as(alice, (tx) => tx.update(s.memberAccount).set({ locale: 'si' }).where(mine));
    }));

  test('reports stay hidden from the reported member', () =>
    scenario(async (as) => {
      assert.equal((await as(maya, (tx) => tx.select().from(s.report))).length, 0);
      assert.equal((await as(chandi, (tx) => tx.select().from(s.report))).length, 0);
      assert.equal((await as(bob, (tx) => tx.select().from(s.report))).length, 1);
    }));
});
