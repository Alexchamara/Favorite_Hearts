import { env } from './env';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
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
  const res = await fetch(`${env.apiUrl}/api/v1${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, body?.code ?? 'UNKNOWN', body?.message ?? 'Something went wrong. Please try again.');
  }
  return body as T;
}
