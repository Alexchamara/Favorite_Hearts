/**
 * Cards for the profile overview: the plan, its expiry warning and what is left of its request limits (sections 2, 3);
 * "engaged or married" (section 7), which hides the profile and ends the plan after a clear warning; and deleting the
 * profile (section 8; owner decision 30 Oct 2026: the candidate decides).
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { RETENTION_MONTHS, type ProfileView } from '@fh/shared';
import { Confirm } from '@/components/confirm';
import { CheckboxField } from '@/components/form/fields';
import { Card, Notice } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ApiError, errorMessage, post } from '@/lib/api';
import { formatDay } from '@/lib/format';
import { keys, refreshRelations, storeProfile, useAccountDeletion, usePlan } from '@/lib/queries';
import { queryClient } from '@/lib/query-client';
import { RecentSignInNotice, RetentionList } from '@/features/account/retention';
import { PlanSummary } from '@/features/billing/PlanPanel';
import { say, useI18n } from '@/lib/i18n';

/** `onOpenPlans`: switches to the profile's Plan tab. */
export function PlanCard({ profile, onOpenPlans }: { profile: ProfileView; onOpenPlans: () => void }) {
  const plan = usePlan(profile.id);
  const { t } = useI18n();
  return (
    <Card>
      <h2 className="font-serif text-2xl">{t('profile.tab.plan')}</h2>
      {plan.isPending ? null : plan.isError ? (
        <div className="mt-3">
          <Notice tone="error">{errorMessage(plan.error)}</Notice>
        </div>
      ) : plan.data.active ? (
        <div className="mt-2">
          <PlanSummary usage={plan.data} />
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{t('standing.plan.none')}</p>
      )}
      <Button variant="outline" className="mt-4 h-11" onClick={onOpenPlans}>
        {t(plan.data?.active ? 'standing.plan.manage' : 'standing.plan.see')}
      </Button>
    </Card>
  );
}

export function EngagedCard({ profile }: { profile: ProfileView }) {
  const plan = usePlan(profile.id);
  const { t } = useI18n();
  const mark = useMutation({
    mutationFn: () => post<ProfileView>(`/profiles/${profile.id}/engaged`, { confirmForfeit: true }),
    onSuccess: async (updated) => {
      await storeProfile(updated);
      await refreshRelations();
      toast.success(say('engaged.done'));
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  if (profile.status !== 'published' && profile.status !== 'paused') return null;
  if (!profile.me.canEdit && profile.me.role !== 'candidate') return null;
  return (
    <Card>
      <h2 className="font-serif text-2xl">{t('engaged.title')}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t('engaged.body')}</p>
      <Confirm
        title={t('engaged.confirm.title')}
        action={t('engaged.confirm.action')}
        destructive
        onConfirm={() => mark.mutate()}
        trigger={
          <Button variant="outline" className="mt-4 h-11" disabled={mark.isPending}>
            {t('engaged.button')}
          </Button>
        }
      >
        <p>{t('engaged.confirm.hidden')}</p>
        {plan.data?.active ? (
          <p>
            <strong>{t('engaged.confirm.planEnds', { date: formatDay(plan.data.endsAt!) })}</strong>
          </p>
        ) : (
          <p>{t('engaged.confirm.noPlan')}</p>
        )}
        <p>{t('engaged.confirm.requests')}</p>
      </Confirm>
    </Card>
  );
}

/**
 * The candidate may always delete the profile; a manager only while no candidate has joined it. A manager of a joined
 * candidate is pointed to the hand-over instead (Candidate tab).
 */
export function DeleteProfileCard({ profile }: { profile: ProfileView }) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  const name = profile.fields.displayName ?? t('deleteProfile.thisProfile');
  if (profile.me.role === 'manager' && profile.candidate.joined) {
    return (
      <Card>
        <h2 className="font-serif text-2xl">{t('deleteProfile.title')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t('deleteProfile.candidateDecides', {
            name: profile.fields.displayName ?? t('deleteProfile.theCandidate'),
            tab: t('profile.tab.candidate'),
          })}
        </p>
      </Card>
    );
  }
  return (
    <Card>
      <h2 className="font-serif text-2xl">{t('deleteProfile.title')}</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {t(profile.status === 'published' ? 'deleteProfile.removesPublished' : 'deleteProfile.removes', { name })}
      </p>
      <Button variant="outline" className="mt-4 h-11 text-destructive" onClick={() => setOpen(true)}>
        {t('deleteProfile.title')}
      </Button>
      <DeleteProfileDialog profile={profile} open={open} onClose={() => setOpen(false)} />
    </Card>
  );
}

function DeleteProfileDialog({ profile, open, onClose }: { profile: ProfileView; open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const plan = usePlan(profile.id);
  const session = useAccountDeletion(open);
  const [understood, setUnderstood] = useState(false);
  const { t } = useI18n();
  const remove = useMutation({
    mutationFn: () => post<void>(`/profiles/${profile.id}/delete`, { confirm: true }),
    onSuccess: async () => {
      onClose();
      queryClient.removeQueries({ queryKey: keys.profile(profile.id) });
      await queryClient.invalidateQueries({ queryKey: keys.profiles });
      await refreshRelations();
      navigate('/', { replace: true });
      toast.success(say('deleteProfile.deleted'));
    },
  });
  const needsSignIn =
    session.data?.recentSignIn === false || (remove.error instanceof ApiError && remove.error.code === 'RECENT_SIGN_IN_REQUIRED');
  const close = () => {
    onClose();
    setUnderstood(false);
    remove.reset();
  };
  const manager = profile.me.role === 'candidate' && profile.management === 'manager' ? profile.manager : null;
  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('deleteProfile.dialog.title', { name: profile.fields.displayName ?? t('deleteProfile.thisProfile') })}</DialogTitle>
          <DialogDescription>{t('deleteProfile.dialog.body')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 text-sm">
          {needsSignIn && <RecentSignInNotice />}
          {plan.data?.active && plan.data.endsAt && (
            <Notice tone="warning">{t('deleteProfile.dialog.planEnds', { date: formatDay(plan.data.endsAt) })}</Notice>
          )}
          {manager && <p>{t('deleteProfile.dialog.managerTold', { name: manager.name })}</p>}
          <RetentionList months={session.data?.retentionMonths ?? RETENTION_MONTHS} />
          {remove.isError && !needsSignIn && <Notice tone="error">{errorMessage(remove.error)}</Notice>}
          <CheckboxField checked={understood} onChange={setUnderstood} label={t('account.dialog.understand')} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" disabled={needsSignIn || !understood || remove.isPending} onClick={() => remove.mutate()}>
            {remove.isPending ? t('account.dialog.deleting') : t('deleteProfile.dialog.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
