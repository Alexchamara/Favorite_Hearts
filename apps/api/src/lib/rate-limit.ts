/**
 * Rate limits (OWNER-DECISIONS Part 2: "rate limits on sign-in, codes, requests, invitations, reports and uploads").
 * Counters live in Postgres (`rate_limit_counter`), so a limit holds across restarts and API instances. Better-Auth's
 * limits on sign-in and codes (auth.ts) count in the same table through `authRateLimitStorage`. Plan caps on requests
 * (sections 2, 3) are separate and still apply; these limits only stop bursts and abuse.
 */
import { getConnInfo } from '@hono/node-server/conninfo';
import { sql } from 'drizzle-orm';
import type { Context, MiddlewareHandler } from 'hono';
import type { Db } from '../db/types.ts';
import type { AppEnv } from '../http.ts';
import { requestLanguage, text } from '../text.ts';
import { rows } from './profile-view.ts';

export type RateRule = { window: number; max: number };
export type Consumed = { allowed: boolean; retryAfter: number | null };

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Counts one request against `key` and says whether it is within `rule`. A window starts with the first request and
 * restarts once it has passed; one statement checks and counts, so simultaneous requests cannot slip past together.
 */
export async function consume(db: Db, key: string, rule: RateRule): Promise<Consumed> {
  const [row] = rows<{ hits: number; remaining: number | string }>(
    await db.execute(sql`
      insert into rate_limit_counter as c (key, window_started_at, hits) values (${key}, now(), 1)
      on conflict (key) do update set
        hits = case when c.window_started_at <= now() - make_interval(secs => ${rule.window}::integer) then 1 else c.hits + 1 end,
        window_started_at = case when c.window_started_at <= now() - make_interval(secs => ${rule.window}::integer)
                                 then now() else c.window_started_at end
      returning c.hits, extract(epoch from c.window_started_at + make_interval(secs => ${rule.window}::integer) - now()) as remaining`),
  );
  if (Number(row!.hits) <= rule.max) return { allowed: true, retryAfter: null };
  return { allowed: false, retryAfter: Math.max(1, Math.ceil(Number(row!.remaining))) };
}

/** Better-Auth's custom storage: its own keys, the same counters. */
export const authRateLimitStorage = (db: Db) => ({
  consume: (key: string, rule: RateRule) => consume(db, `auth:${key}`, rule),
});

/** Counters older than the longest window are no longer needed (run by the retention sweep). */
export async function deleteOldCounters(db: Db): Promise<number> {
  const result = (await db.execute(sql`delete from rate_limit_counter where window_started_at < now() - interval '1 day'`)) as {
    rowCount?: number | null; // node-postgres
    affectedRows?: number; // PGlite
  };
  return result.rowCount ?? result.affectedRows ?? 0;
}

/**
 * The visitor's IP address. Behind a proxy only the header the host sets is trusted (CLIENT_IP_HEADER, for example
 * cf-connecting-ip or fly-client-ip): anything else in X-Forwarded-For can be typed by the visitor.
 */
export function clientIp(c: Context<AppEnv>): string {
  const header = c.var.deps.config.clientIpHeader;
  if (header) return c.req.header(header)?.split(',')[0]?.trim() || 'unknown';
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

type Limit = { name: string; method: string; path: RegExp; rule: RateRule; per: 'account' | 'ip' };

/**
 * Our own endpoints. Sign-in and code limits are Better-Auth's (auth.ts). Proposed numbers (BUILD-PROGRESS, 30 Oct
 * 2026): generous enough for a family filling in a profile, tight enough to stop a script.
 */
export const LIMITS: Limit[] = [
  { name: 'requests', method: 'POST', path: /^\/api\/v1\/profiles\/[^/]+\/interests$/, rule: { window: MINUTE, max: 10 }, per: 'account' },
  { name: 'answers', method: 'POST', path: /^\/api\/v1\/(interests\/[^/]+\/(accept|decline|withdraw)|connections\/[^/]+\/end)$/, rule: { window: MINUTE, max: 30 }, per: 'account' },
  { name: 'blocks', method: 'POST', path: /^\/api\/v1\/profiles\/[^/]+\/blocks$/, rule: { window: HOUR, max: 20 }, per: 'account' },
  { name: 'reports', method: 'POST', path: /^\/api\/v1\/reports$/, rule: { window: HOUR, max: 10 }, per: 'account' },
  { name: 'invitations', method: 'POST', path: /^\/api\/v1\/profiles\/[^/]+\/invitations$/, rule: { window: HOUR, max: 10 }, per: 'account' },
  { name: 'invitation-code', method: 'POST', path: /^\/api\/v1\/invitations\/(preview|code|accept|decline)$/, rule: { window: MINUTE, max: 10 }, per: 'ip' },
  { name: 'photo-uploads', method: 'POST', path: /^\/api\/v1\/profiles\/[^/]+\/photos$/, rule: { window: HOUR, max: 30 }, per: 'account' },
  { name: 'document-uploads', method: 'POST', path: /^\/api\/v1\/verification$/, rule: { window: HOUR, max: 5 }, per: 'account' },
  { name: 'receipt-uploads', method: 'POST', path: /^\/api\/v1\/payments\/[^/]+\/proof$/, rule: { window: HOUR, max: 10 }, per: 'account' },
  { name: 'payments', method: 'POST', path: /^\/api\/v1\/profiles\/[^/]+\/payments$/, rule: { window: HOUR, max: 10 }, per: 'account' },
  { name: 'profiles', method: 'POST', path: /^\/api\/v1\/profiles$/, rule: { window: DAY, max: 10 }, per: 'account' },
  { name: 'export', method: 'GET', path: /^\/api\/v1\/account\/export$/, rule: { window: DAY, max: 5 }, per: 'account' },
  { name: 'deletion', method: 'POST', path: /^\/api\/v1\/(account\/delete|profiles\/[^/]+\/(delete|hand-over))$/, rule: { window: HOUR, max: 10 }, per: 'account' },
];
/** Everything else under /api/v1, per signed-in account, or per IP address for visitors. */
const GENERAL: Record<'account' | 'ip', RateRule> = { account: { window: MINUTE, max: 300 }, ip: { window: MINUTE, max: 120 } };

/** Runs after loadSession. A refusal is 429 RATE_LIMITED with Retry-After, before any work is done. */
export const rateLimits: MiddlewareHandler<AppEnv> = async (c, next) => {
  const { config, db } = c.var.deps;
  if (!config.rateLimit) return next();
  const who = (per: 'account' | 'ip') => (per === 'account' && c.var.user ? `user:${c.var.user.id}` : `ip:${clientIp(c)}`);
  const checks = LIMITS.filter((limit) => limit.method === c.req.method && limit.path.test(c.req.path)).map(
    (limit) => [`rl:${limit.name}:${who(limit.per)}`, limit.rule] as const,
  );
  const general = c.var.user ? 'account' : 'ip';
  checks.push([`rl:all:${who(general)}`, GENERAL[general]]);
  for (const [key, rule] of checks) {
    const result = await consume(db, key, rule);
    if (!result.allowed) {
      const minutes = Math.ceil(result.retryAfter! / 60);
      c.header('Retry-After', String(result.retryAfter));
      return c.json(
        { code: 'RATE_LIMITED', message: text(requestLanguage(c), 'api.rateLimited', { count: minutes }) },
        429,
      );
    }
  }
  await next();
};
