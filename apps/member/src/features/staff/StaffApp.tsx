/**
 * Staff workspace (OWNER-DECISIONS section 10): the owner and the backup reviewer sign in with a
 * password and two-step login, then review identity documents. The server refuses every staff
 * request until two-step login is on, whatever this screen shows.
 */
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { renderSVG } from 'uqr';
import type { StaffQueueItem, VerificationCaseView } from '@fh/shared';
import { CheckboxField, TextAreaField, TextField } from '@/components/form/fields';
import { AppShell, Card, Loading, Notice, PageTitle } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, errorMessage, post } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { keys, resetSession, useMe } from '@/lib/queries';
import { queryClient } from '@/lib/query-client';
import { documentLabels } from '@/features/profile/options';

export default function StaffApp() {
  const me = useMe();
  return (
    <AppShell home="/staff">
      {me.isPending ? (
        <Loading />
      ) : !me.data ? (
        <StaffSignIn />
      ) : !me.data.staffRole ? (
        <>
          <PageTitle title="Staff only" />
          <Notice>This account is not a staff account. Members use the member app.</Notice>
        </>
      ) : !me.data.twoFactorEnabled ? (
        <SetUpTwoStep />
      ) : (
        <ReviewQueue role={me.data.staffRole} />
      )}
    </AppShell>
  );
}

async function refreshAccount() {
  await queryClient.refetchQueries({ queryKey: keys.me });
}

function StaffSignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [needsCode, setNeedsCode] = useState(false);
  const [useBackup, setUseBackup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await authClient.signIn.email({ email, password });
    setBusy(false);
    if (result.error) return setError(result.error.message ?? 'Email or password is not right.');
    if ((result.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) return setNeedsCode(true);
    await resetSession();
  }
  async function verify(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = useBackup ? await authClient.twoFactor.verifyBackupCode({ code }) : await authClient.twoFactor.verifyTotp({ code });
    setBusy(false);
    if (result.error) return setError(result.error.message ?? 'That code did not work.');
    await resetSession();
  }

  return (
    <>
      <PageTitle kicker="Favorite Hearts staff" title="Sign in" />
      <Card>
        {error && (
          <div className="mb-4">
            <Notice tone="error">{error}</Notice>
          </div>
        )}
        {!needsCode ? (
          <form onSubmit={signIn} className="flex flex-col gap-4">
            <TextField label="Email" type="email" autoComplete="username" value={email} onChange={setEmail} />
            <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={setPassword} />
            <Button type="submit" className="h-11" disabled={busy || !email || !password}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        ) : (
          <form onSubmit={verify} className="flex flex-col gap-4">
            <TextField
              label={useBackup ? 'Backup code' : 'Code from your authenticator app'}
              autoComplete="one-time-code"
              value={code}
              onChange={setCode}
            />
            <Button type="submit" className="h-11" disabled={busy || !code}>
              Continue
            </Button>
            <button type="button" className="self-start text-sm text-brand underline underline-offset-4" onClick={() => setUseBackup(!useBackup)}>
              {useBackup ? 'Use the authenticator app instead' : 'Lost your phone? Use a backup code'}
            </button>
          </form>
        )}
      </Card>
    </>
  );
}

