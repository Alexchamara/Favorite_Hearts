/**
 * Member accounts, profiles and everything private that belongs to a profile.
 *
 * Discoverable profile fields live in `profile`. Private data is kept in separate tables
 * with stricter row-level security (spec 12.1): `private_contact` (phones, emails, socials),
 * `photo_original` (original photo object keys) and `verification_case` (trust.ts).
 * Row-level security, helper functions and triggers are in the custom migration
 * drizzle/0003_*.sql; constraints that need no other table are declared here.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  ACCOUNT_STATUSES,
  CHILDREN_PLANS,
  COMMUNITY_OPENNESS,
  CONTACT_KINDS,
  CONTACT_PERSONS,
  DEFAULT_MANAGER_CAPACITY,
  DIETS,
  FAMILY_INVOLVEMENT,
  GENDERS,
  HABIT_FREQUENCIES,
  HOROSCOPE_IMPORTANCE,
  INCOME_RANGES,
  INVITATION_CHANNELS,
  LOCALES,
  MANAGER_RELATIONSHIPS,
  MANAGER_REVOKE_REASONS,
  MARITAL_STATUSES,
  PHOTO_MODERATION_STATUSES,
  PROFILE_MANAGEMENT,
  PROFILE_STATUSES,
  RELIGIONS,
  RELOCATION_PREFERENCES,
  SOCIAL_PLATFORMS,
  TIMELINES,
} from '@fh/shared';
import { user } from './auth.ts';
import { at, createdAt, updatedAt } from './columns.ts';

export const accountStatus = pgEnum('account_status', ACCOUNT_STATUSES);
export const locale = pgEnum('locale', LOCALES);
export const profileStatus = pgEnum('profile_status', PROFILE_STATUSES);
export const profileManagement = pgEnum('profile_management', PROFILE_MANAGEMENT);
export const managerRelationship = pgEnum('manager_relationship', MANAGER_RELATIONSHIPS);
export const managerRevokeReason = pgEnum('manager_revoke_reason', MANAGER_REVOKE_REASONS);
export const gender = pgEnum('gender', GENDERS);
export const maritalStatus = pgEnum('marital_status', MARITAL_STATUSES);
export const religion = pgEnum('religion', RELIGIONS);
export const timeline = pgEnum('timeline', TIMELINES);
export const relocationPreference = pgEnum('relocation_preference', RELOCATION_PREFERENCES);
export const incomeRange = pgEnum('income_range', INCOME_RANGES);
export const horoscopeImportance = pgEnum('horoscope_importance', HOROSCOPE_IMPORTANCE);
export const diet = pgEnum('diet', DIETS);
export const habitFrequency = pgEnum('habit_frequency', HABIT_FREQUENCIES);
export const childrenPlan = pgEnum('children_plan', CHILDREN_PLANS);
export const familyInvolvement = pgEnum('family_involvement', FAMILY_INVOLVEMENT);
export const communityOpenness = pgEnum('community_openness', COMMUNITY_OPENNESS);
export const contactPerson = pgEnum('contact_person', CONTACT_PERSONS);
export const contactKind = pgEnum('contact_kind', CONTACT_KINDS);
export const socialPlatform = pgEnum('social_platform', SOCIAL_PLATFORMS);
export const photoModerationStatus = pgEnum('photo_moderation_status', PHOTO_MODERATION_STATUSES);
export const invitationChannel = pgEnum('invitation_channel', INVITATION_CHANNELS);

const textArray = (name: string) => text(name).array().notNull().default(sql`'{}'::text[]`);
const countryCode = (name: string) => varchar(name, { length: 2 });

/** App-level account state for a Better-Auth user (the identity itself stays in auth_user). */
export const memberAccount = pgTable(
  'member_account',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: accountStatus('status').notNull().default('active'),
    locale: locale('locale').notNull().default('en'),
    /** §2: the member's declared country of residence decides the price band (staff check it). */
    residenceCountry: countryCode('residence_country'),
    /** §5: 3 by default; only the owner may raise it. */
    maxManagedProfiles: smallint('max_managed_profiles').notNull().default(DEFAULT_MANAGER_CAPACITY),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('member_account_residence_country_iso', sql`${t.residenceCountry} ~ '^[A-Z]{2}$'`),
    check('member_account_max_managed_positive', sql`${t.maxManagedProfiles} >= 1`),
  ],
);

/**
 * One candidate's matrimony profile. Fields may stay empty while it is a draft; the
 * `profile_published_complete` check makes a published profile complete (spec 5.2–5.3).
 */
