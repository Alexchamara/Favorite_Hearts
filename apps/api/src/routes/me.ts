import { Hono } from 'hono';
import { PHONE_ONLY_EMAIL_DOMAIN } from '../messaging/email.ts';
import { requireUser, type AppEnv } from '../middleware/session.ts';

/**
 * The signed-in account. Responses are built from an explicit allowlist —
 * never serialise a database row or the Better-Auth user object directly (spec 4.4, G28).
 */
export const me = new Hono<AppEnv>().use(requireUser).get('/', (c) => {
  const user = c.get('user')!;
  const hasRealEmail = !user.email.endsWith(`@${PHONE_ONLY_EMAIL_DOMAIN}`);
  return c.json({
    id: user.id,
    name: user.name,
    email: hasRealEmail ? user.email : null,
    emailVerified: hasRealEmail ? user.emailVerified : false,
    phoneNumber: user.phoneNumber ?? null,
    phoneNumberVerified: Boolean(user.phoneNumberVerified),
  });
});
