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

/** `onOpenPlans`: switches to the profile's Plan tab. */
export function PlanCard({ profile, onOpenPlans }: { profile: ProfileView; onOpenPlans: () => void }) {
  const plan = usePlan(profile.id);
  return (
    <Card>
      <h2 className="font-serif text-2xl">Plan</h2>
      {plan.isPending ? null : plan.isError ? (
        <div className="mt-3">
          <Notice tone="error">{errorMessage(plan.error)}</Notice>
        </div>
      ) : plan.data.active ? (
        <div className="mt-2">
          <PlanSummary usage={plan.data} />
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          No active plan. Publishing and receiving requests are free; a plan lets you send requests, see who is interested
          and accept.
        </p>
      )}
      <Button variant="outline" className="mt-4 h-11" onClick={onOpenPlans}>
        {plan.data?.active ? 'Plans and payments' : 'See plans and prices'}
      </Button>
    </Card>
  );
}

export function EngagedCard({ profile }: { profile: ProfileView }) {
  const plan = usePlan(profile.id);
  const mark = useMutation({
    mutationFn: () => post<ProfileView>(`/profiles/${profile.id}/engaged`, { confirmForfeit: true }),
    onSuccess: async (updated) => {
      await storeProfile(updated);
      await refreshRelations();
      toast.success('Congratulations. The profile is hidden and the plan has ended.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  if (profile.status !== 'published' && profile.status !== 'paused') return null;
  if (!profile.me.canEdit && profile.me.role !== 'candidate') return null;
  return (
    <Card>
      <h2 className="font-serif text-2xl">Found a match?</h2>
      <p className="mt-2 text-sm text-muted-foreground">Marking the profile engaged or married hides it from everyone and ends its plan.</p>
      <Confirm
        title="Mark as engaged or married?"
        action="Yes, mark engaged or married"
        destructive
        onConfirm={() => mark.mutate()}
        trigger={
          <Button variant="outline" className="mt-4 h-11" disabled={mark.isPending}>
            Mark as engaged or married
          </Button>
        }
      >
        <p>The profile is hidden from everyone straight away.</p>
        {plan.data?.active ? (
          <p>
            <strong>The plan ends now. The remaining time until {new Date(plan.data.endsAt!).toLocaleDateString()} is lost and is not refunded.</strong>
          </p>
        ) : (
          <p>There is no active plan to end.</p>
        )}
        <p>Open requests close. Your connections stay on record.</p>
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
  const name = profile.fields.displayName ?? 'this profile';
  if (profile.me.role === 'manager' && profile.candidate.joined) {
    return (
      <Card>
        <h2 className="font-serif text-2xl">Delete this profile</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {profile.fields.displayName ?? 'The candidate'} joined this profile, so only they can delete it. You can hand it over
          to them instead, under “Candidate”.
        </p>
      </Card>
    );
  }
  return (
    <Card>
      <h2 className="font-serif text-2xl">Delete this profile</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Removes {name} for good. {profile.status === 'published' ? 'To stop for a while, pause it instead. ' : ''}Your account
        stays.
      </p>
      <Button variant="outline" className="mt-4 h-11 text-destructive" onClick={() => setOpen(true)}>
        Delete this profile
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
  const remove = useMutation({
    mutationFn: () => post<void>(`/profiles/${profile.id}/delete`, { confirm: true }),
    onSuccess: async () => {
      onClose();
      queryClient.removeQueries({ queryKey: keys.profile(profile.id) });
      await queryClient.invalidateQueries({ queryKey: keys.profiles });
      await refreshRelations();
      navigate('/', { replace: true });
      toast.success('The profile was deleted.');
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
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Delete {profile.fields.displayName ?? 'this profile'}?</DialogTitle>
          <DialogDescription>This cannot be undone. The profile disappears for everyone straight away.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 text-sm">
          {needsSignIn && <RecentSignInNotice />}
          {plan.data?.active && plan.data.endsAt && (
            <Notice tone="warning">
              The plan ends too: the time left until {formatDay(plan.data.endsAt)} is lost and is not refunded.
            </Notice>
          )}
          {manager && <p>{manager.name}, who manages it with you, will be told by email that it was deleted.</p>}
          <RetentionList months={session.data?.retentionMonths ?? RETENTION_MONTHS} />
          {remove.isError && !needsSignIn && <Notice tone="error">{errorMessage(remove.error)}</Notice>}
          <CheckboxField checked={understood} onChange={setUnderstood} label="I understand that this cannot be undone." />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={needsSignIn || !understood || remove.isPending} onClick={() => remove.mutate()}>
            {remove.isPending ? 'Deleting…' : 'Delete the profile'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
