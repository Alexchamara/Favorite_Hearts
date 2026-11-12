/** The admin site's server state, through TanStack Query: who is signed in, and the staff and owner lists. */
import { useQuery } from '@tanstack/react-query';
import type {
  OperationsFlagView,
  OwnerPaymentDetail,
  OwnerPaymentItem,
  OwnerPlanView,
  OwnerProfilePlan,
  Permission,
  PaymentSettingView,
  StaffRole,
} from '@fh/shared';
import { api, ApiError } from './api';
import { queryClient } from './query-client';

/** GET /api/admin/me (apps/api/src/middleware/admin-session.ts). */
export type AdminMe = {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  enrolment: boolean;
  twoFactorEnabled: boolean;
  factor: string | null;
  stepUpFresh: boolean;
  sessionExpiresAt: string;
  idleMinutes: number;
  permissions: Permission[];
};

export const keys = {
  me: ['admin', 'me'] as const,
  staffQueue: (status: string) => ['staff', 'verification', status] as const,
  staffReports: (status: string) => ['staff', 'reports', status] as const,
  ownerPlans: ['owner', 'plans'] as const,
  ownerSettings: ['owner', 'settings'] as const,
  ownerPayments: (status: string, query: string) => ['owner', 'payments', status, query] as const,
  ownerPayment: (id: string) => ['owner', 'payment', id] as const,
  ownerProfilePlan: (profileId: string) => ['owner', 'profile-plan', profileId] as const,
  ownerOperations: ['owner', 'operations'] as const,
  passkeys: ['admin', 'passkeys'] as const,
  sessions: ['admin', 'sessions'] as const,
};

/** Null when signed out (or signed out by the 30-minute idle limit). */
export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return await api<AdminMe>('/me');
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    // Re-checked now and then, so an idle or expired session shows the sign-in again without a click.
    refetchInterval: 60_000,
  });
}

/** After signing in or out: forget everything the previous session loaded. */
export async function resetSession() {
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'admin' || query.queryKey[1] !== 'me' });
  await queryClient.refetchQueries({ queryKey: keys.me });
}

export function useOwnerPlans() {
  return useQuery({ queryKey: keys.ownerPlans, queryFn: async () => (await api<{ plans: OwnerPlanView[] }>('/owner/plans')).plans });
}

export function useOwnerSettings() {
  return useQuery({
    queryKey: keys.ownerSettings,
    queryFn: async () => (await api<{ settings: PaymentSettingView[] }>('/owner/payment-settings')).settings,
  });
}

export function useOwnerPayments(status: string, query: string) {
  return useQuery({
    queryKey: keys.ownerPayments(status, query),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status !== 'all') params.set('status', status);
      if (query) params.set('q', query);
      return (await api<{ payments: OwnerPaymentItem[] }>(`/owner/payments?${params}`)).payments;
    },
  });
}

export function useOwnerPayment(id: string) {
  return useQuery({ queryKey: keys.ownerPayment(id), queryFn: () => api<OwnerPaymentDetail>(`/owner/payments/${id}`) });
}

export function useOwnerProfilePlan(profileId: string) {
  return useQuery({ queryKey: keys.ownerProfilePlan(profileId), queryFn: () => api<OwnerProfilePlan>(`/owner/profiles/${profileId}/plan`) });
}

export function useOwnerOperations() {
  return useQuery({ queryKey: keys.ownerOperations, queryFn: async () => (await api<{ flags: OperationsFlagView[] }>('/owner/operations')).flags });
}
