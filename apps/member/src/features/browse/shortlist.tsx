/**
 * Saving a profile to the shortlist of the profile being acted for (N03, owner 6 Nov 2026), from a Discover card or a
 * member's page. The server holds the limit (20 without a plan) and says so if the shortlist is full.
 */
import { useMutation } from '@tanstack/react-query';
import { Bookmark } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { del, errorMessage, post } from '@/lib/api';
import { say, useI18n } from '@/lib/i18n';
import { keys, useShortlist } from '@/lib/queries';
import { queryClient } from '@/lib/query-client';
import { cn } from '@/lib/utils';

export function useSaved(actingId: string | null, profileId: string) {
  const shortlist = useShortlist(actingId);
  const saved = Boolean(shortlist.data?.items.some((item) => item.profileId === profileId));
  const toggle = useMutation({
    mutationFn: () => (saved ? del(`/profiles/${actingId}/shortlist/${profileId}`) : post(`/profiles/${actingId}/shortlist`, { profileId })),
    onSuccess: async () => {
      toast.success(say(saved ? 'shortlist.removedToast' : 'shortlist.savedToast'));
      await queryClient.invalidateQueries({ queryKey: keys.shortlist(actingId ?? '') });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return { saved, ready: Boolean(actingId) && shortlist.isSuccess, toggle };
}

/** The round bookmark on a card: its name says whose profile it saves or removes. */
export function SaveIcon({ actingId, profileId, name, className }: { actingId: string | null; profileId: string; name: string; className?: string }) {
  const { t } = useI18n();
  const { saved, ready, toggle } = useSaved(actingId, profileId);
  if (!ready) return null;
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={t(saved ? 'shortlist.remove' : 'shortlist.save', { name })}
      disabled={toggle.isPending}
      onClick={() => toggle.mutate()}
      className={cn(
        'grid size-11 place-items-center rounded-full border bg-[var(--ui-surface)] transition-colors hover:border-[var(--ui-purple)] disabled:opacity-60',
        saved ? 'text-[var(--ui-copper)]' : 'text-muted-foreground hover:text-foreground',
        className,
      )}
    >
      <Bookmark className={cn('size-5', saved && 'fill-current')} aria-hidden="true" />
    </button>
  );
}

/** "Save" / "Saved" with its words, for a member's page. */
export function SaveButton({ actingId, profileId }: { actingId: string | null; profileId: string }) {
  const { t } = useI18n();
  const { saved, ready, toggle } = useSaved(actingId, profileId);
  if (!ready) return null;
  return (
    <Button variant="outline" className="h-11" aria-pressed={saved} disabled={toggle.isPending} onClick={() => toggle.mutate()}>
      <Bookmark className={cn(saved && 'fill-current')} aria-hidden="true" />
      {t(saved ? 'shortlist.saved' : 'shortlist.saveShort')}
    </Button>
  );
}
