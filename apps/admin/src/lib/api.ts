/**
 * The admin site's API client. Every call goes to this site's own /api/admin (its proxy forwards to the API), with the
 * X-FH-Admin header the server requires (docs/ADMIN-PANEL-PLAN.md, layer 7) and JSON only.
 *
 * A risky action answered with STEP_UP_REQUIRED opens the "confirm it is you" dialog (lib/step-up.tsx); once the
 * person confirms with their passkey or a code, the same request is sent once more.
 */
import { ADMIN_REQUEST_HEADER } from '@fh/shared';

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

type StepUp = () => Promise<boolean>;
let stepUp: StepUp | null = null;
/** Set by the StepUpProvider: asks the person to confirm, true once they have. */
export function onStepUpRequired(handler: StepUp | null) {
  stepUp = handler;
}

export const adminHeaders = { [ADMIN_REQUEST_HEADER]: '1' } as const;

async function send(path: string, init: RequestInit): Promise<Response> {
  return fetch(`/api/admin${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: { ...adminHeaders, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res = await send(path, init);
  if (res.status === 403 && stepUp) {
    const body = (await res.clone().json().catch(() => null)) as { code?: string } | null;
    if (body?.code === 'STEP_UP_REQUIRED' && (await stepUp())) res = await send(path, init);
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => null)) as ({ code?: string; message?: string; fields?: Record<string, string> } & T) | null;
  if (!res.ok) throw new ApiError(res.status, body?.code ?? 'UNKNOWN', body?.message ?? 'Something went wrong. Try again.', body?.fields ?? {});
  return body as T;
}

export const post = <T>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body: JSON.stringify(body) });
export const patch = <T>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
export const put = <T>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body: JSON.stringify(body) });
export const del = (path: string) => api<void>(path, { method: 'DELETE' });

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return 'Something went wrong. Try again.';
}
