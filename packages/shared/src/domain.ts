/**
 * Domain value lists shared by the database enums (apps/api/src/db/schema), the API and the
 * member app. Business rules come from docs/OWNER-DECISIONS.md (§n = its Part 1 sections);
 * spec references are to docs/Favorite-Hearts.pdf. Changing a list here needs a migration.
 */

// --- Accounts and profiles --------------------------------------------------

export const ACCOUNT_STATUSES = ['active', 'suspended', 'deleted'] as const;
/** §10: English and Sinhala at launch; Tamil stays hidden until fully translated. */
export const LOCALES = ['en', 'si'] as const;

/** §7: paused hides the profile; engaged_or_married hides it and ends the plan. */
export const PROFILE_STATUSES = ['draft', 'published', 'paused', 'engaged_or_married', 'suspended', 'deleted'] as const;
export type ProfileStatus = (typeof PROFILE_STATUSES)[number];
export const PROFILE_MANAGEMENT = ['self', 'manager'] as const;
export const MANAGER_RELATIONSHIPS = ['mother', 'father', 'guardian', 'family_member', 'authorized_person'] as const;
export const MANAGER_REVOKE_REASONS = ['candidate_removed', 'candidate_declined', 'manager_left', 'owner_action'] as const;
/** §5: each manager may run up to 3 profiles; more only with the owner's approval. */
export const DEFAULT_MANAGER_CAPACITY = 3;

export const GENDERS = ['man', 'woman'] as const;
export const MARITAL_STATUSES = ['never_married', 'divorced', 'widowed', 'separated'] as const;
export const RELIGIONS = ['buddhist', 'hindu', 'christian', 'muslim', 'sikh', 'jain', 'other', 'prefer_not_to_say'] as const;
export const TIMELINES = ['ready', 'within_1_2_years', 'within_2_3_years', 'open_to_discussing'] as const;
export const RELOCATION_PREFERENCES = ['open_to_relocating', 'prefer_to_stay', 'open_to_discussing'] as const;
/** §6: optional range, shown on the profile labelled "self-declared" (LKR per month equivalent). */
export const INCOME_RANGES = [
  'prefer_not_to_say',
  'no_personal_income',
  'below_50k',
  'from_50k_to_99k',
  'from_100k_to_199k',
  'from_200k_to_349k',
  'from_350k_to_499k',
  'from_500k_to_999k',
  'from_1m',
] as const;
/** §1: the only horoscope field kept at launch. */
export const HOROSCOPE_IMPORTANCE = [
  'essential',
  'preferred_but_open',
  'family_prefers',
  'not_important',
  'prefer_not_to_say',
] as const;
export const DIETS = ['vegetarian', 'non_vegetarian', 'vegan', 'pescatarian'] as const;
export const HABIT_FREQUENCIES = ['never', 'occasionally', 'regularly'] as const;
export const CHILDREN_PLANS = ['would_like', 'do_not_want', 'open_to_discussing'] as const;
export const FAMILY_INVOLVEMENT = ['candidate_led', 'family_involved', 'decide_together'] as const;
export const COMMUNITY_OPENNESS = ['open_to_any', 'prefer_shared', 'open_to_discussing'] as const;
export const PROFILE_VALUES = [
  'kindness',
  'family',
  'honesty',
  'growth',
  'learning',
  'independence',
  'faith',
  'creativity',
  'adventure',
  'balance',
] as const;

// --- Private contacts, photos and invitations -------------------------------

export const CONTACT_PERSONS = ['candidate', 'manager'] as const;
export const CONTACT_KINDS = ['phone', 'email', 'social'] as const;
export const SOCIAL_PLATFORMS = ['instagram', 'facebook', 'linkedin', 'tiktok', 'youtube', 'x', 'website'] as const;
export const MAX_SOCIAL_LINKS = 7;
/** §6: up to 5 photos per profile, one of them the cover. */
export const MAX_PHOTOS = 5;
export const PHOTO_MODERATION_STATUSES = ['visible', 'hidden'] as const;
export const INVITATION_CHANNELS = ['email', 'phone'] as const;
/** §5: single-use invitation link, valid for 24 hours. */
export const INVITATION_TTL_HOURS = 24;

// --- Verification -------------------------------------------------------------

/** §5: badge wording must say "identity document reviewed", never "government verified". */
export const DOCUMENT_TYPES = ['nic', 'passport', 'driving_licence'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export const VERIFICATION_STATUSES = ['pending', 'approved', 'rejected'] as const;
/** §8: documents are deleted 90 days after the decision. */
export const DOCUMENT_RETENTION_DAYS = 90;

// --- Requests, connections and safety --------------------------------------

export const INTEREST_STATUSES = ['pending', 'accepted', 'declined', 'withdrawn'] as const;
export const CONNECTION_END_REASONS = ['withdrawn', 'blocked', 'candidate_takedown', 'account_deleted', 'moderation'] as const;
/** §4: the log records exactly what was shared and when. */
export const DISCLOSURE_ACTIONS = ['shared', 'revoked'] as const;
export const REPORT_CATEGORIES = [
  'explicit_content',
  'minor_safety',
  'threat',
  'scam',
  'harassment',
  'false_identity',
  'consent_concern',
  'other',
] as const;
/** §7: these hide the content after 1 report; all others after 3 from different verified members. */
export const SERIOUS_REPORT_CATEGORIES = ['explicit_content', 'minor_safety', 'threat', 'scam'] as const;
export const REPORT_STATUSES = ['open', 'upheld', 'dismissed'] as const;

// --- Plans and payments -------------------------------------------------------

export const PLAN_TIERS = ['starter', 'premium'] as const;
/** §2: local members pay in LKR, diaspora members in USD. */
export const RESIDENCE_BANDS = ['local', 'diaspora'] as const;
export const CURRENCIES = ['LKR', 'USD'] as const;
/** §9: LKR bank transfer; diaspora SWIFT into a USD account, or Wise/PayPal-style with proof. */
export const PAYMENT_CHANNELS = ['lkr_bank_transfer', 'usd_swift', 'wise', 'paypal'] as const;
export const PAYMENT_STATUSES = ['awaiting_proof', 'pending_review', 'approved', 'rejected', 'held', 'refunded'] as const;
/** §9: the only refund exceptions. */
export const REFUND_REASONS = ['duplicate_payment', 'mistaken_payment', 'our_failure'] as const;
export const ENTITLEMENT_KINDS = ['grant', 'replace', 'forfeit', 'refund', 'revoke'] as const;

// --- Operations -----------------------------------------------------------------

export const NOTIFICATION_CHANNELS = ['email', 'sms'] as const;
export const NOTIFICATION_STATUSES = ['queued', 'sending', 'sent', 'failed', 'cancelled'] as const;
/** §10: the owner can pause new signups or document submissions when the queue is overwhelmed. */
export const OPERATIONS_FLAGS = ['signups_paused', 'document_submissions_paused'] as const;
