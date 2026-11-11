/**
 * Member sign-up with a password (owner decision, 11 Nov 2026), as a Better-Auth plugin so the session is made and
 * its cookie set by Better-Auth itself:
 *
 *  POST /api/auth/member/sign-up         name, email or phoneNumber, password, consent → a code to that address
 *  POST /api/auth/member/sign-up/verify  email or phoneNumber, code → the account and a session
 *  POST /api/auth/member/sign-up/invitation  token, code, name, password, consent → the candidate's account at the
 *       invited address, accepted as the profile's candidate, and a session (the invitation's own code, sent to that
 *       address, proves it is theirs, so no second code is needed)
 *
 * Nothing is created until the code comes back, so nobody can hold an account on someone else's address. Until then
 * the sign-up waits in Better-Auth's verification table (name, password hash, a keyed hash of the code) for as long
 * as the code lasts. An email carries the code and a button that confirms in one step; a phone gets an SMS code.
 *
 * An address that already has an account gets the same answer on screen ("we sent a code") and a note to its owner
 * instead of a code, so the form never tells a stranger who is a member. The password is hashed either way, so the
 * answer takes as long.
 *
 * Log-in is Better-Auth's own: /sign-in/email and /sign-in/phone-number (auth.ts adds the lockout).
 */
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthEndpoint } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { eq, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  CODE_LENGTH,
  CODE_TTL_SECONDS,
  invitationCodeSchema,
  issueText,
  memberSignUpCodeSchema,
  memberSignUpSchema,
  passwordProblem,
  type OfferedLanguage,
  type TextRef,
} from '@fh/shared';
import type { Config } from '../config.ts';
import { runAsActor } from '../db/actor.ts';
import { user } from '../db/schema/auth.ts';
import { memberAccount } from '../db/schema/members.ts';
import { operationsFlag } from '../db/schema/operations.ts';
import type { Db } from '../db/types.ts';
import { PHONE_ONLY_EMAIL_DOMAIN, type Messenger } from '../messaging/messenger.ts';
import { codeSms, registeredEmail, registeredSms, signUpEmail } from '../messaging/templates.ts';
import { headersLanguage, render, text, type ApiTextKey } from '../text.ts';
import type { IdentityHasher } from './identity-hash.ts';
import { isBannedAddress } from './identity-hash.ts';
import { codeDigest, tokenDigest } from './invitation-tokens.ts';
import { rows } from './profile-view.ts';
import { clearCounter, consume } from './rate-limit.ts';

const PENDING = 'member-sign-up:';

/** The invited candidate's sign-up: the invitation link and its code, plus the account holder's name and password. */
const invitationSignUpSchema = invitationCodeSchema.extend({
  name: z.string().trim().min(1).max(80),
  password: z.string().min(1),
  consent: z.literal(true, { error: 'validation.signUpConsent' }),
});
/** What app.invitation_accept answers (drizzle/0005), in the words routes/invitations.ts uses. */
const INVITATION_PROBLEMS: Record<string, [status: 'BAD_REQUEST' | 'NOT_FOUND', code: string, key: ApiTextKey]> = {
  wrong_code: ['BAD_REQUEST', 'WRONG_CODE', 'api.invitation.wrongCode'],
  code_expired: ['BAD_REQUEST', 'CODE_EXPIRED', 'api.invitation.codeExpired'],
};
/** Wrong codes for one address while its code lasts; then a new code is needed. */
export const SIGN_UP_CODE_TRIES = 5;

type Pending = { name: string; passwordHash: string; codeHash: string };

/** The placeholder email of a phone-only account (never emailed: the .invalid domain cannot receive mail). */
export const phoneOnlyEmail = (phone: string) => `${phone.replace(/\D/g, '')}@${PHONE_ONLY_EMAIL_DOMAIN}`;

/** A field problem in the language of the request, in the shape our own API uses (`fields`). */
function invalid(language: OfferedLanguage, fields: Record<string, TextRef>): never {
  throw new APIError('BAD_REQUEST', {
    code: 'VALIDATION',
    message: text(language, 'api.validation'),
    fields: Object.fromEntries(Object.entries(fields).map(([field, ref]) => [field, render(language, ref)])),
  });
}

function check<S extends z.ZodType>(schema: S, value: unknown, language: OfferedLanguage): z.output<S> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  invalid(
    language,
    Object.fromEntries(
      result.error.issues.map((issue) => [issue.path.join('.') || '_', issueText(issue as Parameters<typeof issueText>[0])]),
    ),
  );
}

const refuse = (status: 'BAD_REQUEST' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'TOO_MANY_REQUESTS' | 'SERVICE_UNAVAILABLE', code: string, language: OfferedLanguage, key: ApiTextKey) => {
  throw new APIError(status, { code, message: text(language, key) });
};

