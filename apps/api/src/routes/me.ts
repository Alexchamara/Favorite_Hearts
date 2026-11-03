import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { languageChoiceSchema, type MeView } from '@fh/shared';
import { memberAccount } from '../db/schema/members.ts';
import { parse, readJson, withActor, type AppEnv } from '../http.ts';
import { PHONE_ONLY_EMAIL_DOMAIN } from '../messaging/messenger.ts';
import { requireUser } from '../middleware/session.ts';

/**
 * The signed-in account. Responses are built from an explicit allowlist —
 * never serialise a database row or the Better-Auth user object directly (spec 4.4, G28).
 */
export const me = new Hono<AppEnv>().use(requireUser);

me.get('/', async (c) => {
  const user = c.var.user!;
  const hasRealEmail = !user.email.endsWith(`@${PHONE_ONLY_EMAIL_DOMAIN}`);
  const [account] = await withActor(c, (tx) =>
    tx.select().from(memberAccount).where(eq(memberAccount.userId, user.id)),
  );
  return c.json<MeView>({
    id: user.id,
    name: user.name,
    email: hasRealEmail ? user.email : null,
    emailVerified: hasRealEmail ? user.emailVerified : false,
    phoneNumber: user.phoneNumber ?? null,
    phoneNumberVerified: Boolean(user.phoneNumberVerified),
    staffRole: c.var.staffRole,
    twoFactorEnabled: Boolean(user.twoFactorEnabled),
    memberAccount: account ? { status: account.status, locale: account.locale } : null,
  });
});

/**
 * The member's language for the app and for emails (OWNER-DECISIONS section 10). Staff, and an account not created yet,
 * have nothing to save: a new member account starts in the language of the request that creates it.
 */
me.put('/language', async (c) => {
  const { language } = parse(languageChoiceSchema, await readJson(c));
  const userId = c.var.user!.id;
  await withActor(c, (tx) => tx.update(memberAccount).set({ locale: language }).where(eq(memberAccount.userId, userId)));
  return c.body(null, 204);
});
