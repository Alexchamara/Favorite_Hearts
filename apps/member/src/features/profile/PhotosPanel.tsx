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
import { queryClient } from '@/lib/query-client';

export function PhotosPanel({ profile }: { profile: ProfileView }) {
  const photos = usePhotos(profile.id);
  const input = useRef<HTMLInputElement>(null);
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.photos(profile.id) }),
      queryClient.invalidateQueries({ queryKey: keys.profile(profile.id) }),
    ]);
  const onError = (error: unknown) => toast.error(errorMessage(error));
  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.set('file', file);
      return post(`/profiles/${profile.id}/photos`, form);
    },
    onSuccess: async () => {
      toast.success('Photo added.');
      await refresh();
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

  return (
    <div className="flex flex-col gap-6">
      <Notice>
        Other members see a blurred copy of your photos until you both accept. Your cover is shown unblurred only if you
        switch that on below. Never include phone numbers or addresses in photos.
      </Notice>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-2xl">Photos</h2>
          <span className="text-sm text-muted-foreground">
            {list.length} of {MAX_PHOTOS}
          </span>
        </div>
        {photos.isPending ? (
          <Loading />
        ) : photos.isError ? (
          <Notice tone="error">{errorMessage(photos.error)}</Notice>
        ) : list.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No photos yet.</p>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {list.map((photo) => (
              <li key={photo.id} className="flex flex-col gap-2">
                <div className="relative aspect-[3/4] overflow-hidden rounded-[12px] border bg-[var(--ui-soft)]">
                  <img src={photo.url} alt={photo.isCover ? 'Cover photo' : `Photo ${photo.slot + 1}`} className="size-full object-cover" />
                  {photo.isCover && <span className="absolute top-2 left-2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">Cover</span>}
                </div>
                {photo.hidden && <p className="text-xs text-destructive">Hidden after a report. Our staff will review it.</p>}
                {canEdit && (
                  <div className="flex flex-wrap gap-2 text-sm">
                    {!photo.isCover && !photo.hidden && (
                      <button type="button" className="underline underline-offset-4" disabled={cover.isPending} onClick={() => cover.mutate(photo.id)}>
                        Make cover
                      </button>
                    )}
                    <Confirm
                      title="Delete this photo?"
                      action="Delete"
                      destructive
                      onConfirm={() => remove.mutate(photo.id)}
                      trigger={
                        <button type="button" className="text-destructive underline underline-offset-4">
                          Delete
                        </button>
                      }
                    >
                      <p>It is removed from your profile and from our storage.</p>
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
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) upload.mutate(file);
              }}
            />
            <Button asChild variant="outline" className="h-11">
              <label htmlFor="photo-upload" className="cursor-pointer">
                {upload.isPending ? 'Uploading…' : 'Add a photo'}
              </label>
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">JPEG, PNG or WebP, up to 5 MB.</p>
          </div>
        )}
      </Card>
      <Card>
        <label className="flex items-start justify-between gap-4">
          <span>
            <span className="block font-semibold">Show my cover photo to members</span>
            <span className="mt-1 block text-sm text-muted-foreground">
              When off, members see a blurred copy until you both accept. Visitors who are not signed in never see photos.
            </span>
          </span>
          <Switch
            checked={profile.coverPublic}
            disabled={!canEdit || visibility.isPending}
            onCheckedChange={(checked) => visibility.mutate(checked)}
            aria-label="Show my cover photo to members"
          />
        </label>
      </Card>
    </div>
  );
}
