/**
 * What deleting removes at once and what is kept, and for how long (OWNER-DECISIONS section 8), said the same way for an
 * account and for one profile. Deleting needs a recent log-in: RecentSignInNotice asks for the password on the spot
 * (a fresh log-in), so the member stays on the page.
 */
import { useState, type FormEvent } from 'react';
import { TextField } from '@/components/form/fields';
import { Notice } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { useBotCheck } from '@/components/turnstile';
import { AuthProblem, logIn } from '@/features/auth/password-auth';
import { useI18n } from '@/lib/i18n';
import { useMe } from '@/lib/queries';
import { queryClient } from '@/lib/query-client';

export function RetentionList({ months, account = false }: { months: number; account?: boolean }) {
  const { t } = useI18n();
  return (
    <>
      <section>
        <h3 className="font-semibold text-foreground">{t('retention.deletedNow')}</h3>
        <ul className="mt-1 list-disc pl-5 text-muted-foreground">
          {account && <li>{t('retention.account.identity')}</li>}
          <li>{t('retention.profileDetails')}</li>
          <li>{t('retention.relations')}</li>
          {account && <li>{t('retention.account.document')}</li>}
        </ul>
      </section>
      <section>
        <h3 className="font-semibold text-foreground">{t('retention.kept', { months })}</h3>
        <ul className="mt-1 list-disc pl-5 text-muted-foreground">
          <li>{t('retention.payments')}</li>
          <li>{t('retention.reports')}</li>
          <li>{t(account ? 'retention.account.staffRecord' : 'retention.staffRecord')}</li>
          {account && <li>{t('retention.account.hashes')}</li>}
        </ul>
      </section>
    </>
  );
}

export function RecentSignInNotice() {
  const { t } = useI18n();
  const me = useMe().data;
  const bot = useBotCheck();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  // The account's own address: its email, or its phone number for a phone-only account (its email is a placeholder on
  // the reserved .invalid domain).
  const identity = me?.phoneNumber && (!me.email || me.email.endsWith('.invalid')) ? { phoneNumber: me.phoneNumber } : me?.email ? { email: me.email } : null;
  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (!identity || !password) return setError(t('validation.required'));
    setBusy(true);
    setError(undefined);
    try {
      await logIn(identity, password, bot.headers);
      // A fresh session: the delete checks ask the server again.
      await queryClient.invalidateQueries();
    } catch (err) {
      const wrong = err instanceof AuthProblem && /^INVALID_(EMAIL|PHONE_NUMBER)_OR_PASSWORD$/.test(err.code ?? '');
      setError(wrong ? t('recentSignIn.wrong') : err instanceof AuthProblem ? err.message : t('common.somethingWrong'));
    } finally {
      setBusy(false);
      bot.reset();
    }
  }
  return (
    <Notice tone="warning" title={t('recentSignIn.title')}>
      <p>{t('recentSignIn.body')}</p>
      <form onSubmit={confirm} noValidate className="mt-3 flex flex-col gap-2">
        <TextField label={t('auth.password')} type="password" autoComplete="current-password" maxLength={128} value={password} onChange={setPassword} error={error} />
        {bot.widget}
        <Button type="submit" variant="outline" className="h-11 self-start" disabled={busy || !bot.ready}>
          {busy ? t('auth.wait') : t('recentSignIn.button')}
        </Button>
      </form>
    </Notice>
  );
}
