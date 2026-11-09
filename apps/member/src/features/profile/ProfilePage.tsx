/**
 * One profile, for the people who operate it: overview and publishing, the details editor,
 * private contacts, requests, its plan and payments, and the manager/candidate panel for
 * guardian-managed profiles.
 */
import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Heart, ShieldCheck, Users } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import type { ProfileView } from '@fh/shared';
import { TrustBadges } from '@/components/badges';
import { AppShell, Card, Loading, Notice, PageTitle } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { ApiError, errorMessage, post } from '@/lib/api';
import { storeProfile, useProfile } from '@/lib/queries';
import { PlanPanel } from '@/features/billing/PlanPanel';
import { ContactsPanel } from './ContactsPanel';
import { DetailsForm, type Save } from './DetailsForm';
import { Onboarding, type WizardStep } from './Onboarding';
import { useLabels } from './options';
import { say, useI18n, type Translate } from '@/lib/i18n';
import { PeoplePanel } from './PeoplePanel';
import { PhotosPanel } from './PhotosPanel';
import { DocumentCheck, PhoneCheck } from '@/features/trust/VerifyPage';
import { essentialsDone, firstOpenTodo, inSetup, NextStep, ProfileSteps, SECTION_SLUGS, sectionFromSlug, sectionOpen, useSetupSteps, type ProfileSection, type SetupTab } from './SetupSteps';
import { DeleteProfileCard, EngagedCard, PlanCard } from './StandingCards';

