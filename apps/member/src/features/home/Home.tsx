/**
 * Home: sign in, then the profiles this account operates (own, managed or joined as candidate),
 * creating a profile, and the account's own verification status.
 */
import { ArrowUpRight, Heart, Plus, ShieldCheck } from 'lucide-react';
import { Link, Navigate, useNavigate } from 'react-router';
import { DEFAULT_MANAGER_CAPACITY, type ProfileView } from '@fh/shared';
import { TrustBadges } from '@/components/badges';
import { AppLoading, AppShell, Card, kickerClass, Loading, Notice, PageTitle } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api';
import { useMe, useMyCases, useProfiles } from '@/lib/queries';
import { AccountCard } from '@/features/account/AccountCard';
import { EntryShell, LocaleStep, useLocaleChosen } from '@/features/auth/Entry';
import { NameStep, SignIn } from '@/features/auth/SignIn';
import { useLabels } from '@/features/profile/options';
import { useI18n } from '@/lib/i18n';

export default function Home() {
  const me = useMe();
  const { t } = useI18n();
  const [localeChosen, chooseLocale] = useLocaleChosen();
  if (me.isPending) return <AppLoading />;
  if (me.data?.staffRole) return <Navigate to="/staff" replace />;
  // Signed out and naming the account: the demo's own entry page. Signed in: the profiles dashboard in the app frame.
  if (!me.data && !localeChosen)
    return (
      <EntryShell aside="title">
        <LocaleStep onDone={chooseLocale} />
      </EntryShell>
    );
  if (!me.data)
    return (
      <EntryShell>
        <SignIn
          heading={(codeStep) => (
            <>
              <span className={kickerClass}>{t('home.kicker')}</span>
              <h1>{t(codeStep ? 'entry.code.title' : 'home.title')}</h1>
              {!codeStep && <p>{t('home.intro')}</p>}
              {me.isError && <Notice tone="warning">{t('home.serviceProblem')}</Notice>}
            </>
          )}
        />
      </EntryShell>
    );
  if (!me.data.name)
    return (
      <EntryShell>
        <span className={kickerClass}>{t('home.welcome.kicker')}</span>
        <h1>{t('home.welcome.title')}</h1>
        <NameStep />
      </EntryShell>
    );
  return (
    <AppShell width="wide">
      <Dashboard />
    </AppShell>
  );
}


function Dashboard() {
  const profiles = useProfiles();
  const cases = useMyCases();
  const me = useMe().data!;
  const navigate = useNavigate();
  const { t } = useI18n();
  const { caseStatusLabels, documentLabels } = useLabels();
  if (profiles.isPending) return <Loading />;
  if (profiles.isError) return <Notice tone="error">{errorMessage(profiles.error)}</Notice>;

  const list = profiles.data;
  const ownProfile = list.find((p) => p.me.role === 'candidate');
  const managed = list.filter((p) => p.me.role === 'manager');
  const latestCase = cases.data?.[0];

  const atLimit = managed.length >= DEFAULT_MANAGER_CAPACITY;
  const canCreate = !ownProfile || !atLimit;

  return (
    <>
      <PageTitle
        kicker={t('dashboard.kicker', { name: me.name })}
        title={t('dashboard.title')}
        action={
          canCreate && list.length > 0 ? (
            <Button className="h-11" onClick={() => navigate('/profiles/new')}>
              <Plus aria-hidden="true" />
              {t('dashboard.create')}
            </Button>
          ) : undefined
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-8">
      <div className="flex flex-col gap-4">
        {list.length === 0 && (
          <section className="flex flex-col items-center gap-3 rounded-[var(--ui-panel-radius)] border border-dashed bg-[var(--ui-surface)] px-5 py-12 text-center">
            <Heart className="size-7 text-[var(--ui-copper)]" aria-hidden="true" />
            <h2 className="font-serif text-2xl">{t('dashboard.none.title')}</h2>
            <p className="max-w-[46ch] text-muted-foreground">{t('dashboard.none.body')}</p>
            <Button className="mt-2 h-11" onClick={() => navigate('/profiles/new')}>
              <Plus aria-hidden="true" />
              {t('dashboard.create')}
            </Button>
          </section>
        )}
        {list.map((profile) => (
          <ProfileCard key={profile.id} profile={profile} />
        ))}
        {atLimit && (
          <p className="text-sm text-muted-foreground">
            {t('dashboard.limit', { count: managed.length })}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-6">
      <Card>
        <ShieldCheck className="mb-3 size-6 text-[var(--ui-copper)]" aria-hidden="true" />
        <h2 className="font-serif text-2xl">{t('dashboard.verification.title')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('dashboard.verification.body')}</p>
        <dl className="mt-4 grid gap-3 border-t pt-4 text-sm">
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
      </div>
      </div>

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
      className="group flex items-center gap-4 rounded-[var(--ui-panel-radius)] border bg-card p-5 transition-colors hover:border-[var(--ui-purple)] sm:gap-5 sm:p-6"
    >
      <span className="grid size-14 shrink-0 place-items-center rounded-full bg-[var(--ui-soft)] font-serif text-2xl text-[var(--ui-purple)]" aria-hidden="true">
        {(profile.fields.displayName ?? '?').slice(0, 1).toUpperCase()}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="font-serif text-2xl leading-tight tracking-[-0.02em]">{profile.fields.displayName ?? t('card.untitled')}</p>
        <p className="text-sm text-muted-foreground">
          {role} · <span className="font-semibold text-foreground">{statusLabels[profile.status]}</span>
          {profile.status === 'draft' && profile.missing.length > 0 && ` · ${t('card.toComplete', { count: profile.missing.length })}`}
        </p>
        <TrustBadges badges={profile.badges} />
      </div>
      <ArrowUpRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" aria-hidden="true" />
    </Link>
  );
}
