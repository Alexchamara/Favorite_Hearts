/**
 * Validation for profiles, private contacts and invitations. The API always re-validates with
 * these schemas; the member app uses the same ones in its forms. Limits follow spec 5.3.
 */
import { z } from 'zod';
import { normalizeEmail, normalizePhone } from './contact.ts';
import {
  CHILDREN_PLANS,
  COMMUNITY_OPENNESS,
  CONTACT_KINDS,
  CONTACT_PERSONS,
  DIETS,
  DOCUMENT_TYPES,
  FAMILY_INVOLVEMENT,
  GENDERS,
  HABIT_FREQUENCIES,
  HOROSCOPE_IMPORTANCE,
  INCOME_RANGES,
  INVITATION_CHANNELS,
  MANAGER_RELATIONSHIPS,
  MARITAL_STATUSES,
  PROFILE_VALUES,
  RELIGIONS,
  RELOCATION_PREFERENCES,
  SOCIAL_PLATFORMS,
  TIMELINES,
} from './domain.ts';

export const MIN_AGE = 18;
export const MAX_AGE = 100;

/** Whole years between an ISO date (YYYY-MM-DD) and `today`. */
export function ageOn(birthDate: string, today: Date = new Date()): number {
  const [y, m, d] = birthDate.split('-').map(Number) as [number, number, number];
  let age = today.getUTCFullYear() - y;
  if (today.getUTCMonth() + 1 < m || (today.getUTCMonth() + 1 === m && today.getUTCDate() < d)) age -= 1;
  return age;
}

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const optionalText = (max: number) => z.string().trim().max(max).nullable();
const birthDate = z.iso.date().refine((value) => {
  const age = ageOn(value);
  return age >= MIN_AGE && age <= MAX_AGE;
}, `The candidate must be between ${MIN_AGE} and ${MAX_AGE}.`);

export const profileCreateSchema = z.discriminatedUnion('management', [
  z.object({ management: z.literal('self'), adultDeclared: z.literal(true) }),
  z.object({
    management: z.literal('manager'),
    relationship: z.enum(MANAGER_RELATIONSHIPS),
    /** §5 / §4: the manager declares the candidate is 18+ and that they may publish and share. */
    authorityDeclared: z.literal(true),
  }),
]);
export type ProfileCreateInput = z.input<typeof profileCreateSchema>;

/** Editable fields; every one optional so the wizard can save step by step. */
export const profileFieldsSchema = z
  .object({
    displayName: text(2, 60),
    gender: z.enum(GENDERS),
    birthDate,
    countryCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, 'Choose a country.'),
    region: optionalText(80),
    city: text(1, 80),
    occupation: text(1, 100),
    education: text(1, 200),
    heightCm: z.number().int().min(100).max(230),
    maritalStatus: z.enum(MARITAL_STATUSES),
    religion: z.enum(RELIGIONS),
    languages: z.array(text(1, 40)).max(10),
    motherTongue: optionalText(80),
    bio: text(20, 600),
    familyStory: optionalText(600),
    values: z.array(z.enum(PROFILE_VALUES)).max(5),
    hobbies: z.array(text(1, 50)).max(6),
    timeline: z.enum(TIMELINES),
    relocation: z.enum(RELOCATION_PREFERENCES),
    motherName: optionalText(80),
    motherOccupation: optionalText(100),
    fatherName: optionalText(80),
    fatherOccupation: optionalText(100),
    sisters: z.array(text(1, 100)).max(12),
    brothers: z.array(text(1, 100)).max(12),
    incomeRange: z.enum(INCOME_RANGES),
    communityOpenness: z.enum(COMMUNITY_OPENNESS).nullable(),
    diet: z.enum(DIETS).nullable(),
    smoking: z.enum(HABIT_FREQUENCIES).nullable(),
    drinking: z.enum(HABIT_FREQUENCIES).nullable(),
    childrenPlan: z.enum(CHILDREN_PLANS).nullable(),
    familyInvolvement: z.enum(FAMILY_INVOLVEMENT).nullable(),
    horoscopeImportance: z.enum(HOROSCOPE_IMPORTANCE),
    /** §6: optional, only with explicit consent; null removes it. */
    caste: z
      .object({ value: text(1, 80), consent: z.literal(true) })
      .nullable(),
    /** The self-managed candidate's own 18+ declaration (managers declare when creating). */
    adultDeclared: z.literal(true),
  })
  .partial()
  .strict();

