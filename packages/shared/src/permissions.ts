/**
 * Admin panel permissions (docs/ADMIN-PANEL-PLAN.md, layer 8; owner decision A2, 12 Nov 2026).
 * Two roles only: the owner and one backup reviewer. Every admin route names one permission; the server refuses a
 * route that names none, and the database's own rules (app.is_staff, app.is_owner) still decide underneath.
 * The backup reviewer never gets anything to do with payments, plans or prices (OWNER-DECISIONS section 9).
 */
import type { StaffRole } from './login-channels.ts';

export const PERMISSIONS = {
  /** Identity documents: the queue, opening a document, approving or rejecting. */
  'documents.review': ['owner', 'backup_reviewer'],
  /** Reports: the queue, the reported content, upholding or dismissing. */
  'reports.review': ['owner', 'backup_reviewer'],
  /** Payments: the queue, receipts, decisions, notes, refunds. */
  'payments.manage': ['owner'],
  /** A profile's plan: viewing it, granting or revoking one. */
  'entitlements.manage': ['owner'],
  /** The plan catalogue and its prices. */
  'plans.manage': ['owner'],
  /** The bank, Wise and PayPal details members pay into. */
  'payment_details.manage': ['owner'],
  /** The service switches (pause sign-ups, pause documents, selfie). */
  'operations.manage': ['owner'],
  /** Your own sign-in: who you are, your sessions, passkeys and two-step login. */
  'self.manage': ['owner', 'backup_reviewer'],
} as const satisfies Record<string, readonly StaffRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(role: StaffRole | null | undefined, permission: Permission): boolean {
  return Boolean(role) && (PERMISSIONS[permission] as readonly StaffRole[]).includes(role!);
}

export function permissionsOf(role: StaffRole | null | undefined): Permission[] {
  return (Object.keys(PERMISSIONS) as Permission[]).filter((permission) => hasPermission(role, permission));
}

/** Admin sessions (layer 5): at most 8 hours, and 30 minutes without a request signs the person out. */
export const ADMIN_SESSION_HOURS = 8;
export const ADMIN_IDLE_MINUTES = 30;
/** Risky actions need a passkey or two-step code from the last 5 minutes (layer 6). */
export const ADMIN_STEP_UP_MINUTES = 5;
/** An invitation link to the admin site works once, for 24 hours (layer 4). */
export const STAFF_INVITE_HOURS = 24;
/** Staff passwords are longer than members'. */
export const STAFF_MIN_PASSWORD_LENGTH = 12;
/** Wrong two-step or backup codes in a row before the account locks, and for how long (layer 3). */
export const ADMIN_FACTOR_FAILURE_LIMIT = 5;
export const ADMIN_FACTOR_LOCK_MINUTES = 15;
/** The header every admin-site request carries; a form on another site cannot send it (layer 7). */
export const ADMIN_REQUEST_HEADER = 'x-fh-admin';
/** How a staff member proved who they are in this session. 'enrolment' only sets up two-step login. */
export const ADMIN_STRONG_FACTORS = ['passkey', 'totp', 'backup_code'] as const;
export type AdminFactor = (typeof ADMIN_STRONG_FACTORS)[number] | 'enrolment' | 'password';
