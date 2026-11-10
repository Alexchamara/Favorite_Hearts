/**
 * Server state through TanStack Query: one key per resource, invalidated after every change.
 * The API is the source of truth; screens never keep their own copy of it.
 */
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type {
  ShortlistView,
  AccountDeletionPreview,
  BillingOverview,
  BlockView,
  ConnectionView,
  HistoryItem,
  DiscoverPage,
  MemberProfileView,
  MeView,
  OperationsFlagView,
  OwnerPaymentDetail,
  OwnerPaymentItem,
  OwnerPlanView,
  OwnerProfilePlan,
  PaymentSettingView,
  PhotoView,
  PlanUsage,
  ProfileView,
  ReceivedInterests,
  SentInterestView,
  ServiceStatus,
  VerificationCaseView,
  VerificationDraftsView,
} from '@fh/shared';
import { api, ApiError } from './api';
import { env } from './env';
import { queryClient } from './query-client';

export const keys = {
  me: ['me'] as const,
  health: ['health'] as const,
  profiles: ['profiles'] as const,
  profile: (id: string) => ['profiles', id] as const,
  cases: ['verification'] as const,
  drafts: ['verification', 'drafts'] as const,
  staffQueue: (status: string) => ['staff', 'verification', status] as const,
  staffReports: (status: string) => ['staff', 'reports', status] as const,
  discover: (filters: string) => ['discover', filters] as const,
  member: (id: string, as: string | null) => ['member', id, as] as const,
  received: (profileId: string) => ['requests', profileId, 'received'] as const,
  sent: (profileId: string) => ['requests', profileId, 'sent'] as const,
  connections: (profileId: string) => ['connections', profileId] as const,
  blocks: (profileId: string) => ['blocks', profileId] as const,
  history: (profileId: string) => ['history', profileId] as const,
  shortlist: (profileId: string) => ['shortlist', profileId] as const,
  plan: (profileId: string) => ['plan', profileId] as const,
  photos: (profileId: string) => ['photos', profileId] as const,
  billing: (profileId: string) => ['billing', profileId] as const,
  ownerPlans: ['owner', 'plans'] as const,
  ownerSettings: ['owner', 'settings'] as const,
  ownerPayments: (status: string, query: string) => ['owner', 'payments', status, query] as const,
  ownerPayment: (id: string) => ['owner', 'payment', id] as const,
  ownerProfilePlan: (profileId: string) => ['owner', 'profile-plan', profileId] as const,
  ownerOperations: ['owner', 'operations'] as const,
  serviceStatus: ['service-status'] as const,
  accountDeletion: ['account', 'deletion'] as const,
};

