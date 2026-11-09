/**
 * Photos (sections 6, 7): up to 5, one of them the cover. Other members get a separate blurred copy until both
 * accept; the cover is shown unblurred only if the member switches that on. Photos appear at once; staff look
 * only at reported ones.
 */
import { useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MAX_PHOTOS, type ProfileView } from '@fh/shared';
import { Confirm } from '@/components/confirm';
import { Card, Loading, Notice } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { del, errorMessage, post } from '@/lib/api';
import { keys, usePhotos } from '@/lib/queries';
import { say, useI18n } from '@/lib/i18n';
import { queryClient } from '@/lib/query-client';

/** `inDialog`: inside the demo's upload dialog (SCREEN-062), whose title and description say what the notice and heading would. */
export function PhotosPanel({ profile, inDialog = false }: { profile: ProfileView; inDialog?: boolean }) {
  const photos = usePhotos(profile.id);
  const input = useRef<HTMLInputElement>(null);
  const { t } = useI18n();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.photos(profile.id) }),
      queryClient.invalidateQueries({ queryKey: keys.profile(profile.id) }),
    ]);
  const onError = (error: unknown) => toast.error(errorMessage(error));
  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      let added = 0;
      try {
        for (const file of files) {
          const form = new FormData();
          form.set('file', file);
          await post(`/profiles/${profile.id}/photos`, form);
          added += 1;
        }
      } finally {
        if (added) {
          toast.success(say('photos.added'));
          await refresh();
        }
      }
    },
    onError,
    onSettled: () => {
      if (input.current) input.current.value = '';
    },
  });
  const cover = useMutation({ mutationFn: (id: string) => post(`/profiles/${profile.id}/photos/${id}/cover`), onSuccess: refresh, onError });
  const remove = useMutation({ mutationFn: (id: string) => del(`/profiles/${profile.id}/photos/${id}`), onSuccess: refresh, onError });
  const visibility = useMutation({
    mutationFn: (coverPublic: boolean) => post(`/profiles/${profile.id}/cover-visibility`, { coverPublic }),
    onSuccess: refresh,
    onError,
  });
  const canEdit = profile.me.canEdit;
  const list = photos.data ?? [];
  const room = MAX_PHOTOS - list.length;

  return (
    <div className="flex flex-col gap-6">
      {!inDialog && <Notice>{t('photos.notice')}</Notice>}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {!inDialog && <h2 className="font-serif text-2xl">{t('photos.title')}</h2>}
          <span className="text-sm text-muted-foreground">{t('photos.count', { count: list.length })}</span>
        </div>
        {photos.isPending ? (
          <Loading />
        ) : photos.isError ? (
          <Notice tone="error">{errorMessage(photos.error)}</Notice>
        ) : list.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t('photos.none')}</p>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {list.map((photo) => (
              <li key={photo.id} className="flex flex-col gap-2">
                <div className="relative aspect-[3/4] overflow-hidden rounded-[12px] border bg-[var(--ui-soft)]">
                  <img src={photo.url} alt={photo.isCover ? t('photos.coverAlt') : t('photos.photoAlt', { number: photo.slot + 1 })} className="size-full object-cover" />
                  {photo.isCover && <span className="absolute top-2 left-2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">{t('photos.cover')}</span>}
                </div>
                {photo.hidden && <p className="text-xs text-destructive">{t('photos.hidden')}</p>}
                {canEdit && (
                  <div className="flex flex-wrap gap-2 text-sm">
                    {!photo.isCover && !photo.hidden && (
                      <button type="button" className="underline underline-offset-4" disabled={cover.isPending} onClick={() => cover.mutate(photo.id)}>
                        {t('photos.makeCover')}
                      </button>
                    )}
                    <Confirm
                      title={t('photos.delete.title')}
                      action={t('photos.delete')}
                      destructive
                      onConfirm={() => remove.mutate(photo.id)}
                      trigger={
                        <button type="button" className="text-destructive underline underline-offset-4">
                          {t('photos.delete')}
                        </button>
                      }
                    >
                      <p>{t('photos.delete.body')}</p>
                    </Confirm>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && list.length < MAX_PHOTOS && (
          <div className="mt-5">
            <input
              ref={input}
              id="photo-upload"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                if (files.length > room) toast.error(say('photos.tooMany', { count: room }));
                if (room > 0 && files.length) upload.mutate(files.slice(0, room));
              }}
            />
            <Button asChild variant="outline" className="h-11">
              <label htmlFor="photo-upload" className="cursor-pointer">
                {upload.isPending ? t('photos.uploading') : t('photos.add')}
              </label>
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">{t('photos.formats')}</p>
          </div>
        )}
      </Card>
      {/* The demo's Toggle (.m-toggle): title and detail, and the switch. */}
      <Card>
        <div className="m-toggle">
          <div>
            <strong>{t('photos.showCover')}</strong>
            <p>{t('photos.showCover.hint')}</p>
          </div>
          <Switch
            checked={profile.coverPublic}
            disabled={!canEdit || visibility.isPending}
            onCheckedChange={(checked) => visibility.mutate(checked)}
            aria-label={t('photos.showCover')}
          />
        </div>
      </Card>
    </div>
  );
}
