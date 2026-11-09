/**
 * The way through a new profile (owner, 5 Nov 2026): Details, Photos, Contacts, Verify, Publish. While the profile is
 * a draft, a row of steps shows what is done and what comes next, and each tab ends with a button to the next step,
 * so nobody is left wondering where to go after saving. It disappears once the profile is published.
 */
import { Check, Lock } from 'lucide-react';
import { Link } from 'react-router';
import type { ProfileView } from '@fh/shared';
import { Card, kickerClass } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { usePhotos } from '@/lib/queries';
import { cn } from '@/lib/utils';

export type SetupTab = 'details' | 'story' | 'photos' | 'verify' | 'overview';
/** Every section of the profile page: the steps' own, plus the plan and the manager/candidate section. */
export type ProfileSection = SetupTab | 'plan' | 'people';
type StepKey = 'details' | 'photos' | 'verify' | 'publish';
type StepState = 'done' | 'waiting' | 'todo';
export type SetupStep = { key: StepKey; state: StepState };

/** The guide is for setting up: shown on a draft the viewer can edit. */
export const inSetup = (profile: ProfileView) => profile.status === 'draft' && profile.me.canEdit;

export function useSetupSteps(profile: ProfileView): { steps: SetupStep[]; next: StepKey | null } {
  const photos = usePhotos(profile.id);
  const publisher = profile.publisher;
  const detailsMissing = profile.missing.filter((key) => key !== 'contactPhone');
  const steps: SetupStep[] = [
    { key: 'details', state: detailsMissing.length ? 'todo' : 'done' },
    { key: 'photos', state: (photos.data?.length ?? 0) > 0 ? 'done' : 'todo' },
  ];
  // Verify (owner, 6 Nov 2026: contacts moved into it): the private contact details, then the account holder's own
  // checks. When someone else publishes, their checks stay private and only the contacts count here.
  const contactsDone = !profile.missing.includes('contactPhone');
  const verified = !publisher?.isMe || (publisher.phoneVerified && publisher.documentStatus === 'approved');
  const waiting = Boolean(publisher?.isMe && publisher.phoneVerified && publisher.documentStatus === 'pending');
  steps.push({ key: 'verify', state: !contactsDone ? 'todo' : verified ? 'done' : waiting ? 'waiting' : 'todo' });
  steps.push({ key: 'publish', state: profile.status === 'published' ? 'done' : 'todo' });
  return { steps, next: steps.find((step) => step.state === 'todo')?.key ?? null };
}

const sectionOf = (key: StepKey): SetupTab => (key === 'publish' ? 'overview' : key);

/** The address of each section: /profiles/:id/details, …/photos, …/verify, …/publish, …/plan, …/people. */
export const SECTION_SLUGS: Record<ProfileSection, string> = {
  details: 'details',
  story: 'story',
  photos: 'photos',
  verify: 'verify',
  overview: 'publish',
  plan: 'plan',
  people: 'people',
};
export const sectionFromSlug = (slug: string | undefined): ProfileSection | null =>
  (Object.entries(SECTION_SLUGS).find(([, value]) => value === slug)?.[0] as ProfileSection | undefined) ?? null;

/**
 * While setting up, a step opens only once the steps before it are complete (owner, 6 Nov 2026). Photos are optional,
 * so they never hold Verify back; a document waiting for review does not hold Publish back either (the overview says
 * what is still to come). Published profiles, and the Plan and manager/candidate sections, are always open.
 */
export function sectionOpen(profile: ProfileView, steps: SetupStep[], section: ProfileSection): boolean {
  if (!inSetup(profile) || section === 'plan' || section === 'people' || section === 'details') return true;
  // The setup wizard's Your story opens once the essentials are complete (decision B3).
  if (section === 'story') return essentialsDone(profile);
  const state = (key: StepKey) => steps.find((step) => step.key === key)?.state ?? 'done';
  if (section === 'photos' || section === 'verify') return state('details') === 'done';
  return state('details') === 'done' && state('verify') !== 'todo';
}

/** Where to send someone who asked for a section that is not open yet: the first step still to do. */
export function firstOpenTodo(_profile: ProfileView, steps: SetupStep[]): ProfileSection {
  const todo = steps.find((step) => step.state === 'todo' && step.key !== 'photos');
  return todo ? sectionOf(todo.key) : 'overview';
}

/** Where a step is done: a section of this page (Verify too, since 6 Nov 2026: no separate page any more). */
export function stepTarget(key: StepKey, _profileId?: string): { tab: SetupTab } | { href: string } {
  return { tab: sectionOf(key) };
}

/**
 * The profile's steps, always above its sections (owner, 6 Nov 2026: they replace the tab bar). While setting up they
 * show the way through; once published every step is ticked and still opens its section. The open section's step is
 * marked; "Next" marks the first step still to do.
 */
