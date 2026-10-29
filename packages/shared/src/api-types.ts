/**
 * Response shapes of the API (/api/v1). The API annotates its responses with these types and the
 * member app reads them, so both sides compile against one contract. Dates arrive as ISO strings.
 */
import type {
  CONTACT_KINDS,
  CONTACT_PERSONS,
  DOCUMENT_TYPES,
  INVITATION_CHANNELS,
  LOCALES,
  MANAGER_RELATIONSHIPS,
  PROFILE_MANAGEMENT,
  PROFILE_STATUSES,
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
