/**
 * Response shapes of the API (/api/v1). The API annotates its responses with these types and the
 * member app reads them, so both sides compile against one contract. Dates arrive as ISO strings.
 */
import type { PLAN_BLOCK_REASONS, PLAN_CHANGE_KINDS } from './billing.ts';
import type {
  CONTACT_KINDS,
  CONTACT_PERSONS,
  CURRENCIES,
  DOCUMENT_TYPES,
  DocumentSide,
  ENTITLEMENT_KINDS,
  INTEREST_STATUSES,
  INVITATION_CHANNELS,
  LOCALES,
  MANAGER_RELATIONSHIPS,
  OPERATIONS_FLAGS,
  PAYMENT_CHANNELS,
  PAYMENT_STATUSES,
  PLAN_TIERS,
  PROFILE_MANAGEMENT,
  PROFILE_STATUSES,
  REFUND_REASONS,
  REPORT_CATEGORIES,
  REPORT_STATUSES,
  SOCIAL_PLATFORMS,
  VERIFICATION_STATUSES,
} from './domain.ts';
import type { StaffRole } from './login-channels.ts';
import type { profileFieldsSchema } from './profile.ts';
import type { DELETION_OUTCOMES } from './safety.ts';
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
  /** Section 7: whether other members see the cover photo unblurred. */
  coverPublic: boolean;
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

/** A document photo chosen but not yet sent for review; only its uploader sees it, until it is sent or expires. */
export type VerificationDraftView = { id: string; side: DocumentSide; via: 'device' | 'phone'; createdAt: ApiDate; expiresAt: ApiDate };

export type VerificationDraftsView = {
  drafts: VerificationDraftView[];
  /** The phone link (QR code) that is open now, if any. */
  phoneLink: { expiresAt: ApiDate } | null;
  selfieRequired: boolean;
};

/** A new phone link: `url` is what the QR code shows (its token is never stored by us). */
export type PhoneLinkView = { url: string; expiresAt: ApiDate };

/** What the phone page may know: when its link ends and which photos are in, never who the member is. */
export type PhoneUploadStatus = { expiresAt: ApiDate; selfieRequired: boolean; uploaded: DocumentSide[] };

