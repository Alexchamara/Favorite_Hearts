/**
 * My security (docs/ADMIN-PANEL-PLAN.md): your passkeys, backup codes, password and signed-in sessions. Every change
 * here needs a fresh passkey or code (step-up), is audited, and emails the owner's security mailbox.
 */
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { STAFF_MIN_PASSWORD_LENGTH } from '@fh/shared';
import { TextField } from '@/components/form/fields';
import { Button } from '@/components/ui/button';
import { formatWhen } from '@/lib/format';
import { Card, Loading, Notice, PageTitle } from '@admin/components/shell';
import { errorMessage } from '@admin/lib/api';
import { authClient, check } from '@admin/lib/auth-client';
import { keys, resetSession, useMe } from '@admin/lib/queries';
import { queryClient } from '@admin/lib/query-client';
import { useStepUp, withStepUp } from '@admin/lib/step-up';
import { deviceName } from '@admin/features/enrol/InvitePage';

export function SecurityPage() {
  const me = useMe();
  if (!me.data) return <Loading />;
  return (
    <>
      <PageTitle kicker="My security" title="How you sign in">
        {`Signed in as ${me.data.email}. This session ends ${formatWhen(me.data.sessionExpiresAt)}, or after ${me.data.idleMinutes} minutes without activity.`}
      </PageTitle>
      <div className="flex flex-col gap-6">
        <Passkeys />
        <BackupCodes />
        <ChangePassword />
        <Sessions />
      </div>
    </>
  );
}

function Passkeys() {
  const confirm = useStepUp();
  const list = useQuery({ queryKey: keys.passkeys, queryFn: () => check(authClient.passkey.listUserPasskeys()) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.passkeys });
  const add = useMutation({
    mutationFn: () => withStepUp(confirm, () => check(authClient.passkey.addPasskey({ name: deviceName() }))),
    onSuccess: async () => {
      toast.success('Passkey added.');
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => withStepUp(confirm, () => check(authClient.passkey.deletePasskey({ id }))),
    onSuccess: async () => {
      toast.success('Passkey removed.');
      await refresh();
    },
  });
  return (
    <Card>
      <h3>Passkeys</h3>
      <p>The safest way to sign in: your face, fingerprint or device PIN. Add one on each device you use for this work.</p>
      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <Notice tone="error">{errorMessage(list.error)}</Notice>
      ) : list.data?.length ? (
        list.data.map((key) => (
          <div className="m-person-row" key={key.id}>
            <div className="m-row-copy">
              <strong>{key.name || 'Passkey'}</strong>
              <p>Added {formatWhen(key.createdAt)}</p>
            </div>
            <button type="button" className="m-btn m-secondary" disabled={remove.isPending} onClick={() => remove.mutate(key.id)}>
              Remove
            </button>
          </div>
        ))
      ) : (
        <Notice tone="warning">No passkey yet. You sign in with your password and authenticator app.</Notice>
      )}
      {(add.isError || remove.isError) && <Notice tone="error">{errorMessage(add.error ?? remove.error)}</Notice>}
      <Button className="mt-4 h-11" disabled={add.isPending} onClick={() => add.mutate()}>
        Add a passkey on this device
      </Button>
    </Card>
  );
}

function BackupCodes() {
  const confirm = useStepUp();
  const [password, setPassword] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const make = useMutation({
    mutationFn: () => withStepUp(confirm, () => check(authClient.twoFactor.generateBackupCodes({ password }))),
    onSuccess: (data) => {
      setCodes(data.backupCodes);
      setPassword('');
    },
  });
  return (
    <Card>
      <h3>Backup codes</h3>
      <p>Each works once if you lose your phone and passkeys. Making new ones stops the old ones working.</p>
      {codes ? (
        <>
          <Notice tone="warning">Save these now; they are not shown again.</Notice>
          <ul className="mt-3 grid grid-cols-2 gap-1 font-mono sm:grid-cols-5" aria-label="New backup codes">
            {codes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
        </>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            make.mutate();
          }}
        >
          {make.isError && <Notice tone="error">{errorMessage(make.error)}</Notice>}
          <TextField label="Your password" type="password" autoComplete="current-password" value={password} onChange={setPassword} />
          <Button type="submit" variant="outline" className="h-11 self-start" disabled={make.isPending || !password}>
            Make new backup codes
          </Button>
        </form>
      )}
    </Card>
  );
}

