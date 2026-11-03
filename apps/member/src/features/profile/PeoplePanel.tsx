/**
 * Guardian-managed profiles (OWNER-DECISIONS section 5). The manager invites the candidate; the
 * candidate confirms, sets what the manager may do, withdraws consent, or takes the profile over.
 */
import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import type { InvitationSent, ProfileView } from '@fh/shared';
import { SelectField, TextField } from '@/components/form/fields';
import { Card, Notice } from '@/components/layout';
import { Confirm } from '@/components/confirm';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ApiError, errorMessage, patch, post } from '@/lib/api';
import { keys, storeProfile, useHealth } from '@/lib/queries';
import { queryClient } from '@/lib/query-client';
import { formatWhen as when } from '@/lib/format';
import { say, useI18n } from '@/lib/i18n';
import { useLabels } from './options';

export function PeoplePanel({ profile }: { profile: ProfileView }) {
  const { t } = useI18n();
  if (profile.me.role === 'manager') return <ManagerSide profile={profile} />;
  if (profile.management === 'manager') return <CandidateSide profile={profile} />;
  return (
    <Card>
      <p>{t('people.selfManaged')}</p>
    </Card>
  );
}

function ManagerSide({ profile }: { profile: ProfileView }) {
  const { candidate, invitation } = profile;
  const { t, rich } = useI18n();
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="font-serif text-2xl">{t('people.candidate.title')}</h2>
        {candidate.joined ? (
          <>
            <p className="mt-2 text-sm">
              {candidate.confirmedAt
                ? t('people.candidate.joinedOn', {
                    name: profile.fields.displayName ?? t('deleteProfile.theCandidate'),
                    date: when(candidate.confirmedAt),
                  })
                : t('people.candidate.joined', { name: profile.fields.displayName ?? t('deleteProfile.theCandidate') })}
            </p>
            {profile.manager && (
              <ul className="mt-4 flex flex-col gap-1 text-sm">
                <li>{t(profile.manager.canEdit ? 'people.perm.edit.yes' : 'people.perm.edit.no')}</li>
                <li>{t(profile.manager.canManageInterests ? 'people.perm.interests.yes' : 'people.perm.interests.no')}</li>
                <li>{t(profile.manager.canViewPrivateDetails ? 'people.perm.details.yes' : 'people.perm.details.no')}</li>
              </ul>
            )}
          </>
        ) : candidate.objectedAt ? (
          <Notice tone="warning" title={t('people.declined.title')}>
            {t('people.declined.body')}
          </Notice>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">{t('people.inviteIntro')}</p>
        )}
        {invitation && !candidate.joined && (
          <p className="mt-4 text-sm">
            {rich(
              invitation.state === 'waiting'
                ? 'people.invitation.waiting'
                : invitation.state === 'expired'
                  ? 'people.invitation.expired'
                  : invitation.state === 'replaced'
                    ? 'people.invitation.replaced'
                    : 'people.invitation.used',
              { strong: (words) => <strong>{words}</strong> },
              { contact: invitation.contact, date: when(invitation.expiresAt) },
            )}
          </p>
        )}
      </Card>
      {!candidate.joined && !candidate.objectedAt && <InviteForm profile={profile} />}
      {candidate.joined && <HandOverCard profile={profile} />}
    </div>
  );
}

/** A manager steps away from a profile whose candidate joined: the candidate runs it alone, as after a takeover. */
function HandOverCard({ profile }: { profile: ProfileView }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const name = profile.fields.displayName ?? t('account.dialog.theCandidate');
  const Name = profile.fields.displayName ?? t('deleteProfile.theCandidate');
  const handOver = useMutation({
    mutationFn: () => post<void>(`/profiles/${profile.id}/hand-over`),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: keys.profile(profile.id) });
      await queryClient.invalidateQueries({ queryKey: keys.profiles });
      navigate('/', { replace: true });
      toast.success(say('handOver.done', { name: Name }));
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <Card>
      <h2 className="font-serif text-2xl">{t('handOver.title')}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t('handOver.body', { name })}</p>
      <Confirm
        trigger={
          <Button variant="outline" className="mt-5 h-11" disabled={handOver.isPending}>
            {t('handOver.button', { name })}
          </Button>
        }
        title={t('handOver.confirm.title', { name })}
        action={t('handOver.confirm.action')}
        onConfirm={() => handOver.mutate()}
      >
        <p>{t('handOver.confirm.access')}</p>
        <p>{t('handOver.confirm.contacts')}</p>
        <p>{t('handOver.confirm.paused', { name })}</p>
        <p>{t('handOver.confirm.told', { name: Name })}</p>
      </Confirm>
    </Card>
  );
}

