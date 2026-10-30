/**
 * The member's data export (Stage 5a): the account and every profile it runs, as JSON, with the original photos, in
 * one ZIP file. Everything is read through row-level security exactly as the app reads it, so the export never holds
 * more than the member may see: a sender hidden until the member has a plan stays hidden, other members appear only
 * by the name the app would show, and staff notes are left out. Identity documents are not included.
 */
import { desc, eq, inArray, or, sql, type Column } from 'drizzle-orm';
import type { Context } from 'hono';
import { RETENTION_MONTHS } from '@fh/shared';
import { entitlementEvent, paymentSubmission } from '../db/schema/billing.ts';
import { connection, interest, report, shortlist } from '../db/schema/connections.ts';
import { memberAccount, photo, photoOriginal, privateContact, profile } from '../db/schema/members.ts';
import { verificationCase } from '../db/schema/trust.ts';
import { isoDate, type AppEnv, type Tx } from '../http.ts';
import { PHONE_ONLY_EMAIL_DOMAIN } from '../messaging/messenger.ts';
import { scalar } from './member-view.ts';
import { rows } from './profile-view.ts';
import { zip, type ZipEntry } from './zip.ts';

const FIELDS = [
  'displayName', 'gender', 'birthDate', 'countryCode', 'region', 'city', 'occupation', 'education', 'heightCm',
  'maritalStatus', 'religion', 'languages', 'motherTongue', 'bio', 'familyStory', 'values', 'hobbies', 'timeline',
  'relocation', 'motherName', 'motherOccupation', 'fatherName', 'fatherOccupation', 'sisters', 'brothers', 'incomeRange',
  'caste', 'casteConsentedAt', 'communityOpenness', 'diet', 'smoking', 'drinking', 'childrenPlan', 'familyInvolvement',
  'horoscopeImportance', 'coverPublic',
] as const;

const README = `Favorite Hearts: your data

data.json holds your account and every profile you run (as the candidate or as a manager):
the profile details, private contact details, photos (in the photos folder), requests sent
and received, connections, shortlist, blocks, plan history, your payments, your identity
document reviews (without the document itself) and the reports you made.

Other members appear only as the app shows them to you. A request sent to a profile without
an active plan shows no sender, as in the app.

To delete your account, use "Delete my account" in the app. Some records are kept for
${RETENTION_MONTHS} months after deletion, as our privacy policy explains.
`;

