/** A member as other members see them in lists: cover (blurred unless allowed), name, age, work and place. */
import type { ReactNode } from 'react';
import { BriefcaseBusiness, MapPin } from 'lucide-react';
import { Link } from 'react-router';
import type { MemberCard, PhotoView, SharedContact } from '@fh/shared';
import { TrustBadges } from '@/components/badges';
import { cn } from '@/lib/utils';
import { countriesIn, countryNameIn, useCountries, useLabels } from '@/features/profile/options';
import { useI18n } from '@/lib/i18n';

/** Staff screens only: the place with the country in English. */
export const englishPlaceOf = (card: Pick<MemberCard, 'city' | 'countryCode'>) =>
  [card.city, card.countryCode ? countryNameIn(countriesIn('en'), card.countryCode) : null].filter(Boolean).join(', ');

/** "Kandy, Sri Lanka", with the country in the reader's language. */
export function usePlaceOf() {
  const countries = useCountries();
  return (card: Pick<MemberCard, 'city' | 'countryCode'>) =>
    [card.city, card.countryCode ? countryNameIn(countries, card.countryCode) : null].filter(Boolean).join(', ');
}

/** A photo the server signed for this viewer: the original, or the separate blurred copy (section 7). */
export function PhotoFrame({ photo, name, className, compact = false }: { photo: PhotoView | null; name: string | null; className?: string; compact?: boolean }) {
  const { t } = useI18n();
  if (!photo) {
    return (
      <div className={cn('flex aspect-[3/4] items-center justify-center bg-[var(--ui-soft)] font-serif text-5xl text-muted-foreground', className)} aria-hidden="true">
        {(name ?? '?').slice(0, 1)}
      </div>
    );
  }
  return (
    <div className={cn('relative aspect-[3/4] overflow-hidden bg-[var(--ui-soft)]', className)}>
      <img src={photo.url} alt={t(photo.blurred ? 'member.blurredPhoto' : 'member.photo', { name: name ?? t('member.thisMember') })} className="size-full object-cover" />
      {photo.blurred && !compact && (
        <span className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white">{t('member.blurredBadge')}</span>
      )}
    </div>
  );
}

/**
 * A member in the Discover list, as the demo draws it: a small portrait beside the name, place and work, the badges,
 * and the way into the profile. The whole card is the link.
 */
export function MemberCardLink({ card, href, action }: { card: MemberCard; href: string; action?: ReactNode }) {
  const { t } = useI18n();
  const placeOf = usePlaceOf();
  const place = placeOf(card);
  const link = (
    <Link
      to={href}
      className="group flex h-full flex-col gap-4 rounded-[13px] border bg-card p-4 transition-colors hover:border-[var(--ui-purple)] sm:p-5"
    >
      <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-4">
        <PhotoFrame photo={card.cover} name={card.displayName} className="h-[92px] w-[72px] rounded-[8px] text-3xl" compact />
        <div className="min-w-0">
          <p className="font-serif text-[1.35rem] leading-tight tracking-[-0.02em]">
            {card.displayName ?? t('member.member')}
            {card.age !== null && <span className="text-muted-foreground">, {card.age}</span>}
          </p>
          {place && (
            <p className="mt-1.5 flex items-start gap-1.5 text-[13px] text-muted-foreground">
              <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0">{place}</span>
            </p>
          )}
          {card.occupation && (
            <p className="mt-1 flex items-start gap-1.5 text-[13px] text-muted-foreground">
              <BriefcaseBusiness className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0">{card.occupation}</span>
            </p>
          )}
        </div>
      </div>
      <TrustBadges badges={card.badges} compact />
      <span
        className={cn(
          'mt-auto inline-flex min-h-11 items-center justify-center rounded-[10px] border border-[var(--ui-purple)] bg-[var(--ui-purple-soft)] px-4 text-sm font-semibold text-[var(--ui-purple)] transition-colors group-hover:bg-[color-mix(in_srgb,var(--ui-purple)_14%,var(--ui-purple-soft))]',
          action && 'mr-14',
        )}
      >
        {t('browse.view')}
      </span>
    </Link>
  );
  // A control may not sit inside the link (nested interactive elements), so it is laid beside "View profile".
  if (!action) return link;
  return (
    <div className="relative h-full">
      {link}
      <div className="absolute right-4 bottom-4 sm:right-5 sm:bottom-5">{action}</div>
    </div>
  );
}

/** A compact row for request and connection lists. */
export function MemberRow({ card, href, children }: { card: MemberCard | null; href?: string; children?: ReactNode }) {
  const { t } = useI18n();
  const placeOf = usePlaceOf();
  return (
    <div className="flex flex-wrap items-center gap-4 py-3">
      <PhotoFrame photo={card?.cover ?? null} name={card?.displayName ?? null} className="w-16 shrink-0 rounded-[10px]" compact />
      <div className="min-w-0 flex-1">
        {card ? (
          <>
            <p className="font-semibold">
              {href ? (
                <Link to={href} className="underline-offset-4 hover:underline">
                  {card.displayName ?? t('member.member')}
                </Link>
              ) : (
                (card.displayName ?? t('member.member'))
              )}
              {card.age !== null && <span className="font-normal text-muted-foreground">, {card.age}</span>}
            </p>
            <p className="text-sm text-muted-foreground">{[card.occupation, placeOf(card)].filter(Boolean).join(' · ')}</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t('member.unavailable')}</p>
        )}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

/** Contact details a connection shares (section 4). */
export function ContactList({ contacts }: { contacts: SharedContact[] }) {
  const { t } = useI18n();
  const { contactKindLabels, contactPersonLabels, platformLabels } = useLabels();
  if (!contacts.length) return <p className="mt-2 text-sm text-muted-foreground">{t('member.noContacts')}</p>;
  return (
    <ul className="mt-3 divide-y text-sm">
      {contacts.map((contact) => (
        <li key={`${contact.person}-${contact.kind}-${contact.value}`} className="py-2.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase">
            {contactPersonLabels[contact.person]} · {contact.kind === 'social' && contact.platform ? platformLabels[contact.platform] : contactKindLabels[contact.kind]}
          </p>
          <p className="break-all">{contact.value}</p>
          {contact.notVerifiedByCandidate && <p className="text-xs text-muted-foreground">{t('member.notVerifiedByCandidate')}</p>}
        </li>
      ))}
    </ul>
  );
}
