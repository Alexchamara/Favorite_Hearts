/**
 * The profile as its own operators (candidate or manager) see it. Built from an explicit allowlist:
 * never serialise a database row directly (spec 4.4, G28).
 */
import { and, asc, eq, sql } from 'drizzle-orm';
import { invitation, privateContact, profile } from '../db/schema/members.ts';
import { fail, type Tx } from '../http.ts';

export type ProfileRow = typeof profile.$inferSelect;
type ContactRow = typeof privateContact.$inferSelect;

/** Fields a profile needs before it can be published (spec 5.2–5.3). */
const REQUIRED = [
  'displayName',
  'gender',
  'birthDate',
  'countryCode',
  'city',
  'occupation',
  'education',
  'heightCm',
  'maritalStatus',
  'bio',
  'adultDeclaredAt',
] as const satisfies readonly (keyof ProfileRow)[];

export function missingForPublication(row: ProfileRow, contacts: ContactRow[]): string[] {
  const missing: string[] = REQUIRED.filter((key) => row[key] === null || row[key] === undefined);
  // People connect through shared contact details, so a published profile needs a phone number.
  if (!contacts.some((contact) => contact.kind === 'phone')) missing.push('contactPhone');
  return missing;
}

export const rows = <T>(result: unknown): T[] => (result as { rows: T[] }).rows;

/** The profile if the actor operates it (candidate or active manager); 404 otherwise. */
export async function operatedProfile(tx: Tx, id: string): Promise<ProfileRow> {
  const [row] = await tx
    .select()
    .from(profile)
    .where(and(eq(profile.id, id), sql`app.operates_profile(${profile.id})`));
  if (!row) fail(404, 'NOT_FOUND', 'Profile not found.');
  return row;
}

export async function actorRights(tx: Tx, id: string) {
  const [rights] = rows<{ can_edit: boolean; can_manage_interests: boolean }>(
    await tx.execute(sql`select app.can_edit_profile(${id}) as can_edit, app.can_manage_interests(${id}) as can_manage_interests`),
  );
  return { canEdit: Boolean(rights?.can_edit), canManageInterests: Boolean(rights?.can_manage_interests) };
}

type People = {
  manager: {
    name: string;
    relationship: string;
    canEdit: boolean;
    canManageInterests: boolean;
    canViewPrivateDetails: boolean;
    since: string;
  } | null;
  candidateJoined: boolean;
  publisher: { isMe: boolean; phoneVerified: boolean; documentStatus: string | null } | null;
};

export async function profilePeople(tx: Tx, id: string): Promise<People> {
  const [row] = rows<{ people: People }>(await tx.execute(sql`select app.profile_people(${id}) as people`));
  return row!.people;
}

export async function profileBadges(tx: Tx, id: string) {
  const [badges] = rows<{ manager_verified: boolean; candidate_confirmed: boolean; candidate_identity_verified: boolean }>(
    await tx.execute(sql`select * from app.profile_badges(${id})`),
  );
  return {
    managerVerified: Boolean(badges?.manager_verified),
    candidateConfirmed: Boolean(badges?.candidate_confirmed),
    candidateIdentityVerified: Boolean(badges?.candidate_identity_verified),
  };
}

export function contactView(contact: ContactRow) {
  return {
    id: contact.id,
    person: contact.person,
    kind: contact.kind,
    platform: contact.platform,
    value: contact.value,
    verified: contact.verifiedAt !== null,
    // OWNER-DECISIONS section 4: a candidate phone entered by a manager is labelled until confirmed.
    notVerifiedByCandidate: contact.person === 'candidate' && contact.kind === 'phone' && contact.verifiedAt === null,
    shareWithConnections: contact.shareWithConnections,
  };
}

export async function invitationStatus(tx: Tx, id: string) {
  const [latest] = await tx
    .select()
    .from(invitation)
    .where(eq(invitation.profileId, id))
    .orderBy(sql`${invitation.createdAt} desc`)
    .limit(1);
  if (!latest) return null;
  const state = latest.consumedAt
    ? 'used'
    : latest.supersededAt
      ? 'replaced'
      : latest.expiresAt.getTime() <= Date.now()
        ? 'expired'
        : 'waiting';
  return { state, channel: latest.channel, contact: latest.contact, sentAt: latest.createdAt, expiresAt: latest.expiresAt };
}

/** Everything the profile's own operators may see, for the actor `userId`. */
export async function ownProfileView(tx: Tx, id: string, userId: string) {
  const row = await operatedProfile(tx, id);
  const [contacts, people, badges, rights] = [
    await tx.select().from(privateContact).where(eq(privateContact.profileId, id)).orderBy(asc(privateContact.createdAt)),
    await profilePeople(tx, id),
    await profileBadges(tx, id),
    await actorRights(tx, id),
  ];
  const isCandidate = row.candidateUserId === userId;
  const missing = missingForPublication(row, contacts);
  return {
    id: row.id,
    management: row.management,
    status: row.status,
    version: row.version,
    firstPublishedAt: row.firstPublishedAt,
    fields: {
      displayName: row.displayName,
      gender: row.gender,
      birthDate: row.birthDate,
      countryCode: row.countryCode,
      region: row.region,
      city: row.city,
      occupation: row.occupation,
      education: row.education,
      heightCm: row.heightCm,
      maritalStatus: row.maritalStatus,
      religion: row.religion,
      languages: row.languages,
      motherTongue: row.motherTongue,
      bio: row.bio,
      familyStory: row.familyStory,
      values: row.values,
      hobbies: row.hobbies,
      timeline: row.timeline,
      relocation: row.relocation,
      motherName: row.motherName,
      motherOccupation: row.motherOccupation,
      fatherName: row.fatherName,
      fatherOccupation: row.fatherOccupation,
      sisters: row.sisters,
      brothers: row.brothers,
      incomeRange: row.incomeRange,
      caste: row.caste ? { value: row.caste, consentedAt: row.casteConsentedAt } : null,
      communityOpenness: row.communityOpenness,
      diet: row.diet,
      smoking: row.smoking,
      drinking: row.drinking,
      childrenPlan: row.childrenPlan,
      familyInvolvement: row.familyInvolvement,
      horoscopeImportance: row.horoscopeImportance,
      adultDeclaredAt: row.adultDeclaredAt,
    },
    me: { role: isCandidate ? ('candidate' as const) : ('manager' as const), ...rights },
    candidate: {
      joined: people.candidateJoined,
      confirmedAt: row.candidateConfirmedAt,
      objectedAt: row.candidateObjectionAt,
    },
    manager: people.manager,
    publisher: people.publisher,
    badges,
    contacts: contacts.map(contactView),
    invitation: isCandidate ? null : await invitationStatus(tx, id),
    missing,
  };
}
