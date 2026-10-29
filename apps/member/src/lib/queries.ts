/**
 * Server state through TanStack Query: one key per resource, invalidated after every change.
 * The API is the source of truth; screens never keep their own copy of it.
 */
import { useQuery } from '@tanstack/react-query';
import type { MeView, ProfileView, VerificationCaseView } from '@fh/shared';
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
};

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
