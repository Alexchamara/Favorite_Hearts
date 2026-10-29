/**
 * The candidate's invitation (OWNER-DECISIONS section 5). The link carries a one-time token in its
 * fragment (#…), so it never reaches a server log. The candidate asks for a code at the address the
 * manager entered, then accepts (with an account) or declines (no account needed).
 */
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import type { InvitationPreview } from '@fh/shared';
import { TextField } from '@/components/form/fields';
import { AppShell, Card, Loading, Notice, PageTitle } from '@/components/layout';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { errorMessage, post } from '@/lib/api';
import { keys, useMe } from '@/lib/queries';
import { queryClient } from '@/lib/query-client';
import { SignIn } from '@/features/auth/SignIn';
import { relationshipLabels } from '@/features/profile/options';

export default function InvitePage() {
  const token = useLocation().hash.slice(1);
  const preview = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => post<InvitationPreview>('/invitations/preview', { token }),
    enabled: token.length > 0,
    retry: false,
  });
  return (
    <AppShell>
      {!token ? (
        <Notice tone="error">This invitation link is incomplete. Open the full link from your message.</Notice>
      ) : preview.isPending ? (
        <Loading />
      ) : preview.isError ? (
        <>
          <PageTitle title="This invitation cannot be used" />
          <Notice tone="warning">{errorMessage(preview.error)}</Notice>
          <p className="mt-4 text-sm text-muted-foreground">
            If you accepted it,{' '}
            <Link to="/" className="text-brand underline underline-offset-4">
              sign in
            </Link>{' '}
            to see the profile. If the link has expired, ask the person who invited you for a new one.
          </p>
        </>
      ) : (
        <Invitation token={token} preview={preview.data} />
      )}
    </AppShell>
  );
}

function Invitation({ token, preview }: { token: string; preview: InvitationPreview }) {
  const navigate = useNavigate();
  const me = useMe();
  const [code, setCode] = useState('');
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [wantsToAccept, setWantsToAccept] = useState(false);
  const [declined, setDeclined] = useState(false);
  const manager = preview.managerName ?? 'A family member';
  const who = preview.relationship ? `${manager} (${relationshipLabels[preview.relationship].toLowerCase()})` : manager;

  const sendCode = useMutation({
    mutationFn: () => post<{ contactHint: string }>('/invitations/code', { token }),
    onSuccess: (sent) => setCodeSentTo(sent.contactHint),
  });
  const accept = useMutation({
    mutationFn: () => post<{ profileId: string }>('/invitations/accept', { token, code }),
    onSuccess: async ({ profileId }) => {
      toast.success('You have confirmed the profile.');
      await queryClient.invalidateQueries({ queryKey: keys.profiles });
      navigate(`/profiles/${profileId}`);
    },
  });
  const decline = useMutation({
    mutationFn: () => post('/invitations/decline', { token, code }),
    onSuccess: () => setDeclined(true),
  });

  if (declined) {
    return (
      <>
        <PageTitle title="You declined" />
        <Notice title="The profile has been taken down">
          It will not be shown, and {manager} cannot publish it or invite you again. Thank you for letting us know.
        </Notice>
      </>
    );
  }

  return (
    <>
      <PageTitle kicker="An invitation for you" title={`${who} has started a matrimony profile${preview.candidateName ? ` for ${preview.candidateName}` : ''}.`}>
        Review it, then accept and confirm it, or decline. Nothing is decided without you. After accepting you can also take
        the profile over and manage it yourself.
      </PageTitle>
      <Card>
        {!codeSentTo ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm">
              To confirm it is you, we will send a code to <strong>{preview.contactHint}</strong>, the {preview.channel === 'email' ? 'email' : 'number'} {manager} entered for
              you. The link expires on {new Date(preview.expiresAt).toLocaleString()}.
            </p>
            {sendCode.isError && <Notice tone="error">{errorMessage(sendCode.error)}</Notice>}
            <Button className="h-11 self-start" disabled={sendCode.isPending} onClick={() => sendCode.mutate()}>
              {sendCode.isPending ? 'Sending…' : 'Send me a code'}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm">
              We sent a 6-digit invitation code to <strong>{codeSentTo}</strong>. It expires in 10 minutes.
            </p>
            <TextField label="Invitation code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(value) => setCode(value.replace(/\D/g, ''))} />
            {(accept.isError || decline.isError) && <Notice tone="error">{errorMessage(accept.error ?? decline.error)}</Notice>}
            <div className="flex flex-wrap gap-3">
              <Button className="h-11" disabled={code.length !== 6 || accept.isPending} onClick={() => (me.data ? accept.mutate() : setWantsToAccept(true))}>
                Accept and confirm
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="h-11" disabled={code.length !== 6 || decline.isPending}>
                    Decline
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Decline this profile?</AlertDialogTitle>
                    <AlertDialogDescription>
                      The profile is taken down and {manager} cannot publish it or invite you again. You do not need an
                      account for this.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={() => decline.mutate()}>
                      Decline
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button variant="ghost" className="h-11" disabled={sendCode.isPending} onClick={() => sendCode.mutate()}>
                Send a new code
              </Button>
            </div>
          </div>
        )}
      </Card>
      {wantsToAccept && !me.data && (
        <Card className="mt-6">
          <h2 className="font-serif text-2xl">Sign in to accept</h2>
          <div className="mt-4">
            <SignIn
              intro="Accepting needs your own account. We will send you a separate sign-in code; if you are new, it also creates your account."
              onSignedIn={() => accept.mutate()}
            />
          </div>
        </Card>
      )}
    </>
  );
}
