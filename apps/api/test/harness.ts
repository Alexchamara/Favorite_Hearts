/**
 * Builds the real API (createApp + Better-Auth) on PGlite, with in-memory file storage and an
 * outbox instead of email/SMS, plus a browser-like client that keeps cookies. No network, Neon,
 * R2, Resend or SMS provider is used.
 */
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { createApp } from '../src/app.ts';
import { createAuth } from '../src/auth.ts';
import type { Config } from '../src/config.ts';
import * as schema from '../src/db/schema/index.ts';
import type { Deps } from '../src/http.ts';
import type { EmailMessage, Messenger, SmsMessage } from '../src/messaging/messenger.ts';
import type { Storage } from '../src/storage/storage.ts';

export const ORIGIN = 'http://localhost:5173';
const API = 'http://localhost:8787';

export type Outbox = { emails: EmailMessage[]; sms: SmsMessage[] };
/** The API answers with JSON shaped per route; tests read it loosely. */
export type Res = { status: number; body: any };
type FetchApp = { request: (input: string, init?: RequestInit) => Response | Promise<Response> };

export async function createTestApp() {
  const db = drizzle({ client: new PGlite(), schema });
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });

  const outbox: Outbox = { emails: [], sms: [] };
  const messenger: Messenger = {
    smsEnabled: true,
    sendEmail: async (message) => void outbox.emails.push(message),
    sendSms: async (message) => void outbox.sms.push(message),
  };
  const files = new Map<string, Buffer>();
  const storage: Storage & { failDeletes: boolean } = {
    configured: true,
    failDeletes: false,
    async put(bucket, key, body) {
      files.set(`${bucket}/${key}`, body);
    },
    async delete(bucket, key) {
      if (this.failDeletes) throw new Error('storage unreachable');
      files.delete(`${bucket}/${key}`);
    },
    async signedGetUrl(bucket, key) {
      return `https://storage.test/${bucket}/${key}?signature=test`;
    },
  };
  const config: Config = {
    nodeEnv: 'test',
    apiUrl: API,
    memberAppUrl: 'http://localhost:4321/app',
    allowedOrigins: [ORIGIN],
    authSecret: 'test-only-secret-0123456789abcdefghijklmnop',
    rateLimit: false,
    signedUrlTtlSeconds: 120,
  };
  const auth = createAuth({ db, config, messenger });
  const deps: Deps = { config, db, auth, storage, messenger };
  const app = createApp(deps);
  return { app, db, deps, outbox, files, storage, client: () => new Client(app, outbox) };
}

/** The last 6-digit code sent to `to` by email or SMS. */
export function latestCode(outbox: Outbox, to: string): string {
  const message = [...outbox.emails.map((m) => ({ to: m.to, text: m.text })), ...outbox.sms.map((m) => ({ to: m.to, text: m.body }))]
    .filter((m) => m.to === to)
    .at(-1);
  const code = message?.text.match(/\b(\d{6})\b/)?.[1];
  assert.ok(code, `no code was sent to ${to}`);
  return code;
}

/** The invitation token from the last invitation emailed to `to` (it is in the link's fragment). */
export function latestInvitationToken(outbox: Outbox, to: string): string {
  const token = outbox.emails.filter((m) => m.to === to).at(-1)?.text.match(/invite#([A-Za-z0-9_-]{43})/)?.[1];
  assert.ok(token, `no invitation link was sent to ${to}`);
  return token;
}

/** RFC 6238 TOTP (SHA-1, 30 s, 6 digits), as an authenticator app computes it. */
export function totp(otpauthUri: string, at = Date.now()): string {
  const secret = new URL(otpauthUri).searchParams.get('secret') ?? '';
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of secret.replace(/=+$/, '').toUpperCase()) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const hmac = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

export class Client {
  private cookies = new Map<string, string>();

  constructor(
    private app: FetchApp,
    private outbox: Outbox,
  ) {}

  async request(method: string, path: string, body?: unknown): Promise<Res> {
    const headers = new Headers({ origin: ORIGIN, 'x-forwarded-for': '127.0.0.1' });
    if (body !== undefined && !(body instanceof FormData)) headers.set('content-type', 'application/json');
    if (this.cookies.size) headers.set('cookie', [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; '));
    const res = await this.app.request(`${API}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
    for (const cookie of res.headers.getSetCookie()) {
      const [pair = ''] = cookie.split(';');
      const index = pair.indexOf('=');
      const name = pair.slice(0, index);
      const value = pair.slice(index + 1);
      if (!value || /max-age=0/i.test(cookie)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // not JSON
    }
    return { status: res.status, body: parsed };
  }

  get = (path: string) => this.request('GET', path);
  post = (path: string, body: unknown = {}) => this.request('POST', path, body);
  patch = (path: string, body: unknown) => this.request('PATCH', path, body);
  delete = (path: string) => this.request('DELETE', path);

  /** Passwordless sign-in (creates the account on first use), optionally setting the display name. */
  async signIn(email: string, name?: string): Promise<this> {
    const sent = await this.post('/api/auth/email-otp/send-verification-otp', { email, type: 'sign-in' });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    const signedIn = await this.post('/api/auth/sign-in/email-otp', { email, otp: latestCode(this.outbox, email) });
    assert.equal(signedIn.status, 200, JSON.stringify(signedIn.body));
    if (name) assert.equal((await this.post('/api/auth/update-user', { name })).status, 200);
    return this;
  }

  /** Adds and verifies a phone number by SMS code, as Better-Auth does for signed-in members. */
  async verifyPhone(phoneNumber: string): Promise<Res> {
    assert.equal((await this.post('/api/auth/phone-number/send-otp', { phoneNumber })).status, 200);
    return this.post('/api/auth/phone-number/verify', {
      phoneNumber,
      code: latestCode(this.outbox, phoneNumber),
      updatePhoneNumber: true,
    });
  }
}
