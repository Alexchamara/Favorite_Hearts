/**
 * Server state through TanStack Query: one key per resource, invalidated after every change.
 * The API is the source of truth; screens never keep their own copy of it.
 */
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type {
  BlockView,
  ConnectionView,
  DiscoverPage,
  MemberProfileView,
  MeView,
  PhotoView,
  PlanUsage,
  ProfileView,
  ReceivedInterests,
  SentInterestView,
  VerificationCaseView,
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
  staffQueue: (status: string) => ['staff', 'verification', status] as const,
  staffReports: (status: string) => ['staff', 'reports', status] as const,
  discover: (filters: string) => ['discover', filters] as const,
  member: (id: string, as: string | null) => ['member', id, as] as const,
  received: (profileId: string) => ['requests', profileId, 'received'] as const,
  sent: (profileId: string) => ['requests', profileId, 'sent'] as const,
  connections: (profileId: string) => ['connections', profileId] as const,
  blocks: (profileId: string) => ['blocks', profileId] as const,
  plan: (profileId: string) => ['plan', profileId] as const,
  photos: (profileId: string) => ['photos', profileId] as const,
};

/** After a request, connection or block changes: everything that shows relations is refreshed. */
export function refreshRelations() {
  return Promise.all(
    ['requests', 'connections', 'blocks', 'member', 'discover', 'plan'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
  );
}

export type Health = { ok: boolean; database: boolean; email: boolean; sms: boolean; storage: boolean };

/** The signed-in account, or null when signed out. */
export function useMe() {
  return useQuery({
    queryKey: keys.me,
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
  return useQuery({ queryKey: keys.received(profileId), queryFn: () => api<ReceivedInterests>(`/profiles/${profileId}/interests?box=received`) });
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

export function useBlocks(profileId: string) {
  return useQuery({
    queryKey: keys.blocks(profileId),
    queryFn: async () => (await api<{ blocks: BlockView[] }>(`/profiles/${profileId}/blocks`)).blocks,
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