/** After a request, connection or block changes: everything that shows relations is refreshed. */
export function refreshRelations() {
  return Promise.all(
    ['requests', 'connections', 'blocks', 'history', 'member', 'discover', 'plan', 'shortlist'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
  );
}

export type Health = { ok: boolean; database: boolean; email: boolean; sms: boolean; storage: boolean };

/**
 * The API could not be reached: no answer at all, a gateway error (502/503/504), or a server error without the API's
 * own error body (a proxy in front of it answering for it: Vite's dev proxy says 500, Astro's 502, when the API is down).
 */
export const unreachable = (error: unknown) =>
  !(error instanceof ApiError) || [502, 503, 504].includes(error.status) || (error.status >= 500 && error.code === 'UNKNOWN');

/**
 * The signed-in account, or null when signed out. Every screen waits for it, so an answer from the server, even an
 * error, is final: only a request that never arrived (a network blip, or a 502/503/504 from the proxy) is tried
 * once more. The sign-in page then shows at once, with a notice; while the API stays unreachable it is asked again
 * every few seconds, so the screen recovers by itself (signed-in members are back where they were) once it answers.
 */
export function useMe() {
  return useQuery({
    queryKey: keys.me,
    retry: (count, error) => count < 1 && unreachable(error),
    retryDelay: 300,
    refetchInterval: (query) => (query.state.status === 'error' && unreachable(query.state.error) ? 5_000 : false),
    queryFn: async () => {
      try {
        return await api<MeView>('/me');
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
  });
}

export function useHealth() {
  return useQuery({
    queryKey: keys.health,
    queryFn: async (): Promise<Health> => (await fetch(`${env.apiUrl}/health`)).json(),
    staleTime: 60_000,
  });
}

export function useProfiles(enabled = true) {
  return useQuery({
    queryKey: keys.profiles,
    queryFn: async () => (await api<{ profiles: ProfileView[] }>('/profiles')).profiles,
    enabled,
  });
}

export function useProfile(id: string) {
  return useQuery({ queryKey: keys.profile(id), queryFn: () => api<ProfileView>(`/profiles/${id}`) });
}

/** Document photos added but not sent yet; checked every 3 seconds while a phone link (QR code) is open. */
export function useDrafts(enabled = true) {
  return useQuery({
    queryKey: keys.drafts,
    queryFn: () => api<VerificationDraftsView>('/verification/drafts'),
    enabled,
    refetchInterval: (query) => (query.state.data?.phoneLink ? 3000 : false),
  });
}

export function useMyCases(enabled = true) {
  return useQuery({
    queryKey: keys.cases,
    queryFn: async () => (await api<{ cases: VerificationCaseView[] }>('/verification')).cases,
    enabled,
  });
}

/** After a change that returned the fresh profile: update its cache and refresh the list. */
export function storeProfile(profile: ProfileView) {
  queryClient.setQueryData(keys.profile(profile.id), profile);
  return queryClient.invalidateQueries({ queryKey: keys.profiles, exact: true });
}

/**
 * After signing in or out: drop everything cached for the previous person and refetch what is on
 * screen (clear() would leave mounted screens showing stale data with nothing to refetch).
 */
export function resetSession() {
  return queryClient.resetQueries();
}

// --- Discovery, requests and connections (Stage 3) --------------------------------------------------------

/** Discovery pages for a filter query string (e.g. "gender=woman&ageMax=30"), 20 at a time. */
export function useDiscover(filters: string) {
  return useInfiniteQuery({
    queryKey: keys.discover(filters),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams(filters);
      if (pageParam) params.set('cursor', pageParam);
      return api<DiscoverPage>(`/discover?${params}`);
    },
    getNextPageParam: (last) => last.nextCursor,
    retry: false,
  });
}

/** Another member's profile, seen from the acting profile `as` (where the two stand). */
export function useMember(id: string, as: string | null, enabled = true) {
  return useQuery({
    queryKey: keys.member(id, as),
    queryFn: () => api<MemberProfileView>(`/discover/${id}${as ? `?as=${as}` : ''}`),
    retry: false,
    enabled,
  });
}

export function useReceived(profileId: string) {
  return useQuery({
    queryKey: keys.received(profileId),
    queryFn: () => api<ReceivedInterests>(`/profiles/${profileId}/interests?box=received`),
    // A page may ask before it knows which profile it acts for.
    enabled: Boolean(profileId),
  });
}

export function useSent(profileId: string) {
  return useQuery({
    queryKey: keys.sent(profileId),
    queryFn: async () => (await api<{ interests: SentInterestView[] }>(`/profiles/${profileId}/interests?box=sent`)).interests,
  });
}

export function useConnections(profileId: string) {
  return useQuery({
    queryKey: keys.connections(profileId),
    queryFn: async () => (await api<{ connections: ConnectionView[] }>(`/profiles/${profileId}/connections`)).connections,
  });
}

/** Closed introductions for the History tab (decision B5). */
export function useHistory(profileId: string) {
  return useQuery({
    queryKey: keys.history(profileId),
    queryFn: async () => (await api<{ items: HistoryItem[] }>(`/profiles/${profileId}/history`)).items,
  });
}

export function useBlocks(profileId: string) {
  return useQuery({
    queryKey: keys.blocks(profileId),
    queryFn: async () => (await api<{ blocks: BlockView[] }>(`/profiles/${profileId}/blocks`)).blocks,
  });
}

/** The profile's shortlist (N03): saved profiles, newest first, and its limit (none while it has a plan). */
export function useShortlist(profileId: string | null) {
  return useQuery({
    queryKey: keys.shortlist(profileId ?? ''),
    queryFn: () => api<ShortlistView>(`/profiles/${profileId}/shortlist`),
    enabled: Boolean(profileId),
  });
}

export function usePlan(profileId: string) {
  return useQuery({ queryKey: keys.plan(profileId), queryFn: () => api<PlanUsage>(`/profiles/${profileId}/plan`) });
}

export function usePhotos(profileId: string) {
  return useQuery({
    queryKey: keys.photos(profileId),
    queryFn: async () => (await api<{ photos: PhotoView[] }>(`/profiles/${profileId}/photos`)).photos,
  });
}

// --- Plans and payments (Stage 4) --------------------------------------------------------------------------

/** After a payment or plan change: the plan, its usage and everything that depends on having a plan. */
export function refreshBilling() {
  return Promise.all(['billing', 'plan', 'requests', 'member'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
}

export function useBilling(profileId: string) {
  return useQuery({ queryKey: keys.billing(profileId), queryFn: () => api<BillingOverview>(`/profiles/${profileId}/billing`) });
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

/** `status`: a payment status, `waiting` (in review or held) or `all`; `query`: a reference or statement line. */
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

// --- Service switches, deletion and export (Stage 5a) ------------------------------------------------------

/** Whether the owner has paused new sign-ups or document submissions (section 10). */
export function useServiceStatus() {
  // Only a notice on the sign-in page: never retried at once, so it cannot hold anything up; asked again every few
  // seconds while the API is unreachable, so the notice goes away by itself.
  return useQuery({
    queryKey: keys.serviceStatus,
    queryFn: () => api<ServiceStatus>('/service-status'),
    staleTime: 60_000,
    retry: false,
    refetchInterval: (query) => (query.state.status === 'error' && unreachable(query.state.error) ? 5_000 : false),
  });
}

export function useOwnerOperations() {
  return useQuery({ queryKey: keys.ownerOperations, queryFn: async () => (await api<{ flags: OperationsFlagView[] }>('/owner/operations')).flags });
}

/** What deleting the account would do; fetched fresh each time the dialog opens. */
export function useAccountDeletion(enabled: boolean) {
  return useQuery({ queryKey: keys.accountDeletion, queryFn: () => api<AccountDeletionPreview>('/account/deletion'), enabled, staleTime: 0 });
}
