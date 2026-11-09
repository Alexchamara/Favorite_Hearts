/**
 * Connections for one profile (sections 3, 4): what each connection shares, while this profile's plan is
 * active; ending a connection (logged; both sides lose access); and the profiles this profile blocked.
 */
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { ProfileView } from '@fh/shared';
import { Confirm } from '@/components/confirm';
import { Card, Loading, Notice } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Count } from './RequestsPanel';
import { del, errorMessage, post } from '@/lib/api';
import { refreshRelations, useBlocks, useConnections } from '@/lib/queries';
import { ContactList, MemberRow } from '@/features/browse/MemberCard';
import { formatDay } from '@/lib/format';
import { say, useI18n } from '@/lib/i18n';

export function ConnectionsPanel({ profile }: { profile: ProfileView }) {
  const connections = useConnections(profile.id);
  const blocks = useBlocks(profile.id);
  const { t } = useI18n();
  const end = useMutation({
    mutationFn: (id: string) => post(`/connections/${id}/end`),
    onSuccess: async () => {
      toast.success(say('connections.ended'));
      await refreshRelations();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const unblock = useMutation({
    mutationFn: (id: string) => del(`/profiles/${profile.id}/blocks/${id}`),
    onSuccess: async () => {
      toast.success(say('connections.unblocked'));
      await refreshRelations();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Tabs defaultValue="connections" className="gap-5">
      <TabsList className="h-auto w-full justify-start gap-1 p-1">
        <TabsTrigger value="connections" className="min-h-11 flex-none px-5">
          {t('connections.title')}
          {connections.data && <Count value={connections.data.length} />}
        </TabsTrigger>
        <TabsTrigger value="blocked" className="min-h-11 flex-none px-5">
          {t('blocks.title')}
          {blocks.data && <Count value={blocks.data.length} />}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="connections">
      <Card>
        <h2 className="sr-only">{t('connections.title')}</h2>
        {connections.isPending ? (
          <Loading />
        ) : connections.isError ? (
          <Notice tone="error">{errorMessage(connections.error)}</Notice>
        ) : connections.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('connections.none')}</p>
        ) : (
          <ul className="-my-2 divide-y">
            {connections.data.map((item) => {
              const name = item.profile?.displayName ?? t('connections.thisMember');
              return (
                <li key={item.id} className="py-2">
                  <MemberRow card={item.profile} href={item.profile ? `/members/${item.profileId}?as=${profile.id}` : undefined}>
                    <Confirm
                      title={t('connections.end.title', { name })}
                      action={t('connections.end')}
                      destructive
                      onConfirm={() => end.mutate(item.id)}
                      trigger={
                        <Button variant="outline" className="h-10">
                          {t('connections.end')}
                        </Button>
                      }
                    >
                      <p>{t('connections.end.details')}</p>
                      <p>{t('connections.end.cooldown')}</p>
                    </Confirm>
                  </MemberRow>
                  <p className="text-xs text-muted-foreground">{t('connections.since', { date: formatDay(item.acceptedAt) })}</p>
                  {item.contacts ? (
                    <ContactList contacts={item.contacts} />
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t(item.contactsHidden === 'plan_needed' ? 'connections.hidden.plan' : 'connections.hidden.candidate')}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      </TabsContent>

      <TabsContent value="blocked">
      <Card>
        <h2 className="sr-only">{t('blocks.title')}</h2>
        {blocks.isPending ? (
          <Loading />
        ) : blocks.isError ? (
          <Notice tone="error">{errorMessage(blocks.error)}</Notice>
        ) : blocks.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('blocks.none')}</p>
        ) : (
          <ul className="-my-3 divide-y text-sm">
            {blocks.data.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span>
                  {item.displayName ?? t('blocks.aMember')}
                  <span className="block text-xs text-muted-foreground">{t('blocks.since', { date: formatDay(item.blockedAt) })}</span>
                </span>
                <Button variant="outline" className="h-10" disabled={unblock.isPending} onClick={() => unblock.mutate(item.id)}>
                  {t('blocks.unblock')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      </TabsContent>
    </Tabs>
  );
}
