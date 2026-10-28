/**
 * Staff roles (D10): the owner plus one backup reviewer. Kept outside Better-Auth so
 * a role is granted deliberately (by the owner) and every change is auditable.
 * Domain tables (profiles, interests, payments, ...) are added from Stage 1 onwards.
 */
import { pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { STAFF_ROLES } from '@fh/shared';
import { user } from './auth.ts';

export const staffRole = pgEnum('staff_role', STAFF_ROLES);

export const staffMember = pgTable('staff_member', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  role: staffRole('role').notNull(),
  grantedBy: text('granted_by').references(() => user.id),
  grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});
