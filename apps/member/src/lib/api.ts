import type { ApiErrorBody } from '@fh/shared';
import { env } from './env';
import { currentLanguage, say } from './i18n';

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
 * Fetch wrapper for our own API (/api/v1/*). Always sends the session cookie, asks for messages in the language on
 * screen, and turns error responses into ApiError with the server's code + friendly message.
 * Use it through TanStack Query so the server stays the source of truth.
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData;
  const language = { 'Accept-Language': currentLanguage() };
  const res = await fetch(`${env.apiUrl}/api/v1${path}`, {
    ...init,
    credentials: 'include',
    headers: isForm ? { ...language, ...init.headers } : { 'Content-Type': 'application/json', ...language, ...init.headers },
  });
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => null)) as (ApiErrorBody & T) | null;
  if (!res.ok) {
    throw new ApiError(
      res.status,
      body?.code ?? 'UNKNOWN',
      body?.message ?? say('common.somethingWrong'),
      body?.fields ?? {},
    );
  }
  return body as T;
}

/** `headers`: extra request headers, e.g. the Turnstile token for a code request. */
export const post = <T>(path: string, body: unknown = {}, headers?: Record<string, string>) =>
  api<T>(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body), headers });
export const patch = <T>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
export const put = <T>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body: JSON.stringify(body) });
export const del = (path: string) => api<void>(path, { method: 'DELETE' });

/** Downloads a file from our API (e.g. the data export) and hands it to the browser to save. */
export async function download(path: string, fallbackName: string): Promise<void> {
  const res = await fetch(`${env.apiUrl}/api/v1${path}`, { credentials: 'include', headers: { 'Accept-Language': currentLanguage() } });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(res.status, body?.code ?? 'UNKNOWN', body?.message ?? say('common.somethingWrong'));
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** A readable message for any error thrown by api() or a Better-Auth client call. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return say('common.somethingWrong');
}
