/**
 * What deleting removes at once and what is kept, and for how long (OWNER-DECISIONS section 8), said the same way for an
 * account and for one profile. Deleting needs a recent sign-in: RecentSignInNotice signs out and back to sign-in.
 */
import { useNavigate } from 'react-router';
import { Notice } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { useI18n } from '@/lib/i18n';
import { resetSession } from '@/lib/queries';

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
  const navigate = useNavigate();
  const { t } = useI18n();
  const signInAgain = async () => {
    await authClient.signOut();
    await resetSession();
    navigate('/', { replace: true });
  };
  return (
    <Notice tone="warning" title={t('recentSignIn.title')}>
      <p>{t('recentSignIn.body')}</p>
      <Button variant="outline" className="mt-3 h-10" onClick={() => void signInAgain()}>
        {t('recentSignIn.button')}
      </Button>
    </Notice>
  );
}
