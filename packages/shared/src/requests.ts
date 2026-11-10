/**
 * Discovery, requests, connections, blocks, reports and photos (OWNER-DECISIONS sections 1–4, 7).
 * The database enforces every rule again; these schemas give members readable answers first.
 */
import { z } from 'zod';
import { CHILDREN_PLANS, COMMUNITY_OPENNESS, DIETS, FAMILY_INVOLVEMENT, GENDERS, HABIT_FREQUENCIES, MARITAL_STATUSES, RELIGIONS, REPORT_CATEGORIES } from './domain.ts';
import { MAX_AGE, MAX_HEIGHT_CM, MIN_AGE, MIN_HEIGHT_CM } from './profile.ts';

/** §4: after a decline or a withdrawal, a new request between the same two profiles waits this long. */
export const REQUEST_COOLDOWN_DAYS = 7;
/** Version of the "what will be shared" confirmation a sender accepts (spec 12.2). */
export const SHARING_POLICY_VERSION = 'sharing-v1';
export const DISCOVER_PAGE_SIZE = 20;
/**
 * N03 (owner, 6 Nov 2026): a profile without an active plan saves up to this many profiles to its shortlist; with a
 * plan there is no limit. Saved ones above it stay when a plan ends, but no new ones until under it again. The
 * database holds the same number (drizzle/0015_shortlist.sql).
 */
export const SHORTLIST_LIMIT = 20;

const uuid = (message: string) => z.uuid({ error: message });
const decimal = (min: number, max: number, message: string) => z.coerce.number({ error: message }).min(min, message).max(max, message);
const whole = (min: number, max: number, message: string) => z.coerce.number({ error: message }).int(message).min(min, message).max(max, message);

/**
 * How discovery can be sorted (decision B4, 9 Nov 2026: the demo's sorts the app can honour; "your priorities" and
 * "shared values" need a matching score, which has no owner decision, Q-030/Q-032).
 */
export const DISCOVER_SORTS = ['newest', 'age_asc', 'age_desc', 'name', 'district'] as const;
export type DiscoverSort = (typeof DISCOVER_SORTS)[number];
/** Where to look (the demo's location filter): anywhere, in Sri Lanka (optionally some districts), or abroad. */
export const DISCOVER_LOCATIONS = ['everywhere', 'sri_lanka', 'abroad'] as const;

/** A comma-separated list in the query string ("Kandy,Galle"), each item checked by `item`. */
const list = <T extends z.ZodType<string, string>>(item: T, max: number) =>
  z
    .string()
    .max(2000)
    .transform((value) => value.split(',').map((part) => part.trim()).filter(Boolean))
    .pipe(z.array(item).max(max, 'validation.tooMany'));

/** Discovery filters, read from the query string. All optional. */
export const discoverQuerySchema = z
  .object({
    gender: z.enum(GENDERS, { error: 'validation.chooseOption' }).optional(),
    ageMin: whole(MIN_AGE, MAX_AGE, 'validation.ageRange').optional(),
    ageMax: whole(MIN_AGE, MAX_AGE, 'validation.ageRange').optional(),
    countryCode: z.string().regex(/^[A-Z]{2}$/, 'validation.country').optional(),
    religion: z.enum(RELIGIONS, { error: 'validation.chooseOption' }).optional(),
    maritalStatus: z.enum(MARITAL_STATUSES, { error: 'validation.chooseOption' }).optional(),
    heightMin: decimal(MIN_HEIGHT_CM, MAX_HEIGHT_CM, 'validation.heightRange').optional(),
    heightMax: decimal(MIN_HEIGHT_CM, MAX_HEIGHT_CM, 'validation.heightRange').optional(),
    caste: z.string().trim().min(1).max(80).optional(),
    // Decision B4 (9 Nov 2026): search, sort, location modes and the demo's culture filters, all read-only.
    q: z.string().trim().min(1).max(60).optional(),
    sort: z.enum(DISCOVER_SORTS, { error: 'validation.chooseOption' }).optional(),
    location: z.enum(DISCOVER_LOCATIONS, { error: 'validation.chooseOption' }).optional(),
    regions: list(z.string().min(1).max(80), 25).optional(),
    countries: list(z.string().regex(/^[A-Z]{2}$/, 'validation.country'), 50).optional(),
    diet: z.enum(DIETS, { error: 'validation.chooseOption' }).optional(),
    smoking: z.enum(HABIT_FREQUENCIES, { error: 'validation.chooseOption' }).optional(),
    drinking: z.enum(HABIT_FREQUENCIES, { error: 'validation.chooseOption' }).optional(),
    childrenPlan: z.enum(CHILDREN_PLANS, { error: 'validation.chooseOption' }).optional(),
    familyInvolvement: z.enum(FAMILY_INVOLVEMENT, { error: 'validation.chooseOption' }).optional(),
    communityOpenness: z.enum(COMMUNITY_OPENNESS, { error: 'validation.chooseOption' }).optional(),
    motherTongue: z.string().trim().min(1).max(80).optional(),
    cursor: z.string().max(400).optional(),
  })
  .refine((q) => q.ageMin === undefined || q.ageMax === undefined || q.ageMin <= q.ageMax, {
    path: ['ageMax'],
    error: 'validation.ageOrder',
  })
  .refine((q) => q.heightMin === undefined || q.heightMax === undefined || q.heightMin <= q.heightMax, {
    path: ['heightMax'],
    error: 'validation.heightOrder',
  });
export type DiscoverQuery = z.infer<typeof discoverQuerySchema>;

/** The profile a member acts as (a manager may run several), e.g. `?as=` on a profile view. */
export const actingProfileSchema = uuid('validation.actingProfile');

export const sendInterestSchema = z
  .object({
    receiverProfileId: uuid('validation.chooseProfile'),
    /** §4: the sender confirms that, if both accept, contact details are shared. */
    confirmSharing: z.literal(true, { error: 'validation.confirmSharing' }),
    /** Retrying with the same key never sends or charges twice. */
    idempotencyKey: z.string().min(8).max(100).optional(),
  })
  .strict();

export const blockSchema = z.object({ profileId: uuid('validation.chooseProfile') }).strict();

export const shortlistSchema = z.object({ profileId: uuid('validation.chooseProfile') }).strict();

export const reportSchema = z
  .object({
    reporterProfileId: uuid('validation.reportingProfile'),
    profileId: uuid('validation.chooseProfile'),
    photoId: uuid('validation.choosePhoto').optional(),
    category: z.enum(REPORT_CATEGORIES, { error: 'validation.reportReason' }),
    detail: z.string().trim().max(1000).optional(),
  })
  .strict();

export const reportDecisionSchema = z
  .object({
    decision: z.enum(['upheld', 'dismissed'], { error: 'validation.staff.reportDecision' }),
    note: z.string().trim().max(1000).optional(),
  })
  .strict();

export const coverVisibilitySchema = z.object({ coverPublic: z.boolean() }).strict();

/** §7: marking "engaged or married" ends the plan; the member confirms the warning first. */
export const engagedSchema = z
  .object({ confirmForfeit: z.literal(true, { error: 'validation.confirmForfeit' }) })
  .strict();
