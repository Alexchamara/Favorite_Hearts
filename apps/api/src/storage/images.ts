/**
 * Photo processing with sharp (D7: "the blur is real").
 * - Decoding with sharp is the real file-type check (browser MIME types are not trusted).
 * - Re-encoding drops EXIF/GPS metadata from the stored original.
 * - The blurred copy is a separate low-detail image, so the original never reaches
 *   a viewer who is not allowed to see it.
 */
import sharp, { type Metadata } from 'sharp';
import type { ApiTextKey } from '../text.ts';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MiB, as in the demo (spec 5.3)
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp']);

/** Says what is wrong with the file, as a catalogue key the route answers with. */
export class InvalidImageError extends Error {
  constructor(public key: ApiTextKey) {
    super(key);
  }
}

export type ProcessedPhoto = {
  original: Buffer; // re-encoded JPEG, metadata stripped, max 1600px
  blurred: Buffer; // heavily blurred JPEG derivative
  width: number;
  height: number;
};

export async function processPhoto(input: Buffer): Promise<ProcessedPhoto> {
  if (input.byteLength > MAX_UPLOAD_BYTES) throw new InvalidImageError('api.image.photoTooLarge');

  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: 40_000_000 }).metadata();
  } catch {
    throw new InvalidImageError('api.image.photoUnreadable');
  }
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) {
    throw new InvalidImageError('api.image.photoWrongType');
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

export type ProcessedDocument = { image: Buffer; width: number; height: number };

type Wording = { tooLarge: ApiTextKey; unreadable: ApiTextKey; wrongType: ApiTextKey };

/** Decoding is the real file check, and re-encoding drops EXIF/GPS metadata. Large enough to stay legible. */
async function reencodeLegible(input: Buffer, wording: Wording): Promise<ProcessedDocument> {
  if (input.byteLength > MAX_UPLOAD_BYTES) throw new InvalidImageError(wording.tooLarge);
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: 40_000_000 }).metadata();
  } catch {
    throw new InvalidImageError(wording.unreadable);
  }
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) throw new InvalidImageError(wording.wrongType);
  const { data, info } = await sharp(input, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return { image: data, width: info.width, height: info.height };
}

/** Identity document photos (NIC, passport, driving licence), kept legible for the reviewer. */
export function processDocument(input: Buffer): Promise<ProcessedDocument> {
  return reencodeLegible(input, {
    tooLarge: 'api.image.documentTooLarge',
    unreadable: 'api.image.documentUnreadable',
    wrongType: 'api.image.documentWrongType',
  });
}

/** Payment receipts (owner decision, 29 Oct 2026): photos or screenshots only, no PDF. */
export function processReceipt(input: Buffer): Promise<ProcessedDocument> {
  return reencodeLegible(input, {
    tooLarge: 'api.image.receiptTooLarge',
    unreadable: 'api.image.receiptUnreadable',
    wrongType: 'api.image.receiptWrongType',
  });
}
