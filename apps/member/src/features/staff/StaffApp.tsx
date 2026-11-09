/**
 * Staff workspace (OWNER-DECISIONS section 10): the owner and the backup reviewer sign in with a
 * password and two-step login, then review identity documents and reports; the owner also runs
 * payments, plans and payment details. The server refuses every staff request until two-step
 * login is on, whatever this screen shows.
 */
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { renderSVG } from 'uqr';
import type { DocumentSide, StaffQueueItem, VerificationCaseView } from '@fh/shared';
import { CodeInput, useCodeCheck } from '@/components/form/code-input';
import { CheckboxField, TextAreaField, TextField } from '@/components/form/fields';
import { AppShell, Card, Loading, Notice, PageTitle } from '@/components/layout';
import { useBotCheck } from '@/components/turnstile';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, errorMessage, post } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { keys, resetSession, useMe } from '@/lib/queries';
import { queryClient } from '@/lib/query-client';
import { ENGLISH_LABELS } from '@/features/profile/options';
import { PaymentDetailsAdmin } from './PaymentDetailsAdmin';
import { PaymentsQueue } from './PaymentsQueue';
import { PlansAdmin } from './PlansAdmin';
import { ReportsQueue } from './ReportsQueue';
import { ServiceAdmin } from './ServiceAdmin';

const { documentLabels } = ENGLISH_LABELS;

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
        <StaffWorkspace role={me.data.staffRole} />
      )}
    </AppShell>
  );
}

type Area = 'documents' | 'reports' | 'payments' | 'plans' | 'details' | 'service';

const areas: { value: Area; label: string; ownerOnly?: boolean }[] = [
  { value: 'documents', label: 'Identity documents' },
  { value: 'reports', label: 'Reports' },
  { value: 'payments', label: 'Payments', ownerOnly: true },
  { value: 'plans', label: 'Plans', ownerOnly: true },
  { value: 'details', label: 'Payment details', ownerOnly: true },
  { value: 'service', label: 'Service', ownerOnly: true },
];

/**
 * Identity documents and reports: both roles review both (section 10). Payments, plans, payment details and the
 * service switches are the owner's alone; the backup reviewer never sees those tabs, and the server refuses them anyway.
 */
function StaffWorkspace({ role }: { role: 'owner' | 'backup_reviewer' }) {
  const [area, setArea] = useState<Area>('documents');
  const visible = areas.filter((item) => role === 'owner' || !item.ownerOnly);
  return (
    <>
      <Tabs value={area} onValueChange={(value) => setArea(value as Area)}>
        <TabsList className="mb-6 h-auto w-full flex-wrap justify-start gap-1 bg-[var(--ui-soft)] p-1">
          {visible.map((item) => (
            <TabsTrigger key={item.value} value={item.value} className="min-h-10 flex-none px-4">
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {area === 'documents' && <ReviewQueue role={role} />}
      {area === 'reports' && <ReportsQueue role={role} />}
      {role === 'owner' && area === 'payments' && <PaymentsQueue />}
      {role === 'owner' && area === 'plans' && <PlansAdmin />}
      {role === 'owner' && area === 'details' && <PaymentDetailsAdmin />}
      {role === 'owner' && area === 'service' && <ServiceAdmin />}
    </>
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
  const bot = useBotCheck();

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await authClient.signIn.email({ email, password, fetchOptions: { headers: bot.headers } });
    bot.reset();
    setBusy(false);
    if (result.error) return setError(result.error.message ?? 'Email or password is not right.');
    if ((result.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) return setNeedsCode(true);
    await resetSession();
  }
  async function verify(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await authClient.twoFactor.verifyBackupCode({ code });
    setBusy(false);
    if (result.error) return setError(result.error.message ?? 'That code did not work.');
    await resetSession();
  }
  // The authenticator's 6 digits are checked as soon as they are in.
  const totpEntry = useCodeCheck(
    async (value) => {
      const result = await authClient.twoFactor.verifyTotp({ code: value });
      if (result.error) throw new Error(result.error.message ?? 'That code did not work.');
    },
    () => resetSession(),
  );

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
            {bot.widget}
            <Button type="submit" className="h-11" disabled={busy || !email || !password || !bot.ready}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        ) : (
          <form onSubmit={verify} className="flex flex-col gap-4">
            {useBackup ? (
              <>
                <TextField label="Backup code" autoComplete="one-time-code" value={code} onChange={setCode} />
                <Button type="submit" className="h-11" disabled={busy || !code}>
                  Continue
                </Button>
              </>
            ) : (
              <CodeInput label="Code from your authenticator app" value={totpEntry.value} onChange={totpEntry.change} state={totpEntry.state} message={totpEntry.message} />
            )}
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
            <CodeInput label="3. Enter the 6-digit code from the app" value={code} onChange={setCode} autoFocus={false} />
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
                  <p className="font-semibold">{item.subject.accountDeleted ? 'Deleted account' : item.subject.name || 'Unnamed account'}</p>
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

const sideNames: Record<DocumentSide, string> = { front: 'Front', back: 'Back', selfie: 'Selfie holding the document' };

function DocumentSideView({ item, side }: { item: StaffQueueItem; side: DocumentSide }) {
  const [image, setImage] = useState<string | null>(null);
  const show = useMutation({
    mutationFn: () => api<{ url: string }>(`/staff/verification/${item.id}/document?side=${side}`),
    onSuccess: (document) => setImage(document.url),
  });
  const name = item.documentType === 'passport' && side === 'front' ? 'Photo page' : sideNames[side];
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold">{name}</p>
      {image ? (
        <img src={image} alt={`${name} of the ${documentLabels[item.documentType]} submitted by ${item.subject.name || 'the member'}`} className="w-full rounded-[10px] border" />
      ) : (
        <Button variant="outline" className="h-11 self-start" disabled={show.isPending} onClick={() => show.mutate()}>
          Show {name.toLowerCase()} (logged)
        </Button>
      )}
      {show.isError && <Notice tone="error">{errorMessage(show.error)}</Notice>}
    </div>
  );
}

function CaseDetail({ item }: { item: StaffQueueItem }) {
  const [reason, setReason] = useState('');
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
      <h2 className="font-serif text-2xl">{subject.accountDeleted ? 'Deleted account' : subject.name || 'Unnamed account'}</h2>
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
        ) : (
          // Each side is opened on its own, and each look is logged with its side (routes/staff.ts).
          <div className="grid gap-4 sm:grid-cols-2">
            {(item.sides ?? ['front']).map((side) => (
              <DocumentSideView key={side} item={item} side={side} />
            ))}
          </div>
        )}
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
