/**
 * Every admin route and what it needs (docs/ADMIN-PANEL-PLAN.md, layers 6 and 8): one permission, whether it needs a
 * passkey or code from the last 5 minutes (step-up), whether opening it is audited, and whether it alerts the owner.
 * A route that is not listed is refused (default deny), so a new route cannot go live without a decision here.
 * The route files' own guards (requireStaff) and the database's rules still apply underneath.
 */
import type { Permission } from '@fh/shared';
import type { SecurityAlertKind } from '../lib/security-alerts.ts';

export type RoutePolicy = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Path under /api/admin. */
  path: RegExp;
  permission: Permission;
  stepUp?: boolean;
  /** Audit action written when a GET succeeds (opening lists or details with personal data). */
  viewed?: { action: string; entityType: string };
  alert?: SecurityAlertKind;
};

const ID = '[^/]+';
const r = (pattern: string) => new RegExp(`^${pattern.replaceAll(':id', ID)}$`);

export const ADMIN_ROUTES: RoutePolicy[] = [
  // Who is signed in (also answers an enrolment session, middleware/admin-session.ts).
  { method: 'GET', path: r('/me'), permission: 'self.manage' },

  // Identity documents and reports: the owner and the backup reviewer (routes/staff.ts).
  { method: 'GET', path: r('/staff/verification'), permission: 'documents.review', viewed: { action: 'verification.queue_viewed', entityType: 'verification_case' } },
  { method: 'GET', path: r('/staff/verification/:id/document'), permission: 'documents.review' },
  { method: 'POST', path: r('/staff/verification/:id/decision'), permission: 'documents.review' },
  { method: 'GET', path: r('/staff/reports'), permission: 'reports.review', viewed: { action: 'report.queue_viewed', entityType: 'report' } },
  { method: 'POST', path: r('/staff/reports/:id/decision'), permission: 'reports.review' },
  { method: 'GET', path: r('/staff/reports/:id/content'), permission: 'reports.review' },

  // The owner alone (routes/owner.ts): plans and prices.
  { method: 'GET', path: r('/owner/plans'), permission: 'plans.manage' },
  { method: 'POST', path: r('/owner/plans'), permission: 'plans.manage', stepUp: true },
  { method: 'PATCH', path: r('/owner/plans/:id'), permission: 'plans.manage', stepUp: true },
  { method: 'DELETE', path: r('/owner/plans/:id'), permission: 'plans.manage', stepUp: true },
  { method: 'POST', path: r('/owner/plans/:id/prices'), permission: 'plans.manage', stepUp: true },

  // Payment details and service switches.
  { method: 'GET', path: r('/owner/payment-settings'), permission: 'payment_details.manage' },
  { method: 'PUT', path: r('/owner/payment-settings/:id'), permission: 'payment_details.manage', stepUp: true, alert: 'payment_details_changed' },
  { method: 'GET', path: r('/owner/operations'), permission: 'operations.manage' },
  { method: 'PUT', path: r('/owner/operations/:id'), permission: 'operations.manage', stepUp: true },

  // Payments.
  { method: 'GET', path: r('/owner/payments'), permission: 'payments.manage', viewed: { action: 'payment.queue_viewed', entityType: 'payment_submission' } },
  { method: 'GET', path: r('/owner/payments/:id'), permission: 'payments.manage', viewed: { action: 'payment.viewed', entityType: 'payment_submission' } },
  { method: 'GET', path: r('/owner/payments/:id/proofs/:id'), permission: 'payments.manage' },
  { method: 'POST', path: r('/owner/payments/:id/approve'), permission: 'payments.manage', stepUp: true },
  { method: 'POST', path: r('/owner/payments/:id/reject'), permission: 'payments.manage' },
  { method: 'POST', path: r('/owner/payments/:id/hold'), permission: 'payments.manage' },
  { method: 'POST', path: r('/owner/payments/:id/refund'), permission: 'payments.manage', stepUp: true },
  { method: 'PATCH', path: r('/owner/payments/:id'), permission: 'payments.manage' },
  { method: 'POST', path: r('/owner/payments/:id/settlement'), permission: 'payments.manage', stepUp: true },
  { method: 'DELETE', path: r('/owner/payments/:id'), permission: 'payments.manage', stepUp: true },

  // A profile's plan.
  { method: 'GET', path: r('/owner/profiles/:id/plan'), permission: 'entitlements.manage', viewed: { action: 'plan.viewed', entityType: 'profile' } },
  { method: 'POST', path: r('/owner/profiles/:id/plan/grant'), permission: 'entitlements.manage', stepUp: true },
  { method: 'POST', path: r('/owner/profiles/:id/plan/revoke'), permission: 'entitlements.manage', stepUp: true },
];

export function routePolicy(method: string, path: string): RoutePolicy | null {
  return ADMIN_ROUTES.find((route) => route.method === method && route.path.test(path)) ?? null;
}
