/**
 * Deletion with the retention list, data export and the owner's service switches (OWNER-DECISIONS sections 8
 * and 10). The database enforces the rules again (drizzle/0011_safety_rules.sql).
 */
import { z } from 'zod';
import { OPERATIONS_FLAGS } from './domain.ts';

/** §8: what is kept after a deletion is kept this long, then the retention sweep removes it. */
export const RETENTION_MONTHS = 6;
/** Deleting an account or a profile needs a sign-in within this many minutes. */
export const RECENT_SIGN_IN_MINUTES = 15;

/** What deleting an account does to each profile it runs (owner decision, 30 Oct 2026: the candidate decides). */
export const DELETION_OUTCOMES = ['deleted', 'handed_over'] as const;

const confirmed = z.literal(true, { error: 'Confirm that you understand this cannot be undone.' });
export const deleteAccountSchema = z.object({ confirm: confirmed });
export const deleteProfileSchema = z.object({ confirm: confirmed });

export const operationsFlagSchema = z.object({
  enabled: z.boolean({ error: 'Choose on or off.' }),
  reason: z.string().trim().max(300, 'Keep the reason to 300 characters or fewer.').optional(),
});
export const operationsFlagKeySchema = z.enum(OPERATIONS_FLAGS, { error: 'Unknown switch.' });
