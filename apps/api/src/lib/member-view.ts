/**
 * Profiles as OTHER members see them (discovery, requests, connections). Built from an explicit allowlist,
 * never the stored row (spec 4.4, G28). Row access comes from row-level security: a query only returns
 * profiles, photos, originals and contacts this viewer may see, and a signed link is made only for those.
 */
import { and, asc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { Context } from 'hono';
import type { MemberCard, MemberProfileView, PhotoView, SharedContact } from '@fh/shared';
import { photo, photoOriginal, privateContact, profile } from '../db/schema/members.ts';
import type { AppEnv, Tx } from '../http.ts';
import { contactView, rows, type ProfileRow } from './profile-view.ts';

/** The columns a member card needs; selected under row-level security. */
export const cardColumns = {
  id: profile.id,
  displayName: profile.displayName,
  birthDate: profile.birthDate,
  gender: profile.gender,
  city: profile.city,
  region: profile.region,
  countryCode: profile.countryCode,
  occupation: profile.occupation,
  education: profile.education,
  heightCm: profile.heightCm,
  maritalStatus: profile.maritalStatus,
  religion: profile.religion,
  management: profile.management,
};
export type CardRow = Pick<ProfileRow, keyof typeof cardColumns>;

export const uuidArray = (ids: string[]): SQL => sql`ARRAY[${sql.join(ids.map((id) => sql`${id}`), sql`, `)}]::uuid[]`;

/** Whole years on the date in Sri Lanka; only the age is ever shown (spec 5.3). */
export function ageFrom(birthDate: string | null, now = new Date()): number | null {
  if (!birthDate) return null;
  const [year, month, day] = birthDate.split('-').map(Number) as [number, number, number];
  const today = new Date(now.getTime() + 5.5 * 3_600_000); // Asia/Colombo, UTC+05:30 all year
  let age = today.getUTCFullYear() - year;
  if ((today.getUTCMonth() + 1) * 100 + today.getUTCDate() < month * 100 + day) age -= 1;
  return age;
}

/**
 * The photos of these profiles that the viewer may see, signed: the original when row-level security
 * returns it (the profile's operators, a cover shown publicly, or a connection with a plan), otherwise the
 * separate blurred copy. With `coversOnly`, only covers are signed (discovery lists).
 */
export async function visiblePhotos(c: Context<AppEnv>, tx: Tx, profileIds: string[], coversOnly = false): Promise<Map<string, PhotoView[]>> {
  const byProfile = new Map<string, PhotoView[]>();
  if (!profileIds.length) return byProfile;
  const found = await tx
    .select({
      id: photo.id,
      profileId: photo.profileId,
      slot: photo.slot,
      isCover: photo.isCover,
      blurredKey: photo.blurredKey,
      moderationStatus: photo.moderationStatus,
      originalKey: photoOriginal.objectKey,
    })
    .from(photo)
    .leftJoin(photoOriginal, eq(photoOriginal.photoId, photo.id))
    .where(inArray(photo.profileId, profileIds))
    .orderBy(asc(photo.slot));
  const { storage } = c.var.deps;
  for (const row of found) {
    const list = byProfile.get(row.profileId) ?? [];
    const sign = !coversOnly || row.isCover;
    list.push({
      id: row.id,
      slot: row.slot,
      isCover: row.isCover,
      url: sign ? await (row.originalKey ? storage.signedGetUrl('private', row.originalKey) : storage.signedGetUrl('derived', row.blurredKey)) : '',
      blurred: !row.originalKey,
      hidden: row.moderationStatus === 'hidden',
    });
    byProfile.set(row.profileId, list);
  }
  return byProfile;
}

type CardExtras = {
  profile_id: string;
  manager_relationship: MemberCard['managerRelationship'];
  manager_verified: boolean;
  candidate_confirmed: boolean;
  candidate_identity_verified: boolean;
};

/** Cards for profiles already read under row-level security, in the same order. */
export async function memberCards(c: Context<AppEnv>, tx: Tx, profiles: CardRow[]): Promise<MemberCard[]> {
  if (!profiles.length) return [];
  const ids = profiles.map((p) => p.id);
  const extras = new Map(
    rows<CardExtras>(await tx.execute(sql`select * from app.member_cards(${uuidArray(ids)})`)).map((e) => [e.profile_id, e]),
  );
  const photos = await visiblePhotos(c, tx, ids, true);
  return profiles.map((p) => {
    const extra = extras.get(p.id);
    const list = (photos.get(p.id) ?? []).filter((ph) => !ph.hidden);
    return {
      id: p.id,
      displayName: p.displayName,
      age: ageFrom(p.birthDate),
      gender: p.gender,
      city: p.city,
      region: p.region,
      countryCode: p.countryCode,
      occupation: p.occupation,
      education: p.education,
      heightCm: p.heightCm,
      maritalStatus: p.maritalStatus,
      religion: p.religion,
      management: p.management,
      managerRelationship: extra?.manager_relationship ?? null,
      badges: {
        managerVerified: Boolean(extra?.manager_verified),
        candidateConfirmed: Boolean(extra?.candidate_confirmed),
        candidateIdentityVerified: Boolean(extra?.candidate_identity_verified),
      },
      cover: list.find((ph) => ph.isCover) ?? null,
      photoCount: list.length,
    };
  });
}

/** Cards by id, for the profiles the viewer may see; the others come back as null. */
export async function cardsById(c: Context<AppEnv>, tx: Tx, ids: string[]): Promise<Map<string, MemberCard>> {
  if (!ids.length) return new Map();
  const found = await tx.select(cardColumns).from(profile).where(inArray(profile.id, [...new Set(ids)]));
  const cards = await memberCards(c, tx, found);
  return new Map(cards.map((card) => [card.id, card]));
}

const scalar = async <T>(tx: Tx, query: SQL): Promise<T> => rows<{ value: T }>(await tx.execute(sql`select ${query} as value`))[0]!.value;

/** Shared contact details, when this viewer may see them (sections 3, 4); otherwise null. */
export async function sharedContacts(tx: Tx, target: Pick<ProfileRow, 'id' | 'management'>): Promise<SharedContact[] | null> {
  if (!(await scalar<boolean>(tx, sql`app.can_view_private(${target.id})`))) return null;
  const found = await tx.select().from(privateContact).where(and(eq(privateContact.profileId, target.id), eq(privateContact.shareWithConnections, true)));
  return found.map((contact) => {
    const view = contactView(contact, target.management);
    return { person: view.person, kind: view.kind, platform: view.platform, value: view.value, notVerifiedByCandidate: view.notVerifiedByCandidate };
  });
}

/** One profile as another member sees it. `row` was read under row-level security. */
export async function memberProfileView(c: Context<AppEnv>, tx: Tx, row: ProfileRow): Promise<Omit<MemberProfileView, 'relation' | 'contactsHidden'>> {
  const [card] = await memberCards(c, tx, [row]);
  const photos = (await visiblePhotos(c, tx, [row.id])).get(row.id) ?? [];
  const connected = await scalar<boolean>(tx, sql`app.connected_to(${row.id})`);
  return {
    ...card!,
    languages: row.languages,
    motherTongue: row.motherTongue,
    bio: row.bio,
    values: row.values as MemberProfileView['values'],
    hobbies: row.hobbies,
    timeline: row.timeline,
    relocation: row.relocation,
    incomeRange: row.incomeRange,
    communityOpenness: row.communityOpenness,
    diet: row.diet,
    smoking: row.smoking,
    drinking: row.drinking,
    childrenPlan: row.childrenPlan,
    horoscopeImportance: row.horoscopeImportance,
    caste: row.caste && row.casteConsentedAt ? row.caste : null,
    family: {
      familyStory: row.familyStory,
      motherOccupation: row.motherOccupation,
      fatherOccupation: row.fatherOccupation,
      sisters: row.sisters,
      brothers: row.brothers,
      familyInvolvement: row.familyInvolvement,
      motherName: connected ? row.motherName : null,
      fatherName: connected ? row.fatherName : null,
      namesShown: connected,
    },
    photos: photos.filter((ph) => !ph.hidden),
    contacts: await sharedContacts(tx, row),
  };
}

export { scalar };
