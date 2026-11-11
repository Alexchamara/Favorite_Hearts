/**
 * Accepting an invitation needs the candidate's own account (OWNER-DECISIONS section 5; sign-in decided 11 Nov 2026).
 * The invitation's code was sent to the invited address, so it already proves that address: "Sign up" asks only for
 * the name and a password and makes the account, accepts and signs in at once (no second code). Someone who already
 * has an account at that address logs in with the password, then the page accepts. The demo's Sign up / Log in look.
 */
import { useState, type FormEvent } from 'react';
import { passwordProblem } from '@fh/shared';
import { CheckboxField, TextField } from '@/components/form/fields';
import { useBotCheck } from '@/components/turnstile';
import { useI18n } from '@/lib/i18n';
import { resetSession } from '@/lib/queries';
import { phoneAllowed, readIdentity, AuthProblem, joinByInvitation, logIn } from '@/features/auth/password-auth';
import { readPreferences } from '@/features/auth/Entry';

type Props = {
  token: string;
  code: string;
  /** The masked invited address ("n•••@example.test"). */
  contactHint: string;
  /** After the account was made and the invitation accepted. */
  onJoined: (profileId: string) => void;
  /** After logging in to an existing account: the page accepts with it. */
  onLoggedIn: () => void;
};

export function InviteAccount({ token, code, contactHint, onJoined, onLoggedIn }: Props) {
  const { t, rich } = useI18n();
  const bot = useBotCheck();
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [name, setName] = useState('');
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [consent, setConsent] = useState(false);
  const [visible, setVisible] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const phones = phoneAllowed(readPreferences().country ?? 'LK');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const next: Record<string, string | undefined> = {};
    const target = mode === 'login' ? readIdentity(identity, phones) : null;
    if (mode === 'signup') {
      if (name.trim().length < 2) next.name = t('auth.nameRequired');
      const problem = passwordProblem(password, { name });
      if (problem) next.password = t(`validation.password.${problem}`);
      if (!next.password && confirm !== password) next.confirm = t('auth.mismatch');
      if (!consent) next.consent = t('validation.signUpConsent');
    } else {
      if (!target) next.identity = t(phones ? 'auth.identityInvalid' : 'validation.email');
      if (!password) next.password = t('validation.required');
    }
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setBusy(true);
    try {
      if (mode === 'signup') {
        const { profileId } = await joinByInvitation({ token, code, name: name.trim(), password, consent }, bot.headers);
        await resetSession();
        onJoined(profileId);
      } else {
        await logIn(target!, password, bot.headers);
        await resetSession();
        onLoggedIn();
      }
    } catch (err) {
      const problem = err instanceof AuthProblem ? err : null;
      if (problem?.code === 'ACCOUNT_EXISTS') setMode('login');
      if (problem?.fields.password) setErrors({ password: problem.fields.password });
      setError(problem?.message ?? t('common.somethingWrong'));
    } finally {
      setBusy(false);
      bot.reset();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-serif text-2xl">{t('invite.account.title')}</h2>
      <div className="ma-tabs" role="group" aria-label={t('auth.tabs')}>
        <button type="button" aria-pressed={mode === 'signup'} onClick={() => setMode('signup')}>
          {t('auth.tab.signup')}
        </button>
        <button type="button" aria-pressed={mode === 'login'} onClick={() => setMode('login')}>
          {t('auth.tab.login')}
        </button>
      </div>
      <p className="text-sm">
        {mode === 'signup'
          ? rich('invite.account.signupIntro', { strong: (words) => <strong>{words}</strong> }, { contact: contactHint })
          : t('invite.account.loginIntro')}
      </p>
      <form onSubmit={submit} noValidate className="flex flex-col gap-1">
        {mode === 'signup' ? (
          <TextField label={t('auth.name')} placeholder={t('auth.namePlaceholder')} autoComplete="name" maxLength={80} value={name} onChange={setName} error={errors.name} />
        ) : (
          <TextField
            label={phones ? t('auth.identity') : t('signIn.email')}
            placeholder={phones ? t('auth.identityPlaceholder') : t('signIn.emailPlaceholder')}
            inputMode="email"
            autoComplete="username"
            maxLength={150}
            value={identity}
            onChange={setIdentity}
            error={errors.identity}
          />
        )}
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
        <button type="button" className="m-text self-start" aria-pressed={visible} onClick={() => setVisible(!visible)}>
          {t(visible ? 'auth.hidePassword' : 'auth.showPassword')}
        </button>
        {mode === 'signup' && (
          <>
            <TextField label={t('auth.confirmPassword')} type={visible ? 'text' : 'password'} autoComplete="new-password" maxLength={128} value={confirm} onChange={setConfirm} error={errors.confirm} />
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
          </>
        )}
        {bot.widget}
        <button type="submit" className="m-btn mt-2" disabled={busy || !bot.ready}>
          {busy ? t('auth.wait') : t(mode === 'signup' ? 'invite.account.join' : 'invite.account.loginAccept')}
        </button>
        <p className="m-error" role="alert">
          {error}
        </p>
      </form>
    </div>
  );
}
