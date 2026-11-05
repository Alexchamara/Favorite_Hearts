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
import { useBotCheck } from '@/components/turnstile';
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
import { useLabels } from '@/features/profile/options';
import { formatWhen } from '@/lib/format';
import { say, useI18n } from '@/lib/i18n';

export default function InvitePage() {
  const token = useLocation().hash.slice(1);
  const preview = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => post<InvitationPreview>('/invitations/preview', { token }),
    enabled: token.length > 0,
    retry: false,
  });
  const { t, rich } = useI18n();
  return (
    <AppShell>
      {!token ? (
        <>
          <PageTitle title={t('invite.unusable.title')} />
          <Notice tone="error">{t('invite.incomplete')}</Notice>
        </>
      ) : preview.isPending ? (
        <Loading />
      ) : preview.isError ? (
        <>
          <PageTitle title={t('invite.unusable.title')} />
          <Notice tone="warning">{errorMessage(preview.error)}</Notice>
          <p className="mt-4 text-sm text-muted-foreground">
            {rich('invite.unusable.help', {
              link: (words) => (
                <Link to="/" className="text-brand underline underline-offset-4">
                  {words}
                </Link>
              ),
            })}
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
  const { t, rich } = useI18n();
  const { relationshipLabels } = useLabels();
  const manager = preview.managerName ?? t('invite.someone');
  const who = preview.relationship
    ? t('invite.who', { manager, relationship: relationshipLabels[preview.relationship].toLowerCase() })
    : manager;

  const bot = useBotCheck();
  const sendCode = useMutation({
    mutationFn: () => post<{ contactHint: string }>('/invitations/code', { token }, bot.headers),
    onSuccess: (sent) => setCodeSentTo(sent.contactHint),
    onSettled: () => bot.reset(),
  });
  const accept = useMutation({
    mutationFn: () => post<{ profileId: string }>('/invitations/accept', { token, code }),
    onSuccess: async ({ profileId }) => {
      toast.success(say('invite.confirmed'));
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
        <PageTitle title={t('invite.declined.title')} />
        <Notice title={t('invite.declined.notice.title')}>{t('invite.declined.notice.body', { manager })}</Notice>
      </>
    );
  }

  return (
    <>
      <PageTitle
        kicker={t('invite.kicker')}
        title={preview.candidateName ? t('invite.titleFor', { who, candidate: preview.candidateName }) : t('invite.title', { who })}
      >
        {t('invite.intro')}
      </PageTitle>
      <Card>
        {!codeSentTo ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm">
              {rich(
                preview.channel === 'email' ? 'invite.codeWillGo.email' : 'invite.codeWillGo.sms',
                { strong: (words) => <strong>{words}</strong> },
                { contact: preview.contactHint, manager, expires: formatWhen(preview.expiresAt) },
              )}
            </p>
            {sendCode.isError && <Notice tone="error">{errorMessage(sendCode.error)}</Notice>}
            {bot.widget}
            <Button className="h-11 self-start" disabled={sendCode.isPending || !bot.ready} onClick={() => sendCode.mutate()}>
              {sendCode.isPending ? t('signIn.sending') : t('signIn.send')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm">{rich('invite.codeSent', { strong: (words) => <strong>{words}</strong> }, { contact: codeSentTo })}</p>
            <TextField label={t('invite.codeLabel')} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(value) => setCode(value.replace(/\D/g, ''))} />
            {(accept.isError || decline.isError) && <Notice tone="error">{errorMessage(accept.error ?? decline.error)}</Notice>}
            <div className="flex flex-wrap gap-3">
              <Button className="h-11" disabled={code.length !== 6 || accept.isPending} onClick={() => (me.data ? accept.mutate() : setWantsToAccept(true))}>
                {t('invite.accept')}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="h-11" disabled={code.length !== 6 || decline.isPending}>
                    {t('invite.decline')}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('invite.declineDialog.title')}</AlertDialogTitle>
                    <AlertDialogDescription>{t('invite.declineDialog.body', { manager })}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={() => decline.mutate()}>
                      {t('invite.decline')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button variant="ghost" className="h-11" disabled={sendCode.isPending || !bot.ready} onClick={() => sendCode.mutate()}>
                {t('signIn.resend')}
              </Button>
            </div>
            {bot.widget}
          </div>
        )}
      </Card>
      {wantsToAccept && !me.data && (
        <Card className="mt-6">
          <h2 className="font-serif text-2xl">{t('invite.signInTitle')}</h2>
          <div className="mt-4">
            <SignIn
              intro={t('invite.signInIntro')}
              onSignedIn={() => accept.mutate()}
            />
          </div>
        </Card>
      )}
    </>
  );
}
