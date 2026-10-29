/**
 * Guardian-managed profiles (OWNER-DECISIONS section 5). The manager invites the candidate; the
 * candidate confirms, sets what the manager may do, withdraws consent, or takes the profile over.
 */
import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { INVITATION_TTL_HOURS, type InvitationSent, type ProfileView } from '@fh/shared';
import { SelectField, TextField } from '@/components/form/fields';
import { Card, Notice } from '@/components/layout';
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
import { Switch } from '@/components/ui/switch';
import { ApiError, errorMessage, patch, post } from '@/lib/api';
import { keys, storeProfile, useHealth } from '@/lib/queries';
import { queryClient } from '@/lib/query-client';
import { relationshipLabels } from './options';

const when = (value: string | Date) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function PeoplePanel({ profile }: { profile: ProfileView }) {
  if (profile.me.role === 'manager') return <ManagerSide profile={profile} />;
  if (profile.management === 'manager') return <CandidateSide profile={profile} />;
  return (
    <Card>
      <p>You manage this profile yourself.</p>
    </Card>
  );
}

function ManagerSide({ profile }: { profile: ProfileView }) {
  const { candidate, invitation } = profile;
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="font-serif text-2xl">The candidate</h2>
        {candidate.joined ? (
          <>
            <p className="mt-2 text-sm">
              {profile.fields.displayName ?? 'The candidate'} joined and confirmed this profile
              {candidate.confirmedAt ? ` on ${when(candidate.confirmedAt)}` : ''}.
            </p>
            {profile.manager && (
              <ul className="mt-4 flex flex-col gap-1 text-sm">
                <li>{profile.manager.canEdit ? '✓ You may edit the profile' : '✗ You may not edit the profile'}</li>
                <li>{profile.manager.canManageInterests ? '✓ You may manage interests' : '✗ You may not manage interests'}</li>
                <li>
                  {profile.manager.canViewPrivateDetails
                    ? '✓ You may see connections’ shared details'
                    : '✗ You may not see connections’ shared details'}
                </li>
              </ul>
            )}
          </>
        ) : candidate.objectedAt ? (
          <Notice tone="warning" title="The candidate declined">
            They asked for this profile not to be shown. It stays hidden, and no new invitations can be sent.
          </Notice>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Invite the candidate to review the profile. They can accept and confirm it, decline it, or take it over. Until
            they confirm, their details are shared on your word, and their phone shows as “not verified by candidate”.
          </p>
        )}
        {invitation && !candidate.joined && (
          <p className="mt-4 text-sm">
            Latest invitation to <strong>{invitation.contact}</strong>:{' '}
            {invitation.state === 'waiting'
              ? `waiting, link valid until ${when(invitation.expiresAt)}`
              : invitation.state === 'expired'
                ? 'expired'
                : invitation.state === 'replaced'
                  ? 'replaced by a newer one'
                  : 'used'}
            .
          </p>
        )}
      </Card>
      {!candidate.joined && !candidate.objectedAt && <InviteForm profile={profile} />}
    </div>
  );
}

