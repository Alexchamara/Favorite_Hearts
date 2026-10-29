/** A member as other members see them in lists: cover (blurred unless allowed), name, age, work and place. */
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { MemberCard, PhotoView, SharedContact } from '@fh/shared';
import { TrustBadges } from '@/components/badges';
import { cn } from '@/lib/utils';
import { contactKindLabels, contactPersonLabels, countries, platformLabels } from '@/features/profile/options';

export const placeOf = (card: Pick<MemberCard, 'city' | 'countryCode'>) =>
  [card.city, countries.find((c) => c.code === card.countryCode)?.name].filter(Boolean).join(', ');

/** A photo the server signed for this viewer: the original, or the separate blurred copy (section 7). */
export function PhotoFrame({ photo, name, className, compact = false }: { photo: PhotoView | null; name: string | null; className?: string; compact?: boolean }) {
  if (!photo) {
    return (
      <div className={cn('flex aspect-[3/4] items-center justify-center bg-[var(--ui-soft)] font-serif text-5xl text-muted-foreground', className)} aria-hidden="true">
        {(name ?? '?').slice(0, 1)}
      </div>
    );
  }
  return (
    <div className={cn('relative aspect-[3/4] overflow-hidden bg-[var(--ui-soft)]', className)}>
      <img src={photo.url} alt={photo.blurred ? `Blurred photo of ${name ?? 'this member'}` : `Photo of ${name ?? 'this member'}`} className="size-full object-cover" />
      {photo.blurred && !compact && (
        <span className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white">Blurred until you both accept</span>
      )}
    </div>
  );
}

export function MemberCardLink({ card, href }: { card: MemberCard; href: string }) {
  return (
    <Link
      to={href}
      className="flex flex-col overflow-hidden rounded-[var(--ui-panel-radius)] border bg-card shadow-[var(--ui-shadow)] transition-colors hover:border-[var(--ui-accent)] focus-visible:outline-2"
    >
      <PhotoFrame photo={card.cover} name={card.displayName} />
      <div className="flex flex-col gap-1.5 p-4">
        <p className="font-serif text-xl leading-tight">
          {card.displayName ?? 'Member'}
          {card.age !== null && <span className="text-muted-foreground">, {card.age}</span>}
        </p>
        <p className="text-sm text-muted-foreground">{[card.occupation, placeOf(card)].filter(Boolean).join(' · ')}</p>
        <TrustBadges badges={card.badges} />
      </div>
    </Link>
  );
}

/** A compact row for request and connection lists. */
export function MemberRow({ card, href, children }: { card: MemberCard | null; href?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-4 py-3">
      <PhotoFrame photo={card?.cover ?? null} name={card?.displayName ?? null} className="w-16 shrink-0 rounded-[10px]" compact />
      <div className="min-w-0 flex-1">
        {card ? (
          <>
            <p className="font-semibold">
              {href ? (
                <Link to={href} className="underline-offset-4 hover:underline">
                  {card.displayName ?? 'Member'}
                </Link>
              ) : (
                card.displayName ?? 'Member'
              )}
              {card.age !== null && <span className="font-normal text-muted-foreground">, {card.age}</span>}
            </p>
            <p className="text-sm text-muted-foreground">{[card.occupation, placeOf(card)].filter(Boolean).join(' · ')}</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">This profile is not available right now.</p>
        )}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

/** Contact details a connection shares (section 4). */
export function ContactList({ contacts }: { contacts: SharedContact[] }) {
  if (!contacts.length) return <p className="mt-2 text-sm text-muted-foreground">No contact details are shared.</p>;
  return (
    <ul className="mt-3 divide-y text-sm">
      {contacts.map((contact) => (
        <li key={`${contact.person}-${contact.kind}-${contact.value}`} className="py-2.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase">
            {contactPersonLabels[contact.person]} · {contact.kind === 'social' && contact.platform ? platformLabels[contact.platform] : contactKindLabels[contact.kind]}
          </p>
          <p className="break-all">{contact.value}</p>
          {contact.notVerifiedByCandidate && <p className="text-xs text-muted-foreground">Not verified by candidate</p>}
        </li>
      ))}
    </ul>
  );
}
