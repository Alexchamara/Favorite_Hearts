/**
 * Home: sign in, then the profiles this account operates (own, managed or joined as candidate),
 * creating a profile, and the account's own verification status.
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { Link, Navigate, useNavigate } from 'react-router';
import { DEFAULT_MANAGER_CAPACITY, MANAGER_RELATIONSHIPS, type ProfileView } from '@fh/shared';
import { TrustBadges } from '@/components/badges';
import { CheckboxField, SelectField } from '@/components/form/fields';
import { AppShell, Card, Loading, Notice, PageTitle } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { errorMessage, post } from '@/lib/api';
import { storeProfile, useMe, useMyCases, useProfiles } from '@/lib/queries';
import { AccountCard } from '@/features/account/AccountCard';
import { NameStep, SignIn } from '@/features/auth/SignIn';
import { options, useLabels } from '@/features/profile/options';
import { useI18n } from '@/lib/i18n';

export default function Home() {
  const me = useMe();
  const { t } = useI18n();
  if (me.isPending) return <AppShell><Loading /></AppShell>;
  if (me.data?.staffRole) return <Navigate to="/staff" replace />;
  return (
    <AppShell>
      {!me.data ? (
        <>
          <PageTitle kicker={t('home.kicker')} title={t('home.title')}>
            {t('home.intro')}
          </PageTitle>
          <Card>
            <SignIn />
          </Card>
        </>
      ) : !me.data.name ? (
        <>
          <PageTitle kicker={t('home.welcome.kicker')} title={t('home.welcome.title')} />
          <Card>
            <NameStep />
          </Card>
        </>
      ) : (
        <Dashboard />
      )}
    </AppShell>
  );
}

function Dashboard() {
  const profiles = useProfiles();
  const cases = useMyCases();
  const me = useMe().data!;
  const [creating, setCreating] = useState<'self' | 'manager' | null>(null);
  const { t } = useI18n();
  const { caseStatusLabels, documentLabels } = useLabels();
  if (profiles.isPending) return <Loading />;
  if (profiles.isError) return <Notice tone="error">{errorMessage(profiles.error)}</Notice>;

  const list = profiles.data;
  const ownProfile = list.find((p) => p.me.role === 'candidate');
  const managed = list.filter((p) => p.me.role === 'manager');
  const latestCase = cases.data?.[0];

  return (
    <>
      <PageTitle kicker={t('dashboard.kicker', { name: me.name })} title={t('dashboard.title')} />
      <div className="flex flex-col gap-4">
        {list.length === 0 && (
          <Notice title={t('dashboard.none.title')}>{t('dashboard.none.body')}</Notice>
        )}
        {list.map((profile) => (
          <ProfileCard key={profile.id} profile={profile} />
        ))}
        <div className="flex flex-wrap gap-3">
          {!ownProfile && (
            <Button className="h-11" onClick={() => setCreating('self')}>
              {t('dashboard.createOwn')}
            </Button>
          )}
          <Button
            variant="outline"
            className="h-11"
            disabled={managed.length >= DEFAULT_MANAGER_CAPACITY}
            onClick={() => setCreating('manager')}
          >
            {t('dashboard.createForFamily')}
          </Button>
        </div>
        {managed.length >= DEFAULT_MANAGER_CAPACITY && (
          <p className="text-sm text-muted-foreground">
            {t('dashboard.limit', { count: managed.length })}
          </p>
        )}
      </div>

      <Card className="mt-10">
        <h2 className="font-serif text-2xl">{t('dashboard.verification.title')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('dashboard.verification.body')}</p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-semibold">{t('dashboard.verification.document')}</dt>
            <dd className="text-muted-foreground">
              {latestCase
                ? t('dashboard.verification.documentStatus', {
                    document: documentLabels[latestCase.documentType],
                    status: caseStatusLabels[latestCase.status].toLowerCase(),
                  })
                : t('dashboard.verification.notSubmitted')}
            </dd>
          </div>
          <div>
            <dt className="font-semibold">{t('dashboard.verification.phone')}</dt>
            <dd className="text-muted-foreground">
              {me.phoneNumber
                ? me.phoneNumberVerified
                  ? t('dashboard.verification.phoneVerified', { phone: me.phoneNumber })
                  : me.phoneNumber
                : t('dashboard.verification.notVerified')}
            </dd>
          </div>
        </dl>
        <Button asChild variant="outline" className="mt-5 h-11">
          <Link to="/verify">{t('dashboard.verification.button')}</Link>
        </Button>
      </Card>

      <AccountCard />

      <CreateProfileDialog kind={creating} onClose={() => setCreating(null)} />
    </>
  );
}

function ProfileCard({ profile }: { profile: ProfileView }) {
  const { t } = useI18n();
  const { relationshipLabels, statusLabels } = useLabels();
  const role =
    profile.me.role === 'manager'
      ? t('card.youManage')
      : profile.management === 'manager'
        ? profile.manager
          ? t('card.managedBy', {
              name: profile.manager.name,
              relationship: relationshipLabels[profile.manager.relationship].toLowerCase(),
            })
          : t('card.managedByFamily')
        : t('card.own');
  return (
    <Link
      to={`/profiles/${profile.id}`}
      className="group flex items-center justify-between gap-4 rounded-[var(--ui-panel-radius)] border bg-card p-5 shadow-[var(--ui-shadow)] hover:border-[var(--ui-accent)]"
    >
      <div className="flex min-w-0 flex-col gap-2">
        <p className="font-serif text-xl">{profile.fields.displayName ?? t('card.untitled')}</p>
        <p className="text-sm text-muted-foreground">
          {role} · <span className="font-semibold text-foreground">{statusLabels[profile.status]}</span>
          {profile.status === 'draft' && profile.missing.length > 0 && ` · ${t('card.toComplete', { count: profile.missing.length })}`}
        </p>
        <TrustBadges badges={profile.badges} />
      </div>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
    </Link>
  );
}

function CreateProfileDialog({ kind, onClose }: { kind: 'self' | 'manager' | null; onClose: () => void }) {
  const navigate = useNavigate();
  const [declared, setDeclared] = useState(false);
  const [relationship, setRelationship] = useState<(typeof MANAGER_RELATIONSHIPS)[number] | ''>('');
  const { t } = useI18n();
  const { relationshipLabels } = useLabels();
  const create = useMutation({
    mutationFn: () =>
      post<ProfileView>(
        '/profiles',
        kind === 'self'
          ? { management: 'self', adultDeclared: true }
          : { management: 'manager', relationship, authorityDeclared: true },
      ),
    onSuccess: async (profile) => {
      await storeProfile(profile);
      onClose();
      navigate(`/profiles/${profile.id}`);
    },
  });
  const ready = declared && (kind === 'self' || relationship !== '');
  return (
    <Dialog
      open={kind !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          setDeclared(false);
          setRelationship('');
          create.reset();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(kind === 'self' ? 'create.self.title' : 'create.manager.title')}</DialogTitle>
          <DialogDescription>{t(kind === 'self' ? 'create.self.body' : 'create.manager.body')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {create.isError && <Notice tone="error">{errorMessage(create.error)}</Notice>}
          {kind === 'manager' && (
            <SelectField
              label={t('create.relationship')}
              value={relationship}
              onChange={setRelationship}
              options={options(relationshipLabels)}
            />
          )}
          <CheckboxField
            checked={declared}
            onChange={setDeclared}
            label={t(kind === 'self' ? 'create.self.declare' : 'create.manager.declare')}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button disabled={!ready || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? t('create.creating') : t('create.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
