/**
 * Staff workspace (OWNER-DECISIONS section 10): the owner and the backup reviewer sign in with a
 * password and two-step login, then review identity documents and reports; the owner also runs
 * payments, plans and payment details. The server refuses every staff request until two-step
 * login is on, whatever this screen shows.
 */
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ShieldCheck } from 'lucide-react';
import { renderSVG } from 'uqr';
import type { DocumentSide, StaffQueueItem, VerificationCaseView } from '@fh/shared';
import { CodeInput, useCodeCheck } from '@/components/form/code-input';
import { CheckboxField, TextAreaField, TextField } from '@/components/form/fields';
import { AppShell, Card, Loading, Notice, PageTitle } from '@/components/layout';
import { useBotCheck } from '@/components/turnstile';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, errorMessage, post } from '@/lib/api';
import { formatWhen } from '@/lib/format';
import { authClient } from '@/lib/auth-client';
import { keys, resetSession, useMe, useOwnerPayments } from '@/lib/queries';
import { queryClient } from '@/lib/query-client';
import { ENGLISH_LABELS } from '@/features/profile/options';
import { PaymentDetailsAdmin } from './PaymentDetailsAdmin';
import { PaymentsQueue } from './PaymentsQueue';
import { PlansAdmin } from './PlansAdmin';
import { ReportsQueue, useStaffReports } from './ReportsQueue';
import { ServiceAdmin } from './ServiceAdmin';
import { Empty } from './Empty';

const { documentLabels } = ENGLISH_LABELS;

export default function StaffApp() {
  const me = useMe();
  return (
    <AppShell home="/staff" width={me.data?.staffRole && me.data.twoFactorEnabled ? 'wide' : 'narrow'}>
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
  { value: 'payments', label: 'Payments', ownerOnly: true },
  { value: 'documents', label: 'Verification' },
  { value: 'reports', label: 'Reports' },
  { value: 'plans', label: 'Plans', ownerOnly: true },
  { value: 'details', label: 'Payment details', ownerOnly: true },
  { value: 'service', label: 'Service', ownerOnly: true },
];

/**
 * The demo's private review workspace (SCREEN-049): heading, the rules in a note, counts of what waits, then one tab
 * per area. Identity documents and reports: both roles review both (section 10). Payments, plans, payment details and
 * the service switches are the owner's alone; the backup reviewer never sees those tabs or the payments count, and the
 * server refuses them anyway. The demo's consent and featured-profile tabs are not built (no such review here).
 */
function StaffWorkspace({ role }: { role: 'owner' | 'backup_reviewer' }) {
  const owner = role === 'owner';
  const [area, setArea] = useState<Area>(owner ? 'payments' : 'documents');
  const visible = areas.filter((item) => owner || !item.ownerOnly);
  return (
    <>
      <div className="m-page-heading">
        <div>
          <span className="m-kicker uppercase">Private review workspace</span>
          <h1>Trust deserves attention.</h1>
          <p>{owner ? 'Owner' : 'Backup reviewer'}: review what members sent, and decide each case yourself.</p>
        </div>
      </div>
      <div className="m-note">
        <ShieldCheck size={21} aria-hidden="true" />
        <span>
          Every document, receipt and reported item you open is logged. Accepting a document gives the badge
          “identity document reviewed”, nothing more.
          {owner && ' Approve a payment only after you find the transfer in the real bank, Wise or PayPal statement.'}
        </span>
      </div>
      <ReviewStats owner={owner} />
      <Tabs value={area} onValueChange={(value) => setArea(value as Area)} className="m-tabs">
        <TabsList>
          {visible.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {area === 'documents' && <ReviewQueue />}
      {area === 'reports' && <ReportsQueue />}
      {owner && area === 'payments' && <PaymentsQueue />}
      {owner && area === 'plans' && <PlansAdmin />}
      {owner && area === 'details' && <PaymentDetailsAdmin />}
      {owner && area === 'service' && <ServiceAdmin />}
    </>
  );
}

/** The demo's .m-review-stats: what waits for a decision, from the same lists the tabs show. */
function ReviewStats({ owner }: { owner: boolean }) {
  const documents = useCases('pending');
  const reports = useStaffReports('open');
  return (
    <div className="m-review-stats">
      {owner && <PaymentStat />}
      <Stat label="Identity reviews" count={documents.data?.length} />
      <Stat label="Open reports" count={reports.data?.length} />
    </div>
  );
}

function PaymentStat() {
  const payments = useOwnerPayments('pending_review', '');
  return <Stat label="Payment proofs" count={payments.data?.length} />;
}

function Stat({ label, count }: { label: string; count: number | undefined }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{count ?? '–'}</strong>
    </div>
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

function useCases(status: VerificationCaseView['status']) {
  return useQuery({
    queryKey: keys.staffQueue(status),
    queryFn: async () => (await api<{ cases: StaffQueueItem[] }>(`/staff/verification?status=${status}`)).cases,
  });
}

const caseName = (item: StaffQueueItem) => (item.subject.accountDeleted ? 'Deleted account' : item.subject.name || 'Unnamed account');

/** The demo's identity review queue: one .m-person-row per case; the case opens in a dialog. */
function ReviewQueue() {
  const [status, setStatus] = useState<VerificationCaseView['status']>('pending');
  const [selected, setSelected] = useState<string | null>(null);
  const queue = useCases(status);
  const current = queue.data?.find((item) => item.id === selected) ?? null;
  return (
    <div className="m-surface">
      <h3>Identity review queue</h3>
      <p>Compare the document with the account details. Badges only ever say “identity document reviewed”.</p>
      <Tabs value={status} onValueChange={(value) => { setStatus(value as typeof status); setSelected(null); }} className="m-tabs">
        <TabsList aria-label="Show cases">
          {statuses.map(([value, label]) => (
            <TabsTrigger key={value} value={value}>
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
        <Empty title={status === 'pending' ? 'Nothing awaiting identity review.' : 'Nothing here.'} text="Documents members send for review appear here." />
      ) : (
        queue.data.map((item) => (
          <div className="m-person-row" key={item.id}>
            <div className="m-row-copy">
              <strong>{caseName(item)}</strong>
              <p>
                {documentLabels[item.documentType]} · sent {formatWhen(item.submittedAt)}
              </p>
            </div>
            <button type="button" className="m-btn m-secondary" onClick={() => setSelected(item.id)}>
              {item.status === 'pending' ? 'Review' : 'Open'}
            </button>
          </div>
        ))
      )}
      <Dialog open={!!current} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent>
          {current && (
            <>
              <DialogHeader>
                <span className="m-kicker uppercase">Identity review</span>
                <DialogTitle>{caseName(current)}</DialogTitle>
                <DialogDescription>
                  {documentLabels[current.documentType]} · sent {formatWhen(current.submittedAt)}
                </DialogDescription>
              </DialogHeader>
              <CaseDetail key={current.id} item={current} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
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
    <div>
      <dl className="grid gap-2 text-sm">
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
          {item.reviewedAt && ` on ${formatWhen(item.reviewedAt)}`}.
        </p>
      )}
    </div>
  );
}
