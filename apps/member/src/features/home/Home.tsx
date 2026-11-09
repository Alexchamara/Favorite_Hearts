/**
 * Home: sign in, then the profiles this account operates (own, managed or joined as candidate),
 * creating a profile, and the account's own verification status.
 */
import { useState, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArrowUpRight, Check, Heart, Plus, ShieldCheck, UserRound, Users } from 'lucide-react';
import { Link, Navigate, useNavigate } from 'react-router';
import { DEFAULT_MANAGER_CAPACITY, MANAGER_RELATIONSHIPS, type ProfileView } from '@fh/shared';
import { TrustBadges } from '@/components/badges';
import { CheckboxField } from '@/components/form/fields';
import { AppShell, Card, kickerClass, Loading, Notice, PageTitle } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { errorMessage, post } from '@/lib/api';
import { storeProfile, useMe, useMyCases, useProfiles } from '@/lib/queries';
import { AccountCard } from '@/features/account/AccountCard';
import { NameStep, SignIn } from '@/features/auth/SignIn';
import { useLabels } from '@/features/profile/options';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export default function Home() {
  const me = useMe();
  const { t } = useI18n();
  if (me.isPending) return <AppShell><Loading /></AppShell>;
  if (me.data?.staffRole) return <Navigate to="/staff" replace />;
  return (
    <AppShell width="wide">
      {!me.data ? (
        <Welcome>
          <p className={kickerClass}>{t('home.kicker')}</p>
          <h1 className="mt-3 font-serif text-[2rem] leading-[1.15] sm:text-[2.4rem]">{t('home.title')}</h1>
          <p className="mt-3 mb-6 text-muted-foreground">{t('home.intro')}</p>
          {me.isError && (
            <div className="mb-4">
              <Notice tone="warning">{t('home.serviceProblem')}</Notice>
            </div>
          )}
          <SignIn />
        </Welcome>
      ) : !me.data.name ? (
        <Welcome>
          <p className={kickerClass}>{t('home.welcome.kicker')}</p>
          <h1 className="mt-3 mb-6 font-serif text-[2rem] leading-[1.15] sm:text-[2.4rem]">{t('home.welcome.title')}</h1>
          <NameStep />
        </Welcome>
      ) : (
        <Dashboard />
      )}
    </AppShell>
  );
}

/** Signing in, as in the demo: the form on a card, and beside it what the account is for and how it goes. */
function Welcome({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16 xl:gap-24">
      <section className="rounded-[var(--ui-panel-radius)] border bg-card p-6 sm:p-11">{children}</section>
      <aside className="lg:pt-8">
        <p className={kickerClass}>{t('home.aside.kicker')}</p>
        <p className="mt-2 font-serif text-[2.5rem] leading-[1.08] tracking-[-0.035em] sm:text-[3.5rem]">
          {t('home.aside.title1')}
          <br />
          <em className="text-[var(--ui-copper)]">{t('home.aside.title2')}</em>
        </p>
        <p className="mt-6 text-muted-foreground">{t('home.aside.lead')}</p>
        <h2 className="sr-only">{t('home.aside.steps')}</h2>
        <ol className="mt-6 grid gap-4">
          {(['1', '2', '3', '4'] as const).map((step) => (
            <li key={step} className="flex items-start gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full border border-[var(--ui-purple)] bg-[var(--ui-purple-soft)] text-xs font-bold text-[var(--ui-purple)]" aria-hidden="true">
                {step}
              </span>
              <span className="pt-0.5">{t(`home.aside.step.${step}`)}</span>
            </li>
          ))}
        </ol>
        <p className="mt-8 max-w-[52ch] text-sm leading-relaxed text-muted-foreground">{t('home.aside.note')}</p>
      </aside>
    </div>
  );
}

function Dashboard() {
  const profiles = useProfiles();
  const cases = useMyCases();
  const me = useMe().data!;
  const [creating, setCreating] = useState(false);
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
            <Button className="h-11" onClick={() => setCreating(true)}>
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
            <Button className="mt-2 h-11" onClick={() => setCreating(true)}>
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

      <CreateProfileDialog open={creating} ownExists={Boolean(ownProfile)} atLimit={atLimit} onClose={() => setCreating(false)} />
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

type Role = 'self' | (typeof MANAGER_RELATIONSHIPS)[number];
const ROLES: Role[] = ['self', ...MANAGER_RELATIONSHIPS];

/**
 * "Who is this profile for?" as the demo asks it: one card per role. Myself makes a self-managed profile; every other
 * card makes a managed one with that relationship. Then the matching declaration, and the profile is created.
 */
function CreateProfileDialog({ open, ownExists, atLimit, onClose }: { open: boolean; ownExists: boolean; atLimit: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [declared, setDeclared] = useState(false);
  const [role, setRole] = useState<Role | ''>('');
  const { t } = useI18n();
  const self = role === 'self';
  const create = useMutation({
    mutationFn: () =>
      post<ProfileView>(
        '/profiles',
        self ? { management: 'self', adultDeclared: true } : { management: 'manager', relationship: role, authorityDeclared: true },
      ),
    onSuccess: async (profile) => {
      await storeProfile(profile);
      close();
      navigate(`/profiles/${profile.id}`);
    },
  });
  function close() {
    onClose();
    setDeclared(false);
    setRole('');
    create.reset();
  }
  const unavailable = (option: Role) => (option === 'self' ? ownExists : atLimit);
  const ready = declared && role !== '';
  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-[1.75rem] leading-tight font-normal tracking-[-0.03em]">{t('create.who.title')}</DialogTitle>
          <DialogDescription>{t('create.who.body')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          {create.isError && <Notice tone="error">{errorMessage(create.error)}</Notice>}
          <fieldset>
            <legend className="sr-only">{t('create.who.label')}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {ROLES.map((option) => {
                const off = unavailable(option);
                const chosen = role === option;
                const Icon = option === 'self' ? UserRound : Users;
                return (
                  <label
                    key={option}
                    className={cn(
                      'relative flex min-h-[104px] cursor-pointer flex-col gap-1 rounded-[12px] border bg-card p-4 pr-11 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--ring)]',
                      chosen ? 'border-[var(--ui-accent)] bg-[var(--ui-purple-soft)]' : 'hover:border-[var(--ui-purple)]',
                      off && 'cursor-not-allowed opacity-55 hover:border-[var(--ui-line)]',
                    )}
                  >
                    <input
                      type="radio"
                      name="profile-role"
                      value={option}
                      checked={chosen}
                      disabled={off}
                      onChange={() => {
                        setRole(option);
                        setDeclared(false);
                      }}
                      className="sr-only"
                    />
                    <Icon className="mb-2 size-5 text-[var(--ui-copper)]" aria-hidden="true" />
                    <span className="font-semibold">{t(`create.role.${option}`)}</span>
                    <span className="text-sm text-muted-foreground">
                      {off ? (option === 'self' ? t('create.role.self.taken') : t('dashboard.limit', { count: DEFAULT_MANAGER_CAPACITY })) : t(`create.role.${option}.hint`)}
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'absolute top-4 right-4 grid size-5 place-items-center rounded-full border',
                        chosen && 'border-transparent bg-[var(--ui-copper)] text-white dark:text-[#2a1a10]',
                      )}
                    >
                      {chosen && <Check className="size-3.5" />}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          {role !== '' && (
            <>
              <p className="text-sm text-muted-foreground">{t(self ? 'create.self.body' : 'create.manager.body')}</p>
              <CheckboxField checked={declared} onChange={setDeclared} label={t(self ? 'create.self.declare' : 'create.manager.declare')} />
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
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
