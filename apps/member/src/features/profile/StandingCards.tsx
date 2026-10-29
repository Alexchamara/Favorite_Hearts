/**
 * Two cards for the profile overview: the plan and what is left of its request limits (section 2), and
 * "engaged or married" (section 7), which hides the profile and ends the plan after a clear warning.
 */
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { ProfileView } from '@fh/shared';
import { Confirm } from '@/components/confirm';
import { Card, Notice } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { errorMessage, post } from '@/lib/api';
import { refreshRelations, storeProfile, usePlan } from '@/lib/queries';

const planNames: Record<string, string> = { starter_1m: 'Starter', premium_3m: 'Premium, 3 months', premium_6m: 'Premium, 6 months' };

export function PlanCard({ profile }: { profile: ProfileView }) {
  const plan = usePlan(profile.id);
  return (
    <Card>
      <h2 className="font-serif text-2xl">Plan</h2>
      {plan.isPending ? null : plan.isError ? (
        <div className="mt-3">
          <Notice tone="error">{errorMessage(plan.error)}</Notice>
        </div>
      ) : plan.data.active ? (
        <div className="mt-2 text-sm">
          <p>
            {planNames[plan.data.planId ?? ''] ?? 'Active plan'}, until {new Date(plan.data.endsAt!).toLocaleDateString()}.
          </p>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            {plan.data.daily && (
              <div>
                <dt className="text-xs font-semibold text-muted-foreground uppercase">Requests today</dt>
                <dd>
                  {plan.data.daily.used} of {plan.data.daily.cap}
                </dd>
              </div>
            )}
            {plan.data.monthly && (
              <div>
                <dt className="text-xs font-semibold text-muted-foreground uppercase">This month of your plan</dt>
                <dd>
                  {plan.data.monthly.used} of {plan.data.monthly.cap}
                </dd>
              </div>
            )}
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">A new day starts at midnight, Sri Lanka time.</p>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          No active plan. Publishing and receiving requests are free; a plan lets you send requests, see who is interested
          and accept. Buying a plan opens in a later update.
        </p>
      )}
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
