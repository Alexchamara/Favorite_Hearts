/**
 * Shared HTTP plumbing: the app's dependencies and request context, typed errors, validation,
 * and `withActor` — the only way route code reads or writes member/staff data.
 */
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { z } from 'zod';
import { issueText, type StaffRole, type TextRef } from '@fh/shared';
import type { AccessVerifier } from './admin/access.ts';
import type { AdminAuth } from './admin/auth.ts';
import type { Auth, AuthSession } from './auth.ts';
import type { Config } from './config.ts';
import { runAsActor, type Actor, type ActorTx } from './db/actor.ts';
import type { Db } from './db/types.ts';
import type { Messenger } from './messaging/messenger.ts';
import type { Turnstile } from './middleware/turnstile.ts';
import type { Storage } from './storage/storage.ts';
import { toRef, type Say } from './text.ts';

/**
 * `turnstile` is null until a Turnstile secret key is configured (then code and password endpoints need a token).
 * `adminAuth` is the admin site's own sign-in (admin/auth.ts), null when there is no admin site (config.adminOrigin).
 * `accessVerifier` checks Cloudflare Access's token on admin requests (admin/access.ts), null in development.
 */
export type Deps = {
  config: Config;
  db: Db;
  auth: Auth;
  storage: Storage;
  messenger: Messenger;
  turnstile: Turnstile | null;
  adminAuth?: AdminAuth | null;
  accessVerifier?: AccessVerifier | null;
};

export type AppEnv = {
  Variables: {
    deps: Deps;
    user: AuthSession['user'] | null;
    session: AuthSession['session'] | null;
    /** Active staff role on record (two-step login is checked separately). */
    staffRole: StaffRole | null;
    /** Who row-level security sees: null = anonymous. */
    actor: Actor | null;
    /** This request's id (X-Request-Id), kept in the audit trail as its correlation id. */
    requestId: string;
    /** Admin requests: the email Cloudflare Access signed in, when Access is configured. */
    accessEmail?: string | null;
  };
};

export type Tx = ActorTx<Db>;

/**
 * An error with a stable code the member app can act on, and a message people can read. The message is a catalogue key
 * (text.ts): the error handler renders it in the language of the request.
 */
export class HttpError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    public code: string,
    public text: TextRef,
    public fields?: Record<string, TextRef>,
  ) {
    super(text.key);
  }
}

export function fail(status: ContentfulStatusCode, code: string, message: Say, fields?: Record<string, Say>): never {
  const refs = fields && Object.fromEntries(Object.entries(fields).map(([field, say]) => [field, toRef(say)]));
  throw new HttpError(status, code, toRef(message), refs);
}

/** Validates with a shared Zod schema; field messages go back as `fields`. */
export function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const fields = Object.fromEntries(
      result.error.issues.map((issue) => [issue.path.join('.') || '_', issueText(issue as Parameters<typeof issueText>[0])]),
    );
    throw new HttpError(400, 'VALIDATION', { key: 'api.validation' }, fields);
  }
  return result.data;
}

export async function readJson(c: Context<AppEnv>): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    fail(400, 'BAD_JSON', 'api.badJson');
  }
}

/** Runs `fn` in one transaction as the request's actor (role fh_app; row-level security applies). */
export function withActor<T>(c: Context<AppEnv>, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return runAsActor(c.var.deps.db, c.var.actor, fn);
}

/** A Postgres error from either driver, unwrapped from Drizzle's wrapper. */
export type PgError = { code: string; constraint?: string; message: string; detail?: string };

export function pgError(err: unknown): PgError | null {
  let current = err as { code?: unknown; cause?: unknown } | null;
  for (let depth = 0; current && depth < 4; depth += 1) {
    if (typeof current.code === 'string' && /^[0-9A-Z]{5}$/.test(current.code)) return current as PgError;
    current = current.cause as typeof current;
  }
  return null;
}

/**
 * Timestamps read through raw SQL arrive as driver-specific values (a Date from node-postgres, Postgres text
 * from PGlite). Responses always carry ISO 8601, so every browser parses them the same way.
 */
export function isoDate(value: string | Date): string;
export function isoDate(value: string | Date | null): string | null;
export function isoDate(value: string | Date | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}
