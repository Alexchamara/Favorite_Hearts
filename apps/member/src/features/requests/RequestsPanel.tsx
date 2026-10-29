/**
 * Requests for one profile (sections 1, 2, 4). Received: without a plan, previews only (the server never sends
 * who it was); with a plan, who sent it, with Accept and Decline. Sent: status, withdraw, and the 7-day wait.
 */
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { ProfileView } from '@fh/shared';
import { Card, Loading, Notice } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { errorMessage, post } from '@/lib/api';
import { refreshRelations, useReceived, useSent } from '@/lib/queries';
import { interestStatusLabels } from '@/features/profile/options';
import { MemberRow } from '@/features/browse/MemberCard';

const day = (value: string | Date) => new Date(value).toLocaleDateString();

export function RequestsPanel({ profile }: { profile: ProfileView }) {
  const canAct = profile.me.canManageInterests;
  const received = useReceived(profile.id);
  const sent = useSent(profile.id);
  const act = useMutation({
    mutationFn: (path: string) => post(path),
    onSuccess: refreshRelations,
    onError: (error) => toast.error(errorMessage(error)),
  });
  const memberLink = (id: string) => `/members/${id}?as=${profile.id}`;

  return (
    <div className="flex flex-col gap-6">
      {!canAct && <Notice>The candidate has not allowed you to manage requests for this profile. You can still see them.</Notice>}
      <Card>
        <h2 className="font-serif text-2xl">Received</h2>
        {received.isPending ? (
          <Loading />
        ) : received.isError ? (
          <Notice tone="error">{errorMessage(received.error)}</Notice>
        ) : !received.data.identified ? (
          <>
            <div className="mt-3">
              <Notice title="A plan shows who sent them">
                With a plan you see who is interested and can accept. Buying a plan opens in a later update.
              </Notice>
            </div>
            {received.data.previews.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No requests yet.</p>
            ) : (
              <ul className="mt-3 divide-y text-sm">
                {received.data.previews.map((preview) => (
                  <li key={preview.id} className="py-3">
                    Someone{preview.senderAge !== null && `, ${preview.senderAge}`}
                    {preview.senderOccupation && `, ${preview.senderOccupation}`}, sent a request on {day(preview.receivedAt)}.
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : received.data.interests.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No requests waiting.</p>
        ) : (
          <ul className="mt-2 divide-y">
            {received.data.interests.map((item) => (
              <li key={item.id}>
                <MemberRow card={item.sender} href={item.sender ? memberLink(item.sender.id) : undefined}>
                  {canAct && (
                    <>
                      <Button
                        className="h-10"
                        disabled={act.isPending}
                        onClick={() => act.mutate(`/interests/${item.id}/accept`, { onSuccess: () => toast.success('Accepted. You are now connected.') })}
                      >
                        Accept
                      </Button>
                      <Button variant="outline" className="h-10" disabled={act.isPending} onClick={() => act.mutate(`/interests/${item.id}/decline`)}>
                        Decline
                      </Button>
                    </>
                  )}
                </MemberRow>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="font-serif text-2xl">Sent</h2>
        {sent.isPending ? (
          <Loading />
        ) : sent.isError ? (
          <Notice tone="error">{errorMessage(sent.error)}</Notice>
        ) : sent.data.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">You have not sent any requests yet.</p>
        ) : (
          <ul className="mt-2 divide-y">
            {sent.data.map((item) => (
              <li key={item.id}>
                <MemberRow card={item.receiver} href={item.receiver ? memberLink(item.receiver.id) : undefined}>
                  <span className="text-sm">
                    {interestStatusLabels[item.status]}
                    {item.cooldownUntil && new Date(item.cooldownUntil) > new Date() && (
                      <span className="block text-xs text-muted-foreground">New request possible from {day(item.cooldownUntil)}</span>
                    )}
                  </span>
                  {item.status === 'pending' && canAct && (
                    <Button variant="outline" className="h-10" disabled={act.isPending} onClick={() => act.mutate(`/interests/${item.id}/withdraw`)}>
                      Withdraw
                    </Button>
                  )}
                </MemberRow>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