export function memberAccess({ db, config, messenger, hash }: { db: Db; config: Config; messenger: Messenger; hash: IdentityHasher }) {
  const codeHash = (address: string, code: string) => createHmac('sha256', config.authSecret).update(`${address}:${code}`).digest('hex');

  async function existingUser(address: { email?: string; phoneNumber?: string }) {
    const [row] = await db
      .select({ id: user.id })
      .from(user)
      .where(address.email ? eq(user.email, address.email) : or(eq(user.phoneNumber, address.phoneNumber!), eq(user.email, phoneOnlyEmail(address.phoneNumber!))));
    return row ?? null;
  }

  async function signupsPaused() {
    const [flag] = await db.select({ enabled: operationsFlag.enabled }).from(operationsFlag).where(eq(operationsFlag.key, 'signups_paused'));
    return Boolean(flag?.enabled);
  }

  return {
    id: 'member-access',
    endpoints: {
      memberSignUp: createAuthEndpoint('/member/sign-up', { method: 'POST', body: z.record(z.string(), z.unknown()) }, async (ctx) => {
        const language = headersLanguage(ctx.headers);
        const input = check(memberSignUpSchema, ctx.body, language);
        const address = input.email ?? input.phoneNumber!;
        if (input.phoneNumber && !messenger.smsEnabled) refuse('SERVICE_UNAVAILABLE', 'SMS_UNAVAILABLE', language, 'api.smsSignInUnavailable');
        const problem = passwordProblem(input.password, { name: input.name, email: input.email, phone: input.phoneNumber });
        if (problem) invalid(language, { password: { key: `validation.password.${problem}` } });
        if (await isBannedAddress(db, hash, address)) refuse('FORBIDDEN', 'ADDRESS_BANNED', language, 'api.addressBanned');
        if (await signupsPaused()) refuse('FORBIDDEN', 'SIGNUPS_PAUSED', language, 'api.signupsPaused');

        // Hashed whether or not the address is free, so the answer takes as long either way.
        const passwordHash = await ctx.context.password.hash(input.password);
        const channel = input.email ? 'email' : 'sms';
        if (await existingUser(input)) {
          const logIn = `${config.memberAppUrl}/`;
          if (input.email) await messenger.sendEmail({ to: input.email, ...registeredEmail(language, logIn) });
          else await messenger.sendSms({ to: input.phoneNumber!, body: registeredSms(language) });
          return ctx.json({ sent: true, channel });
        }

        const code = String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');
        const pending: Pending = { name: input.name, passwordHash, codeHash: codeHash(address, code) };
        // A new code replaces the old one and starts with fresh tries (codes per address are limited in auth.ts, so
        // at most CODES_PER_ADDRESS × SIGN_UP_CODE_TRIES guesses an hour).
        await ctx.context.internalAdapter.deleteVerificationByIdentifier(PENDING + address);
        await clearCounter(db, `sign-up-code:${hash(address)}`);
        await ctx.context.internalAdapter.createVerificationValue({
          identifier: PENDING + address,
          value: JSON.stringify(pending),
          expiresAt: new Date(Date.now() + CODE_TTL_SECONDS * 1000),
        });
        if (input.email) {
          const link = `${config.memberAppUrl}/confirm#${new URLSearchParams({ email: input.email, code })}`;
          await messenger.sendEmail({ to: input.email, ...signUpEmail(language, code, link) });
        } else {
          await messenger.sendSms({ to: input.phoneNumber!, body: codeSms(language, code, undefined, config.memberAppUrl) });
        }
        return ctx.json({ sent: true, channel });
      }),

      memberSignUpVerify: createAuthEndpoint('/member/sign-up/verify', { method: 'POST', body: z.record(z.string(), z.unknown()) }, async (ctx) => {
        const language = headersLanguage(ctx.headers);
        const input = check(memberSignUpCodeSchema, ctx.body, language);
        const address = input.email ?? input.phoneNumber!;
        const identifier = PENDING + address;
        const found = await ctx.context.internalAdapter.findVerificationValue(identifier);
        if (!found || found.expiresAt < new Date()) refuse('BAD_REQUEST', 'CODE_EXPIRED', language, 'api.signUpCodeExpired');
        // Counted in one Postgres statement, so tries sent at the same moment cannot slip past the limit together.
        const tries = await consume(db, `sign-up-code:${hash(address)}`, { window: CODE_TTL_SECONDS, max: SIGN_UP_CODE_TRIES });
        if (!tries.allowed) {
          await ctx.context.internalAdapter.deleteVerificationByIdentifier(identifier);
          refuse('TOO_MANY_REQUESTS', 'TOO_MANY_ATTEMPTS', language, 'api.signUpTooManyTries');
        }
        const pending = JSON.parse(found!.value) as Pending;
        const given = Buffer.from(codeHash(address, input.code), 'hex');
        if (!timingSafeEqual(given, Buffer.from(pending.codeHash, 'hex'))) refuse('BAD_REQUEST', 'INVALID_CODE', language, 'api.signUpCodeWrong');
        // Single use: of two requests with the right code, only one gets the row.
        const consumed = await ctx.context.internalAdapter.consumeVerificationValue(identifier);
        if (!consumed) refuse('BAD_REQUEST', 'CODE_EXPIRED', language, 'api.signUpCodeExpired');
        if (await existingUser(input)) refuse('CONFLICT', 'ACCOUNT_EXISTS', language, 'api.accountExists');

        // The user hooks in auth.ts run here too: banned addresses and paused sign-ups are refused at creation.
        const created = await ctx.context.internalAdapter.createUser({
          email: input.email ?? phoneOnlyEmail(input.phoneNumber!),
          name: pending.name,
          emailVerified: Boolean(input.email),
          ...(input.phoneNumber ? { phoneNumber: input.phoneNumber, phoneNumberVerified: true } : {}),
        }, { method: input.email ? 'email-password' : 'phone-number' });
        await ctx.context.internalAdapter.linkAccount({
          userId: created.id,
          providerId: 'credential',
          accountId: created.id,
          password: pending.passwordHash,
        });
        const session = await ctx.context.internalAdapter.createSession(created.id);
        await setSessionCookie(ctx, { session, user: created });
        return ctx.json({ user: { id: created.id, name: created.name } });
      }),

      memberSignUpInvitation: createAuthEndpoint('/member/sign-up/invitation', { method: 'POST', body: z.record(z.string(), z.unknown()) }, async (ctx) => {
        const language = headersLanguage(ctx.headers);
        const input = check(invitationSignUpSchema, ctx.body, language);
        const tokenHash = tokenDigest(input.token);
        // The invited address, read by the reviewed function the preview uses (no one chooses it here).
        const [found] = rows<{ preview: { channel: 'email' | 'phone'; contact: string } | null }>(
          await runAsActor(db, null, (tx) => tx.execute(sql`select app.invitation_preview(${tokenHash}) as preview`)),
        );
        const invited = found?.preview;
        if (!invited) refuse('NOT_FOUND', 'INVITATION_INVALID', language, 'api.invitation.invalid');
        const address = invited!.channel === 'email' ? { email: invited!.contact } : { phoneNumber: invited!.contact };
        const problem = passwordProblem(input.password, { name: input.name, email: address.email, phone: address.phoneNumber });
        if (problem) invalid(language, { password: { key: `validation.password.${problem}` } });
        if (await isBannedAddress(db, hash, invited!.contact)) refuse('FORBIDDEN', 'ADDRESS_BANNED', language, 'api.addressBanned');
        if (await signupsPaused()) refuse('FORBIDDEN', 'SIGNUPS_PAUSED', language, 'api.signupsPaused');
        // The invited person already has an account: they log in and accept (the page offers Log in).
        if (await existingUser(address)) refuse('CONFLICT', 'ACCOUNT_EXISTS', language, 'api.accountExists');

        const created = await ctx.context.internalAdapter.createUser(
          {
            email: address.email ?? phoneOnlyEmail(address.phoneNumber!),
            name: input.name,
            emailVerified: Boolean(address.email),
            ...(address.phoneNumber ? { phoneNumber: address.phoneNumber, phoneNumberVerified: true } : {}),
          },
          { method: 'invitation' },
        );
        // Accepting checks the code. Its own transaction commits whatever the answer, so a wrong code is counted
        // against the invitation; only an accepted invitation keeps the new account.
        const actor = { userId: created.id, role: 'member' as const };
        const [answer] = rows<{ result: { status: string; profileId?: string } }>(
          await runAsActor(db, actor, (tx) =>
            tx.execute(sql`select app.invitation_accept(${tokenHash}, ${codeDigest(config.authSecret, tokenHash, input.code)}) as result`),
          ),
        );
        const result = answer!.result;
        if (result.status !== 'accepted') {
          await ctx.context.internalAdapter.deleteUser(created.id);
          const [status, code, key] = INVITATION_PROBLEMS[result.status] ?? ['NOT_FOUND', 'INVITATION_INVALID', 'api.invitation.invalid'];
          refuse(status, code, language, key);
        }
        await ctx.context.internalAdapter.linkAccount({
          userId: created.id,
          providerId: 'credential',
          accountId: created.id,
          password: await ctx.context.password.hash(input.password),
        });
        await runAsActor(db, actor, (tx) => tx.insert(memberAccount).values({ userId: created.id, locale: language }).onConflictDoNothing());
        const session = await ctx.context.internalAdapter.createSession(created.id);
        await setSessionCookie(ctx, { session, user: created });
        return ctx.json({ profileId: result.profileId });
      }),
    },
  } satisfies BetterAuthPlugin;
}