export default function ProfilePage() {
  const { id = '', section } = useParams();
  const profile = useProfile(id);
  const { t } = useI18n();
  // A draft being set up opens in the demo's setup wizard; its plan and manager/candidate sections keep the page.
  if (profile.data && inSetup(profile.data) && section !== 'plan' && section !== 'people')
    return (
      <AppShell onboarding>
        <SetupWizard profile={profile.data} />
      </AppShell>
    );
  return (
    <AppShell width="wide">
      <Link to="/" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
        {t('verify.back')}
      </Link>
      <div className="mt-5">
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

const WIZARD_OF: Partial<Record<ProfileSection, WizardStep>> = { details: 'essentials', story: 'story', verify: 'privacy', overview: 'review' };
const SECTION_OF: Record<WizardStep, ProfileSection | null> = { role: null, essentials: 'details', story: 'story', privacy: 'verify', review: 'overview' };

/**
 * A draft in the demo's five-step wizard (decision B3). Each step is an address of this page (…/details, …/story,
 * …/verify, …/publish), opens once the steps before it are complete, and saves as the member goes: Continue saves the
 * step's parts in turn, then opens the next step. Your role was chosen when the profile was created (/profiles/new).
 */
function SetupWizard({ profile }: { profile: ProfileView }) {
  const { section: slug } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { steps } = useSetupSteps(profile);
  const saves = useRef<Save | null>(null);
  const [error, setError] = useState<string | null>(null);
  const todo = firstOpenTodo(profile, steps);
  const fallback: ProfileSection = todo === 'details' && essentialsDone(profile) ? 'story' : todo;
  const asked = sectionFromSlug(slug);
  const wanted: ProfileSection = asked === 'photos' ? 'story' : (asked ?? fallback);
  const current: ProfileSection = WIZARD_OF[wanted] && sectionOpen(profile, steps, wanted) ? wanted : fallback;
  const step = WIZARD_OF[current] ?? 'essentials';
  useEffect(() => {
    if (slug !== SECTION_SLUGS[current]) navigate(`/profiles/${profile.id}/${SECTION_SLUGS[current]}`, { replace: true });
  }, [slug, current, profile.id, navigate]);
  const isOpen = (option: WizardStep) => {
    const target = SECTION_OF[option];
    return target !== null && sectionOpen(profile, steps, target);
  };
  const go = (next: ProfileSection) => {
    setError(null);
    navigate(`/profiles/${profile.id}/${SECTION_SLUGS[next]}`, { state: { stepChanged: true } });
  };
  // A step opened from the wizard (not a fresh page load): back to the top and focus on its title, so keyboard and
  // screen-reader users follow. The page remounts on every address (App's error boundary is keyed by it), so the
  // navigation carries the flag.
  const { state } = useLocation();
  const stepChanged = Boolean((state as { stepChanged?: boolean } | null)?.stepChanged);
  useEffect(() => {
    if (!stepChanged) return;
    window.scrollTo({ top: 0, behavior: 'auto' });
    document.getElementById('onboard-title')?.focus({ preventScroll: true });
  }, [step, stepChanged]);
  const save = (after: () => void) => (saves.current ? saves.current(after) : after());
  const heads: Record<WizardStep, { kicker: string; title: string; lead?: string }> = {
    role: { kicker: t('onboard.role.kicker'), title: t('create.who.title') },
    essentials: { kicker: t('onboard.essentials.kicker'), title: t('onboard.essentials.title'), lead: t('details.essentials.intro') },
    story: { kicker: t('onboard.story.kicker'), title: t('onboard.story.title'), lead: t('details.about.intro') },
    privacy: { kicker: t('onboard.privacy.kicker'), title: t('onboard.privacy.title') },
    review: { kicker: t('onboard.review.kicker'), title: t('onboard.review.title') },
  };
  const back: Record<WizardStep, () => void> = {
    role: () => navigate('/'),
    essentials: () => navigate('/'),
    story: () => go('details'),
    privacy: () => go('story'),
    review: () => go('verify'),
  };
  const next: Partial<Record<WizardStep, () => void>> = {
    essentials: () => save(() => go('story')),
    story: () => save(() => go('verify')),
    privacy: () => (isOpen('review') ? go('overview') : setError(t('onboard.notOpen'))),
  };
  saves.current = null;
  return (
    <Onboarding
      step={step}
      isOpen={isOpen}
      onStep={(option) => {
        const target = SECTION_OF[option];
        if (target) go(target);
      }}
      {...heads[step]}
      error={error}
      back={back[step]}
      next={next[step]}
      onSaveLater={() => (step === 'essentials' || step === 'story' ? save(() => navigate('/')) : navigate('/'))}
    >
      {step === 'essentials' && <DetailsForm profile={profile} part="essentials" saves={saves} />}
      {step === 'story' && (
        <>
          <DetailsForm profile={profile} part="story" saves={saves} />
          <PhotosPanel profile={profile} />
        </>
      )}
      {step === 'privacy' && (
        <>
          <ContactsPanel profile={profile}>
            {profile.publisher?.isMe && <PhoneCheck embedded suggested={profile.contacts.find((c) => c.kind === 'phone' && c.person === profile.me.role)?.value} />}
          </ContactsPanel>
          {profile.publisher?.isMe && <DocumentCheck />}
        </>
      )}
      {step === 'review' && <Overview profile={profile} onOpenPlans={() => navigate(`/profiles/${profile.id}/plan`)} onOpen={go} />}
    </Onboarding>
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
  const setup = inSetup(profile);
  // A new profile opens on its details; one under way, or published, on its overview.
  // Each section has its own address (/profiles/:id/details …), so back, reload and links all land on the same step.
  const { section: slug } = useParams();
  const navigate = useNavigate();
  const { steps } = useSetupSteps(profile);
  const asked = sectionFromSlug(slug);
  // No section in the address: a profile being set up opens on its first step still to do, others on Publish.
  const fallback: ProfileSection = setup ? firstOpenTodo(profile, steps) : 'overview';
  const wanted = asked ?? fallback;
  // After a takeover the profile is self-managed and the manager/candidate section is gone; a step not open yet
  // (the ones before it are not complete) goes to the first step still to do.
  const current: ProfileSection = wanted === 'people' && !showPeople ? 'overview' : sectionOpen(profile, steps, wanted) ? wanted : fallback;
  useEffect(() => {
    if (slug !== SECTION_SLUGS[current]) navigate(`/profiles/${profile.id}/${SECTION_SLUGS[current]}`, { replace: true });
  }, [slug, current, profile.id, navigate]);
  const { t } = useI18n();
  const { relationshipLabels, statusLabels } = useLabels();
  /** Opens a section from the steps, a card or a "continue" button: back up to the steps, focus in the section. */
  const goTo = (next: ProfileSection) => {
    navigate(`/profiles/${profile.id}/${SECTION_SLUGS[next]}`);
    requestAnimationFrame(() => {
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      document.getElementById('profile-steps')?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
      document.getElementById('profile-section')?.focus({ preventScroll: true });
    });
  };
  const peopleLabel = t(profile.me.role === 'manager' ? 'profile.tab.candidate' : 'profile.tab.managerConsent');
  const names: Record<ProfileSection, string> = {
    overview: t('profile.tab.overview'),
    details: t('profile.tab.details'),
    story: t('onboard.label.story'),
    photos: t('profile.tab.photos'),
    verify: t('setup.step.verify'),
    plan: t('profile.tab.plan'),
    people: peopleLabel,
  };
  return (
    <>
      <PageTitle kicker={roleLine(t, relationshipLabels, profile)} title={profile.fields.displayName ?? t('card.untitled')}>
        <span className="inline-flex rounded-full border bg-card px-3 py-1 text-xs font-semibold text-foreground">{statusLabels[profile.status]}</span>
      </PageTitle>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
        <div className="min-w-0">
          <ProfileSteps profile={profile} open={current} onOpen={goTo} />
          {/* The open section; it takes focus when opened, so keyboard and screen reader users land in it. */}
          <section id="profile-section" tabIndex={-1} aria-label={names[current]} className="flex flex-col gap-6 rounded-[var(--ui-panel-radius)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
            {(current === 'plan' || current === 'people') && (
              <button type="button" className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-semibold text-[var(--ui-purple)] underline-offset-4 hover:underline" onClick={() => goTo('overview')}>
                <ArrowLeft className="size-4" aria-hidden="true" />
                {t('profile.back')}
              </button>
            )}
            {current === 'overview' && <Overview profile={profile} onOpenPlans={() => goTo('plan')} onOpen={goTo} />}
            {(current === 'details' || current === 'story') && <DetailsForm profile={profile} onDone={setup ? () => goTo('photos') : undefined} />}
            {current === 'photos' && (
              <>
                <PhotosPanel profile={profile} />
                <NextStep profile={profile} after="photos" onOpen={goTo} />
              </>
            )}
            {/* Verify: the private contact details, then the account holder's own checks, all here on the profile. */}
            {current === 'verify' && (
              <>
                <ContactsPanel profile={profile}>
                  {profile.publisher?.isMe && (
                    <PhoneCheck embedded suggested={profile.contacts.find((c) => c.kind === 'phone' && c.person === profile.me.role)?.value} />
                  )}
                </ContactsPanel>
                {profile.publisher?.isMe && <DocumentCheck />}
                <NextStep profile={profile} after="verify" onOpen={goTo} />
              </>
            )}
            {current === 'plan' && <PlanPanel profile={profile} />}
            {current === 'people' && <PeoplePanel profile={profile} />}
          </section>
        </div>
        <TrustAside profile={profile} peopleLabel={showPeople ? peopleLabel : null} onOpen={goTo} />
      </div>
    </>
  );
}

/**
 * Beside the sections, as in the demo: the badges this profile has earned and where the checks are done, the way to
 * its plan, requests and connections, and (managed profiles) the manager/candidate section.
 */
function TrustAside({ profile, peopleLabel, onOpen }: { profile: ProfileView; peopleLabel: string | null; onOpen: (section: ProfileSection) => void }) {
  const { t } = useI18n();
  return (
    <aside className="flex flex-col gap-6 lg:sticky lg:top-6">
      <Card>
        <ShieldCheck className="mb-3 size-6 text-[var(--ui-copper)]" aria-hidden="true" />
        <h2 className="text-lg font-semibold">{t('profile.trust.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('profile.trust.body')}</p>
        <div className="mt-4">
          <TrustBadges badges={profile.badges} explain />
        </div>
        {profile.publisher?.isMe && (
          <Button variant="outline" className="mt-5 h-11" onClick={() => onOpen('verify')}>
            {t('profile.trust.verify')}
          </Button>
        )}
      </Card>
      <Card>
        <Heart className="mb-3 size-6 text-[var(--ui-copper)]" aria-hidden="true" />
        <h2 className="text-lg font-semibold">{t('profile.relations.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('profile.relations.body')}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button asChild variant="outline" className="h-11">
            <Link to={`/requests?as=${profile.id}`}>{t('layout.dock.requests')}</Link>
          </Button>
          <Button asChild variant="outline" className="h-11">
            <Link to={`/connections?as=${profile.id}`}>{t('layout.dock.connections')}</Link>
          </Button>
        </div>
      </Card>
      {peopleLabel && (
        <Card>
          <Users className="mb-3 size-6 text-[var(--ui-copper)]" aria-hidden="true" />
          <h2 className="text-lg font-semibold">{peopleLabel}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t(profile.me.role === 'manager' ? 'profile.people.body.manager' : 'profile.people.body.candidate')}</p>
          <Button variant="outline" className="mt-4 h-11" onClick={() => onOpen('people')}>
            {t('profile.people.open', { section: peopleLabel })}
          </Button>
        </Card>
      )}
    </aside>
  );
}

function Overview({ profile, onOpenPlans, onOpen }: { profile: ProfileView; onOpenPlans: () => void; onOpen: (tab: SetupTab) => void }) {
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
              {/* Each missing detail opens the tab where it is filled in. */}
              {profile.missing.map((key) => (
                <li key={key}>
                  <button type="button" className="min-h-6 text-left underline underline-offset-4 hover:text-foreground" onClick={() => onOpen(key === 'contactPhone' ? 'verify' : 'details')}>
                    {fieldLabels[key] ?? key}
                  </button>
                </li>
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
            <button type="button" className="min-h-6 text-brand underline underline-offset-4" onClick={() => onOpen('verify')}>
              {t('profile.goToVerification')}
            </button>
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
              <Button className="h-11" disabled={publish.isPending || Boolean(profile.candidate.objectedAt) || profile.missing.length > 0 || Boolean(publisher?.isMe && (!publisher.phoneVerified || publisher.documentStatus !== 'approved'))} onClick={() => publish.mutate()}>
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
