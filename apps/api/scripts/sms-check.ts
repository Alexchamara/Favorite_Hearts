/**
 * Checks the SMSlenz account in apps/api/.env without sending anything (`npm run sms:check`): whether the User ID and
 * API key work, the credit balance, and whether SMS_SENDER_ID is one of the account's sender IDs. Prints no secrets.
 */
const { SMS_PROVIDER, SMS_SENDER_ID = '', SMSLENZ_USER_ID, SMSLENZ_API_KEY, SMSLENZ_BASE_URL = 'https://smslenz.lk/api' } = process.env;

if (!SMSLENZ_USER_ID || !SMSLENZ_API_KEY) {
  console.error('Set SMSLENZ_USER_ID and SMSLENZ_API_KEY in apps/api/.env first (from the SMSlenz settings page).');
  process.exit(1);
}

const res = await fetch(`${SMSLENZ_BASE_URL.replace(/\/$/, '')}/account-status`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify({ user_id: SMSLENZ_USER_ID, api_key: SMSLENZ_API_KEY }),
  signal: AbortSignal.timeout(15_000),
}).catch((err: Error) => {
  console.error(`Could not reach SMSlenz (${err.message}).`);
  process.exit(1);
});
type Status = { success?: boolean; message?: string; data?: Record<string, unknown> } & Record<string, unknown>;
const body = (await res.json().catch(() => ({}))) as Status;
if (!res.ok || body.success !== true) {
  console.error(`SMSlenz refused: HTTP ${res.status}${body.message ? `, ${body.message}` : ''}. Check the User ID and API key.`);
  process.exit(1);
}
const data = (body.data ?? body) as Record<string, unknown>;
const senders = (Array.isArray(data.sender_id_balances) ? data.sender_id_balances : []) as { sender_id?: string; active?: boolean }[];
console.log(`SMSlenz account: ${String(data.status ?? 'unknown')}, credit balance ${String(data.sms_credit_balance ?? 'unknown')}`);
console.log(`Sender IDs: ${senders.map((s) => `${s.sender_id}${s.active === false ? ' (inactive)' : ''}`).join(', ') || 'none listed'}`);
const match = senders.find((s) => s.sender_id === SMS_SENDER_ID);
console.log(
  match ? `SMS_SENDER_ID "${SMS_SENDER_ID}" is on the account.` : `SMS_SENDER_ID "${SMS_SENDER_ID}" is not listed: it must match an approved sender ID exactly (case sensitive).`,
);
if (SMS_PROVIDER !== 'smslenz') console.log('SMS_PROVIDER is not "smslenz" yet, so the API does not use SMSlenz until you set it.');

export {};