export const profileUpdateSchema = profileFieldsSchema.extend({
  /** Optimistic concurrency (spec A05): the version the edit was based on. */
  version: z.number().int().positive(),
});
export type ProfileUpdateInput = z.input<typeof profileUpdateSchema>;

/** Social links: a username or an HTTPS link, at most 300 characters (spec 5.3). */
const SOCIAL_PREFIX: Record<(typeof SOCIAL_PLATFORMS)[number], string | null> = {
  instagram: 'https://instagram.com/',
  facebook: 'https://facebook.com/',
  linkedin: 'https://linkedin.com/in/',
  tiktok: 'https://tiktok.com/@',
  youtube: 'https://youtube.com/@',
  x: 'https://x.com/',
  website: null,
};

export function normalizeSocial(platform: (typeof SOCIAL_PLATFORMS)[number], raw: string): string | null {
  const value = raw.trim();
  const prefix = SOCIAL_PREFIX[platform];
  if (prefix && /^@?[A-Za-z0-9_.-]{1,80}$/.test(value)) return prefix + value.replace(/^@/, '');
  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  const href = url.toString();
  return href.length <= 300 ? href : null;
}

export const contactSchema = z
  .object({
    person: z.enum(CONTACT_PERSONS),
    kind: z.enum(CONTACT_KINDS),
    platform: z.enum(SOCIAL_PLATFORMS).optional(),
    value: z.string().trim().min(1).max(300),
    shareWithConnections: z.boolean().default(true),
  })
  .transform((contact, ctx) => {
    let value: string | null;
    if (contact.kind === 'phone') value = normalizePhone(contact.value);
    else if (contact.kind === 'email') value = normalizeEmail(contact.value);
    else value = contact.platform ? normalizeSocial(contact.platform, contact.value) : null;
    if (!value) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: `Enter a valid ${contact.kind === 'social' ? 'link or username' : contact.kind}.` });
      return z.NEVER;
    }
    return { ...contact, platform: contact.kind === 'social' ? contact.platform : undefined, value };
  });
export type ContactInput = z.input<typeof contactSchema>;

export const contactUpdateSchema = z.object({ shareWithConnections: z.boolean() }).strict();

export const invitationCreateSchema = z
  .object({ channel: z.enum(INVITATION_CHANNELS), contact: z.string().trim().min(3).max(150) })
  .transform((input, ctx) => {
    const contact = input.channel === 'email' ? normalizeEmail(input.contact) : normalizePhone(input.contact);
    if (!contact) {
      ctx.addIssue({ code: 'custom', path: ['contact'], message: `Enter the candidate's ${input.channel === 'email' ? 'email' : 'phone number'}.` });
      return z.NEVER;
    }
    return { channel: input.channel, contact };
  });

/** The invitation token from the link: 43 URL-safe characters (32 random bytes). */
export const invitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'This invitation link is not valid.');
export const invitationCodeSchema = z.object({
  token: invitationTokenSchema,
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code.'),
});

export const managerPermissionsSchema = z
  .object({ canEdit: z.boolean(), canManageInterests: z.boolean(), canViewPrivateDetails: z.boolean() })
  .partial()
  .strict();

export const documentTypeSchema = z.enum(DOCUMENT_TYPES);
export const verificationDecisionSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('approved') }),
  z.object({ decision: z.literal('rejected'), reason: text(3, 300) }),
]);
