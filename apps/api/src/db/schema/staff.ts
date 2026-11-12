/**
 * Staff roles (D10): the owner plus one backup reviewer. Kept outside Better-Auth so
 * a role is granted deliberately (by the owner) and every change is auditable.
 * Domain tables (profiles, interests, payments, ...) are added from Stage 1 onwards.
 */
import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
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

/**
 * An invitation to the admin site (docs/ADMIN-PANEL-PLAN.md, layer 4): single use, 24 hours. Only a hash of the
 * link's token is stored. The person sets their own password and two-step login from the link; nobody else ever
 * knows the password.
 */
export const staffInvite = pgTable(
  'staff_invite',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    role: staffRole('role').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    invitedByUserId: text('invited_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('staff_invite_email_idx').on(t.email)],
);

/**
 * Devices a staff member has signed in from (a keyed hash of the browser and the network), so a sign-in from a new one
 * sends the owner an alert. No raw address or browser string is kept here.
 */
export const staffDevice = pgTable(
  'staff_device',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    deviceHash: text('device_hash').notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('staff_device_user_device_idx').on(t.userId, t.deviceHash)],
);
