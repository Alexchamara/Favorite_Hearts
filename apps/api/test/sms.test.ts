// The SMSlenz sender (src/messaging/sms.ts) against a fake SMSlenz: what it sends, and that every kind of failure is a
// failure (never a code the member waits for in vain).
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { SmsSendError, createSmsSender } from '../src/messaging/sms.ts';

const account = { userId: '12', apiKey: 'test-key', baseUrl: 'https://smslenz.test/api/' };
function fake(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof globalThis.fetch;
  return { calls, fetch };
}

describe('SMSlenz', () => {
  test('sends the number, the text and the approved sender ID as SMSlenz documents', async () => {
    const server = fake(200, { success: true, message: 'SMS sent successfully', data: { status: 'success', pages: 1 } });
    await createSmsSender('smslenz', { senderId: 'FavHearts', smslenz: account, fetch: server.fetch })({ to: '+94771234567', body: 'Your code is 123456' });
    assert.equal(server.calls.length, 1);
    assert.equal(server.calls[0]!.url, 'https://smslenz.test/api/send-sms');
    assert.equal(server.calls[0]!.init.method, 'POST');
    assert.deepEqual(JSON.parse(String(server.calls[0]!.init.body)), {
      user_id: '12',
      api_key: 'test-key',
      sender_id: 'FavHearts',
      contact: '+94771234567',
      message: 'Your code is 123456',
    });
  });

  test('a refusal, an error status, a page that is not JSON or no connection is a failure', async () => {
    const send = (fetch: typeof globalThis.fetch) => createSmsSender('smslenz', { senderId: 'FavHearts', smslenz: account, fetch })({ to: '+94771234567', body: 'x' });
    await assert.rejects(send(fake(200, { success: false, message: 'Sender ID not approved' }).fetch), SmsSendError);
    await assert.rejects(send(fake(401, { message: 'Invalid API key' }).fetch), SmsSendError);
    await assert.rejects(send(fake(502, '<html>Bad gateway</html>').fetch), SmsSendError);
    await assert.rejects(send((async () => { throw new TypeError('fetch failed'); }) as unknown as typeof globalThis.fetch), SmsSendError);
  });
});
