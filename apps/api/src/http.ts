/**
 * Shared HTTP plumbing: the app's dependencies and request context, typed errors, validation,
 * and `withActor` — the only way route code reads or writes member/staff data.
 */
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { z } from 'zod';
import type { StaffRole } from '@fh/shared';
import type { Auth, AuthSession } from './auth.ts';
import type { Config } from './config.ts';
import { runAsActor, type Actor, type ActorTx } from './db/actor.ts';
import type { Db } from './db/types.ts';
import type { Messenger } from './messaging/messenger.ts';
import type { Storage } from './storage/storage.ts';

export type Deps = { config: Config; db: Db; auth: Auth; storage: Storage; messenger: Messenger };

export type AppEnv = {
  Variables: {
    deps: Deps;
    user: AuthSession['user'] | null;
    session: AuthSession['session'] | null;
    /** Active staff role on record (two-step login is checked separately). */
    staffRole: StaffRole | null;
    /** Who row-level security sees: null = anonymous. */
    actor: Actor | null;
  };
};

export type Tx = ActorTx<Db>;

/** An error with a stable code the member app can act on, and a message people can read. */
export class HttpError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export function fail(status: ContentfulStatusCode, code: string, message: string, fields?: Record<string, string>): never {
  throw new HttpError(status, code, message, fields);
}

/** Validates with a shared Zod schema; field messages go back as `fields`. */
export function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const fields = Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.') || '_', issue.message]));
    fail(400, 'VALIDATION', 'Please check the highlighted fields.', fields);
  }
  return result.data;
}

export async function readJson(c: Context<AppEnv>): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    fail(400, 'BAD_JSON', 'The request body must be JSON.');
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
