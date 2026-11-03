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

export function TrustBadges({ badges, explain = false }: { badges: Badges; explain?: boolean }) {
  const { t } = useI18n();
  const earned = BADGES.filter((badge) => badges[badge.key]);
  if (!earned.length) return explain ? <p className="text-sm text-muted-foreground">{t('badges.none')}</p> : null;
  return (
    <ul className="flex flex-col gap-2" aria-label={t('badges.list')}>
      {earned.map(({ key, Icon }) => (
        <li key={key} className="flex items-start gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ui-purple-soft)] px-2.5 py-1 font-semibold text-brand">
            <Icon className="size-4" aria-hidden="true" />
            {t(`badges.${key}`)}
          </span>
          {explain && <span className="pt-1 text-muted-foreground">{t(`badges.${key}.explains`)}</span>}
        </li>
      ))}
    </ul>
  );
}
