/**
 * One profile, for the people who operate it: overview and publishing, the details editor,
 * private contacts, requests, its plan and payments, and the manager/candidate panel for
 * guardian-managed profiles.
 */
import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, ArrowUpRight, Camera, Heart, ShieldCheck, UserRound, Users } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ageOn, MAX_PHOTOS, type ProfileView } from '@fh/shared';
import { TrustBadges } from '@/components/badges';
import { AppShell, Card, Loading, Notice, PageTitle } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ApiError, errorMessage, post } from '@/lib/api';
import { storeProfile, usePhotos, useProfile } from '@/lib/queries';
import { PlanPanel } from '@/features/billing/PlanPanel';
import { ContactsPanel } from './ContactsPanel';
import { DetailsForm, type Save } from './DetailsForm';
import { Onboarding, type WizardStep } from './Onboarding';
import { suggestionLabel, useLabels } from './options';
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
  // The demo's wizard: for a draft being set up (all but its plan and manager/candidate sections), and for editing a
  // published profile (its details, story and privacy steps; "Edit profile" opens it, as in the demo).
  const editing = section === 'details' || section === 'story' || section === 'photos' || section === 'verify';
  if (profile.data && profile.data.me.canEdit && (inSetup(profile.data) ? section !== 'plan' && section !== 'people' : editing))
    return (
      <AppShell onboarding>
        <SetupWizard profile={profile.data} />
      </AppShell>
    );
  return (
    <AppShell width="wide">
      {/* Not in the demo (one profile per account there): back to this account's profiles. The Membership page has its
          own way back, to this profile. */}
      {section !== 'plan' && (
        <Link to="/" className="m-text">
          {t('verify.back')}
        </Link>
      )}
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
  // A published profile being edited: every step is open, Review is its profile page, and leaving goes back there.
  const home = inSetup(profile) ? '/' : `/profiles/${profile.id}`;
  const back: Record<WizardStep, () => void> = {
    role: () => navigate(home),
    essentials: () => navigate(home),
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
      onSaveLater={() => (step === 'essentials' || step === 'story' ? save(() => navigate(home)) : navigate(home))}
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
  // The plan is the demo's Membership page, on its own (SCREEN-046).
  if (current === 'plan')
    return (
      <>
        <button type="button" className="m-text" onClick={() => goTo('overview')}>
          <ArrowLeft size={16} aria-hidden="true" />
          {t('profile.back')}
        </button>
        <PlanPanel profile={profile} />
      </>
    );
  if (current === 'overview' && !setup) return <ProfileDashboard profile={profile} peopleLabel={showPeople ? peopleLabel : null} onOpen={goTo} />;
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
            {current === 'people' && (
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
  // The demo's aside (.m-stack) of context cards (.m-context-card): icon, title, text and the way in.
  return (
    <aside className="m-stack">
      <div className="m-context-card">
        <ShieldCheck size={25} aria-hidden="true" />
        <h3>{t('profile.trust.title')}</h3>
        <p>{t('profile.trust.body')}</p>
        <TrustBadges badges={profile.badges} explain />
        {profile.publisher?.isMe && (
          <button type="button" className="m-btn m-secondary" onClick={() => onOpen('verify')}>
            {t('profile.trust.verify')}
          </button>
        )}
      </div>
      <div className="m-context-card">
        <Heart size={24} aria-hidden="true" />
        <h3>{t('profile.relations.title')}</h3>
        <p>{t('profile.relations.body')}</p>
        <div className="flex flex-wrap gap-3">
          <Link className="m-btn m-secondary" to={`/requests?as=${profile.id}`}>
            {t('layout.dock.requests')}
          </Link>
          <Link className="m-btn m-secondary" to={`/connections?as=${profile.id}`}>
            {t('layout.dock.connections')}
          </Link>
        </div>
      </div>
      {peopleLabel && (
        <div className="m-context-card">
          <Users size={24} aria-hidden="true" />
          <h3>{peopleLabel}</h3>
          <p>{t(profile.me.role === 'manager' ? 'profile.people.body.manager' : 'profile.people.body.candidate')}</p>
          <button type="button" className="m-text" onClick={() => onOpen('people')}>
            {t('profile.people.open', { section: peopleLabel })}
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        </div>
      )}
    </aside>
  );
}

/**
 * A published profile's own page, as the demo's "My profile" (SCREEN-042): the page heading with Edit profile, then
 * the profile itself (.m-surface: photo, name and age, occupation and city, who manages it, its status and badges, and
 * the demo's sections) beside the context cards and this app's publishing, plan and delete panels.
 */
function ProfileDashboard({ profile, peopleLabel, onOpen }: { profile: ProfileView; peopleLabel: string | null; onOpen: (section: ProfileSection) => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const labels = useLabels();
  const photos = usePhotos(profile.id);
  const [photosOpen, setPhotosOpen] = useState(false);
  const [cultureOpen, setCultureOpen] = useState(false);
  const f = profile.fields;
  const name = f.displayName ?? t('card.untitled');
  const cover = photos.data?.find((photo) => photo.isCover);
  const edit = profile.me.canEdit;
  const notShared = t('details.notShared');
  const listOr = (items: string[] | undefined | null) => (items?.length ? items.join(', ') : notShared);
  const facts: [string, string][] = [
    [t('details.height'), f.heightCm ? `${f.heightCm} cm` : notShared],
    [t('details.income'), f.incomeRange ? labels.incomeLabels[f.incomeRange] : notShared],
    [t('details.education'), f.education || notShared],
    [t('details.timeline'), f.timeline ? labels.timelineLabels[f.timeline] : notShared],
    [t('details.languages'), listOr(f.languages?.map((language) => suggestionLabel(t, 'spokenLanguage', language)))],
    [t('details.marital'), f.maritalStatus ? labels.maritalLabels[f.maritalStatus] : notShared],
    [t('details.religion'), f.religion ? labels.religionLabels[f.religion] : notShared],
    [t('details.relocation'), f.relocation ? labels.relocationLabels[f.relocation] : notShared],
  ];
  const family: [string, string][] = [
    [t('details.motherName'), f.motherName || notShared],
    [t('details.motherOccupation'), f.motherOccupation || notShared],
    [t('details.fatherName'), f.fatherName || notShared],
    [t('details.fatherOccupation'), f.fatherOccupation || notShared],
    [t('details.sisters'), listOr(f.sisters)],
    [t('details.brothers'), listOr(f.brothers)],
    [t('details.involvement'), f.familyInvolvement ? labels.involvementLabels[f.familyInvolvement] : notShared],
  ];
  return (
    <>
      <div className="m-page-heading">
        <div>
          <span className="m-kicker uppercase">{t('profile.dash.kicker')}</span>
          <h1>{t('profile.dash.title', { name })}</h1>
          <p>{t('profile.dash.lead')}</p>
        </div>
        {edit && (
          <button type="button" className="m-btn" onClick={() => onOpen('details')}>
            {t('profile.dash.edit')}
            <ArrowUpRight size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="m-two-columns">
        <section className="m-surface" aria-labelledby="own-profile-name">
          <div className="m-own-profile">
            <div className="m-own-photo">
              {cover ? <img src={cover.url} alt={t('photos.coverAlt')} /> : <UserRound size={44} aria-hidden="true" />}
              {edit && (
                <button type="button" aria-label={t('profile.dash.uploadPhoto')} onClick={() => setPhotosOpen(true)}>
                  <Camera size={18} aria-hidden="true" />
                </button>
              )}
            </div>
            <div>
              <h2 id="own-profile-name">
                {name}
                {f.birthDate ? `, ${ageOn(f.birthDate)}` : ''}
              </h2>
              <p>{[f.occupation, f.city].filter(Boolean).join(' · ')}</p>
              <span className="m-tag">
                <Users size={13} aria-hidden="true" />
                {roleLine(t, labels.relationshipLabels, profile)}
              </span>
              <p className="m-status">
                <ShieldCheck size={15} aria-hidden="true" />
                {labels.statusLabels[profile.status]}
              </p>
            </div>
          </div>
          <TrustBadges badges={profile.badges} />
          <section className="m-profile-section">
            <h3>{t('profile.dash.photos.title')}</h3>
            <p>{t('photos.notice')}</p>
            {edit && (
              <button type="button" className="m-btn m-secondary" onClick={() => setPhotosOpen(true)}>
                {t('profile.dash.photos.manage', { count: photos.data?.length ?? 0, max: MAX_PHOTOS })}
              </button>
            )}
          </section>
          <section className="m-profile-section">
            <h3>{t('profile.dash.culture.title')}</h3>
            <p>{t('profile.dash.culture.body')}</p>
            {edit && (
              <button type="button" className="m-btn m-secondary" onClick={() => setCultureOpen(true)}>
                {t('profile.dash.culture.edit')}
              </button>
            )}
          </section>
          <section className="m-profile-section">
            <h3>{t('profile.dash.contacts.title')}</h3>
            <p>{t('contacts.notice')}</p>
            {edit && (
              <button type="button" className="m-btn m-secondary" onClick={() => onOpen('verify')}>
                {t('profile.dash.contacts.edit')}
              </button>
            )}
          </section>
          <div className="m-profile-section">
            <h3>{t('profile.dash.words.title')}</h3>
            <p>{f.bio || t('profile.dash.words.empty')}</p>
            {Boolean(f.values?.length) && (
              <div className="m-values">
                {f.values!.map((value) => (
                  <span key={value}>{labels.valueLabels[value]}</span>
                ))}
              </div>
            )}
          </div>
          <dl className="m-detail-grid">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt>
                  <small>{label}</small>
                </dt>
                <dd>
                  <strong>{value}</strong>
                </dd>
              </div>
            ))}
          </dl>
          <div className="m-profile-section">
            <h3>{t('profile.dash.beyond.title')}</h3>
            {Boolean(f.hobbies?.length) && (
              <div className="m-values">
                {f.hobbies!.map((hobby) => (
                  <span key={hobby}>{hobby}</span>
                ))}
              </div>
            )}
            {edit && (
              <button type="button" className="m-text" onClick={() => onOpen('story')}>
                {t('profile.dash.beyond.edit')}
              </button>
            )}
          </div>
          <div className="m-profile-section">
            <h3>{t('profile.dash.family.title')}</h3>
            <dl className="m-detail-grid">
              {family.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <p>{f.familyStory || t('profile.dash.family.empty')}</p>
          </div>
        </section>
        <div className="m-stack">
          <TrustAside profile={profile} peopleLabel={peopleLabel} onOpen={onOpen} />
          <Overview profile={profile} onOpenPlans={() => navigate(`/profiles/${profile.id}/plan`)} onOpen={onOpen} />
        </div>
      </div>
      <Dialog open={photosOpen} onOpenChange={setPhotosOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <span className="m-kicker uppercase">{t('profile.dash.photosDialog.kicker')}</span>
            <DialogTitle>{t('photos.title')}</DialogTitle>
            <DialogDescription>{t('photos.notice')}</DialogDescription>
          </DialogHeader>
          <PhotosPanel profile={profile} inDialog />
        </DialogContent>
      </Dialog>
      <Dialog open={cultureOpen} onOpenChange={setCultureOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('profile.dash.culture.dialogTitle')}</DialogTitle>
            <DialogDescription>{t('profile.dash.culture.dialogBody')}</DialogDescription>
          </DialogHeader>
          <DetailsForm profile={profile} part="lifestyle" onSaved={() => setCultureOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
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
