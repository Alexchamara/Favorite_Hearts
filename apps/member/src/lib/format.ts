import { dateNow, say } from './i18n';

/**
 * Money and plan dates as members and the owner read them, in the language on screen. Money arrives in minor units with its currency
 * (OWNER-DECISIONS section 2): 300000 LKR is "LKR 3,000". Plan dates are shown on the Sri Lanka clock, where the
 * plan's months are counted.
 */
export function formatMoney(amountMinor: number, currency: string): string {
  const whole = amountMinor % 100 === 0;
  return `${currency} ${(amountMinor / 100).toLocaleString('en-GB', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** "3,000" or "3000.50" becomes 300000 or 300050; anything else is null. */
export function parseMoney(text: string): number | null {
  const clean = text.replace(/[,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const value = Math.round(Number(clean) * 100);
  return value > 0 ? value : null;
}

/** Minor units back into what the owner typed: 300050 becomes "3000.50". */
export const moneyInput = (amountMinor: number) => (amountMinor % 100 === 0 ? String(amountMinor / 100) : (amountMinor / 100).toFixed(2));

// Month names and the order of a date come from the catalogue (date.*), not from the browser: some browsers have no
// Sinhala calendar data and would quietly show English.

/** "29 November 2026" (Sri Lanka). */
export const formatDay = (value: string | Date) => dateNow(value, 'day');
/** "29 Nov 2026, 10:15" (Sri Lanka), for plan ends and review times. */
export const formatWhen = (value: string | Date) => say('format.sriLankaTime', { time: dateNow(value, 'when') });

/** "3 hours" / "2 days": how long something has waited, for the owner's 48-hour promise. */
export function waitedFor(value: string | Date): string {
  const hours = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 3_600_000));
  if (hours < 1) return 'under an hour';
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'}`;
  return `${Math.floor(hours / 24)} days`;
}