export type StaffQueueItem = VerificationCaseView & {
  evidenceAvailable: boolean;
  /** The photos of this submission, each shown on its own audited request. */
  sides: DocumentSide[];
  subject: {
    name: string | null;
    email: string | null;
    phone: string | null;
    phoneVerified: boolean;
    /** The member deleted the account: only the decision is kept, until the retention sweep. */
    accountDeleted: boolean;
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
  planName: string | null;
  endsAt: ApiDate | null;
  /** The plan has ended but a renewal receipt sent in time is waiting for review (up to 3 days). */
  inGrace: boolean;
  graceEndsAt: ApiDate | null;
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

/** What staff see when deciding a report: the profile as members see it, with every photo (hidden ones too). */
export type StaffReportContent = {
  profile: Omit<MemberProfileView, 'relation' | 'contactsHidden'>;
  reportedPhotoId: string | null;
};

// --- Plans and payments (Stage 4) ---------------------------------------------------------------------------

type Currency = (typeof CURRENCIES)[number];
type PaymentChannel = (typeof PAYMENT_CHANNELS)[number];
type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export type PlanPrice = { currency: Currency; amountMinor: number; priceVersionId: string };

/** A plan as members see it: the owner's current name, limits and prices. */
export type PlanView = {
  id: string;
  name: string;
  description: string | null;
  tier: (typeof PLAN_TIERS)[number];
  level: number;
  termMonths: number;
  dailyRequestCap: number;
  monthlyRequestCap: number | null;
  prices: PlanPrice[];
};

/** What buying the plan would do now: upgrades and renewals start on approval, so remaining days are lost. */
export type PlanChange = {
  kind: (typeof PLAN_CHANGE_KINDS)[number];
  reason: (typeof PLAN_BLOCK_REASONS)[number] | null;
  lostDays: number;
  renewalOpensAt: ApiDate | null;
};

export type PlanOption = PlanView & { change: PlanChange };

export type CurrentPlan = {
  planId: string | null;
  planName: string | null;
  level: number | null;
  startsAt: ApiDate;
  endsAt: ApiDate;
  inGrace: boolean;
  graceEndsAt: ApiDate | null;
};

/** A member's own payment. `instructions` (the owner's account details) only while it is still open. */
export type PaymentView = {
  id: string;
  profileId: string | null;
  reference: string;
  status: PaymentStatus;
  planId: string;
  planName: string | null;
  termMonths: number | null;
  currency: Currency;
  amountMinor: number;
  channel: PaymentChannel;
  residenceCountry: string | null;
  changeKind: string | null;
  lostDays: number | null;
  /** The owner's message: why it was rejected, or what is needed. */
  message: string | null;
  refundReason: (typeof REFUND_REASONS)[number] | null;
  proofCount: number;
  createdAt: ApiDate;
  proofSubmittedAt: ApiDate | null;
  reviewedAt: ApiDate | null;
  instructions: string | null;
};

export type ChannelAvailability = { channel: PaymentChannel; currency: Currency; available: boolean };

export type BillingOverview = {
  profileId: string;
  current: CurrentPlan | null;
  openPayment: PaymentView | null;
  options: PlanOption[];
  channels: ChannelAvailability[];
  /** The payer's own payments for this profile (never another payer's, e.g. a former manager's). */
  history: PaymentView[];
  residenceCountry: string | null;
  refundTermsVersion: string;
};

// --- Owner ---------------------------------------------------------------------------------------------------

export type PriceHistoryItem = {
  id: string;
  currency: Currency;
  amountMinor: number;
  effectiveFrom: ApiDate;
  effectiveTo: ApiDate | null;
};

export type OwnerPlanView = PlanView & {
  active: boolean;
  sortOrder: number;
  createdAt: ApiDate;
  priceHistory: PriceHistoryItem[];
  /** A plan that was ever bought or granted cannot be deleted, only retired. */
  usage: { payments: number; grants: number };
};

export type PaymentSettingView = {
  channel: PaymentChannel;
  currency: Currency;
  enabled: boolean;
  instructions: string | null;
  updatedAt: ApiDate | null;
};

/** §2: signs that the declared residence (and so the price band) may not match; for review, never automatic. */
export type ResidenceFlag = 'profile_country_differs' | 'phone_country_differs' | 'no_country_declared';

export type OwnerPaymentItem = {
  id: string;
  reference: string;
  status: PaymentStatus;
  createdAt: ApiDate;
  proofSubmittedAt: ApiDate | null;
  reviewedAt: ApiDate | null;
  /** `deleted`: the profile or the payer's account was deleted; the payment stays on record for the retention period. */
  profile: { id: string | null; displayName: string | null; countryCode: string | null; deleted: boolean };
  payer: { userId: string | null; name: string | null; email: string | null; phone: string | null; deleted: boolean };
  plan: { id: string; name: string | null; level: number | null; termMonths: number | null };
  currency: Currency;
  amountMinor: number;
  channel: PaymentChannel;
  residenceCountry: string | null;
  residenceFlags: ResidenceFlag[];
  changeKind: string | null;
  lostDays: number | null;
  proofCount: number;
  settlementRef: string | null;
  message: string | null;
  ownerNote: string | null;
  refundReason: (typeof REFUND_REASONS)[number] | null;
};

export type EntitlementView = {
  id: string;
  kind: (typeof ENTITLEMENT_KINDS)[number];
  planId: string | null;
  paymentId: string | null;
  startsAt: ApiDate | null;
  endsAt: ApiDate | null;
  reason: string | null;
  createdAt: ApiDate;
};

export type AuditView = { action: string; actorRole: string | null; reason: string | null; createdAt: ApiDate };

export type OwnerPaymentDetail = OwnerPaymentItem & {
  proofs: { id: string; uploadedAt: ApiDate }[];
  /** Recomputed now: approval re-checks the plan rules because time may have passed. */
  changeNow: PlanChange | null;
  entitlements: EntitlementView[];
  history: AuditView[];
};

export type ApprovalResult = {
  status: 'approved' | 'already_approved';
  entitlementId: string;
  kind: 'grant' | 'replace';
  startsAt: ApiDate;
  endsAt: ApiDate;
  lostDays: number;
};

export type OwnerProfilePlan = {
  profileId: string;
  current: CurrentPlan | null;
  entitlements: EntitlementView[];
  payments: OwnerPaymentItem[];
};

// --- Safety: service switches, deletion and export (Stage 5a) -----------------------------------------------

/** Public: whether the owner has paused new sign-ups or document submissions (section 10). */
export type ServiceStatus = { signupsPaused: boolean; documentSubmissionsPaused: boolean; selfieRequired: boolean };

export type OperationsFlagView = {
  key: (typeof OPERATIONS_FLAGS)[number];
  enabled: boolean;
  reason: string | null;
  updatedAt: ApiDate;
};

/** What deleting the account does to one profile it runs. */
export type DeletionOutcomeView = {
  profileId: string;
  displayName: string | null;
  outcome: (typeof DELETION_OUTCOMES)[number];
  /** The candidate who takes the profile over (outcome handed_over). */
  candidateName: string | null;
  planActive: boolean;
  planEndsAt: ApiDate | null;
};

export type AccountDeletionPreview = {
  profiles: DeletionOutcomeView[];
  /** The member's own payments with a receipt the owner has not decided yet: they stay with the owner. */
  paymentsUnderReview: number;
  /** Deleting needs a recent sign-in; false means "sign in again first". */
  recentSignIn: boolean;
  retentionMonths: number;
};

export type AccountDeletionResult = { profilesDeleted: number; profilesHandedOver: number };
