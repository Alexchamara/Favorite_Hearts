/**
 * The six-digit code, one box per digit (owner, 6 Nov 2026). Under the boxes is one real input, so the phone's
 * "from Messages" suggestion, pasting and screen readers all work as with any text field. With `useCodeCheck` the code
 * is checked as soon as the sixth digit is in: the digits dim while checking, a wrong code shakes red and clears for
 * another try, and a right one becomes a tick.
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
  const reset = () => {
    if (timer.current) clearTimeout(timer.current);
    setValue('');
    setState('idle');
    setMessage(null);
  };
  return { value, state, message, change, reset };
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

  const active = focused && !locked ? Math.min(value.length, CODE_LENGTH - 1) : -1;
  const status = state === 'checking' ? t('signIn.checking') : state === 'success' ? t('code.verified') : state === 'error' || message ? message : null;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[13px] font-semibold">
        {label}
      </label>
      <div className="flex w-fit max-w-full flex-col gap-2">
      <div className="relative">
        <div
          key={state === 'error' ? 'shake' : 'still'}
          aria-hidden="true"
          className={cn('flex items-center gap-1.5 sm:gap-2', state === 'error' && 'animate-[code-shake_380ms_ease-in-out]', state === 'success' && 'invisible')}
        >
          {Array.from({ length: CODE_LENGTH }, (_, index) => {
            const digit = value[index];
            return (
              <span
                key={index}
                className={cn(
                  'relative grid h-13 w-11 place-items-center rounded-[10px] border bg-[var(--ui-surface)] font-sans text-2xl font-semibold tabular-nums transition-[border-color,background-color,color,opacity] duration-200 sm:h-14 sm:w-12',
                  index === 3 && 'ml-2 sm:ml-3',
                  digit && 'border-[color-mix(in_srgb,var(--ui-text)_28%,var(--ui-line))] bg-card',
                  index === active && 'border-[var(--ui-purple)] ring-2 ring-[color-mix(in_srgb,var(--ui-purple)_22%,transparent)]',
                  state === 'checking' && 'animate-pulse text-muted-foreground',
                  state === 'error' && 'border-destructive bg-[color-mix(in_srgb,var(--ui-danger)_9%,var(--ui-surface))] text-destructive',
                )}
              >
                {digit ? (
                  <span key={`${index}-${digit}`} className="animate-[code-pop_160ms_cubic-bezier(0.2,0.9,0.3,1.3)]">
                    {digit}
                  </span>
                ) : index === active ? (
                  <span className="h-6 w-0.5 animate-[code-caret_1s_steps(1)_infinite] rounded-full bg-foreground" />
                ) : null}
              </span>
            );
          })}
        </div>
        {state === 'success' && (
          <div aria-hidden="true" className="absolute inset-0 grid place-items-center">
            <Check className="size-10 animate-[code-check_420ms_cubic-bezier(0.2,0.9,0.3,1.2)] text-foreground" strokeWidth={1.75} />
          </div>
        )}
        {/* The real field, over the boxes: tapping anywhere on them puts the caret here. */}
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
          className="absolute inset-0 size-full cursor-text bg-transparent text-transparent caret-transparent opacity-0 outline-none selection:bg-transparent"
        />
      </div>
      <p
        id={statusId}
        role="status"
        className={cn(
          'min-h-5 w-0 min-w-full text-sm',
          state === 'success' && 'text-center',
          state === 'error' || (state === 'idle' && message) ? 'font-medium text-destructive' : 'text-muted-foreground',
        )}
      >
        {status}
      </p>
      </div>
    </div>
  );
}
