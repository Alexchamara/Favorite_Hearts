/**
 * The two pages an email link opens (owner decision, 11 Nov 2026), in the demo's entry frame:
 *  - /confirm#email=…&code=…  the sign-up email's one-step button: confirms the account and signs in;
 *  - /reset-password#token=…  the reset email's link: "Choose a new password." (the demo's reset step).
 * The address, code and token are after "#", so they never reach a server log; each page removes them from the address
 * bar as soon as it has read them.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { passwordProblem } from '@fh/shared';
import { TextField } from '@/components/form/fields';
import { kickerClass } from '@/components/layout';
import { useI18n } from '@/lib/i18n';
import { resetSession } from '@/lib/queries';
import { EntryShell } from './Entry';
import { AuthProblem, confirmSignUp, resetPassword } from './password-auth';

/** Reads the fragment once and clears it from the address bar (and from history). */
function useFragment(): URLSearchParams {
  const [params] = useState(() => new URLSearchParams(window.location.hash.slice(1)));
  useEffect(() => {
    if (window.location.hash) history.replaceState(history.state, '', window.location.pathname + window.location.search);
  }, []);
  return params;
}

export function ConfirmLinkPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const params = useFragment();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    // Once only: the code works once, and React runs effects twice while developing.
    if (started.current) return;
    started.current = true;
    const email = params.get('email');
    const phoneNumber = params.get('phoneNumber');
    const code = params.get('code') ?? '';
    if (!code || (!email && !phoneNumber)) return setError(t('auth.reset.invalidLink'));
    confirmSignUp(email ? { email } : { phoneNumber: phoneNumber! }, code)
      .then(async () => {
        await resetSession();
        navigate('/', { replace: true });
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : t('common.somethingWrong')));
  }, [navigate, params, t]);
  return (
    <EntryShell aside="title">
      <span className={kickerClass}>{t('home.kicker')}</span>
      <h1>{t('entry.code.title')}</h1>
      {error ? (
        <>
          <p className="m-error" role="alert">
            {error}
          </p>
          <button type="button" className="m-btn" onClick={() => navigate('/', { replace: true })}>
            {t('auth.backToEntry')}
          </button>
        </>
      ) : (
        <p role="status">{t('auth.confirming')}</p>
      )}
    </EntryShell>
  );
}

export function ResetPasswordPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const params = useFragment();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [visible, setVisible] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [error, setError] = useState<string | null>(token ? null : t('auth.reset.invalidLink'));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const problem = passwordProblem(password);
    const next = {
      password: problem ? t(`validation.password.${problem}`) : undefined,
      confirm: !problem && confirm !== password ? t('auth.mismatch') : undefined,
    };
    setErrors(next);
    if (next.password || next.confirm) return;
    setBusy(true);
    try {
      await resetPassword(token, password);
      setDone(true);
      heading.current?.focus();
    } catch (err) {
      const fields = err instanceof AuthProblem ? err.fields : {};
      if (fields.newPassword) setErrors({ password: fields.newPassword });
      setError(err instanceof Error ? err.message : t('common.somethingWrong'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <EntryShell aside="title">
      <span className={kickerClass}>{t('home.kicker')}</span>
      <h1 ref={heading} tabIndex={-1}>
        {t('auth.reset.title')}
      </h1>
      {done ? (
        <>
          <p role="status">{t('auth.reset.done')}</p>
          <button type="button" className="m-btn" onClick={() => navigate('/', { replace: true, state: { mode: 'login' } })}>
            {t('auth.tab.login')}
          </button>
        </>
      ) : (
        <form onSubmit={submit} noValidate>
          <TextField
            label={t('auth.reset.new')}
            placeholder={t('auth.passwordHint')}
            type={visible ? 'text' : 'password'}
            autoComplete="new-password"
            maxLength={128}
            value={password}
            onChange={setPassword}
            error={errors.password}
          />
          <TextField
            label={t('auth.reset.confirmNew')}
            type={visible ? 'text' : 'password'}
            autoComplete="new-password"
            maxLength={128}
            value={confirm}
            onChange={setConfirm}
            error={errors.confirm}
          />
          <button type="button" className="m-text" aria-pressed={visible} onClick={() => setVisible(!visible)}>
            {t(visible ? 'auth.hidePassword' : 'auth.showPassword')}
          </button>
          <button type="submit" className="m-btn" disabled={busy || !token}>
            {busy ? t('auth.wait') : t('auth.reset.save')}
          </button>
          <p className="m-error" role="alert">
            {error}
          </p>
        </form>
      )}
    </EntryShell>
  );
}
