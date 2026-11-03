/**
 * The account itself (OWNER-DECISIONS section 8): download everything it holds, or delete it. Before deleting, the
 * member sees what happens to each profile (owner decision 30 Oct 2026: the candidate decides), what goes now and
 * what is kept, and for how long. Deleting needs a recent sign-in.
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import type { AccountDeletionResult } from '@fh/shared';
import { CheckboxField } from '@/components/form/fields';
import { Card, Loading, Notice } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ApiError, download, errorMessage, post } from '@/lib/api';
import { formatDay } from '@/lib/format';
import { say, useI18n } from '@/lib/i18n';
import { resetSession, useAccountDeletion } from '@/lib/queries';
import { RecentSignInNotice, RetentionList } from './retention';

export function AccountCard() {
  const [deleting, setDeleting] = useState(false);
  const { t } = useI18n();
  const exportData = useMutation({
    mutationFn: () => download('/account/export', 'favorite-hearts-data.zip'),
    onSuccess: () => toast.success(say('account.downloadStarted')),
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <Card className="mt-6">
      <h2 className="font-serif text-2xl">{t('account.title')}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t('account.body')}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button variant="outline" className="h-11" disabled={exportData.isPending} onClick={() => exportData.mutate()}>
          {exportData.isPending ? t('account.preparing') : t('account.download')}
        </Button>
        <Button variant="outline" className="h-11 text-destructive" onClick={() => setDeleting(true)}>
          {t('account.delete')}
        </Button>
      </div>
      <DeleteAccountDialog open={deleting} onClose={() => setDeleting(false)} />
    </Card>
  );
}

function DeleteAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const preview = useAccountDeletion(open);
  const [understood, setUnderstood] = useState(false);
  const { t, rich } = useI18n();
  const remove = useMutation({
    mutationFn: () => post<AccountDeletionResult>('/account/delete', { confirm: true }),
    onSuccess: async () => {
      onClose();
      await resetSession();
      navigate('/', { replace: true });
      toast.success(say('account.deleted'));
    },
  });
  const needsSignIn =
    preview.data?.recentSignIn === false || (remove.error instanceof ApiError && remove.error.code === 'RECENT_SIGN_IN_REQUIRED');
  const close = () => {
    onClose();
    setUnderstood(false);
    remove.reset();
  };
  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('account.dialog.title')}</DialogTitle>
          <DialogDescription>{t('account.dialog.body')}</DialogDescription>
        </DialogHeader>
        {preview.isPending ? (
          <Loading />
        ) : preview.isError ? (
          <Notice tone="error">{errorMessage(preview.error)}</Notice>
        ) : (
          <div className="flex flex-col gap-4 text-sm">
            {needsSignIn && <RecentSignInNotice />}
            <section>
              <h3 className="font-semibold text-foreground">{t('account.dialog.profiles')}</h3>
              {preview.data.profiles.length === 0 ? (
                <p className="mt-1 text-muted-foreground">{t('account.dialog.noProfiles')}</p>
              ) : (
                <ul className="mt-1 flex flex-col gap-2">
                  {preview.data.profiles.map((p) => (
                    <li key={p.profileId}>
                      {rich(
                        p.outcome === 'handed_over' ? 'account.dialog.handedOver' : 'account.dialog.deletedNow',
                        { strong: (words) => <strong>{words}</strong> },
                        { name: p.displayName ?? t('card.untitled'), candidate: p.candidateName ?? t('account.dialog.theCandidate') },
                      )}
                      {p.outcome === 'deleted' && p.planActive && p.planEndsAt
                        ? ` ${t('account.dialog.planLost', { date: formatDay(p.planEndsAt) })}`
                        : ''}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {preview.data.paymentsUnderReview > 0 && (
              <Notice tone="warning">{t('account.dialog.paymentUnderReview')}</Notice>
            )}
            <RetentionList months={preview.data.retentionMonths} account />
            {remove.isError && !needsSignIn && <Notice tone="error">{errorMessage(remove.error)}</Notice>}
            <CheckboxField checked={understood} onChange={setUnderstood} label={t('account.dialog.understand')} />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" disabled={!preview.data || needsSignIn || !understood || remove.isPending} onClick={() => remove.mutate()}>
            {remove.isPending ? t('account.dialog.deleting') : t('account.delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