/** Names of other profiles as the app shows them; a profile the member may not see now has none. */
async function visibleNames(tx: Tx, ids: string[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const found = await tx.select({ id: profile.id, name: profile.displayName }).from(profile).where(inArray(profile.id, unique));
  return new Map(found.map((row) => [row.id, row.name]));
}

export async function buildDataExport(c: Context<AppEnv>, tx: Tx): Promise<{ file: Buffer; profiles: number; photos: number }> {
  const user = c.var.user!;
  const { storage } = c.var.deps;
  const [account] = await tx.select().from(memberAccount).where(eq(memberAccount.userId, user.id));
  const own = await tx.select().from(profile).where(sql`app.operates_profile(${profile.id})`).orderBy(profile.createdAt);
  const ids = own.map((p) => p.id);
  const inOwn = (column: Column) => (ids.length ? inArray(column, ids) : sql`false`);

  const contacts = await tx.select().from(privateContact).where(inOwn(privateContact.profileId));
  const photos = await tx
    .select({ profileId: photo.profileId, slot: photo.slot, isCover: photo.isCover, key: photoOriginal.objectKey, createdAt: photo.createdAt })
    .from(photo)
    .leftJoin(photoOriginal, eq(photoOriginal.photoId, photo.id))
    .where(inOwn(photo.profileId))
    .orderBy(photo.slot);
  const interests = await tx
    .select()
    .from(interest)
    .where(or(inOwn(interest.senderProfileId), inOwn(interest.receiverProfileId)))
    .orderBy(desc(interest.createdAt));
  const connections = await tx
    .select()
    .from(connection)
    .where(or(inOwn(connection.profileLow), inOwn(connection.profileHigh)))
    .orderBy(desc(connection.acceptedAt));
  const shortlists = await tx.select().from(shortlist).where(inOwn(shortlist.ownerProfileId));
  const plans = await tx.select().from(entitlementEvent).where(inOwn(entitlementEvent.profileId)).orderBy(entitlementEvent.seq);
  const payments = await tx
    .select()
    .from(paymentSubmission)
    .where(eq(paymentSubmission.payerUserId, user.id))
    .orderBy(paymentSubmission.createdAt);
  const cases = await tx.select().from(verificationCase).where(eq(verificationCase.subjectUserId, user.id)).orderBy(verificationCase.submittedAt);
  const reports = await tx.select().from(report).where(eq(report.reporterUserId, user.id)).orderBy(report.createdAt);

  const others = [
    ...interests.flatMap((i) => [i.senderProfileId, i.receiverProfileId]),
    ...connections.flatMap((x) => [x.profileLow, x.profileHigh]),
    ...shortlists.map((s) => s.targetProfileId),
    ...reports.flatMap((r) => (r.targetProfileId ? [r.targetProfileId] : [])),
  ].filter((id) => !ids.includes(id));
  const names = await visibleNames(tx, others);
  const named = (id: string | null) => (id ? { profileId: id, name: names.get(id) ?? null } : null);

  const files: ZipEntry[] = [];
  const profileData = [];
  for (const [index, row] of own.entries()) {
    const folder = `photos/profile-${index + 1}`;
    const profilePhotos = [];
    for (const item of photos.filter((p) => p.profileId === row.id)) {
      const name = `${folder}/photo-${item.slot + 1}${item.isCover ? '-cover' : ''}.jpg`;
      const bytes = item.key ? await storage.get('private', item.key) : null;
      if (bytes) files.push({ name, data: bytes });
      profilePhotos.push({ slot: item.slot + 1, cover: item.isCover, addedAt: item.createdAt, file: bytes ? name : null });
    }
    // Without a plan, open requests show no sender (sections 1 and 4): the export shows what the app shows.
    const hasPlan = await scalar<boolean>(tx, sql`app.has_active_entitlement(${row.id})`);
    const hiddenPreviews = hasPlan
      ? []
      : rows<{ received_at: string; sender_age: number | null; sender_occupation: string | null }>(
          await tx.execute(sql`select * from app.received_interest_previews(${row.id})`),
        );
    const blocks = rows<{ profile_id: string | null; display_name: string | null; blocked_at: string }>(
      await tx.execute(sql`select * from app.blocked_profiles(${row.id})`),
    );
    profileData.push({
      id: row.id,
      yourRole: row.candidateUserId === user.id ? 'candidate' : 'manager',
      management: row.management,
      status: row.status,
      createdAt: row.createdAt,
      firstPublishedAt: row.firstPublishedAt,
      candidateConfirmedAt: row.candidateConfirmedAt,
      details: Object.fromEntries(FIELDS.map((field) => [field, row[field]])),
      contacts: contacts
        .filter((x) => x.profileId === row.id)
        .map((x) => ({
          person: x.person,
          kind: x.kind,
          platform: x.platform,
          value: x.value,
          verified: Boolean(x.verifiedAt),
          sharedWithConnections: x.shareWithConnections,
          addedAt: x.createdAt,
        })),
      photos: profilePhotos,
      requestsSent: interests
        .filter((i) => i.senderProfileId === row.id)
        .map((i) => ({ to: named(i.receiverProfileId), status: i.status, sentAt: i.createdAt, answeredAt: i.respondedAt })),
      requestsReceived: [
        ...interests
          .filter((i) => i.receiverProfileId === row.id)
          .map((i) => ({ from: named(i.senderProfileId), status: i.status, receivedAt: i.createdAt, answeredAt: i.respondedAt })),
        ...hiddenPreviews.map((p) => ({
          from: { hidden: true, age: p.sender_age, occupation: p.sender_occupation },
          status: 'pending',
          receivedAt: isoDate(p.received_at),
          answeredAt: null,
        })),
      ],
      connections: connections
        .filter((x) => x.profileLow === row.id || x.profileHigh === row.id)
        .map((x) => ({
          with: named(x.profileLow === row.id ? x.profileHigh : x.profileLow),
          connectedAt: x.acceptedAt,
          endedAt: x.endedAt,
          endReason: x.endReason,
        })),
      shortlist: shortlists.filter((s) => s.ownerProfileId === row.id).map((s) => ({ profile: named(s.targetProfileId), addedAt: s.createdAt })),
      blocked: blocks.map((b) => ({ profileId: b.profile_id, name: b.display_name, blockedAt: isoDate(b.blocked_at) })),
      planHistory: plans
        .filter((p) => p.profileId === row.id)
        .map((p) => ({ kind: p.kind, planId: p.planId, startsAt: p.startsAt, endsAt: p.endsAt, reason: p.reason, at: p.createdAt })),
    });
  }

  const data = {
    exportedAt: new Date().toISOString(),
    account: {
      name: user.name,
      email: user.email.endsWith(`@${PHONE_ONLY_EMAIL_DOMAIN}`) ? null : user.email,
      emailVerified: user.emailVerified,
      phoneNumber: user.phoneNumber ?? null,
      phoneNumberVerified: Boolean(user.phoneNumberVerified),
      createdAt: user.createdAt,
      language: account?.locale ?? null,
      residenceCountry: account?.residenceCountry ?? null,
    },
    profiles: profileData,
    payments: payments.map((p) => ({
      reference: p.reference,
      profileId: p.profileId,
      plan: p.planName ?? p.planId,
      currency: p.currency,
      amountMinor: p.amountMinor,
      channel: p.channel,
      declaredResidence: p.declaredResidenceCountry,
      status: p.status,
      startedAt: p.createdAt,
      receiptSentAt: p.proofSubmittedAt,
      decidedAt: p.reviewedAt,
      messageFromUs: p.decisionNote,
      refundReason: p.refundReason,
      refundTermsConfirmed: p.refundTermsVersion,
    })),
    identityDocumentReviews: cases.map((v) => ({
      documentType: v.documentType,
      status: v.status,
      submittedAt: v.submittedAt,
      decidedAt: v.reviewedAt,
      reason: v.decisionReason,
      documentDeleted: v.evidenceKey === null,
    })),
    reportsYouMade: reports.map((r) => ({
      about: named(r.targetProfileId),
      category: r.category,
      detail: r.detail,
      status: r.status,
      reportedAt: r.createdAt,
      decidedAt: r.reviewedAt,
    })),
  };
  const file = zip([
    { name: 'README.txt', data: Buffer.from(README, 'utf8'), compress: true },
    { name: 'data.json', data: Buffer.from(JSON.stringify(data, null, 2), 'utf8'), compress: true },
    ...files,
  ]);
  return { file, profiles: own.length, photos: files.length };
}
