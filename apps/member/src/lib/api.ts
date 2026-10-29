import type { ApiErrorBody } from '@fh/shared';
import { env } from './env';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

/**
 * Fetch wrapper for our own API (/api/v1/*). Always sends the session cookie and
 * turns error responses into ApiError with the server's code + friendly message.
 * Use it through TanStack Query so the server stays the source of truth.
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData;
  const res = await fetch(`${env.apiUrl}/api/v1${path}`, {
    ...init,
    credentials: 'include',
    headers: isForm ? init.headers : { 'Content-Type': 'application/json', ...init.headers },
  });
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => null)) as (ApiErrorBody & T) | null;
  if (!res.ok) {
    throw new ApiError(
      res.status,
      body?.code ?? 'UNKNOWN',
      body?.message ?? 'Something went wrong. Please try again.',
      body?.fields ?? {},
    );
  }
  return body as T;
}

export const post = <T>(path: string, body: unknown = {}) =>
  api<T>(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) });
export const patch = <T>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
export const del = (path: string) => api<void>(path, { method: 'DELETE' });

/** A readable message for any error thrown by api() or a Better-Auth client call. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}
