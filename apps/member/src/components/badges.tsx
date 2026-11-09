import { CheckCircle2, Clock, ShieldCheck } from 'lucide-react';
import type { Badges } from '@fh/shared';
import { useI18n } from '@/lib/i18n';

/**
 * The three badges (OWNER-DECISIONS section 5), each meaning exactly one thing. The wording says
 * "identity document reviewed" and never "government verified". Drawn as the demo's .m-earned-badges chips, in the
 * demo's order and icons; with none earned, the demo's grey "pending" chip.
 */
const BADGES = [
  { key: 'candidateIdentityVerified', Icon: ShieldCheck },
  { key: 'candidateConfirmed', Icon: CheckCircle2 },
  { key: 'managerVerified', Icon: ShieldCheck },
] as const;

/** `explain`: each badge's meaning under the chips (own profile and member pages). */
export function TrustBadges({ badges, explain = false }: { badges: Badges; explain?: boolean; compact?: boolean }) {
  const { t } = useI18n();
  const earned = BADGES.filter((badge) => badges[badge.key]);
  return (
    <>
      <div className="m-earned-badges" role="list" aria-label={t('badges.list')}>
        {earned.map(({ key, Icon }) => (
          <span key={key} role="listitem">
            <Icon size={15} aria-hidden="true" />
            {t(`badges.${key}`)}
          </span>
        ))}
        {!earned.length && (
          <span role="listitem" className="m-checks-pending">
            <Clock size={14} aria-hidden="true" />
            {t('badges.none')}
          </span>
        )}
      </div>
      {explain && earned.length > 0 && (
        <dl className="grid gap-1 text-sm">
          {earned.map(({ key }) => (
            <div key={key}>
              <dt className="sr-only">{t(`badges.${key}`)}</dt>
              <dd className="text-muted-foreground">{t(`badges.${key}.explains`)}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}
