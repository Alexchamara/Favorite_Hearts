import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { memberAccount } from '../db/schema/members.ts';
import { withActor, type AppEnv } from '../http.ts';
import { PHONE_ONLY_EMAIL_DOMAIN } from '../messaging/messenger.ts';
import { requireUser } from '../middleware/session.ts';

/**
 * The signed-in account. Responses are built from an explicit allowlist —
 * never serialise a database row or the Better-Auth user object directly (spec 4.4, G28).
 */
export const me = new Hono<AppEnv>().use(requireUser).get('/', async (c) => {
  const user = c.var.user!;
  const hasRealEmail = !user.email.endsWith(`@${PHONE_ONLY_EMAIL_DOMAIN}`);
  const [account] = await withActor(c, (tx) =>
    tx.select().from(memberAccount).where(eq(memberAccount.userId, user.id)),
  );
  return c.json({
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
