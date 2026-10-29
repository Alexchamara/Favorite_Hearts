/**
 * Response shapes of the API (/api/v1). The API annotates its responses with these types and the
 * member app reads them, so both sides compile against one contract. Dates arrive as ISO strings.
 */
import type {
  CONTACT_KINDS,
  CONTACT_PERSONS,
  DOCUMENT_TYPES,
  INTEREST_STATUSES,
  INVITATION_CHANNELS,
  LOCALES,
  MANAGER_RELATIONSHIPS,
  PROFILE_MANAGEMENT,
  PROFILE_STATUSES,
  REPORT_CATEGORIES,
  REPORT_STATUSES,
  SOCIAL_PLATFORMS,
  VERIFICATION_STATUSES,
} from './domain.ts';
import type { StaffRole } from './login-channels.ts';
import type { profileFieldsSchema } from './profile.ts';
import type { z } from 'zod';

type ApiDate = string | Date;

export type ApiErrorBody = { code: string; message: string; fields?: Record<string, string> };

export type MeView = {
  id: string;
  name: string;
  email: string | null;
  emailVerified: boolean;
  phoneNumber: string | null;
  phoneNumberVerified: boolean;
  staffRole: StaffRole | null;
  twoFactorEnabled: boolean;
  memberAccount: { status: string; locale: (typeof LOCALES)[number] } | null;
};

/** The three badges (OWNER-DECISIONS section 5), each meaning exactly one thing. */
export type Badges = { managerVerified: boolean; candidateConfirmed: boolean; candidateIdentityVerified: boolean };

export type ContactView = {
  id: string;
  person: (typeof CONTACT_PERSONS)[number];
  kind: (typeof CONTACT_KINDS)[number];
  platform: (typeof SOCIAL_PLATFORMS)[number] | null;
  value: string;
  verified: boolean;
  notVerifiedByCandidate: boolean;
  shareWithConnections: boolean;
};

type ProfileFieldValues = Required<Omit<z.output<typeof profileFieldsSchema>, 'caste' | 'adultDeclared'>>;
/** Every editable field as stored: empty ones are null. */
export type ProfileFields = { [K in keyof ProfileFieldValues]: ProfileFieldValues[K] | null } & {
  caste: { value: string; consentedAt: ApiDate | null } | null;
  adultDeclaredAt: ApiDate | null;
};

export type InvitationState = 'waiting' | 'used' | 'replaced' | 'expired';

export type ProfileView = {
  id: string;
  management: (typeof PROFILE_MANAGEMENT)[number];
  status: (typeof PROFILE_STATUSES)[number];
  version: number;
  firstPublishedAt: ApiDate | null;
  fields: ProfileFields;
  me: { role: 'candidate' | 'manager'; canEdit: boolean; canManageInterests: boolean };
  candidate: { joined: boolean; confirmedAt: ApiDate | null; objectedAt: ApiDate | null };
  manager: {
    name: string;
    relationship: (typeof MANAGER_RELATIONSHIPS)[number];
    canEdit: boolean;
    canManageInterests: boolean;
    canViewPrivateDetails: boolean;
    since: ApiDate;
  } | null;
  /**
   * The account whose checks publishing relies on. documentStatus is its latest review ('none' if it
   * has not sent a document); null when that account is someone else, whose checks stay private.
   */
  publisher: { isMe: boolean; phoneVerified: boolean; documentStatus: (typeof VERIFICATION_STATUSES)[number] | 'none' | null } | null;
  badges: Badges;
  contacts: ContactView[];
  invitation: {
    state: InvitationState;
    channel: (typeof INVITATION_CHANNELS)[number];
    contact: string;
    sentAt: ApiDate;
    expiresAt: ApiDate;
  } | null;
  /** Field names still needed before publishing ("contactPhone" = a phone contact). */
  missing: string[];
};

export type InvitationSent = { channel: (typeof INVITATION_CHANNELS)[number]; contact: string; expiresAt: ApiDate };

export type InvitationPreview = {
  candidateName: string | null;
  managerName: string | null;
  relationship: (typeof MANAGER_RELATIONSHIPS)[number] | null;
  channel: (typeof INVITATION_CHANNELS)[number];
  contactHint: string;
  expiresAt: ApiDate;
};

export type VerificationCaseView = {
  id: string;
  documentType: (typeof DOCUMENT_TYPES)[number];
  status: (typeof VERIFICATION_STATUSES)[number];
  submittedAt: ApiDate;
  reviewedAt: ApiDate | null;
  decisionReason: string | null;
};

export type StaffQueueItem = VerificationCaseView & {
  evidenceAvailable: boolean;
  subject: {
    name: string | null;
    email: string | null;
    phone: string | null;
    phoneVerified: boolean;
    profiles: { displayName: string | null; role: 'candidate' | 'manager' }[];
  };
};

