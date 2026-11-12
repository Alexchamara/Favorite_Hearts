/**
 * The demo's account panel (product/app/matrimony/account-entry.ts, SCREEN-023 to 026) on the real API (owner
 * decision, 11 Nov 2026): Sign up / Log in as the demo's toggle buttons (.ma-tabs), the demo's fields, "Show password",
 * the consent tick and its ⓘ note, then:
 *  - sign up → "Verify it’s you.": the code sent to the email address (with a one-step link) or by SMS;
 *  - log in → the address and password, no code;
 *  - "Forgot password?" → a reset link by email (phone-only accounts reset through support).
 * The demo's sample-account buttons, simulation notice and demo code are not built (demo-only). Each step moves focus to
 * its heading, so a screen reader hears where it is.
 */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { passwordProblem, type PasswordProblem } from '@fh/shared';
import { CODE_LENGTH, CodeInput, useCodeCheck } from '@/components/form/code-input';
import { CheckboxField, TextField } from '@/components/form/fields';
import { kickerClass, Notice } from '@/components/layout';
import { useBotCheck } from '@/components/turnstile';
import { env } from '@/lib/env';
import { useI18n, type AppTextKey } from '@/lib/i18n';
import { resetSession, useServiceStatus } from '@/lib/queries';
import { readPreferences } from './Entry';
import {
  AuthProblem,
  confirmSignUp,
  identityText,
  logIn,
  phoneAllowed,
  readIdentity,
  requestReset,
  startSignUp,
  type Identity,
} from './password-auth';

type Mode = 'signup' | 'login' | 'recover';
type Phase = { kind: 'form' } | { kind: 'confirm'; identity: Identity } | { kind: 'sent'; email: string };
type Errors = Partial<Record<'name' | 'identity' | 'password' | 'confirm' | 'consent', string>>;

const PASSWORD_TEXT: Record<PasswordProblem, AppTextKey> = {
  tooShort: 'validation.password.tooShort',
  tooLong: 'validation.password.tooLong',
  common: 'validation.password.common',
  personal: 'validation.password.personal',
};

