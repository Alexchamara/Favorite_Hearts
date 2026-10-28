/**
 * Photo processing with sharp (D7: "the blur is real").
 * - Decoding with sharp is the real file-type check (browser MIME types are not trusted).
 * - Re-encoding drops EXIF/GPS metadata from the stored original.
 * - The blurred copy is a separate low-detail image, so the original never reaches
 *   a viewer who is not allowed to see it.
 */
import sharp from 'sharp';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MiB, as in the demo (spec 5.3)
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp']);

export class InvalidImageError extends Error {}

export type ProcessedPhoto = {
  original: Buffer; // re-encoded JPEG, metadata stripped, max 1600px
  blurred: Buffer; // heavily blurred JPEG derivative
  width: number;
  height: number;
};

export async function processPhoto(input: Buffer): Promise<ProcessedPhoto> {
  if (input.byteLength > MAX_UPLOAD_BYTES) throw new InvalidImageError('Photos must be 5 MB or smaller.');

  let meta: sharp.Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: 40_000_000 }).metadata();
  } catch {
    throw new InvalidImageError('This file is not a supported image.');
  }
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) {
    throw new InvalidImageError('Please upload a JPEG, PNG or WebP photo.');
  }

  const { data: original, info } = await sharp(input)
    .rotate() // apply EXIF orientation before the metadata is dropped
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });

  // Shrink to a tiny image first so no detail survives, then blur and scale back up.
  const tiny = await sharp(original).resize({ width: 32 }).toBuffer();
  const blurred = await sharp(tiny).resize({ width: 640 }).blur(12).jpeg({ quality: 60 }).toBuffer();

  return { original, blurred, width: info.width, height: info.height };
}
