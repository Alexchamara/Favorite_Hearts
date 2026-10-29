/**
 * One profile, for the people who operate it: overview and publishing, the details editor,
 * private contacts, and the manager/candidate panel for guardian-managed profiles.
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import type { ProfileView } from '@fh/shared';
import { TrustBadges } from '@/components/badges';
import { AppShell, Card, Loading, Notice, PageTitle } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ApiError, errorMessage, post } from '@/lib/api';
import { storeProfile, useProfile } from '@/lib/queries';
import { ContactsPanel } from './ContactsPanel';
import { DetailsForm } from './DetailsForm';
import { caseStatusLabels, fieldLabels, relationshipLabels, statusLabels } from './options';
import { PeoplePanel } from './PeoplePanel';

export default function ProfilePage() {
  const { id = '' } = useParams();
  const profile = useProfile(id);
  return (
    <AppShell>
      <Link to="/" className="text-sm text-muted-foreground underline underline-offset-4">
        ← Your profiles
      </Link>
      <div className="mt-6">
        {profile.isPending ? (
          <Loading />
        ) : profile.isError ? (
          <Notice tone="error">{errorMessage(profile.error)}</Notice>
        ) : (
          <ProfileScreen profile={profile.data} />
        )}
      </div>
    </AppShell>
  );
}

function roleLine(profile: ProfileView): string {
  if (profile.me.role === 'manager') return 'You manage this profile';
  if (profile.management === 'manager' && profile.manager) {
    return `Managed by ${profile.manager.name} (${relationshipLabels[profile.manager.relationship].toLowerCase()})`;
  }
  return 'Your own profile';
}

function ProfileScreen({ profile }: { profile: ProfileView }) {
  const showPeople = profile.management === 'manager';
  const [tab, setTab] = useState('overview');
  // After a takeover the profile is self-managed and the "people" tab is gone.
  const current = tab === 'people' && !showPeople ? 'overview' : tab;
  return (
    <>
      <PageTitle kicker={roleLine(profile)} title={profile.fields.displayName ?? 'Untitled profile'}>
        <span className="inline-flex rounded-full border px-3 py-1 text-xs font-semibold text-foreground">{statusLabels[profile.status]}</span>
      </PageTitle>
      <Tabs value={current} onValueChange={setTab} className="gap-6">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-[var(--ui-soft)] p-1">
          <TabsTrigger value="overview" className="min-h-10 flex-none px-4">
            Overview
          </TabsTrigger>
          <TabsTrigger value="details" className="min-h-10 flex-none px-4">
            Details
          </TabsTrigger>
          <TabsTrigger value="contacts" className="min-h-10 flex-none px-4">
            Contacts
          </TabsTrigger>
          {showPeople && (
            <TabsTrigger value="people" className="min-h-10 flex-none px-4">
              {profile.me.role === 'manager' ? 'Candidate' : 'Manager and consent'}
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="overview">
          <Overview profile={profile} />
        </TabsContent>
        <TabsContent value="details">
          <DetailsForm profile={profile} />
        </TabsContent>
        <TabsContent value="contacts">
          <ContactsPanel profile={profile} />
        </TabsContent>
        {showPeople && (
          <TabsContent value="people">
            <PeoplePanel profile={profile} />
          </TabsContent>
        )}
      </Tabs>
    </>
  );
}

function Overview({ profile }: { profile: ProfileView }) {
  const publish = useMutation({
    mutationFn: () => post<ProfileView>(`/profiles/${profile.id}/publish`),
    onSuccess: async (updated) => {
      await storeProfile(updated);
      toast.success('Published. Members can now find this profile.');
    },
  });
  const pause = useMutation({
    mutationFn: () => post<ProfileView>(`/profiles/${profile.id}/pause`),
    onSuccess: async (updated) => {
      await storeProfile(updated);
      toast.success('Paused. The profile is hidden from other members.');
    },
  });
  const publisher = profile.publisher;
  const publishError = publish.error instanceof ApiError ? publish.error : null;

  return (
    <div className="flex flex-col gap-6">
      {profile.candidate.objectedAt && (
        <Notice tone="warning" title="The candidate asked for this profile not to be shown">
          {profile.me.role === 'candidate'
            ? 'It stays hidden. You can lift this under “Manager and consent”, then publish when you are ready.'
            : 'Only the candidate can change that. The profile stays hidden.'}
        </Notice>
      )}
      {!profile.me.canEdit && (
        <Notice title="You cannot edit this profile">
          {profile.me.role === 'candidate'
            ? 'Your manager edits it. You can take it over under “Manager and consent” to manage it yourself.'
            : 'The candidate has not allowed you to edit it.'}
        </Notice>
      )}

      <Card>
        <h2 className="font-serif text-2xl">Badges</h2>
        <div className="mt-4">
          <TrustBadges badges={profile.badges} explain />
        </div>
      </Card>

      <Card>
        <h2 className="font-serif text-2xl">Publishing</h2>
        {profile.status === 'published' ? (
          <p className="mt-2 text-sm text-muted-foreground">This profile is visible to signed-in members.</p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Publishing is free. It needs a complete profile, plus {publisher?.isMe ? 'your' : 'the manager’s'} identity
            document reviewed and phone verified by SMS.
          </p>
        )}
        {profile.missing.length > 0 && profile.status !== 'published' && (
          <div className="mt-4">
            <p className="text-sm font-semibold">Still needed</p>
            <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
              {profile.missing.map((key) => (
                <li key={key}>{fieldLabels[key] ?? key}</li>
              ))}
            </ul>
          </div>
        )}
        {publisher?.isMe && (!publisher.phoneVerified || publisher.documentStatus !== 'approved') && (
          <p className="mt-4 text-sm">
            Your verification: phone {publisher.phoneVerified ? 'verified' : 'not verified'}, identity document{' '}
            {publisher.documentStatus && publisher.documentStatus !== 'none' ? caseStatusLabels[publisher.documentStatus].toLowerCase() : 'not submitted'}.{' '}
            <Link to="/verify" className="text-brand underline underline-offset-4">
              Go to verification
            </Link>
          </p>
        )}
        {publishError && (
          <div className="mt-4">
            <Notice tone="error">{publishError.message}</Notice>
          </div>
        )}
        {profile.me.canEdit && (
          <div className="mt-5 flex flex-wrap gap-3">
            {profile.status === 'published' ? (
              <Button variant="outline" className="h-11" disabled={pause.isPending} onClick={() => pause.mutate()}>
                Pause (hide from others)
              </Button>
            ) : (
              <Button className="h-11" disabled={publish.isPending || Boolean(profile.candidate.objectedAt)} onClick={() => publish.mutate()}>
                {profile.status === 'paused' ? 'Publish again' : 'Publish'}
              </Button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
