/**
 * Admin sign-in (docs/ADMIN-PANEL-PLAN.md, layer 3): a passkey, or the password and then a code from the
 * authenticator app (or one backup code). There is no "trust this device" and no password reset: a lost password or
 * device is a new invitation from the owner.
 */
import { useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { CodeInput, useCodeCheck } from '@/components/form/code-input';
import { TextField } from '@/components/form/fields';
import { useBotCheck } from '@/components/turnstile';
import { Button } from '@/components/ui/button';
import { Card, Notice, PageTitle } from '@admin/components/shell';
import { authClient, check } from '@admin/lib/auth-client';
import { resetSession } from '@admin/lib/queries';

export function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [needsCode, setNeedsCode] = useState(false);
  const [useBackup, setUseBackup] = useState(false);
  const [backup, setBackup] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bot = useBotCheck();

  async function withPassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await check(authClient.signIn.email({ email, password, fetchOptions: { headers: bot.headers } }));
      if ((data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) setNeedsCode(true);
      else setError('This account cannot sign in here.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      bot.reset();
      setBusy(false);
    }
  }

  async function withPasskey() {
    setBusy(true);
    setError(null);
    try {
      await check(authClient.signIn.passkey());
      await resetSession();
    } catch (err) {
      setError((err as Error).message || 'The passkey did not work. Use your password and code instead.');
    } finally {
      setBusy(false);
    }
  }

  async function withBackup(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await check(authClient.twoFactor.verifyBackupCode({ code: backup.trim() }));
      await resetSession();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // The authenticator's 6 digits are checked as soon as they are in.
  const totp = useCodeCheck(
    async (value) => {
      await check(authClient.twoFactor.verifyTotp({ code: value }));
    },
    () => resetSession(),
  );

  return (
    <>
      <PageTitle kicker="Favorite Hearts staff" title="Sign in to the admin site">
        For the owner and the backup reviewer only. Every sign-in asks for your passkey or a code.
      </PageTitle>
      <Card>
        {error && (
          <div className="mb-4">
            <Notice tone="error">{error}</Notice>
          </div>
        )}
        {!needsCode ? (
          <div className="flex flex-col gap-6">
            <Button className="h-11 self-start" disabled={busy} onClick={() => void withPasskey()}>
              <KeyRound size={16} aria-hidden="true" />
              Sign in with a passkey
            </Button>
            <form onSubmit={withPassword} className="flex flex-col gap-4 border-t pt-6">
              <p className="text-sm">Or use your password and authenticator app:</p>
              <TextField label="Email" type="email" autoComplete="username webauthn" value={email} onChange={setEmail} />
              <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={setPassword} />
              {bot.widget}
              <Button type="submit" variant="outline" className="h-11 self-start" disabled={busy || !email || !password || !bot.ready}>
                {busy ? 'Checking…' : 'Continue'}
              </Button>
            </form>
          </div>
        ) : useBackup ? (
          <form onSubmit={withBackup} className="flex flex-col gap-4">
            <TextField label="Backup code (each works once)" autoComplete="one-time-code" value={backup} onChange={setBackup} />
            <Button type="submit" className="h-11 self-start" disabled={busy || !backup.trim()}>
              Sign in
            </Button>
            <button type="button" className="self-start text-sm text-brand underline underline-offset-4" onClick={() => setUseBackup(false)}>
              Use the authenticator app instead
            </button>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            <CodeInput label="Code from your authenticator app" value={totp.value} onChange={totp.change} state={totp.state} message={totp.message} />
            <button type="button" className="self-start text-sm text-brand underline underline-offset-4" onClick={() => setUseBackup(true)}>
              Lost your phone? Use a backup code
            </button>
          </div>
        )}
      </Card>
    </>
  );
}
