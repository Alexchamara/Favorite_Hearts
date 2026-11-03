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
import { useLabels } from '@/features/profile/options';
import { MemberRow } from '@/features/browse/MemberCard';
import { formatDay as day } from '@/lib/format';
import { say, useI18n } from '@/lib/i18n';

export function RequestsPanel({ profile }: { profile: ProfileView }) {
  const canAct = profile.me.canManageInterests;
  const received = useReceived(profile.id);
  const sent = useSent(profile.id);
  const { t } = useI18n();
  const { interestStatusLabels } = useLabels();
  const act = useMutation({
    mutationFn: (path: string) => post(path),
    onSuccess: refreshRelations,
    onError: (error) => toast.error(errorMessage(error)),
  });
  const memberLink = (id: string) => `/members/${id}?as=${profile.id}`;

  return (
    <div className="flex flex-col gap-6">
      {!canAct && <Notice>{t('requests.cannotManage')}</Notice>}
      <Card>
        <h2 className="font-serif text-2xl">{t('requests.received')}</h2>
        {received.isPending ? (
          <Loading />
        ) : received.isError ? (
          <Notice tone="error">{errorMessage(received.error)}</Notice>
        ) : !received.data.identified ? (
          <>
            <div className="mt-3">
              <Notice title={t('requests.planShows.title')}>{t('requests.planShows.body')}</Notice>
            </div>
            {received.data.previews.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">{t('requests.none')}</p>
            ) : (
              <ul className="mt-3 divide-y text-sm">
                {received.data.previews.map((preview) => (
                  <li key={preview.id} className="py-3">
                    {t(
                      preview.senderAge !== null && preview.senderOccupation
                        ? 'requests.preview.full'
                        : preview.senderAge !== null
                          ? 'requests.preview.age'
                          : preview.senderOccupation
                            ? 'requests.preview.occupation'
                            : 'requests.preview.plain',
                      { age: preview.senderAge ?? '', occupation: preview.senderOccupation ?? '', date: day(preview.receivedAt) },
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : received.data.interests.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t('requests.noneWaiting')}</p>
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
                        onClick={() => act.mutate(`/interests/${item.id}/accept`, { onSuccess: () => toast.success(say('requests.accepted')) })}
                      >
                        {t('requests.accept')}
                      </Button>
                      <Button variant="outline" className="h-10" disabled={act.isPending} onClick={() => act.mutate(`/interests/${item.id}/decline`)}>
                        {t('requests.decline')}
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
        <h2 className="font-serif text-2xl">{t('requests.sent')}</h2>
        {sent.isPending ? (
          <Loading />
        ) : sent.isError ? (
          <Notice tone="error">{errorMessage(sent.error)}</Notice>
        ) : sent.data.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t('requests.noneSent')}</p>
        ) : (
          <ul className="mt-2 divide-y">
            {sent.data.map((item) => (
              <li key={item.id}>
                <MemberRow card={item.receiver} href={item.receiver ? memberLink(item.receiver.id) : undefined}>
                  <span className="text-sm">
                    {interestStatusLabels[item.status]}
                    {item.cooldownUntil && new Date(item.cooldownUntil) > new Date() && (
                      <span className="block text-xs text-muted-foreground">{t('requests.cooldown', { date: day(item.cooldownUntil) })}</span>
                    )}
                  </span>
                  {item.status === 'pending' && canAct && (
                    <Button variant="outline" className="h-10" disabled={act.isPending} onClick={() => act.mutate(`/interests/${item.id}/withdraw`)}>
                      {t('requests.withdraw')}
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