/** First sign-in: turn on two-step login with an authenticator app; save the backup codes. */
function SetUpTwoStep() {
  const [password, setPassword] = useState('');
  const [setup, setSetup] = useState<{ totpURI: string; backupCodes: string[] } | null>(null);
  const [saved, setSaved] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await authClient.twoFactor.enable({ password });
    setBusy(false);
    if (result.error || !result.data) return setError(result.error?.message ?? 'Could not start the set-up.');
    if (!('totpURI' in result.data)) return setError('An authenticator app is required for staff two-step login.');
    setSetup({ totpURI: result.data.totpURI, backupCodes: result.data.backupCodes });
  }
  async function confirm(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await authClient.twoFactor.verifyTotp({ code });
    setBusy(false);
    if (result.error) return setError(result.error.message ?? 'That code did not work.');
    toast.success('Two-step login is on.');
    await refreshAccount();
  }

  const secret = setup ? new URL(setup.totpURI).searchParams.get('secret') : null;
  return (
    <>
      <PageTitle kicker="Favorite Hearts staff" title="Turn on two-step login">
        Staff tools stay locked until it is on. You will need an authenticator app (for example Google Authenticator or
        Microsoft Authenticator) on your phone.
      </PageTitle>
      <Card>
        {error && (
          <div className="mb-4">
            <Notice tone="error">{error}</Notice>
          </div>
        )}
        {!setup ? (
          <form onSubmit={start} className="flex flex-col gap-4">
            <TextField label="Confirm your password" type="password" autoComplete="current-password" value={password} onChange={setPassword} />
            <Button type="submit" className="h-11 self-start" disabled={busy || !password}>
              Start
            </Button>
          </form>
        ) : (
          <form onSubmit={confirm} className="flex flex-col gap-5">
            <div className="grid gap-5 sm:grid-cols-[200px_1fr]">
              <img
                src={`data:image/svg+xml;utf8,${encodeURIComponent(renderSVG(setup.totpURI))}`}
                alt="QR code for your authenticator app"
                className="size-[200px] rounded-[10px] border bg-white p-2"
              />
              <div className="text-sm">
                <p>1. Scan this code with your authenticator app.</p>
                <p className="mt-2">
                  Or enter this key by hand: <code className="font-mono break-all">{secret}</code>
                </p>
              </div>
            </div>
            <div className="text-sm">
              <p>2. Save these backup codes somewhere safe and private. Each works once if you lose your phone.</p>
              <ul className="mt-2 grid grid-cols-2 gap-1 font-mono sm:grid-cols-5">
                {setup.backupCodes.map((backup) => (
                  <li key={backup}>{backup}</li>
                ))}
              </ul>
            </div>
            <CheckboxField checked={saved} onChange={setSaved} label="I have saved my backup codes." />
            <TextField label="3. Enter the 6-digit code from the app" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(value) => setCode(value.replace(/\D/g, ''))} />
            <Button type="submit" className="h-11 self-start" disabled={busy || !saved || code.length !== 6}>
              Turn on two-step login
            </Button>
          </form>
        )}
      </Card>
    </>
  );
}

const statuses = [
  ['pending', 'Waiting'],
  ['approved', 'Accepted'],
  ['rejected', 'Not accepted'],
] as const;

