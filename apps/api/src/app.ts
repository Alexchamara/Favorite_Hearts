import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import { auth } from './auth.ts';
import { env } from './env.ts';
import { log } from './lib/log.ts';
import { smsEnabled } from './messaging/sms.ts';
import { loadSession, type AppEnv } from './middleware/session.ts';
import { health } from './routes/health.ts';
import { me } from './routes/me.ts';

export const app = new Hono<AppEnv>();

app.use('*', secureHeaders());
app.use(
  '/api/*',
  cors({
    origin: env.ALLOWED_ORIGINS,
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Idempotency-Key'],
    maxAge: 600,
  }),
);
// Default JSON body limit. Upload routes set their own (5 MiB) limit.
app.use('/api/*', bodyLimit({ maxSize: 100 * 1024 }));

app.route('/health', health);

// SMS codes stay off until a provider is configured: say so clearly instead of failing silently.
app.post('/api/auth/phone-number/send-otp', (c, next) =>
  smsEnabled ? next() : c.json({ code: 'SMS_UNAVAILABLE', message: 'SMS sign-in is not available yet. Please use email.' }, 503),
);
app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));

// Everything below is our own API: session loaded once, permission checks per route.
const v1 = new Hono<AppEnv>().use(loadSession).route('/me', me);
app.route('/api/v1', v1);

app.notFound((c) => c.json({ code: 'NOT_FOUND', message: 'Not found.' }, 404));
app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ code: 'HTTP_' + err.status, message: err.message }, err.status);
  log.error('api.unhandled', { path: c.req.path, message: err.message });
  return c.json({ code: 'INTERNAL', message: 'Something went wrong. Please try again.' }, 500);
});