function ChangePassword() {
  const confirm = useStepUp();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const change = useMutation({
    mutationFn: () =>
      withStepUp(confirm, () => check(authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true }))),
    onSuccess: async () => {
      toast.success('Password changed. Your other sessions were signed out.');
      setCurrent('');
      setNext('');
      await queryClient.invalidateQueries({ queryKey: keys.sessions });
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    change.mutate();
  };
  return (
    <Card>
      <h3>Password</h3>
      <form className="flex flex-col gap-3" onSubmit={submit}>
        {change.isError && <Notice tone="error">{errorMessage(change.error)}</Notice>}
        <TextField label="Current password" type="password" autoComplete="current-password" value={current} onChange={setCurrent} />
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={setNext}
          hint={`${STAFF_MIN_PASSWORD_LENGTH} characters or more.`}
        />
        <Button type="submit" variant="outline" className="h-11 self-start" disabled={change.isPending || !current || next.length < STAFF_MIN_PASSWORD_LENGTH}>
          Change password
        </Button>
      </form>
    </Card>
  );
}

type SessionRow = { id: string; token: string; createdAt: string | Date; userAgent?: string | null; ipAddress?: string | null };

function Sessions() {
  const confirm = useStepUp();
  const sessions = useQuery({ queryKey: keys.sessions, queryFn: () => check(authClient.listSessions()) as Promise<SessionRow[]> });
  const current = useQuery({ queryKey: ['admin', 'current-session'], queryFn: () => check(authClient.getSession()) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.sessions });
  const end = useMutation({
    mutationFn: (token: string) => check(authClient.revokeSession({ token })),
    onSuccess: refresh,
  });
  const endOthers = useMutation({
    mutationFn: () => withStepUp(confirm, () => check(authClient.revokeOtherSessions())),
    onSuccess: async () => {
      toast.success('Your other sessions were signed out.');
      await refresh();
    },
  });
  const signOutEverywhere = async () => {
    await withStepUp(confirm, () => check(authClient.revokeSessions()));
    await resetSession();
  };
  const currentId = (current.data as { session?: { id: string } } | null)?.session?.id;
  return (
    <Card>
      <h3>Signed-in sessions</h3>
      <p>Each browser where you are signed in. End any you do not recognise, then change your password.</p>
      {sessions.isPending ? (
        <Loading />
      ) : sessions.isError ? (
        <Notice tone="error">{errorMessage(sessions.error)}</Notice>
      ) : (
        sessions.data.map((row) => (
          <div className="m-person-row" key={row.id}>
            <div className="m-row-copy">
              <strong>{row.id === currentId ? 'This browser' : (row.userAgent ?? 'Unknown browser').slice(0, 80)}</strong>
              <p>Signed in {formatWhen(row.createdAt)}</p>
            </div>
            {row.id !== currentId && (
              <button type="button" className="m-btn m-secondary" disabled={end.isPending} onClick={() => end.mutate(row.token)}>
                End
              </button>
            )}
          </div>
        ))
      )}
      {endOthers.isError && <Notice tone="error">{errorMessage(endOthers.error)}</Notice>}
      <div className="mt-4 flex flex-wrap gap-3">
        <Button variant="outline" className="h-11" disabled={endOthers.isPending} onClick={() => endOthers.mutate()}>
          Sign out other sessions
        </Button>
        <Button variant="outline" className="h-11" onClick={() => void signOutEverywhere().catch((error) => toast.error(errorMessage(error)))}>
          Sign out everywhere
        </Button>
      </div>
    </Card>
  );
}
