/**
 * The shortlist (N03, owner 6 Nov 2026): profiles saved to look at again, for the profile being acted for. Private to
 * the people who operate that profile. Without a plan it holds up to 20; saved profiles that are no longer shown
 * (paused, hidden, blocked or deleted) stay listed without details so they can be removed.
 */
import { useMutation } from '@tanstack/react-query';
import { Bookmark, EyeOff } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { AppShell, Loading, Notice, PageTitle } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { del, errorMessage } from '@/lib/api';
import { formatDay } from '@/lib/format';
import { say, useI18n } from '@/lib/i18n';
import { keys, useShortlist } from '@/lib/queries';
import { queryClient } from '@/lib/query-client';
import { ActingPicker, useActingProfile, withAs } from './acting';
import { DiscoverCard } from './MemberCard';
import { SaveIcon } from './shortlist';

export default function ShortlistPage() {
  const { acting, profiles, choose, ready } = useActingProfile();
  const shortlist = useShortlist(acting?.id ?? null);
  const { t } = useI18n();
  const remove = useMutation({
    mutationFn: (profileId: string) => del(`/profiles/${acting!.id}/shortlist/${profileId}`),
    onSuccess: async () => {
      toast.success(say('shortlist.removedToast'));
      await queryClient.invalidateQueries({ queryKey: keys.shortlist(acting!.id) });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const items = shortlist.data?.items ?? [];
  const shown = items.filter((item) => item.profile);
  const gone = items.filter((item) => !item.profile);
  const limit = shortlist.data?.limit ?? null;

  return (
    <AppShell width="wide">
      <PageTitle
        kicker={t('shortlist.page.kicker')}
        title={t('shortlist.page.title')}
        action={ready && <ActingPicker profiles={profiles} acting={acting} onChoose={choose} />}
      >
        {t('shortlist.page.intro')}
      </PageTitle>
      {!ready || (acting && shortlist.isPending) ? (
        <Loading />
      ) : !acting ? (
        <Notice>
          {t('requests.page.noProfile')}{' '}
          <Link to="/" className="font-semibold text-brand underline underline-offset-4">
            {t('requests.page.toProfiles')}
          </Link>
        </Notice>
      ) : shortlist.isError ? (
        <Notice tone="error">{errorMessage(shortlist.error)}</Notice>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-4 text-sm">
            <p role="status" className="text-muted-foreground tabular-nums">
              {limit === null ? t('shortlist.unlimited', { count: items.length }) : t('shortlist.count', { count: items.length, limit })}
            </p>
          </div>
          {limit !== null && items.length >= limit && <Notice tone="warning">{t('shortlist.full')}</Notice>}
          {items.length === 0 ? (
            // The demo's empty state (.m-empty).
            <div className="m-empty">
              <Bookmark size={28} aria-hidden="true" />
              <h3>{t('shortlist.empty.title')}</h3>
              <p>{t('shortlist.empty.body')}</p>
              <Link className="m-btn m-secondary" to={withAs('/browse', acting)}>
                {t('shortlist.empty.action')}
              </Link>
            </div>
          ) : (
            <>
              {shown.length > 0 && (
                // The demo's shortlist (SCREEN-035) is its Discover grid of cards.
                <div className="m-profile-grid" role="list" aria-label={t('shortlist.list')}>
                  {shown.map(({ profile: card }) => (
                    <div key={card!.id} role="listitem" className="min-w-0">
                      <DiscoverCard
                        card={card!}
                        href={withAs(`/members/${card!.id}`, acting)}
                        action={<SaveIcon className="m-bookmark" actingId={acting.id} profileId={card!.id} name={card!.displayName ?? t('member.member')} />}
                      />
                    </div>
                  ))}
                </div>
              )}
              {gone.length > 0 && (
                <ul className="divide-y rounded-[var(--ui-panel-radius)] border bg-card px-5" aria-label={t('shortlist.goneList')}>
                  {gone.map((item) => (
                    <li key={item.profileId} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                      <span className="flex items-center gap-3">
                        <EyeOff className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span>
                          {t('shortlist.gone')}
                          <span className="block text-xs text-muted-foreground">{t('shortlist.savedOn', { date: formatDay(item.savedAt) })}</span>
                        </span>
                      </span>
                      <Button variant="outline" className="h-10" disabled={remove.isPending} onClick={() => remove.mutate(item.profileId)}>
                        {t('shortlist.removeShort')}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </AppShell>
  );
}