export const profile = pgTable(
  'profile',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    management: profileManagement('management').notNull(),
    createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    /** The candidate's own account: the creator when self-managed, set when an invited candidate joins. */
    candidateUserId: text('candidate_user_id').references(() => user.id, { onDelete: 'set null' }),
    status: profileStatus('status').notNull().default('draft'),
    displayName: text('display_name'),
    gender: gender('gender'),
    /** Assumption pending owner decision (spec 5.3: date-of-birth handling). */
    birthDate: date('birth_date', { mode: 'string' }),
    countryCode: countryCode('country_code'),
    region: text('region'),
    city: text('city'),
    occupation: text('occupation'),
    education: text('education'),
    heightCm: smallint('height_cm'),
    maritalStatus: maritalStatus('marital_status'),
    religion: religion('religion').notNull().default('prefer_not_to_say'),
    languages: textArray('languages'),
    motherTongue: text('mother_tongue'),
    bio: text('bio'),
    familyStory: text('family_story'),
    values: textArray('values'),
    hobbies: textArray('hobbies'),
    timeline: timeline('timeline').notNull().default('within_1_2_years'),
    relocation: relocationPreference('relocation').notNull().default('open_to_discussing'),
    motherName: text('mother_name'),
    motherOccupation: text('mother_occupation'),
    fatherName: text('father_name'),
    fatherOccupation: text('father_occupation'),
    sisters: textArray('sisters'),
    brothers: textArray('brothers'),
    /** §6: optional range, labelled self-declared. */
    incomeRange: incomeRange('income_range').notNull().default('prefer_not_to_say'),
    /** §6: optional, only with explicit consent, removable at any time. */
    caste: text('caste'),
    casteConsentedAt: at('caste_consented_at'),
    communityOpenness: communityOpenness('community_openness'),
    diet: diet('diet'),
    smoking: habitFrequency('smoking'),
    drinking: habitFrequency('drinking'),
    childrenPlan: childrenPlan('children_plan'),
    familyInvolvement: familyInvolvement('family_involvement'),
    horoscopeImportance: horoscopeImportance('horoscope_importance').notNull().default('prefer_not_to_say'),
    /** §7: the cover photo is shown to other members only when this is on. */
    coverPublic: boolean('cover_public').notNull().default(false),
    /** Adult declaration: the self-managed candidate's own, or the manager's authority declaration (§5). */
    adultDeclaredAt: at('adult_declared_at'),
    /** Set once by a trigger on first publication; never bumped by later edits (spec 6.1). */
    firstPublishedAt: at('first_published_at'),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('profile_candidate_user_idx').on(t.candidateUserId),
    index('profile_status_idx').on(t.status),
    check('profile_display_name_length', sql`char_length(${t.displayName}) between 2 and 60`),
    check('profile_country_code_iso', sql`${t.countryCode} ~ '^[A-Z]{2}$'`),
    check('profile_region_length', sql`char_length(${t.region}) <= 80`),
    check('profile_city_length', sql`char_length(${t.city}) between 1 and 80`),
    check('profile_occupation_length', sql`char_length(${t.occupation}) between 1 and 100`),
    check('profile_education_length', sql`char_length(${t.education}) between 1 and 200`),
    check('profile_height_range', sql`${t.heightCm} between 100 and 230`),
    check('profile_bio_length', sql`char_length(${t.bio}) between 20 and 600`),
    check('profile_family_story_length', sql`char_length(${t.familyStory}) <= 600`),
    check('profile_mother_tongue_length', sql`char_length(${t.motherTongue}) <= 80`),
    check('profile_values_count', sql`cardinality(${t.values}) <= 5`),
    check('profile_hobbies_count', sql`cardinality(${t.hobbies}) <= 6`),
    check('profile_siblings_count', sql`cardinality(${t.sisters}) <= 12 and cardinality(${t.brothers}) <= 12`),
    check(
      'profile_family_names_length',
      sql`char_length(${t.motherName}) <= 80 and char_length(${t.fatherName}) <= 80 and char_length(${t.motherOccupation}) <= 100 and char_length(${t.fatherOccupation}) <= 100`,
    ),
    check('profile_caste_length', sql`char_length(${t.caste}) between 1 and 80`),
    check('profile_caste_needs_consent', sql`${t.caste} is null or ${t.casteConsentedAt} is not null`),
    check(
      'profile_published_complete',
      sql`${t.status} <> 'published' or (${t.displayName} is not null and ${t.gender} is not null and ${t.birthDate} is not null and ${t.countryCode} is not null and ${t.city} is not null and ${t.occupation} is not null and ${t.education} is not null and ${t.heightCm} is not null and ${t.maritalStatus} is not null and ${t.bio} is not null and ${t.adultDeclaredAt} is not null)`,
    ),
  ],
);

