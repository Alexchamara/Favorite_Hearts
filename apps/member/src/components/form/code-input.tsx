/**
 * The six-digit code as one field, as in the demo (decision B2a, 9 Nov 2026; it replaces the one-box-per-digit design of
 * 6 Nov). It is a normal .m-field input, so the phone's "from Messages" suggestion, pasting and screen readers work as
 * with any text field. With `useCodeCheck` the code is checked as soon as the sixth digit is in; the line under the
 * field says "Checking…", "Verified" or what was wrong.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export const CODE_LENGTH = 6;
export type CodeState = 'idle' | 'checking' | 'error' | 'success';

/** How long a wrong code stays red before the boxes clear, and the tick shows before moving on. */
const ERROR_MS = 900;
const SUCCESS_MS = 750;

/**
 * Checks a code once all six digits are in. `check` throws an Error whose message people can read; `onDone` runs
 * after the tick has shown.
 */
export function useCodeCheck(check: (code: string) => Promise<void>, onDone?: () => void | Promise<void>) {
  const [value, setValue] = useState('');
  const [state, setState] = useState<CodeState>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const change = (next: string) => {
    if (state === 'checking' || state === 'success') return;
    if (state === 'error') setState('idle');
    setMessage(null);
    setValue(next);
    if (next.length === CODE_LENGTH) void run(next);
  };
  async function run(code: string) {
    setState('checking');
    try {
      await check(code);
      setState('success');
      timer.current = setTimeout(() => void onDone?.(), SUCCESS_MS);
    } catch (err) {
      setState('error');
      setMessage(err instanceof Error ? err.message : String(err));
      // After the shake the boxes clear and calm down; the message stays until the next digit.
      timer.current = setTimeout(() => {
        setValue('');
        setState('idle');
      }, ERROR_MS);
    }
  }
  /** The field's submit button: checks a full code that is not already being checked. */
  const submit = () => {
    if (value.length === CODE_LENGTH && state === 'idle') void run(value);
  };
  const reset = () => {
    if (timer.current) clearTimeout(timer.current);
    setValue('');
    setState('idle');
    setMessage(null);
  };
  return { value, state, message, change, submit, reset };
}

export function CodeInput({
  label,
  value,
  onChange,
  state = 'idle',
  message,
  autoFocus = true,
  disabled = false,
  fromSms = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  state?: CodeState;
  message?: string | null;
  autoFocus?: boolean;
  disabled?: boolean;
  /** The code comes by text message: on Android, offer to fill it in from the message (Web OTP). */
  fromSms?: boolean;
}) {
  const { t } = useI18n();
  const id = useId();
  const statusId = `${id}-status`;
  const input = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const locked = disabled || state === 'checking' || state === 'success';

  // After a wrong code the boxes clear: put the caret back for the next try.
  useEffect(() => {
    if (state === 'idle' && value === '' && focused === false && autoFocus) input.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, value]);

  const latest = useRef(onChange);
  latest.current = onChange;
  useEffect(() => {
    if (!fromSms || !('OTPCredential' in window)) return;
    const stop = new AbortController();
    navigator.credentials
      .get({ otp: { transport: ['sms'] }, signal: stop.signal } as CredentialRequestOptions)
      .then((found) => {
        const code = (found as { code?: string } | null)?.code;
        if (code) latest.current(code.replace(/\D/g, '').slice(0, CODE_LENGTH));
      })
      .catch(() => undefined);
    return () => stop.abort();
  }, [fromSms]);

  const status = state === 'checking' ? t('signIn.checking') : state === 'success' ? t('code.verified') : state === 'error' || message ? message : null;
  const problem = state === 'error' || (state === 'idle' && Boolean(message));

  return (
    <div className="m-field">
      <span>
        <label htmlFor={id}>{label}</label>
      </span>
      <input
        ref={input}
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        maxLength={CODE_LENGTH}
        autoFocus={autoFocus}
        readOnly={locked}
        aria-describedby={statusId}
        aria-invalid={state === 'error' ? true : undefined}
        className="block w-full tabular-nums"
      />
      <small id={statusId} role="status" className={cn('inline-flex min-h-5 items-center gap-1.5', problem && 'm-field-error')}>
        {state === 'success' && <Check size={14} aria-hidden="true" />}
        {status}
      </small>
    </div>
  );
}
