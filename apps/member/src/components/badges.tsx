import { BadgeCheck, UserCheck } from 'lucide-react';
import type { Badges } from '@fh/shared';

/**
 * The three badges (OWNER-DECISIONS section 5), each meaning exactly one thing. The wording says
 * "identity document reviewed" and never "government verified".
 */
const BADGES = [
  {
    key: 'managerVerified',
    label: 'Manager verified',
    explains: 'The profile manager’s identity document was reviewed and their phone verified.',
    Icon: BadgeCheck,
  },
  {
    key: 'candidateConfirmed',
    label: 'Candidate confirmed',
    explains: 'The candidate accepted this profile themselves.',
    Icon: UserCheck,
  },
  {
    key: 'candidateIdentityVerified',
    label: 'Candidate identity verified',
    explains: 'The candidate’s identity document was reviewed and their phone verified.',
    Icon: BadgeCheck,
  },
] as const;

export function TrustBadges({ badges, explain = false }: { badges: Badges; explain?: boolean }) {
  const earned = BADGES.filter((badge) => badges[badge.key]);
  if (!earned.length) return explain ? <p className="text-sm text-muted-foreground">No badges yet.</p> : null;
  return (
    <ul className="flex flex-col gap-2" aria-label="Trust badges">
      {earned.map(({ key, label, explains, Icon }) => (
        <li key={key} className="flex items-start gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ui-purple-soft)] px-2.5 py-1 font-semibold text-brand">
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </span>
          {explain && <span className="pt-1 text-muted-foreground">{explains}</span>}
        </li>
      ))}
    </ul>
  );
}
