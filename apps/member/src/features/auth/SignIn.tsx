/**
 * Passwordless sign-in and sign-up with a 6-digit code (OWNER-DECISIONS section 5: by email or
 * SMS, the member's choice). SMS appears only when a provider is configured. After the first
 * sign-in the account holder adds their name.
 */
import { useState, type FormEvent } from 'react';
import type { LoginChannel } from '@fh/shared';
import { PhoneField, TextField } from '@/components/form/fields';
import { Notice } from '@/components/layout';
import { useBotCheck } from '@/components/turnstile';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { useI18n } from '@/lib/i18n';
import { keys, resetSession, useServiceStatus } from '@/lib/queries';
import { queryClient } from '@/lib/query-client';
import { authErrorMessage, enabledChannels, requestLoginCode, verifyLoginCode } from './login-code';

type Step = { kind: 'contact' } | { kind: 'code'; channel: LoginChannel; contact: string };

export function SignIn({ onSignedIn, intro }: { onSignedIn?: () => void; intro?: string }) {
  const channels = enabledChannels();
  const [channel, setChannel] = useState<LoginChannel>(channels[0] ?? 'email');
  const [contact, setContact] = useState('');
  const [code, setCode] = useState('');
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
      setCode('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      bot.reset();
    }
  }

  async function checkCode(event: FormEvent) {
    event.preventDefault();
    if (step.kind !== 'code') return;
    setBusy(true);
    setError(null);
    try {
      await verifyLoginCode(input(step.channel, step.contact), code);
      await resetSession();
      onSignedIn?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!channels.length) return <Notice tone="warning">{t('signIn.unavailable')}</Notice>;

  return (
    <div className="flex flex-col gap-5">
      {intro && <p className="text-muted-foreground">{intro}</p>}
      {status.data?.signupsPaused && (
        <Notice tone="warning" title={t('signIn.paused.title')}>
          {t('signIn.paused.body')}
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {step.kind === 'contact' ? (
        <form onSubmit={sendCode} className="flex flex-col gap-4">
          {channels.length > 1 && (
            <div role="radiogroup" aria-label={t('signIn.channel')} className="flex gap-2">
              {channels.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={channel === option}
                  onClick={() => {
                    setChannel(option);
                    setContact('');
                  }}
                  className="min-h-11 flex-1 rounded-[10px] border text-sm font-semibold aria-checked:border-primary aria-checked:bg-primary aria-checked:text-primary-foreground"
                >
                  {t(option === 'email' ? 'signIn.channel.email' : 'signIn.channel.sms')}
                </button>
              ))}
            </div>
          )}
          {channel === 'email' ? (
            <TextField label={t('signIn.email')} type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={contact} onChange={setContact} />
          ) : (
            <PhoneField label={t('signIn.mobile')} value={contact} onChange={setContact} />
          )}
          {bot.widget}
          <Button type="submit" className="h-11" disabled={busy || !contact.trim() || !bot.ready}>
            {busy ? t('signIn.sending') : t('signIn.send')}
          </Button>
          <p className="text-xs text-muted-foreground">
            {t('signIn.newHere')}
          </p>
        </form>
      ) : (
        <form onSubmit={checkCode} className="flex flex-col gap-4">
          <p className="text-sm">
            {rich('signIn.sent', { strong: (words) => <strong>{words}</strong> }, { contact: step.contact })}
          </p>
          <TextField
            label={t('signIn.code')}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(value) => setCode(value.replace(/\D/g, ''))}
          />
          <Button type="submit" className="h-11" disabled={busy || code.length !== 6}>
            {busy ? t('signIn.checking') : t('common.continue')}
          </Button>
          {bot.widget}
          <div className="flex flex-wrap gap-4 text-sm">
            <button type="button" className="text-brand underline underline-offset-4 disabled:opacity-60" onClick={() => void sendCode()} disabled={busy || !bot.ready}>
              {t('signIn.resend')}
            </button>
            <button
              type="button"
              className="text-brand underline underline-offset-4"
              onClick={() => {
                setError(null);
                setStep({ kind: 'contact' });
              }}
            >
              {t(step.channel === 'email' ? 'signIn.otherEmail' : 'signIn.otherNumber')}
            </button>
          </div>
        </form>
      )}
    </div>
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
    <form onSubmit={save} className="flex flex-col gap-4">
      {error && <Notice tone="error">{error}</Notice>}
      <TextField
        label={t('name.label')}
        hint={t('name.hint')}
        autoComplete="name"
        maxLength={60}
        value={name}
        onChange={setName}
      />
      <Button type="submit" className="h-11" disabled={busy || name.trim().length < 2}>
        {busy ? t('common.saving') : t('common.continue')}
      </Button>
    </form>
  );
}
