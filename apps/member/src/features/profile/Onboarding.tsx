/**
 * The demo's profile setup wizard (product/preview/matrimony.tsx, SCREEN-028 to 032; decision B3, 9 Nov 2026): five
 * steps, Your role, The essentials, Your story, Privacy, Review, in the demo's markup: main.m-onboarding with the
 * editorial aside (.m-onboard-aside) and the content (.m-onboard-content: step head, progress, step labels, the step,
 * and the wizard actions).
 *
 * The steps sit on this app's own sections and endpoints: Your role is the new-profile page (POST /profiles), The
 * essentials and Your story are the details form in parts (PATCH /profiles/:id) with photos at the end of the story,
 * Privacy is the private contacts and the account holder's own checks, Review is publishing.
 */
import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { useI18n } from '@/lib/i18n';

export const WIZARD_STEPS = ['role', 'essentials', 'story', 'privacy', 'review'] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export function Onboarding({
  step,
  isOpen,
  onStep,
  kicker,
  title,
  lead,
  children,
  error,
  back,
  next,
  nextLabel,
  busy = false,
  onSaveLater,
}: {
  step: WizardStep;
  /** Whether a step label may be followed (a step opens once the ones before it are complete). */
  isOpen: (step: WizardStep) => boolean;
  onStep: (step: WizardStep) => void;
  kicker: string;
  title: string;
  lead?: ReactNode;
  children: ReactNode;
  error?: string | null;
  back: () => void;
  /** Continue; left out on the last step, where the step's own action (publish) finishes. */
  next?: () => void;
  nextLabel?: string;
  busy?: boolean;
  onSaveLater?: () => void;
}) {
  const { t } = useI18n();
  const index = WIZARD_STEPS.indexOf(step);
  return (
    <main id="main" className="m-onboarding">
      <aside className="m-onboard-aside">
        <div>
          <span className="m-kicker uppercase">{t('onboard.kicker')}</span>
          <h1>
            {t('home.aside.title1')}
            <br />
            <em>{t('home.aside.title2')}</em>
          </h1>
          <p>{t('onboard.lead')}</p>
        </div>
        <div className="m-onboard-quote">
          <span className="uppercase">{t('onboard.quote.kicker')}</span>
          <h3>
            {t('onboard.quote.title1')}
            <br />
            {t('onboard.quote.title2')}
          </h3>
          <p>{t('onboard.quote.body')}</p>
        </div>
      </aside>
      <section className="m-onboard-content" aria-labelledby="onboard-title">
        <div className="m-step-head">
          <span>{t('onboard.stepOf', { step: index + 1, count: WIZARD_STEPS.length })}</span>
        </div>
        <Progress value={(index + 1) * 20} className="m-progress" aria-label={t('onboard.stepOf', { step: index + 1, count: WIZARD_STEPS.length })} />
        <nav className="m-step-labels" aria-label={t('onboard.steps')}>
          {WIZARD_STEPS.map((option) => (
            <button
              type="button"
              key={option}
              className={option === step ? 'active' : ''}
              disabled={option !== step && !isOpen(option)}
              aria-current={option === step ? 'step' : undefined}
              onClick={() => option !== step && onStep(option)}
            >
              {t(`onboard.label.${option}`)}
            </button>
          ))}
        </nav>
        <span className="m-kicker uppercase">{kicker}</span>
        <h2 id="onboard-title" tabIndex={-1} className="outline-none">
          {title}
        </h2>
        {lead && <p className="m-lead">{lead}</p>}
        {children}
        {error && (
          <p className="m-error" role="alert">
            {error}
          </p>
        )}
        <div className="m-wizard-actions">
          <button type="button" className="m-text" onClick={back}>
            <ArrowLeft size={16} aria-hidden="true" />
            {t('onboard.back')}
          </button>
          {next && (
            <button type="button" className="m-btn" disabled={busy} onClick={next}>
              {busy ? t('common.saving') : (nextLabel ?? t('common.continue'))}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          )}
        </div>
        {onSaveLater && (
          <button type="button" className="m-save-draft" disabled={busy} onClick={onSaveLater}>
            {t('onboard.saveLater')}
          </button>
        )}
      </section>
    </main>
  );
}
