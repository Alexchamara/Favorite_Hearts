/**
 * Passwordless sign-in and sign-up with a 6-digit code (OWNER-DECISIONS section 5: by email or
 * SMS, the member's choice). SMS appears only when a provider is configured. After the first
 * sign-in the account holder adds their name.
 */
import { useState, type FormEvent } from 'react';
import type { LoginChannel } from '@fh/shared';
import { TextField } from '@/components/form/fields';
import { Notice } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { keys, resetSession } from '@/lib/queries';
import { queryClient } from '@/lib/query-client';
import { enabledChannels, requestLoginCode, verifyLoginCode } from './login-code';

type Step = { kind: 'contact' } | { kind: 'code'; channel: LoginChannel; contact: string };

export function SignIn({ onSignedIn, intro }: { onSignedIn?: () => void; intro?: string }) {
  const channels = enabledChannels();
  const [channel, setChannel] = useState<LoginChannel>(channels[0] ?? 'email');
  const [contact, setContact] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<Step>({ kind: 'contact' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const input = (target: LoginChannel, value: string) =>
    target === 'email' ? ({ channel: 'email', email: value } as const) : ({ channel: 'sms', phone: value } as const);

  async function sendCode(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requestLoginCode(input(channel, contact));
      setStep({ kind: 'code', channel, contact });
      setCode('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
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

  if (!channels.length) return <Notice tone="warning">Sign-in is not available right now.</Notice>;

  return (
    <div className="flex flex-col gap-5">
      {intro && <p className="text-muted-foreground">{intro}</p>}
      {error && <Notice tone="error">{error}</Notice>}
      {step.kind === 'contact' ? (
        <form onSubmit={sendCode} className="flex flex-col gap-4">
          {channels.length > 1 && (
            <div role="radiogroup" aria-label="Sign in with" className="flex gap-2">
              {channels.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={channel === option}
                  onClick={() => setChannel(option)}
                  className="min-h-11 flex-1 rounded-[10px] border text-sm font-semibold aria-checked:border-primary aria-checked:bg-primary aria-checked:text-primary-foreground"
                >
                  {option === 'email' ? 'Email' : 'Phone (SMS)'}
                </button>
              ))}
            </div>
          )}
          <TextField
            label={channel === 'email' ? 'Email address' : 'Mobile number'}
            type={channel === 'email' ? 'email' : 'tel'}
            inputMode={channel === 'email' ? 'email' : 'tel'}
            autoComplete={channel === 'email' ? 'email' : 'tel'}
            placeholder={channel === 'email' ? 'you@example.com' : '+94 77 123 4567'}
            value={contact}
            onChange={setContact}
          />
          <Button type="submit" className="h-11" disabled={busy || !contact.trim()}>
            {busy ? 'Sending…' : 'Send me a code'}
          </Button>
          <p className="text-xs text-muted-foreground">
            New here? The same code creates your account. Favorite Hearts staff will never ask you for a code.
          </p>
        </form>
      ) : (
        <form onSubmit={checkCode} className="flex flex-col gap-4">
          <p className="text-sm">
            We sent a 6-digit code to <strong>{step.contact}</strong>. It expires in 10 minutes.
          </p>
          <TextField
            label="Code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(value) => setCode(value.replace(/\D/g, ''))}
          />
          <Button type="submit" className="h-11" disabled={busy || code.length !== 6}>
            {busy ? 'Checking…' : 'Continue'}
          </Button>
          <div className="flex flex-wrap gap-4 text-sm">
            <button type="button" className="text-brand underline underline-offset-4" onClick={() => void sendCode()} disabled={busy}>
              Send a new code
            </button>
            <button type="button" className="text-brand underline underline-offset-4" onClick={() => setStep({ kind: 'contact' })}>
              Use a different {step.channel === 'email' ? 'email' : 'number'}
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
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await authClient.updateUser({ name: name.trim() });
    setBusy(false);
    if (result.error) return setError(result.error.message ?? 'Could not save your name.');
    await queryClient.invalidateQueries({ queryKey: keys.me });
  }
  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      {error && <Notice tone="error">{error}</Notice>}
      <TextField
        label="Your name"
        hint="The account holder: you, or the family member managing a profile. Others see it as “Managed by …”."
        autoComplete="name"
        maxLength={60}
        value={name}
        onChange={setName}
      />
      <Button type="submit" className="h-11" disabled={busy || name.trim().length < 2}>
        {busy ? 'Saving…' : 'Continue'}
      </Button>
    </form>
  );
}