// --- Discovery, requests and connections (Stage 3) ---------------------------------------------------

/** A photo as this viewer may see it: the original, or the separate blurred copy (section 7). */
export type PhotoView = { id: string; slot: number; isCover: boolean; url: string; blurred: boolean; hidden: boolean };

/** What every member who may browse sees: an allowlist, never the stored row (spec 4.4). */
export type MemberCard = {
  id: string;
  displayName: string | null;
  age: number | null;
  gender: ProfileFields['gender'];
  city: string | null;
  region: string | null;
  countryCode: string | null;
  occupation: string | null;
  education: string | null;
  heightCm: number | null;
  maritalStatus: ProfileFields['maritalStatus'];
  religion: ProfileFields['religion'];
  management: (typeof PROFILE_MANAGEMENT)[number];
  managerRelationship: (typeof MANAGER_RELATIONSHIPS)[number] | null;
  badges: Badges;
  cover: PhotoView | null;
  photoCount: number;
};

export type DiscoverPage = { profiles: MemberCard[]; nextCursor: string | null };

/** A contact as a connection sees it: only what the profile shares (section 4). */
export type SharedContact = Pick<ContactView, 'person' | 'kind' | 'platform' | 'value' | 'notVerifiedByCandidate'>;

/**
 * Why contact details are not shown: no connection; the viewer's own plan is not active (section 3); or a
 * manager whose candidate turned off "see the contact details connections share".
 */
export type ContactsHidden = 'not_connected' | 'plan_needed' | 'not_allowed';

/** Where the acting profile stands with another profile. Without a plan only `canSend` is filled in. */
export type RelationView = {
  actingProfileId: string;
  connectionId: string | null;
  latestInterest: {
    id: string;
    direction: 'sent' | 'received';
    status: (typeof INTEREST_STATUSES)[number];
    createdAt: ApiDate;
  } | null;
  cooldownUntil: ApiDate | null;
  canSend: boolean;
  /** Why a request cannot be sent now. */
  reason: 'no_plan' | 'not_published' | 'not_allowed' | 'pending' | 'connected' | 'cooldown' | null;
};

type AboutFields = Pick<
  ProfileFields,
  | 'languages'
  | 'motherTongue'
  | 'bio'
  | 'values'
  | 'hobbies'
  | 'timeline'
  | 'relocation'
  | 'incomeRange'
  | 'communityOpenness'
  | 'diet'
  | 'smoking'
  | 'drinking'
  | 'childrenPlan'
  | 'horoscopeImportance'
>;

export type MemberProfileView = MemberCard &
  AboutFields & {
    /** Shown only when the profile consented (section 6). */
    caste: string | null;
    family: Pick<ProfileFields, 'familyStory' | 'motherOccupation' | 'fatherOccupation' | 'sisters' | 'brothers' | 'familyInvolvement'> & {
      /** Parents' names only after both accept (owner decision 29 Oct 2026). */
      motherName: string | null;
      fatherName: string | null;
      namesShown: boolean;
    };
    photos: PhotoView[];
    contacts: SharedContact[] | null;
    contactsHidden: ContactsHidden | null;
    relation: RelationView | null;
  };

/** Sections 1 and 4: without an active plan the receiver gets previews only; the sender stays on the server. */
export type ReceivedInterests =
  | { identified: true; interests: { id: string; receivedAt: ApiDate; sender: MemberCard | null }[] }
  | { identified: false; previews: { id: string; receivedAt: ApiDate; senderAge: number | null; senderOccupation: string | null }[] };

export type SentInterestView = {
  id: string;
  status: (typeof INTEREST_STATUSES)[number];
  createdAt: ApiDate;
  respondedAt: ApiDate | null;
  receiver: MemberCard | null;
  connectionId: string | null;
  cooldownUntil: ApiDate | null;
};

export type ConnectionView = {
  id: string;
  acceptedAt: ApiDate;
  profileId: string;
  profile: MemberCard | null;
  contacts: SharedContact[] | null;
  contactsHidden: ContactsHidden | null;
};

export type BlockView = { id: string; profileId: string | null; displayName: string | null; blockedAt: ApiDate };

/** Section 2: the active plan and what is left of its request limits. */
export type PlanUsage = {
  active: boolean;
  planId: string | null;
  endsAt: ApiDate | null;
  daily: { used: number; cap: number } | null;
  monthly: { used: number; cap: number } | null;
};

export type StaffReportItem = {
  id: string;
  category: (typeof REPORT_CATEGORIES)[number];
  detail: string | null;
  status: (typeof REPORT_STATUSES)[number];
  createdAt: ApiDate;
  target: { profileId: string | null; displayName: string | null; photoId: string | null; hidden: boolean };
  reporter: { profileId: string | null; displayName: string | null; dismissedBefore: number };
};