function InviteForm({ profile }: { profile: ProfileView }) {
  const sms = useHealth().data?.sms ?? false;
  const [channel, setChannel] = useState<'email' | 'phone'>('email');
  const [contact, setContact] = useState('');
  const invite = useMutation({
    mutationFn: () => post<InvitationSent>(`/profiles/${profile.id}/invitations`, { channel, contact }),
    onSuccess: async (sent) => {
      toast.success(`Invitation sent to ${sent.contact}.`);
      setContact('');
      await queryClient.invalidateQueries({ queryKey: keys.profile(profile.id) });
    },
  });
  const failure = invite.error instanceof ApiError ? invite.error : null;
  function submit(event: FormEvent) {
    event.preventDefault();
    invite.mutate();
  }
  return (
    <Card>
      <h2 className="font-serif text-2xl">{profile.invitation ? 'Send a new invitation' : 'Invite the candidate'}</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        The link works once and expires in {INVITATION_TTL_HOURS} hours; a new one replaces the old. Use the candidate’s own
        email or phone, not yours. Up to 3 invitations a day.
      </p>
      <form onSubmit={submit} className="mt-5 grid gap-5 sm:grid-cols-2">
        {failure && (
          <div className="sm:col-span-2">
            <Notice tone="error">{failure.fields.contact ?? failure.message}</Notice>
          </div>
        )}
        <SelectField
          label="Send by"
          value={channel}
          onChange={(next) => next && setChannel(next)}
          options={[
            { value: 'email', label: 'Email' },
            ...(sms ? [{ value: 'phone' as const, label: 'SMS' }] : []),
          ]}
          hint={sms ? undefined : 'SMS invitations are not available yet.'}
        />
        <TextField
          label={channel === 'email' ? 'Candidate’s email' : 'Candidate’s mobile number'}
          type={channel === 'email' ? 'email' : 'tel'}
          value={contact}
          onChange={setContact}
        />
        <div className="sm:col-span-2">
          <Button type="submit" className="h-11" disabled={invite.isPending || !contact.trim()}>
            {invite.isPending ? 'Sending…' : 'Send invitation'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Confirm({ trigger, title, children, action, onConfirm, destructive }: { trigger: ReactNode; title: string; children: ReactNode; action: string; onConfirm: () => void; destructive?: boolean }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="flex flex-col gap-2 text-sm">{children}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant={destructive ? 'destructive' : 'default'} onClick={onConfirm}>
            {action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function CandidateSide({ profile }: { profile: ProfileView }) {
  const manager = profile.manager;
  const act = useMutation({
    mutationFn: (path: 'take-over' | 'withdraw-consent' | 'restore-consent') => post<ProfileView>(`/profiles/${profile.id}/${path}`),
    onSuccess: async (updated, path) => {
      await storeProfile(updated);
      toast.success(
        path === 'take-over'
          ? 'You now manage this profile yourself.'
          : path === 'withdraw-consent'
            ? 'The profile is hidden. Only you can change that.'
            : 'Consent restored. The profile stays hidden until it is published again.',
      );
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const permissions = useMutation({
    mutationFn: (change: Partial<Record<'canEdit' | 'canManageInterests' | 'canViewPrivateDetails', boolean>>) =>
      patch<ProfileView>(`/profiles/${profile.id}/manager`, change),
    onSuccess: storeProfile,
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <div className="flex flex-col gap-6">
      {manager && (
        <Card>
          <h2 className="font-serif text-2xl">
            {manager.name} ({relationshipLabels[manager.relationship].toLowerCase()})
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Manages this profile since {when(manager.since)}. Changes take effect immediately.
          </p>
          <ul className="mt-5 flex flex-col gap-4">
            {(
              [
                ['canEdit', 'Edit the profile, photos and contacts'],
                ['canManageInterests', 'Send, accept and decline interests'],
                ['canViewPrivateDetails', 'See the contact details connections share'],
              ] as const
            ).map(([key, label]) => (
              <li key={key} className="flex items-center justify-between gap-4">
                <span className="text-sm">{label}</span>
                <Switch
                  checked={manager[key]}
                  disabled={permissions.isPending}
                  onCheckedChange={(checked) => permissions.mutate({ [key]: checked })}
                  aria-label={label}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="font-serif text-2xl">Your consent</h2>
        {profile.candidate.objectedAt ? (
          <>
            <p className="mt-2 text-sm">You asked for this profile not to be shown. It is hidden.</p>
            <Button className="mt-5 h-11" variant="outline" disabled={act.isPending} onClick={() => act.mutate('restore-consent')}>
              Restore my consent
            </Button>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted-foreground">You can take the profile down at any time; only you can bring it back.</p>
            <Confirm
              trigger={
                <Button className="mt-5 h-11" variant="outline" disabled={act.isPending}>
                  Withdraw my consent
                </Button>
              }
              title="Withdraw your consent?"
              action="Withdraw consent"
              destructive
              onConfirm={() => act.mutate('withdraw-consent')}
            >
              <p>The profile is hidden from other members right away, and your manager cannot publish it again.</p>
            </Confirm>
          </>
        )}
      </Card>

      {manager && (
        <Card>
          <h2 className="font-serif text-2xl">Take over this profile</h2>
          <p className="mt-2 text-sm text-muted-foreground">Manage the profile yourself. There is no fee.</p>
          <Confirm
            trigger={
              <Button className="mt-5 h-11" disabled={act.isPending}>
                Take over
              </Button>
            }
            title="Take over this profile?"
            action="Take over"
            onConfirm={() => act.mutate('take-over')}
          >
            <p>{manager.name} loses all access to this profile immediately, including its interests and contact details.</p>
            <p>Any paid plan stays with the profile until it ends.</p>
            <p>If the profile is published, it pauses until your own identity document is reviewed and your phone verified.</p>
          </Confirm>
        </Card>
      )}
    </div>
  );
}
