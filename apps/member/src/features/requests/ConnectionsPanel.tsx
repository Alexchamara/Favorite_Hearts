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
import { del, errorMessage, post } from '@/lib/api';
import { refreshRelations, useBlocks, useConnections } from '@/lib/queries';
import { ContactList, MemberRow } from '@/features/browse/MemberCard';

export function ConnectionsPanel({ profile }: { profile: ProfileView }) {
  const connections = useConnections(profile.id);
  const blocks = useBlocks(profile.id);
  const end = useMutation({
    mutationFn: (id: string) => post(`/connections/${id}/end`),
    onSuccess: async () => {
      toast.success('Connection ended.');
      await refreshRelations();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const unblock = useMutation({
    mutationFn: (id: string) => del(`/profiles/${profile.id}/blocks/${id}`),
    onSuccess: async () => {
      toast.success('Unblocked. You can see each other again.');
      await refreshRelations();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="font-serif text-2xl">Connections</h2>
        {connections.isPending ? (
          <Loading />
        ) : connections.isError ? (
          <Notice tone="error">{errorMessage(connections.error)}</Notice>
        ) : connections.data.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No connections yet. A connection starts when both sides accept.</p>
        ) : (
          <ul className="mt-2 divide-y">
            {connections.data.map((item) => {
              const name = item.profile?.displayName ?? 'this member';
              return (
                <li key={item.id} className="py-2">
                  <MemberRow card={item.profile} href={item.profile ? `/members/${item.profileId}?as=${profile.id}` : undefined}>
                    <Confirm
                      title={`End the connection with ${name}?`}
                      action="End connection"
                      destructive
                      onConfirm={() => end.mutate(item.id)}
                      trigger={
                        <Button variant="outline" className="h-10">
                          End connection
                        </Button>
                      }
                    >
                      <p>From now on neither of you sees the other’s contact details or unblurred photos.</p>
                      <p>A new request between you can be sent after 7 days.</p>
                    </Confirm>
                  </MemberRow>
                  <p className="text-xs text-muted-foreground">Connected since {new Date(item.acceptedAt).toLocaleDateString()}</p>
                  {item.contacts ? (
                    <ContactList contacts={item.contacts} />
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {item.contactsHidden === 'plan_needed'
                        ? 'This profile’s plan has ended, so contact details are hidden. They come back on renewal.'
                        : 'The candidate has not allowed you to see the contact details connections share.'}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="font-serif text-2xl">Blocked</h2>
        {blocks.isPending ? (
          <Loading />
        ) : blocks.isError ? (
          <Notice tone="error">{errorMessage(blocks.error)}</Notice>
        ) : blocks.data.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">You have not blocked anyone.</p>
        ) : (
          <ul className="mt-2 divide-y text-sm">
            {blocks.data.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span>
                  {item.displayName ?? 'A member'}
                  <span className="block text-xs text-muted-foreground">Blocked on {new Date(item.blockedAt).toLocaleDateString()}</span>
                </span>
                <Button variant="outline" className="h-10" disabled={unblock.isPending} onClick={() => unblock.mutate(item.id)}>
                  Unblock
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
