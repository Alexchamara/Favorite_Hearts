/**
 * The way through a new profile (owner, 5 Nov 2026): Details, Photos, Contacts, Verify, Publish. While the profile is
 * a draft, a row of steps shows what is done and what comes next, and each tab ends with a button to the next step,
 * so nobody is left wondering where to go after saving. It disappears once the profile is published.
 */
import { Check } from 'lucide-react';
import { Link } from 'react-router';
import type { ProfileView } from '@fh/shared';
import { Card } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { usePhotos } from '@/lib/queries';
import { cn } from '@/lib/utils';

export type SetupTab = 'details' | 'photos' | 'contacts' | 'overview';
type StepKey = 'details' | 'photos' | 'contacts' | 'verify' | 'publish';
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
    { key: 'contacts', state: profile.missing.includes('contactPhone') ? 'todo' : 'done' },
  ];
  // The account holder's own checks; when someone else publishes, theirs stay private and the Overview says so.
  if (publisher?.isMe) {
    const verified = publisher.phoneVerified && publisher.documentStatus === 'approved';
    steps.push({ key: 'verify', state: verified ? 'done' : publisher.phoneVerified && publisher.documentStatus === 'pending' ? 'waiting' : 'todo' });
  }
  steps.push({ key: 'publish', state: profile.status === 'published' ? 'done' : 'todo' });
  return { steps, next: steps.find((step) => step.state === 'todo')?.key ?? null };
}

/** Where a step is done: a tab of this page, or the verification page. */
export function stepTarget(key: StepKey, profileId: string): { tab: SetupTab } | { href: string } {
  if (key === 'verify') return { href: `/verify?profile=${profileId}` };
  return { tab: key === 'publish' ? 'overview' : key };
}

export function SetupGuide({ profile, onOpen }: { profile: ProfileView; onOpen: (tab: SetupTab) => void }) {
  const { t } = useI18n();
  const { steps, next } = useSetupSteps(profile);
  const label = (key: StepKey) => t(`setup.step.${key}`);
  const stateText = (step: SetupStep) =>
    step.state === 'done' ? t('setup.state.done') : step.state === 'waiting' ? t('setup.state.waiting') : step.key === next ? t('setup.state.next') : step.key === 'photos' ? t('setup.state.recommended') : '';
  return (
    <section aria-labelledby="setup-title" className="mb-6 rounded-[18px] border bg-card p-4 sm:p-5">
      <h2 id="setup-title" className="font-serif text-xl">
        {t('setup.title')}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('setup.intro')}</p>
      <ol className="mt-4 grid gap-2 sm:grid-cols-5">
        {steps.map((step, index) => {
          const target = stepTarget(step.key, profile.id);
          const className = cn(
            'flex min-h-14 w-full items-center gap-3 rounded-[12px] border px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
            step.key === next && 'border-[var(--ui-purple)] bg-brand-soft',
          );
          const content = (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                  step.state === 'done' && 'border-transparent bg-brand text-[var(--ui-on-purple)]',
                )}
              >
                {step.state === 'done' ? <Check className="size-4" /> : index + 1}
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">{label(step.key)}</span>
                {/* On the highlighted step the muted colour is under 4.5:1, so it uses the full text colour. */}
                <span className={cn('block text-xs', step.key === next ? 'text-foreground' : 'text-muted-foreground')}>{stateText(step)}</span>
              </span>
            </>
          );
          return (
            <li key={step.key} aria-current={step.key === next ? 'step' : undefined}>
              {'href' in target ? (
                <Link to={target.href} className={className}>
                  {content}
                </Link>
              ) : (
                <button type="button" className={className} onClick={() => onOpen(target.tab)}>
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** The end of a tab while setting up: says what comes next and goes there. */
export function NextStep({ profile, after, onOpen }: { profile: ProfileView; after: 'photos' | 'contacts'; onOpen: (tab: SetupTab) => void }) {
  const { t } = useI18n();
  const { steps } = useSetupSteps(profile);
  if (!inSetup(profile)) return null;
  // After photos come contacts; after contacts, verification if it is still to do, otherwise review and publish.
  const verify = steps.find((step) => step.key === 'verify');
  const goTo: StepKey = after === 'photos' ? 'contacts' : verify && verify.state === 'todo' ? 'verify' : 'publish';
  const target = stepTarget(goTo, profile.id);
  const hint = after === 'photos' ? t('setup.next.photosHint') : profile.missing.includes('contactPhone') ? t('setup.next.contactsHint') : null;
  return (
    <Card>
      <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">{t('setup.next.kicker')}</p>
      <p className="mt-1 font-serif text-xl">{t(`setup.next.to.${goTo}`)}</p>
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
