/**
 * One profile, for the people who operate it: overview and publishing, the details editor,
 * private contacts, requests, its plan and payments, and the manager/candidate panel for
 * guardian-managed profiles.
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
import { PlanPanel } from '@/features/billing/PlanPanel';
import { ConnectionsPanel } from '@/features/requests/ConnectionsPanel';
import { RequestsPanel } from '@/features/requests/RequestsPanel';
import { ContactsPanel } from './ContactsPanel';
import { DetailsForm } from './DetailsForm';
import { useLabels } from './options';
import { say, useI18n, type Translate } from '@/lib/i18n';
import { PeoplePanel } from './PeoplePanel';
import { PhotosPanel } from './PhotosPanel';
import { DeleteProfileCard, EngagedCard, PlanCard } from './StandingCards';

export default function ProfilePage() {
  const { id = '' } = useParams();
  const profile = useProfile(id);
  const { t } = useI18n();
  return (
    <AppShell>
      <Link to="/" className="text-sm text-muted-foreground underline underline-offset-4">
        {t('verify.back')}
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

function roleLine(t: Translate, relationshipLabels: Record<string, string>, profile: ProfileView): string {
  if (profile.me.role === 'manager') return t('card.youManage');
  if (profile.management === 'manager' && profile.manager) {
    return t('card.managedBy', { name: profile.manager.name, relationship: relationshipLabels[profile.manager.relationship]!.toLowerCase() });
  }
  return t('card.own');
}

function ProfileScreen({ profile }: { profile: ProfileView }) {
  const showPeople = profile.management === 'manager';
  const [tab, setTab] = useState('overview');
  // After a takeover the profile is self-managed and the "people" tab is gone.
  const current = tab === 'people' && !showPeople ? 'overview' : tab;
  const { t } = useI18n();
  const { relationshipLabels, statusLabels } = useLabels();
  return (
    <>
      <PageTitle kicker={roleLine(t, relationshipLabels, profile)} title={profile.fields.displayName ?? t('card.untitled')}>
        <span className="inline-flex rounded-full border px-3 py-1 text-xs font-semibold text-foreground">{statusLabels[profile.status]}</span>
      </PageTitle>
      <Tabs value={current} onValueChange={setTab} className="gap-6">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-[var(--ui-soft)] p-1">
          <TabsTrigger value="overview" className="min-h-10 flex-none px-4">
            {t('profile.tab.overview')}
          </TabsTrigger>
          <TabsTrigger value="details" className="min-h-10 flex-none px-4">
            {t('profile.tab.details')}
          </TabsTrigger>
          <TabsTrigger value="photos" className="min-h-10 flex-none px-4">
            {t('profile.tab.photos')}
          </TabsTrigger>
          <TabsTrigger value="contacts" className="min-h-10 flex-none px-4">
            {t('profile.tab.contacts')}
          </TabsTrigger>
          <TabsTrigger value="requests" className="min-h-10 flex-none px-4">
            {t('profile.tab.requests')}
          </TabsTrigger>
          <TabsTrigger value="connections" className="min-h-10 flex-none px-4">
            {t('profile.tab.connections')}
          </TabsTrigger>
          <TabsTrigger value="plan" className="min-h-10 flex-none px-4">
            {t('profile.tab.plan')}
          </TabsTrigger>
          {showPeople && (
            <TabsTrigger value="people" className="min-h-10 flex-none px-4">
              {t(profile.me.role === 'manager' ? 'profile.tab.candidate' : 'profile.tab.managerConsent')}
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="overview">
          <Overview profile={profile} onOpenPlans={() => setTab('plan')} />
        </TabsContent>
        <TabsContent value="details">
          <DetailsForm profile={profile} />
        </TabsContent>
        <TabsContent value="photos">
          <PhotosPanel profile={profile} />
        </TabsContent>
        <TabsContent value="contacts">
          <ContactsPanel profile={profile} />
        </TabsContent>
        <TabsContent value="requests">
          <RequestsPanel profile={profile} />
        </TabsContent>
        <TabsContent value="connections">
          <ConnectionsPanel profile={profile} />
        </TabsContent>
        <TabsContent value="plan">
          <PlanPanel profile={profile} />
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

function Overview({ profile, onOpenPlans }: { profile: ProfileView; onOpenPlans: () => void }) {
  const publish = useMutation({
    mutationFn: () => post<ProfileView>(`/profiles/${profile.id}/publish`),
    onSuccess: async (updated) => {
      await storeProfile(updated);
      toast.success(say('profile.publishedToast'));
    },
  });
  const pause = useMutation({
    mutationFn: () => post<ProfileView>(`/profiles/${profile.id}/pause`),
    onSuccess: async (updated) => {
      await storeProfile(updated);
      toast.success(say('profile.pausedToast'));
    },
  });
  const publisher = profile.publisher;
  const { t } = useI18n();
  const { caseStatusLabels, fieldLabels } = useLabels();
  const consentTab = t('profile.tab.managerConsent');
  const publishError = publish.error instanceof ApiError ? publish.error : null;

  return (
    <div className="flex flex-col gap-6">
      {profile.candidate.objectedAt && (
        <Notice tone="warning" title={t('profile.objected.title')}>
          {profile.me.role === 'candidate' ? t('profile.objected.candidate', { tab: consentTab }) : t('profile.objected.manager')}
        </Notice>
      )}
      {!profile.me.canEdit && (
        <Notice title={t('profile.cannotEdit.title')}>
          {profile.me.role === 'candidate' ? t('profile.cannotEdit.candidate', { tab: consentTab }) : t('profile.cannotEdit.manager')}
        </Notice>
      )}

      <Card>
        <h2 className="font-serif text-2xl">{t('profile.badges')}</h2>
        <div className="mt-4">
          <TrustBadges badges={profile.badges} explain />
        </div>
      </Card>

      <Card>
        <h2 className="font-serif text-2xl">{t('profile.publishing')}</h2>
        {profile.status === 'published' ? (
          <p className="mt-2 text-sm text-muted-foreground">{t('profile.visible')}</p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">{t(publisher?.isMe ? 'profile.publishNeeds.self' : 'profile.publishNeeds.manager')}</p>
        )}
        {profile.missing.length > 0 && profile.status !== 'published' && (
          <div className="mt-4">
            <p className="text-sm font-semibold">{t('profile.stillNeeded')}</p>
            <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
              {profile.missing.map((key) => (
                <li key={key}>{fieldLabels[key] ?? key}</li>
              ))}
            </ul>
          </div>
        )}
        {publisher?.isMe && (!publisher.phoneVerified || publisher.documentStatus !== 'approved') && (
          <p className="mt-4 text-sm">
            {t('profile.yourVerification', {
              phone: t(publisher.phoneVerified ? 'profile.phoneVerified' : 'profile.phoneNotVerified'),
              document:
                publisher.documentStatus && publisher.documentStatus !== 'none'
                  ? caseStatusLabels[publisher.documentStatus].toLowerCase()
                  : t('profile.documentNotSubmitted'),
            })}{' '}
            <Link to="/verify" className="text-brand underline underline-offset-4">
              {t('profile.goToVerification')}
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
                {t('profile.pause')}
              </Button>
            ) : (
              <Button className="h-11" disabled={publish.isPending || Boolean(profile.candidate.objectedAt)} onClick={() => publish.mutate()}>
                {t(profile.status === 'draft' ? 'profile.publish' : 'profile.publishAgain')}
              </Button>
            )}
          </div>
        )}
      </Card>

      <PlanCard profile={profile} onOpenPlans={onOpenPlans} />
      <EngagedCard profile={profile} />
      <DeleteProfileCard profile={profile} />
    </div>
  );
}
