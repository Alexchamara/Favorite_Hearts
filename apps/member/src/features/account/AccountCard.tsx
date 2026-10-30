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
import { resetSession, useAccountDeletion } from '@/lib/queries';
import { RecentSignInNotice, RetentionList } from './retention';

export function AccountCard() {
  const [deleting, setDeleting] = useState(false);
  const exportData = useMutation({
    mutationFn: () => download('/account/export', 'favorite-hearts-data.zip'),
    onSuccess: () => toast.success('Your data is downloading as a ZIP file.'),
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <Card className="mt-6">
      <h2 className="font-serif text-2xl">Your account</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Download a copy of everything your account holds: profiles, contact details, photos, requests, connections and
        payments. Or delete the account.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button variant="outline" className="h-11" disabled={exportData.isPending} onClick={() => exportData.mutate()}>
          {exportData.isPending ? 'Preparing your file…' : 'Download my data'}
        </Button>
        <Button variant="outline" className="h-11 text-destructive" onClick={() => setDeleting(true)}>
          Delete my account
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
  const remove = useMutation({
    mutationFn: () => post<AccountDeletionResult>('/account/delete', { confirm: true }),
    onSuccess: async () => {
      onClose();
      await resetSession();
      navigate('/', { replace: true });
      toast.success('Your account has been deleted.');
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
          <DialogTitle>Delete your account?</DialogTitle>
          <DialogDescription>This cannot be undone. Here is exactly what happens.</DialogDescription>
        </DialogHeader>
        {preview.isPending ? (
          <Loading />
        ) : preview.isError ? (
          <Notice tone="error">{errorMessage(preview.error)}</Notice>
        ) : (
          <div className="flex flex-col gap-4 text-sm">
            {needsSignIn && <RecentSignInNotice />}
            <section>
              <h3 className="font-semibold text-foreground">Your profiles</h3>
              {preview.data.profiles.length === 0 ? (
                <p className="mt-1 text-muted-foreground">You have no profiles.</p>
              ) : (
                <ul className="mt-1 flex flex-col gap-2">
                  {preview.data.profiles.map((p) => (
                    <li key={p.profileId}>
                      <strong>{p.displayName ?? 'Untitled profile'}</strong>
                      {p.outcome === 'handed_over'
                        ? ` passes to ${p.candidateName ?? 'the candidate'}, who joined it. They run it alone from now on, and its plan stays with it.`
                        : ' is deleted now.'}
                      {p.outcome === 'deleted' && p.planActive && p.planEndsAt
                        ? ` Its plan ends too: the time left until ${formatDay(p.planEndsAt)} is lost and is not refunded.`
                        : ''}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {preview.data.paymentsUnderReview > 0 && (
              <Notice tone="warning">
                A payment you sent is still being checked. It stays with us as a payment record. If you want to ask about it,
                contact us before you delete.
              </Notice>
            )}
            <RetentionList months={preview.data.retentionMonths} account />
            {remove.isError && !needsSignIn && <Notice tone="error">{errorMessage(remove.error)}</Notice>}
            <CheckboxField checked={understood} onChange={setUnderstood} label="I understand that this cannot be undone." />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={!preview.data || needsSignIn || !understood || remove.isPending} onClick={() => remove.mutate()}>
            {remove.isPending ? 'Deleting…' : 'Delete my account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
