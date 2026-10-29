/**
 * Discovery, requests, connections, blocks, reports and photos (OWNER-DECISIONS sections 1–4, 7).
 * The database enforces every rule again; these schemas give members readable answers first.
 */
import { z } from 'zod';
import { GENDERS, MARITAL_STATUSES, RELIGIONS, REPORT_CATEGORIES } from './domain.ts';
import { MAX_AGE, MIN_AGE } from './profile.ts';

/** §4: after a decline or a withdrawal, a new request between the same two profiles waits this long. */
export const REQUEST_COOLDOWN_DAYS = 7;
/** Version of the "what will be shared" confirmation a sender accepts (spec 12.2). */
export const SHARING_POLICY_VERSION = 'sharing-v1';
export const DISCOVER_PAGE_SIZE = 20;

const uuid = (message: string) => z.uuid({ error: message });
const whole = (min: number, max: number, message: string) => z.coerce.number({ error: message }).int(message).min(min, message).max(max, message);

/** Discovery filters, read from the query string. All optional. */
export const discoverQuerySchema = z
  .object({
    gender: z.enum(GENDERS, { error: 'Choose one of the options.' }).optional(),
    ageMin: whole(MIN_AGE, MAX_AGE, `Enter an age between ${MIN_AGE} and ${MAX_AGE}.`).optional(),
    ageMax: whole(MIN_AGE, MAX_AGE, `Enter an age between ${MIN_AGE} and ${MAX_AGE}.`).optional(),
    countryCode: z.string().regex(/^[A-Z]{2}$/, 'Choose a country.').optional(),
    religion: z.enum(RELIGIONS, { error: 'Choose one of the options.' }).optional(),
    maritalStatus: z.enum(MARITAL_STATUSES, { error: 'Choose one of the options.' }).optional(),
    heightMin: whole(100, 230, 'Enter a height between 100 and 230 cm.').optional(),
    heightMax: whole(100, 230, 'Enter a height between 100 and 230 cm.').optional(),
    caste: z.string().trim().min(1).max(80, 'Keep it to 80 characters or fewer.').optional(),
    cursor: z.string().max(200).optional(),
  })
  .refine((q) => q.ageMin === undefined || q.ageMax === undefined || q.ageMin <= q.ageMax, {
    path: ['ageMax'],
    error: 'The highest age must be at least the lowest.',
  })
  .refine((q) => q.heightMin === undefined || q.heightMax === undefined || q.heightMin <= q.heightMax, {
    path: ['heightMax'],
    error: 'The greatest height must be at least the smallest.',
  });
export type DiscoverQuery = z.infer<typeof discoverQuerySchema>;

/** The profile a member acts as (a manager may run several), e.g. `?as=` on a profile view. */
export const actingProfileSchema = uuid('Choose which profile you are acting for.');

export const sendInterestSchema = z
  .object({
    receiverProfileId: uuid('Choose a profile.'),
    /** §4: the sender confirms that, if both accept, contact details are shared. */
    confirmSharing: z.literal(true, { error: 'Confirm what is shared once both of you accept.' }),
    /** Retrying with the same key never sends or charges twice. */
    idempotencyKey: z.string().min(8).max(100).optional(),
  })
  .strict();

export const blockSchema = z.object({ profileId: uuid('Choose a profile.') }).strict();

export const reportSchema = z
  .object({
    reporterProfileId: uuid('Choose which profile you are reporting from.'),
    profileId: uuid('Choose a profile.'),
    photoId: uuid('Choose a photo.').optional(),
    category: z.enum(REPORT_CATEGORIES, { error: 'Choose a reason.' }),
    detail: z.string().trim().max(1000, 'Keep it to 1000 characters or fewer.').optional(),
  })
  .strict();

export const reportDecisionSchema = z
  .object({
    decision: z.enum(['upheld', 'dismissed'], { error: 'Choose a decision.' }),
    note: z.string().trim().max(1000, 'Keep it to 1000 characters or fewer.').optional(),
  })
  .strict();

export const coverVisibilitySchema = z.object({ coverPublic: z.boolean() }).strict();

/** §7: marking "engaged or married" ends the plan; the member confirms the warning first. */
export const engagedSchema = z
  .object({ confirmForfeit: z.literal(true, { error: 'Confirm that the remaining plan time is forfeited.' }) })
  .strict();