export function ProfileSteps({ profile, open, onOpen }: { profile: ProfileView; open: ProfileSection; onOpen: (section: SetupTab) => void }) {
  const { t } = useI18n();
  const { steps, next } = useSetupSteps(profile);
  const setup = inSetup(profile);
  const label = (key: StepKey) => t(`setup.step.${key}`);
  const stateText = (step: SetupStep) =>
    step.state === 'done' ? t('setup.state.done') : step.state === 'waiting' ? t('setup.state.waiting') : step.key === next ? t('setup.state.next') : step.key === 'photos' ? t('setup.state.recommended') : '';
  const done = steps.filter((step) => step.state === 'done').length;
  const openIndex = steps.findIndex((step) => sectionOf(step.key) === open);
  return (
    <nav aria-labelledby="setup-title" id="profile-steps" className="mb-6 scroll-mt-6 rounded-[var(--ui-panel-radius)] border bg-card p-5 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="setup-title" className="font-serif text-2xl">
          {t(setup ? 'setup.title' : 'profile.steps.title')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {!next ? t('setup.allDone') : openIndex >= 0 ? t('setup.stepOf', { current: openIndex + 1, total: steps.length }) : t('setup.doneOf', { done, total: steps.length })}
        </p>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{t(setup ? 'setup.intro' : 'profile.steps.intro')}</p>
      {/* The demo's progress line: how much of the way is done. */}
      <div className="mt-5 h-1 overflow-hidden rounded-full bg-[var(--ui-line)]" aria-hidden="true">
        <div className="h-full rounded-full bg-[var(--ui-rose)] transition-[width] duration-500 ease-out" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="mt-3 grid gap-1" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((step, index) => {
          const target = stepTarget(step.key, profile.id);
          const isOpen = index === openIndex;
          const locked = !sectionOpen(profile, steps, sectionOf(step.key));
          const className = cn(
            'relative flex h-full min-h-14 w-full flex-col items-center gap-1 rounded-[10px] px-1 pt-2 pb-2.5 text-center text-xs transition-colors hover:bg-[var(--ui-soft)] sm:text-sm',
            locked && 'cursor-not-allowed opacity-50 hover:bg-transparent',
            isOpen && 'bg-[var(--ui-purple-soft)] text-[var(--ui-purple)] after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[var(--ui-accent)] hover:bg-[var(--ui-purple-soft)]',
          );
          const content = (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold',
                  step.state === 'done' && 'border-transparent bg-brand text-[var(--ui-on-purple)]',
                  isOpen && step.state !== 'done' && 'border-[var(--ui-purple)]',
                )}
              >
                {step.state === 'done' ? <Check className="size-3.5" /> : locked ? <Lock className="size-3" /> : index + 1}
              </span>
              <span className="font-semibold break-words">{label(step.key)}</span>
              {/* On the highlighted step the muted colour is under 4.5:1, so it uses the full text colour. */}
              <span className={cn('hidden text-xs sm:block', isOpen ? 'text-foreground' : 'text-muted-foreground')}>{locked ? t('setup.state.locked') : stateText(step)}</span>
              <span className="sr-only sm:hidden">{locked ? t('setup.state.locked') : stateText(step)}</span>
            </>
          );
          return (
            <li key={step.key}>
              {'href' in target ? (
                <Link to={target.href} className={className}>
                  {content}
                </Link>
              ) : (
                <button
                  type="button"
                  aria-current={isOpen ? 'step' : undefined}
                  aria-disabled={locked || undefined}
                  className={className}
                  onClick={() => !locked && onOpen(target.tab)}
                >
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** The end of a tab while setting up: says what comes next and goes there. */
export function NextStep({ profile, after, onOpen }: { profile: ProfileView; after: 'photos' | 'verify'; onOpen: (tab: SetupTab) => void }) {
  const { t } = useI18n();
  const { steps } = useSetupSteps(profile);
  if (!inSetup(profile)) return null;
  // After photos comes Verify (contacts and checks); after Verify, review and publish.
  const verify = steps.find((step) => step.key === 'verify');
  const goTo: StepKey = after === 'photos' ? 'verify' : 'publish';
  const target = stepTarget(goTo, profile.id);
  const hint = after === 'photos' ? t('setup.next.photosHint') : verify?.state === 'todo' && profile.missing.includes('contactPhone') ? t('setup.next.contactsHint') : null;
  return (
    <Card>
      <p className={kickerClass}>{t('setup.next.kicker')}</p>
      <p className="mt-2 font-serif text-2xl tracking-[-0.02em]">{t(`setup.next.to.${goTo}`)}</p>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      <div className="mt-4">
        {'href' in target ? (
          <Button asChild className="h-11">
            <Link to={target.href}>{t(`setup.next.button.${goTo}`)} →</Link>
          </Button>
        ) : (
          <Button className="h-11" onClick={() => onOpen(target.tab)}>
            {t(`setup.next.button.${goTo}`)} →
          </Button>
        )}
      </div>
    </Card>
  );
}

/** The details the wizard's The essentials asks for are all there (the story's bio and the contacts come later). */
export const essentialsDone = (profile: ProfileView) => !profile.missing.some((key) => key !== 'contactPhone' && key !== 'bio');
