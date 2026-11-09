/**
 * Requests and Connected as their own places in the dock (owner, 6 Nov 2026, from the demo's Interests and Connected
 * screens). Both act for one profile: the one in `?as=`, or the account's published one, chosen here when the
 * account runs several.
 */
import { Link } from 'react-router';
import { AppShell, Loading, Notice, PageTitle } from '@/components/layout';
import { useI18n } from '@/lib/i18n';
import { ActingPicker, useActingProfile } from '@/features/browse/acting';
import { ConnectionsPanel } from './ConnectionsPanel';
import { RequestsPanel } from './RequestsPanel';

export default function RelationsPage({ kind }: { kind: 'requests' | 'connections' }) {
  const { acting, profiles, choose, ready } = useActingProfile();
  const { t } = useI18n();
  const prefix = kind === 'requests' ? 'requests.page' : 'connections.page';
  return (
    <AppShell width="wide">
      <PageTitle
        kicker={t(`${prefix}.kicker`)}
        title={t(`${prefix}.title`)}
        action={ready && <ActingPicker profiles={profiles} acting={acting} onChoose={choose} />}
      >
        {t(`${prefix}.intro`)}
      </PageTitle>
      {!ready ? (
        <Loading />
      ) : !acting ? (
        <Notice>
          {t('requests.page.noProfile')}{' '}
          <Link to="/" className="font-semibold text-brand underline underline-offset-4">
            {t('requests.page.toProfiles')}
          </Link>
        </Notice>
      ) : kind === 'requests' ? (
        <RequestsPanel key={acting.id} profile={acting} />
      ) : (
        <ConnectionsPanel key={acting.id} profile={acting} />
      )}
    </AppShell>
  );
}
