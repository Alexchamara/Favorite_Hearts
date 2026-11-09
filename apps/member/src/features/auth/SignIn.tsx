/**
 * Passwordless sign-in and sign-up with a 6-digit code (OWNER-DECISIONS section 5: by email or
 * SMS, the member's choice). SMS appears only when a provider is configured. After the first
 * sign-in the account holder adds their name.
 */
import { useState, type FormEvent, type ReactNode } from 'react';
import type { LoginChannel } from '@fh/shared';
import { CODE_LENGTH, CodeInput, useCodeCheck } from '@/components/form/code-input';
import { PhoneField, TextField } from '@/components/form/fields';
import { Notice } from '@/components/layout';
import { useBotCheck } from '@/components/turnstile';
import { errorMessage } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { useI18n } from '@/lib/i18n';
import { keys, resetSession, useServiceStatus } from '@/lib/queries';
import { queryClient } from '@/lib/query-client';
import { authErrorMessage, enabledChannels, requestLoginCode, verifyLoginCode } from './login-code';

type Step = { kind: 'contact' } | { kind: 'code'; channel: LoginChannel; contact: string };

/** `heading` draws the panel's kicker and title; the demo changes the title on the code step ("Verify it’s you."). */
export function SignIn({ onSignedIn, intro, heading }: { onSignedIn?: () => void; intro?: string; heading?: (codeStep: boolean) => ReactNode }) {
  const channels = enabledChannels();
  const [channel, setChannel] = useState<LoginChannel>(channels[0] ?? 'email');
  const [contact, setContact] = useState('');
  const [step, setStep] = useState<Step>({ kind: 'contact' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bot = useBotCheck();
  const status = useServiceStatus();
  const { t, rich } = useI18n();

  const input = (target: LoginChannel, value: string) =>
    target === 'email' ? ({ channel: 'email', email: value } as const) : ({ channel: 'sms', phone: value } as const);

  async function sendCode(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requestLoginCode(input(channel, contact), bot.headers);
      setStep({ kind: 'code', channel, contact });
      entry.reset();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      bot.reset();
    }
  }

  // Checked as soon as all six digits are in; after the tick, the session is loaded and the next screen shows.
  const entry = useCodeCheck(
    async (value) => {
      if (step.kind !== 'code') return;
      await verifyLoginCode(input(step.channel, step.contact), value);
    },
    async () => {
      await resetSession();
      onSignedIn?.();
    },
  );

  if (!channels.length) return <Notice tone="warning">{t('signIn.unavailable')}</Notice>;

  // The demo's entry panel (account-entry.ts): the channel choice as its tabs, a grid form, one primary button, quiet
  // text actions, and the small notice under the form.
  return (
    <>
      {heading?.(step.kind === 'code')}
      {intro && <p>{intro}</p>}
      {status.data?.signupsPaused && (
        <Notice tone="warning" title={t('signIn.paused.title')}>
          {t('signIn.paused.body')}
        </Notice>
      )}
      {step.kind === 'contact' ? (
        <>
          {channels.length > 1 && (
            <div className="ma-tabs" role="group" aria-label={t('signIn.channel')}>
              {channels.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={channel === option}
                  onClick={() => {
                    setChannel(option);
                    setContact('');
                  }}
                >
                  {t(option === 'email' ? 'signIn.channel.email' : 'signIn.channel.sms')}
                </button>
              ))}
            </div>
          )}
          <form onSubmit={sendCode}>
            {channel === 'email' ? (
              <TextField label={t('signIn.email')} type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={contact} onChange={setContact} />
            ) : (
              <PhoneField label={t('signIn.mobile')} value={contact} onChange={setContact} />
            )}
            {bot.widget}
            <button type="submit" className="m-btn" disabled={busy || !contact.trim() || !bot.ready}>
              {busy ? t('signIn.sending') : t('signIn.send')}
            </button>
            <p className="m-error" role="alert">
              {error}
            </p>
          </form>
          <p className="ma-notice">{t('signIn.newHere')}</p>
        </>
      ) : (
        <>
          <p>{rich('signIn.sent', { strong: (words) => <strong>{words}</strong> }, { contact: step.contact })}</p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              entry.submit();
            }}
          >
            <CodeInput label={t('signIn.code')} value={entry.value} onChange={entry.change} state={entry.state} message={entry.message} fromSms={step.channel === 'sms'} />
            {bot.widget}
            <button type="submit" className="m-btn" disabled={entry.value.length < CODE_LENGTH || entry.state !== 'idle'}>
              {entry.state === 'checking' ? t('signIn.checking') : t('signIn.verify')}
            </button>
            <button type="button" className="m-text" onClick={() => void sendCode()} disabled={busy || !bot.ready}>
              {t('signIn.resend')}
            </button>
            <button
              type="button"
              className="m-text"
              onClick={() => {
                setError(null);
                setStep({ kind: 'contact' });
              }}
            >
              {t(step.channel === 'email' ? 'signIn.otherEmail' : 'signIn.otherNumber')}
            </button>
            <p className="m-error" role="alert">
              {error}
            </p>
          </form>
        </>
      )}
    </>
  );
}

/** First sign-in: the account holder's name (the candidate's own, or the family member's). */
export function NameStep() {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { t } = useI18n();
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await authClient.updateUser({ name: name.trim() });
    setBusy(false);
    if (result.error) return setError(authErrorMessage(result.error));
    await queryClient.invalidateQueries({ queryKey: keys.me });
  }
  return (
    <form onSubmit={save}>
      <TextField
        label={t('name.label')}
        hint={t('name.hint')}
        autoComplete="name"
        maxLength={60}
        value={name}
        onChange={setName}
      />
      <button type="submit" className="m-btn" disabled={busy || name.trim().length < 2}>
        {busy ? t('common.saving') : t('common.continue')}
      </button>
      <p className="m-error" role="alert">
        {error}
      </p>
    </form>
  );
}