function ReviewQueue({ role }: { role: 'owner' | 'backup_reviewer' }) {
  const [status, setStatus] = useState<VerificationCaseView['status']>('pending');
  const [selected, setSelected] = useState<string | null>(null);
  const queue = useQuery({
    queryKey: keys.staffQueue(status),
    queryFn: async () => (await api<{ cases: StaffQueueItem[] }>(`/staff/verification?status=${status}`)).cases,
  });
  const current = queue.data?.find((item) => item.id === selected) ?? null;
  return (
    <>
      <PageTitle kicker={role === 'owner' ? 'Owner' : 'Backup reviewer'} title="Identity documents">
        Compare the document with the account details. Badges only ever say “identity document reviewed”.
      </PageTitle>
      <Tabs value={status} onValueChange={(value) => { setStatus(value as typeof status); setSelected(null); }}>
        <TabsList className="mb-4 h-auto bg-[var(--ui-soft)] p-1">
          {statuses.map(([value, label]) => (
            <TabsTrigger key={value} value={value} className="min-h-10 px-4">
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {queue.isPending ? (
        <Loading />
      ) : queue.isError ? (
        <Notice tone="error">{errorMessage(queue.error)}</Notice>
      ) : queue.data.length === 0 ? (
        <Notice>Nothing here.</Notice>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <ul className="flex flex-col gap-2">
            {queue.data.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-pressed={item.id === selected}
                  onClick={() => setSelected(item.id)}
                  className="w-full rounded-[12px] border bg-card p-4 text-left text-sm hover:border-[var(--ui-accent)] aria-pressed:border-[var(--ui-purple)]"
                >
                  <p className="font-semibold">{item.subject.name || 'Unnamed account'}</p>
                  <p className="text-muted-foreground">
                    {documentLabels[item.documentType]} · sent {new Date(item.submittedAt).toLocaleString()}
                  </p>
                </button>
              </li>
            ))}
          </ul>
          {current ? <CaseDetail key={current.id} item={current} /> : <Notice>Choose a case to review.</Notice>}
        </div>
      )}
    </>
  );
}

function CaseDetail({ item }: { item: StaffQueueItem }) {
  const [reason, setReason] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const show = useMutation({
    mutationFn: () => api<{ url: string }>(`/staff/verification/${item.id}/document`),
    onSuccess: (document) => setImage(document.url),
  });
  const decide = useMutation({
    mutationFn: (decision: 'approved' | 'rejected') =>
      post(`/staff/verification/${item.id}/decision`, decision === 'approved' ? { decision } : { decision, reason }),
    onSuccess: async (_, decision) => {
      toast.success(decision === 'approved' ? 'Accepted.' : 'Not accepted; the member sees your reason.');
      await queryClient.invalidateQueries({ queryKey: ['staff'] });
    },
  });
  const { subject } = item;
  return (
    <Card>
      <h2 className="font-serif text-2xl">{subject.name || 'Unnamed account'}</h2>
      <dl className="mt-4 grid gap-2 text-sm">
        <div>
          <dt className="inline font-semibold">Document: </dt>
          <dd className="inline">{documentLabels[item.documentType]}</dd>
        </div>
        <div>
          <dt className="inline font-semibold">Email: </dt>
          <dd className="inline">{subject.email ?? 'none'}</dd>
        </div>
        <div>
          <dt className="inline font-semibold">Phone: </dt>
          <dd className="inline">{subject.phone ? `${subject.phone} (${subject.phoneVerified ? 'verified' : 'not verified'})` : 'none'}</dd>
        </div>
        <div>
          <dt className="inline font-semibold">Profiles: </dt>
          <dd className="inline">
            {subject.profiles.length
              ? subject.profiles.map((p) => `${p.displayName ?? 'Untitled'} (${p.role === 'candidate' ? 'own' : 'manages'})`).join(', ')
              : 'none yet'}
          </dd>
        </div>
      </dl>
      <div className="mt-5">
        {!item.evidenceAvailable ? (
          <Notice>The document was deleted under the 90-day rule. The decision is kept.</Notice>
        ) : image ? (
          <img src={image} alt={`${documentLabels[item.documentType]} submitted by ${subject.name || 'the member'}`} className="w-full rounded-[10px] border" />
        ) : (
          <Button variant="outline" className="h-11" disabled={show.isPending} onClick={() => show.mutate()}>
            Show the document (logged)
          </Button>
        )}
        {show.isError && <Notice tone="error">{errorMessage(show.error)}</Notice>}
      </div>
      {item.status === 'pending' ? (
        <div className="mt-6 flex flex-col gap-4">
          {decide.isError && <Notice tone="error">{errorMessage(decide.error)}</Notice>}
          <Button className="h-11 self-start" disabled={decide.isPending} onClick={() => decide.mutate('approved')}>
            Accept: identity document reviewed
          </Button>
          <TextAreaField label="Or, reason it cannot be accepted (the member sees this)" rows={3} maxLength={300} value={reason} onChange={setReason} />
          <Button variant="outline" className="h-11 self-start" disabled={decide.isPending || reason.trim().length < 3} onClick={() => decide.mutate('rejected')}>
            Not accepted
          </Button>
        </div>
      ) : (
        <p className="mt-6 text-sm">
          {item.status === 'approved' ? 'Accepted' : `Not accepted: ${item.decisionReason}`}
          {item.reviewedAt && ` on ${new Date(item.reviewedAt).toLocaleString()}`}.
        </p>
      )}
    </Card>
  );
}