/** A manager's access to one profile (§5). The candidate controls the three permissions. */
export const profileManager = pgTable(
  'profile_manager',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profile.id, { onDelete: 'cascade' }),
    managerUserId: text('manager_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    relationship: managerRelationship('relationship').notNull(),
    authorityDeclaredAt: at('authority_declared_at').notNull(),
    canEdit: boolean('can_edit').notNull().default(true),
    canManageInterests: boolean('can_manage_interests').notNull().default(true),
    canViewPrivateDetails: boolean('can_view_private_details').notNull().default(true),
    grantedAt: at('granted_at').notNull().defaultNow(),
    revokedAt: at('revoked_at'),
    revokedReason: managerRevokeReason('revoked_reason'),
  },
  (t) => [
    uniqueIndex('profile_manager_one_active_idx').on(t.profileId).where(sql`${t.revokedAt} is null`),
    index('profile_manager_active_manager_idx').on(t.managerUserId).where(sql`${t.revokedAt} is null`),
    check('profile_manager_revoke_reason', sql`(${t.revokedAt} is null) = (${t.revokedReason} is null)`),
  ],
);

/** Phones, emails and social links: never part of discovery (§4, spec 4.4). */
export const privateContact = pgTable(
  'private_contact',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profile.id, { onDelete: 'cascade' }),
    person: contactPerson('person').notNull(),
    kind: contactKind('kind').notNull(),
    platform: socialPlatform('platform'),
    value: text('value').notNull(),
    /** A candidate phone entered by a manager stays "not verified by candidate" until set (§4). */
    verifiedAt: at('verified_at'),
    /** §4: shared with connections by default; the candidate can restrict it. */
    shareWithConnections: boolean('share_with_connections').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('private_contact_profile_idx').on(t.profileId),
    check('private_contact_platform_for_social', sql`(${t.kind} = 'social') = (${t.platform} is not null)`),
    check('private_contact_value_length', sql`char_length(${t.value}) between 1 and 300`),
  ],
);

/** Photo slots 0–4 (§6: at most 5, one cover). Holds only the blurred derivative's key. */
export const photo = pgTable(
  'photo',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profile.id, { onDelete: 'cascade' }),
    slot: smallint('slot').notNull(),
    isCover: boolean('is_cover').notNull().default(false),
    blurredKey: text('blurred_key').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    moderationStatus: photoModerationStatus('moderation_status').notNull().default('visible'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('photo_profile_slot_idx').on(t.profileId, t.slot),
    uniqueIndex('photo_one_cover_idx').on(t.profileId).where(sql`${t.isCover}`),
    check('photo_slot_range', sql`${t.slot} between 0 and 4`),
  ],
);

/** Original photo object key, separated so discovery can never read it (§7: "the blur is real"). */
export const photoOriginal = pgTable('photo_original', {
  photoId: uuid('photo_id')
    .primaryKey()
    .references(() => photo.id, { onDelete: 'cascade' }),
  objectKey: text('object_key').notNull(),
  createdAt: createdAt(),
});

/**
 * Candidate invitation (§5): single-use, 24 hours, contact different from the manager's,
 * and a new invitation supersedes the live one. Only digests of the token and code are stored.
 */
export const invitation = pgTable(
  'invitation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profile.id, { onDelete: 'cascade' }),
    issuedByUserId: text('issued_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    channel: invitationChannel('channel').notNull(),
    /** Normalised email (lowercase) or E.164 phone, as produced by @fh/shared. */
    contact: text('contact').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    codeHash: text('code_hash'),
    codeAttempts: smallint('code_attempts').notNull().default(0),
    resendNumber: smallint('resend_number').notNull().default(0),
    createdAt: createdAt(),
    /** Leave to the default: the window is measured on the database clock (spec 12.2). */
    expiresAt: at('expires_at')
      .notNull()
      .default(sql`now() + interval '24 hours'`),
    consumedAt: at('consumed_at'),
    consumedByUserId: text('consumed_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    supersededAt: at('superseded_at'),
  },
  (t) => [
    uniqueIndex('invitation_one_live_idx')
      .on(t.profileId)
      .where(sql`${t.consumedAt} is null and ${t.supersededAt} is null`),
    check(
      'invitation_valid_24_hours',
      sql`${t.expiresAt} > ${t.createdAt} and ${t.expiresAt} <= ${t.createdAt} + interval '24 hours'`,
    ),
    check('invitation_single_outcome', sql`${t.consumedAt} is null or ${t.supersededAt} is null`),
  ],
);
