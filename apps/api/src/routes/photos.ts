/**
 * Photos (OWNER-DECISIONS sections 6, 7): up to 5 per profile, one of them the cover. sharp re-encodes the
 * original into the private bucket and makes a separate blurred copy; other members get the original only
 * when the database allows it (a cover shown publicly, or a connection with a plan). Photos appear at once;
 * staff look only at reported ones.
 */
import { and, asc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { coverVisibilitySchema, MAX_PHOTOS, type PhotoView } from '@fh/shared';
import { photo, photoOriginal, profile } from '../db/schema/members.ts';
import { fail, parse, readJson, withActor, type AppEnv, type Tx } from '../http.ts';
import { log } from '../lib/log.ts';
import { visiblePhotos } from '../lib/member-view.ts';
import { actorRights, operatedProfile } from '../lib/profile-view.ts';
import { InvalidImageError, processPhoto } from '../storage/images.ts';
import { newObjectKey } from '../storage/storage.ts';

const idParam = (value: string | undefined) => parse(z.uuid({ error: 'Not found.' }), value);

/** Mounted under /profiles, after the profiles router, whose requireMember also covers these routes. */
export const profilePhotos = new Hono<AppEnv>();

async function requireEditor(tx: Tx, id: string) {
  await operatedProfile(tx, id);
  if (!(await actorRights(tx, id)).canEdit) fail(403, 'CANNOT_EDIT', 'You cannot change this profile’s photos.');
}

async function ownPhotos(c: Parameters<typeof visiblePhotos>[0], tx: Tx, id: string): Promise<PhotoView[]> {
  return (await visiblePhotos(c, tx, [id])).get(id) ?? [];
}

profilePhotos.get('/:id/photos', async (c) => {
  const id = idParam(c.req.param('id'));
  const photos = await withActor(c, async (tx) => {
    await operatedProfile(tx, id);
    return ownPhotos(c, tx, id);
  });
  return c.json({ photos });
});

profilePhotos.post('/:id/photos', async (c) => {
  const id = idParam(c.req.param('id'));
  const { storage } = c.var.deps;
  const form = await c.req.parseBody().catch(() => fail(400, 'BAD_FORM', 'Send the photo as a form upload.'));
  const file = form.file;
  if (!(file instanceof File)) fail(400, 'VALIDATION', 'Choose a photo.', { file: 'Required' });

  // Friendly answer before processing; the database enforces the limit again (slots 0–4).
  await withActor(c, async (tx) => {
    await requireEditor(tx, id);
    const [{ count } = { count: 0 }] = await tx.select({ count: sql<number>`count(*)::int` }).from(photo).where(eq(photo.profileId, id));
    if (count >= MAX_PHOTOS) fail(409, 'PHOTO_LIMIT', `A profile can have up to ${MAX_PHOTOS} photos.`);
  });
  if (!storage.configured) fail(503, 'STORAGE_UNAVAILABLE', 'Photo upload is not available yet.');

  let processed: Awaited<ReturnType<typeof processPhoto>>;
  try {
    processed = await processPhoto(Buffer.from(await file.arrayBuffer()));
  } catch (err) {
    if (err instanceof InvalidImageError) fail(400, 'INVALID_PHOTO', err.message);
    throw err;
  }
  const originalKey = newObjectKey('photos');
  const blurredKey = `${originalKey}-blurred`;
  await storage.put('private', originalKey, processed.original, 'image/jpeg');
  await storage.put('derived', blurredKey, processed.blurred, 'image/jpeg');

  try {
    const photos = await withActor(c, async (tx) => {
      await requireEditor(tx, id);
      // One upload at a time per profile, so two uploads never take the same slot.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${id}::text, 0))`);
      const taken = await tx.select({ slot: photo.slot, isCover: photo.isCover }).from(photo).where(eq(photo.profileId, id));
      const slot = [0, 1, 2, 3, 4].find((s) => !taken.some((t) => t.slot === s));
      if (slot === undefined) fail(409, 'PHOTO_LIMIT', `A profile can have up to ${MAX_PHOTOS} photos.`);
      const [created] = await tx
        .insert(photo)
        .values({ profileId: id, slot, isCover: !taken.some((t) => t.isCover), blurredKey, width: processed.width, height: processed.height })
        .returning({ id: photo.id });
      await tx.insert(photoOriginal).values({ photoId: created!.id, objectKey: originalKey });
      return ownPhotos(c, tx, id);
    });
    return c.json({ photos }, 201);
  } catch (err) {
    await Promise.allSettled([storage.delete('private', originalKey), storage.delete('derived', blurredKey)]);
    throw err;
  }
});

profilePhotos.delete('/:id/photos/:photoId', async (c) => {
  const id = idParam(c.req.param('id'));
  const photoId = idParam(c.req.param('photoId'));
  const { storage } = c.var.deps;
  const removed = await withActor(c, async (tx) => {
    await requireEditor(tx, id);
    const [original] = await tx.select({ key: photoOriginal.objectKey }).from(photoOriginal).where(eq(photoOriginal.photoId, photoId));
    const [gone] = await tx
      .delete(photo)
      .where(and(eq(photo.id, photoId), eq(photo.profileId, id)))
      .returning({ blurredKey: photo.blurredKey, isCover: photo.isCover });
    if (!gone) fail(404, 'NOT_FOUND', 'Photo not found.');
    if (gone.isCover) {
      // The next photo in order becomes the cover.
      const [next] = await tx.select({ id: photo.id }).from(photo).where(eq(photo.profileId, id)).orderBy(asc(photo.slot)).limit(1);
      if (next) await tx.update(photo).set({ isCover: true }).where(eq(photo.id, next.id));
    }
    return { blurredKey: gone.blurredKey, originalKey: original?.key ?? null };
  });
  // Files go after the rows; a failed delete leaves an unreachable file, logged for clean-up.
  const results = await Promise.allSettled([
    storage.delete('derived', removed.blurredKey),
    removed.originalKey ? storage.delete('private', removed.originalKey) : Promise.resolve(),
  ]);
  if (results.some((r) => r.status === 'rejected')) log.error('photos.delete_failed', { photoId });
  return c.body(null, 204);
});

profilePhotos.post('/:id/photos/:photoId/cover', async (c) => {
  const id = idParam(c.req.param('id'));
  const photoId = idParam(c.req.param('photoId'));
  const photos = await withActor(c, async (tx) => {
    await requireEditor(tx, id);
    const [target] = await tx.select({ id: photo.id }).from(photo).where(and(eq(photo.id, photoId), eq(photo.profileId, id)));
    if (!target) fail(404, 'NOT_FOUND', 'Photo not found.');
    await tx.update(photo).set({ isCover: false }).where(and(eq(photo.profileId, id), eq(photo.isCover, true)));
    await tx.update(photo).set({ isCover: true }).where(eq(photo.id, photoId));
    return ownPhotos(c, tx, id);
  });
  return c.json({ photos });
});

/** Section 7: the member decides whether other members see the cover; the rest stay blurred until both accept. */
profilePhotos.post('/:id/cover-visibility', async (c) => {
  const id = idParam(c.req.param('id'));
  const input = parse(coverVisibilitySchema, await readJson(c));
  await withActor(c, async (tx) => {
    await requireEditor(tx, id);
    await tx.update(profile).set({ coverPublic: input.coverPublic }).where(eq(profile.id, id));
  });
  return c.json({ coverPublic: input.coverPublic });
});
