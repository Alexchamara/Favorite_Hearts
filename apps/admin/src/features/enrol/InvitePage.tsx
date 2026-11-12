/**
 * Joining the admin site from an invitation link (docs/ADMIN-PANEL-PLAN.md, layer 4): the token is after "#" so it
 * never reaches a server log, and it is taken off the address bar as soon as it is read.
 *
 *  1. Choose your own password (12 characters or more).
 *  2. Set up the authenticator app and save the backup codes (required: it is the fallback for a lost passkey).
 *  3. Add a passkey on this device (recommended; Face ID, Touch ID, Windows Hello or a security key).
 *  4. Sign in again with them: nothing else works in the setup session.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { renderSVG } from 'uqr';
import { STAFF_MIN_PASSWORD_LENGTH } from '@fh/shared';
import { CodeInput } from '@/components/form/code-input';
import { CheckboxField, TextField } from '@/components/form/fields';
import { Button } from '@/components/ui/button';
import { Card, Loading, Notice, PageTitle } from '@admin/components/shell';
import { authClient, check } from '@admin/lib/auth-client';
import { resetSession } from '@admin/lib/queries';

type Invite = { name: string; email: string; role: 'owner' | 'backup_reviewer'; expiresAt: string };
type Step = 'password' | 'authenticator' | 'passkey' | 'done';

const ROLE_NAMES = { owner: 'owner', backup_reviewer: 'backup reviewer' } as const;

export function InvitePage() {
  const navigate = useNavigate();
  const [token] = useState(() => window.location.hash.slice(1));
  const [invite, setInvite] = useState<Invite | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('password');
  const [password, setPassword] = useState('');

  useEffect(() => {
    // The link's secret leaves the address bar (and the browser history entry) at once.
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
    if (!token) return setProblem('This page needs the link from your invitation.');
    authClient
      .$fetch<Invite>('/staff-invite/preview', { method: 'POST', body: { token } })
      .then((result) => (result.error ? setProblem(result.error.message ?? 'This invitation link does not work.') : setInvite(result.data)))
      .catch(() => setProblem('This invitation link does not work.'));
  }, [token]);

  const finish = async () => {
    await authClient.signOut();
    await resetSession();
    toast.success('All set. Sign in with your passkey, or your password and a code.');
    navigate('/', { replace: true });
  };

  if (problem) {
    return (
      <>
        <PageTitle kicker="Admin invitation" title="This link does not work" />
        <Notice tone="error">{problem} Ask the owner for a new invitation.</Notice>
      </>
    );
  }
  if (!invite) return <Loading />;
  return (
    <>
      <PageTitle kicker="Admin invitation" title={`Welcome, ${invite.name}`}>
        {`You are joining the Favorite Hearts admin site as the ${ROLE_NAMES[invite.role]}, with ${invite.email}. Three short steps, then you sign in.`}
      </PageTitle>
      <ol className="mb-4 flex flex-wrap gap-3 text-sm" aria-label="Steps">
        {(['password', 'authenticator', 'passkey'] as const).map((name, index) => (
          <li key={name} className={step === name ? 'font-semibold' : 'text-muted-foreground'} aria-current={step === name ? 'step' : undefined}>
            {index + 1}. {name === 'password' ? 'Password' : name === 'authenticator' ? 'Authenticator app' : 'Passkey'}
          </li>
        ))}
      </ol>
      {step === 'password' && (
        <ChoosePassword
          token={token}
          onDone={(chosen) => {
            setPassword(chosen);
            setStep('authenticator');
          }}
        />
      )}
      {step === 'authenticator' && <SetUpAuthenticator password={password} onDone={() => setStep('passkey')} />}
      {step === 'passkey' && <AddPasskey onDone={() => void finish()} />}
    </>
  );
}

function ChoosePassword({ token, onDone }: { token: string; onDone: (password: string) => void }) {
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const short = password.length > 0 && password.length < STAFF_MIN_PASSWORD_LENGTH;
  const mismatch = again.length > 0 && again !== password;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await authClient.$fetch('/staff-invite/accept', { method: 'POST', body: { token, password } });
    setBusy(false);
    if (result.error) return setError(result.error.message ?? 'That did not work.');
    onDone(password);
  }

  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && <Notice tone="error">{error}</Notice>}
        <p className="text-sm">
          Choose a password only you know, {STAFF_MIN_PASSWORD_LENGTH} characters or more. A short sentence is easy to remember and hard to guess. Nobody at
          Favorite Hearts will ever ask you for it.
        </p>
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          error={short ? `At least ${STAFF_MIN_PASSWORD_LENGTH} characters.` : undefined}
        />
        <TextField label="The same password again" type="password" autoComplete="new-password" value={again} onChange={setAgain} error={mismatch ? 'The two do not match.' : undefined} />
        <Button type="submit" className="h-11 self-start" disabled={busy || password.length < STAFF_MIN_PASSWORD_LENGTH || again !== password}>
          {busy ? 'Saving…' : 'Save and continue'}
        </Button>
      </form>
    </Card>
  );
}

function SetUpAuthenticator({ password, onDone }: { password: string; onDone: () => void }) {
  const [setup, setSetup] = useState<{ totpURI: string; backupCodes: string[] } | null>(null);
  const [saved, setSaved] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    check(authClient.twoFactor.enable({ password }))
      .then((data) => {
        if (!data || !('totpURI' in data)) throw new Error('An authenticator app is required for staff.');
        setSetup({ totpURI: data.totpURI, backupCodes: data.backupCodes });
      })
      .catch((err: Error) => setError(err.message));
  }, [password]);

  async function confirm(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await check(authClient.twoFactor.verifyTotp({ code }));
      toast.success('Two-step login is on.');
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!setup) return error ? <Notice tone="error">{error}</Notice> : <Loading />;
  const secret = new URL(setup.totpURI).searchParams.get('secret');
  return (
    <Card>
      <form onSubmit={confirm} className="flex flex-col gap-5">
        {error && <Notice tone="error">{error}</Notice>}
        <div className="grid gap-5 sm:grid-cols-[200px_1fr]">
          <img
            src={`data:image/svg+xml;utf8,${encodeURIComponent(renderSVG(setup.totpURI))}`}
            alt="QR code for your authenticator app"
            className="size-[200px] rounded-[10px] border bg-white p-2"
          />
          <div className="text-sm">
            <p>1. Scan this code with an authenticator app on your phone (for example Google Authenticator or Microsoft Authenticator).</p>
            <p className="mt-2">
              Or enter this key by hand: <code className="font-mono break-all">{secret}</code>
            </p>
          </div>
        </div>
        <div className="text-sm">
          <p>2. Save these backup codes somewhere safe and private (printed, or in a password manager). Each works once if you lose your devices.</p>
          <ul className="mt-2 grid grid-cols-2 gap-1 font-mono sm:grid-cols-5" aria-label="Backup codes">
            {setup.backupCodes.map((backup) => (
              <li key={backup}>{backup}</li>
            ))}
          </ul>
        </div>
        <CheckboxField checked={saved} onChange={setSaved} label="I have saved my backup codes." />
        <CodeInput label="3. Enter the 6-digit code from the app" value={code} onChange={setCode} autoFocus={false} />
        <Button type="submit" className="h-11 self-start" disabled={busy || !saved || code.length !== 6}>
          Turn on two-step login
        </Button>
      </form>
    </Card>
  );
}

function AddPasskey({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await check(authClient.passkey.addPasskey({ name: deviceName() }));
      toast.success('Passkey added.');
      onDone();
    } catch (err) {
      setError((err as Error).message || 'This device could not make a passkey.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <div className="flex flex-col gap-4">
        {error && <Notice tone="error">{error}</Notice>}
        <p className="text-sm">
          A passkey signs you in with your face, fingerprint or device PIN. It cannot be guessed or tricked out of you by
          a fake site, so it is the safest way to sign in. Add one on each device you use for this work; the
          authenticator app stays as your fallback.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button className="h-11" disabled={busy} onClick={() => void add()}>
            Add a passkey on this device
          </Button>
          <Button variant="outline" className="h-11" disabled={busy} onClick={onDone}>
            Not now, finish
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** A label for the passkey list, from the browser (no device identifiers). */
export function deviceName(): string {
  const agent = navigator.userAgent;
  const system = /iPhone|iPad/.test(agent) ? 'iPhone or iPad' : /Android/.test(agent) ? 'Android' : /Mac/.test(agent) ? 'Mac' : /Windows/.test(agent) ? 'Windows' : 'This device';
  return `${system}, added ${new Date().toISOString().slice(0, 10)}`;
}