function InviteForm({ profile }: { profile: ProfileView }) {
  const sms = useHealth().data?.sms ?? false;
  const [channel, setChannel] = useState<'email' | 'phone'>('email');
  const [contact, setContact] = useState('');
  const { t } = useI18n();
  const invite = useMutation({
    mutationFn: () => post<InvitationSent>(`/profiles/${profile.id}/invitations`, { channel, contact }),
    onSuccess: async (sent) => {
      toast.success(say('inviteForm.sent', { contact: sent.contact }));
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
      <h2 className="font-serif text-2xl">{t(profile.invitation ? 'inviteForm.newTitle' : 'inviteForm.title')}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t('inviteForm.body')}</p>
      <form onSubmit={submit} className="mt-5 grid gap-5 sm:grid-cols-2">
        {failure && (
          <div className="sm:col-span-2">
            <Notice tone="error">{failure.fields.contact ?? failure.message}</Notice>
          </div>
        )}
        <SelectField
          label={t('inviteForm.sendBy')}
          value={channel}
          onChange={(next) => next && setChannel(next)}
          options={[
            { value: 'email', label: t('signIn.channel.email') },
            ...(sms ? [{ value: 'phone' as const, label: t('inviteForm.sms') }] : []),
          ]}
          hint={sms ? undefined : t('inviteForm.smsUnavailable')}
        />
        <TextField
          label={t(channel === 'email' ? 'inviteForm.candidateEmail' : 'inviteForm.candidateMobile')}
          type={channel === 'email' ? 'email' : 'tel'}
          value={contact}
          onChange={setContact}
        />
        <div className="sm:col-span-2">
          <Button type="submit" className="h-11" disabled={invite.isPending || !contact.trim()}>
            {invite.isPending ? t('signIn.sending') : t('inviteForm.submit')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function CandidateSide({ profile }: { profile: ProfileView }) {
  const manager = profile.manager;
  const { t } = useI18n();
  const { relationshipLabels } = useLabels();
  const act = useMutation({
    mutationFn: (path: 'take-over' | 'withdraw-consent' | 'restore-consent') => post<ProfileView>(`/profiles/${profile.id}/${path}`),
    onSuccess: async (updated, path) => {
      await storeProfile(updated);
      toast.success(say(path === 'take-over' ? 'people.tookOver' : path === 'withdraw-consent' ? 'people.withdrawn' : 'people.restored'));
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
            {t('people.manager.title', { name: manager.name, relationship: relationshipLabels[manager.relationship].toLowerCase() })}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{t('people.manager.since', { date: when(manager.since) })}</p>
          <ul className="mt-5 flex flex-col gap-4">
            {(
              [
                ['canEdit', t('people.perm.canEdit')],
                ['canManageInterests', t('people.perm.canManageInterests')],
                ['canViewPrivateDetails', t('people.perm.canViewPrivateDetails')],
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
        <h2 className="font-serif text-2xl">{t('consent.title')}</h2>
        {profile.candidate.objectedAt ? (
          <>
            <p className="mt-2 text-sm">{t('consent.objected')}</p>
            <Button className="mt-5 h-11" variant="outline" disabled={act.isPending} onClick={() => act.mutate('restore-consent')}>
              {t('consent.restore')}
            </Button>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted-foreground">{t('consent.body')}</p>
            <Confirm
              trigger={
                <Button className="mt-5 h-11" variant="outline" disabled={act.isPending}>
                  {t('consent.withdraw')}
                </Button>
              }
              title={t('consent.confirm.title')}
              action={t('consent.confirm.action')}
              destructive
              onConfirm={() => act.mutate('withdraw-consent')}
            >
              <p>{t('consent.confirm.body')}</p>
            </Confirm>
          </>
        )}
      </Card>

      {manager && (
        <Card>
          <h2 className="font-serif text-2xl">{t('takeOver.title')}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t('takeOver.body')}</p>
          <Confirm
            trigger={
              <Button className="mt-5 h-11" disabled={act.isPending}>
                {t('takeOver.button')}
              </Button>
            }
            title={t('takeOver.confirm.title')}
            action={t('takeOver.button')}
            onConfirm={() => act.mutate('take-over')}
          >
            <p>{t('takeOver.confirm.access', { name: manager.name })}</p>
            <p>{t('takeOver.confirm.contacts', { name: manager.name })}</p>
            <p>{t('takeOver.confirm.paused')}</p>
          </Confirm>
        </Card>
      )}
    </div>
  );
}
