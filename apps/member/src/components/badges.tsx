import { BadgeCheck, UserCheck } from 'lucide-react';
import type { Badges } from '@fh/shared';
import { useI18n } from '@/lib/i18n';

/**
 * The three badges (OWNER-DECISIONS section 5), each meaning exactly one thing. The wording says
 * "identity document reviewed" and never "government verified".
 */
const BADGES = [
  {
    key: 'managerVerified',
    Icon: BadgeCheck,
  },
  {
    key: 'candidateConfirmed',
    Icon: UserCheck,
  },
  {
    key: 'candidateIdentityVerified',
    Icon: BadgeCheck,
  },
] as const;

/** `compact`: small chips that wrap, for cards in a list. */
export function TrustBadges({ badges, explain = false, compact = false }: { badges: Badges; explain?: boolean; compact?: boolean }) {
  const { t } = useI18n();
  const earned = BADGES.filter((badge) => badges[badge.key]);
  if (!earned.length) return explain ? <p className="text-sm text-muted-foreground">{t('badges.none')}</p> : null;
  return (
    <ul className={compact ? 'flex flex-wrap gap-1.5' : 'flex flex-col gap-2'} aria-label={t('badges.list')}>
      {earned.map(({ key, Icon }) => (
        <li key={key} className={compact ? 'text-xs' : 'flex flex-col items-start gap-1 text-sm'}>
          <span className={compact ? 'inline-flex items-center gap-1 rounded-[8px] bg-[var(--ui-purple-soft)] px-2 py-1 font-semibold text-brand' : 'inline-flex items-center gap-1.5 rounded-full bg-[var(--ui-purple-soft)] px-2.5 py-1 font-semibold text-brand'}>
            <Icon className={compact ? 'size-3.5' : 'size-4'} aria-hidden="true" />
            {t(`badges.${key}`)}
          </span>
          {explain && <span className="text-muted-foreground">{t(`badges.${key}.explains`)}</span>}
        </li>
      ))}
    </ul>
  );
}