export function AccountPanel({ initialMode = 'signup' }: { initialMode?: 'signup' | 'login' }) {
  const { t, rich } = useI18n();
  const navigate = useNavigate();
  const status = useServiceStatus();
  const bot = useBotCheck();
  const country = readPreferences().country ?? 'LK';
  const phones = phoneAllowed(country);

  const [mode, setMode] = useState<Mode>(initialMode);
  const [phase, setPhase] = useState<Phase>({ kind: 'form' });
  const [name, setName] = useState('');
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [consent, setConsent] = useState(false);
  const [visible, setVisible] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  // A new step: focus its heading (not on the first render, where focus stays where the visitor is).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    heading.current?.focus();
  }, [mode, phase.kind]);

  const switchTo = (next: Mode) => {
    setMode(next);
    setPhase({ kind: 'form' });
    setPassword('');
    setConfirm('');
    setErrors({});
    setError(null);
  };

  /** What the person typed, checked here first (the server checks again and decides). */
  function check(): { target: Identity } | null {
    const next: Errors = {};
    const target = readIdentity(identity, phones);
    if (!target) {
      const looksLikePhone = !identity.includes('@') && identity.replace(/\D/g, '').length >= 7;
      next.identity = t(
        looksLikePhone && !env.loginSmsEnabled ? 'auth.phoneLater' : looksLikePhone && !phones ? 'auth.emailOnly' : phones ? 'auth.identityInvalid' : 'validation.email',
      );
    }
    if (mode === 'signup') {
      if (name.trim().length < 2) next.name = t('auth.nameRequired');
      const problem = passwordProblem(password, { name, ...(target && 'email' in target ? { email: target.email } : { phone: target?.phoneNumber }) });
      if (problem) next.password = t(PASSWORD_TEXT[problem]);
      if (!next.password && confirm !== password) next.confirm = t('auth.mismatch');
      if (!consent) next.consent = t('validation.signUpConsent');
    } else if (mode === 'login' && !password) {
      next.password = t('validation.required');
    } else if (mode === 'recover' && target && !('email' in target)) {
      next.identity = t('auth.recover.phone');
    }
    setErrors(next);
    return Object.keys(next).length || !target ? null : { target };
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const checked = check();
    if (!checked) return;
    setBusy(true);
    try {
      if (mode === 'signup') {
        await startSignUp({ name: name.trim(), identity: checked.target, password, consent }, bot.headers);
        setPhase({ kind: 'confirm', identity: checked.target });
      } else if (mode === 'login') {
        const result = (await logIn(checked.target, password, bot.headers)) as { twoFactorRedirect?: boolean } | null;
        // Staff accounts finish with their two-step code on the staff page.
        if (result?.twoFactorRedirect) return navigate('/staff');
        await resetSession();
        // Every log-in opens Discover (owner, 12 Nov 2026); staff go on to their workspace from there.
        navigate('/browse', { replace: true });
      } else {
        const email = 'email' in checked.target ? checked.target.email : '';
        await requestReset(email, bot.headers);
        setPhase({ kind: 'sent', email });
      }
    } catch (err) {
      const problem = err instanceof AuthProblem ? err : null;
      const fields = problem?.fields ?? {};
      if (Object.keys(fields).length) {
        setErrors({
          name: fields.name,
          identity: fields.email ?? fields.phoneNumber,
          password: fields.password,
          consent: fields.consent,
        });
      }
      setError(problem?.message ?? t('common.somethingWrong'));
    } finally {
      setBusy(false);
      bot.reset();
    }
  }

  const entry = useCodeCheck(
    async (code) => {
      if (phase.kind !== 'confirm') return;
      await confirmSignUp(phase.identity, code);
    },
    async () => {
      await resetSession();
      // A new account starts by creating its profile (owner, 12 Nov 2026).
      navigate('/profiles/new', { replace: true });
    },
  );

  async function resend() {
    if (phase.kind !== 'confirm') return;
    setError(null);
    setBusy(true);
    try {
      await startSignUp({ name: name.trim(), identity: phase.identity, password, consent }, bot.headers);
      entry.reset();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.somethingWrong'));
    } finally {
      setBusy(false);
      bot.reset();
    }
  }

  const titles: Record<Mode, AppTextKey> = { signup: 'home.title', login: 'auth.login.title', recover: 'auth.recover.title' };
  const leads: Record<Mode, AppTextKey> = { signup: 'auth.signup.lead', login: 'auth.login.lead', recover: 'auth.recover.lead' };
  const head = (title: ReactNode, lead: ReactNode) => (
    <>
      <span className={kickerClass}>{t('home.kicker')}</span>
      <h1 ref={heading} tabIndex={-1}>
        {title}
      </h1>
      <p>{lead}</p>
    </>
  );

  if (phase.kind === 'confirm') {
    const sms = 'phoneNumber' in phase.identity;
    const strong = (words: ReactNode) => <strong>{words}</strong>;
    return (
      <>
        {head(t('entry.code.title'), rich(sms ? 'auth.confirm.sms' : 'auth.confirm.email', { strong }, { contact: identityText(phase.identity) }))}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            entry.submit();
          }}
        >
          <CodeInput label={t('signIn.code')} value={entry.value} onChange={entry.change} state={entry.state} message={entry.message} fromSms={sms} />
          {bot.widget}
          <button type="submit" className="m-btn" disabled={entry.value.length < CODE_LENGTH || entry.state !== 'idle'}>
            {entry.state === 'checking' ? t('signIn.checking') : t('signIn.verify')}
          </button>
          <button type="button" className="m-text" onClick={() => void resend()} disabled={busy || !bot.ready}>
            {t('signIn.resend')}
          </button>
          <button type="button" className="m-text" onClick={() => setPhase({ kind: 'form' })}>
            {t('signIn.otherEmail')}
          </button>
          <p className="m-error" role="alert">
            {error}
          </p>
        </form>
      </>
    );
  }

  if (phase.kind === 'sent') {
    return (
      <>
        {head(t('auth.recover.title'), rich('auth.recover.sent', { strong: (words) => <strong>{words}</strong> }, { contact: phase.email }))}
        <button type="button" className="m-btn" onClick={() => switchTo('login')}>
          {t('auth.recover.back')}
        </button>
      </>
    );
  }

  const identityLabel = mode === 'recover' || !phones ? t('signIn.email') : t('auth.identity');
  return (
    <>
      {head(t(titles[mode]), t(leads[mode]))}
      {mode !== 'recover' && (
        <div className="ma-tabs" role="group" aria-label={t('auth.tabs')}>
          <button type="button" aria-pressed={mode === 'signup'} onClick={() => switchTo('signup')}>
            {t('auth.tab.signup')}
          </button>
          <button type="button" aria-pressed={mode === 'login'} onClick={() => switchTo('login')}>
            {t('auth.tab.login')}
          </button>
        </div>
      )}
      {mode === 'signup' && status.data?.signupsPaused && (
        <Notice tone="warning" title={t('signIn.paused.title')}>
          {t('signIn.paused.body')}
        </Notice>
      )}
      <form onSubmit={submit} noValidate>
        {mode === 'signup' && (
          <TextField
            label={t('auth.name')}
            placeholder={t('auth.namePlaceholder')}
            autoComplete="name"
            maxLength={80}
            value={name}
            onChange={setName}
            error={errors.name}
          />
        )}
        <TextField
          label={identityLabel}
          placeholder={mode === 'recover' || !phones ? t('signIn.emailPlaceholder') : t('auth.identityPlaceholder')}
          type={mode === 'recover' || !phones ? 'email' : 'text'}
          inputMode="email"
          autoComplete="username"
          maxLength={150}
          value={identity}
          onChange={setIdentity}
          error={errors.identity}
        />
        {mode !== 'recover' && (
          <>
            <TextField
              label={t('auth.password')}
              placeholder={t('auth.passwordHint')}
              type={visible ? 'text' : 'password'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              maxLength={128}
              value={password}
              onChange={setPassword}
              error={errors.password}
            />
            <button type="button" className="m-text" aria-pressed={visible} onClick={() => setVisible(!visible)}>
              {t(visible ? 'auth.hidePassword' : 'auth.showPassword')}
            </button>
          </>
        )}
        {mode === 'signup' && (
          <>
            <TextField
              label={t('auth.confirmPassword')}
              type={visible ? 'text' : 'password'}
              autoComplete="new-password"
              maxLength={128}
              value={confirm}
              onChange={setConfirm}
              error={errors.confirm}
            />
            <CheckboxField
              checked={consent}
              onChange={setConsent}
              error={errors.consent}
              label={rich('auth.consent', {
                terms: (words) => (
                  <a href="/terms/" target="_blank" rel="noopener">
                    {words}
                  </a>
                ),
                privacy: (words) => (
                  <a href="/privacy/" target="_blank" rel="noopener">
                    {words}
                  </a>
                ),
              })}
            />
            <details className="fh-native-help">
              <summary aria-label={t('auth.more')}>ⓘ</summary>
              <p>{t('auth.moreText')}</p>
            </details>
          </>
        )}
        {bot.widget}
        <button type="submit" className="m-btn" disabled={busy || !bot.ready}>
          {busy ? t('auth.wait') : t(mode === 'signup' ? 'auth.create' : mode === 'login' ? 'auth.tab.login' : 'auth.recover.send')}
        </button>
        {mode === 'login' && (
          <button type="button" className="m-text" onClick={() => switchTo('recover')}>
            {t('auth.forgot')}
          </button>
        )}
        {mode === 'recover' && (
          <button type="button" className="m-text" onClick={() => switchTo('login')}>
            {t('auth.recover.back')}
          </button>
        )}
        <p className="m-error" role="alert">
          {error}
        </p>
      </form>
      <p className="ma-notice">{t('auth.staffNever')}</p>
    </>
  );
}
