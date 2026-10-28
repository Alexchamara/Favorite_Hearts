/**
 * Cloudflare R2 (S3-compatible). Both buckets are PRIVATE: no public bucket URL and no
 * custom-domain public access. Browsers only ever get short-lived signed GET URLs, and
 * only after the API has checked the viewer may see that object (spec 8.3, R11).
 *
 *   private bucket : ID documents, payment proofs, original photos
 *   derived bucket : blurred photo copies made by sharp
 *
 * Object keys are random (no names, emails or profile data in keys).
 */
import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../env.ts';

export type Bucket = 'private' | 'derived';

const buckets: Record<Bucket, string> = {
  private: env.R2_BUCKET_PRIVATE,
  derived: env.R2_BUCKET_DERIVED,
};

export const storageConfigured = Boolean(
  env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET_PRIVATE && env.R2_BUCKET_DERIVED,
);

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID || 'not-configured'}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});

function assertConfigured() {
  if (!storageConfigured) throw new Error('File storage (R2) is not configured.');
}

/** e.g. newObjectKey('documents') -> "documents/2026/10/5f0c...". */
export function newObjectKey(prefix: 'documents' | 'payment-proofs' | 'photos'): string {
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${prefix}/${now.getUTCFullYear()}/${month}/${randomUUID()}`;
}

export async function putObject(bucket: Bucket, key: string, body: Buffer, contentType: string): Promise<void> {
  assertConfigured();
  await client.send(new PutObjectCommand({ Bucket: buckets[bucket], Key: key, Body: body, ContentType: contentType }));
}

export async function deleteObject(bucket: Bucket, key: string): Promise<void> {
  assertConfigured();
  await client.send(new DeleteObjectCommand({ Bucket: buckets[bucket], Key: key }));
}

/** Call ONLY after the API has authorised this viewer for this object. Never cache publicly. */
export async function signedGetUrl(bucket: Bucket, key: string): Promise<string> {
  assertConfigured();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: buckets[bucket], Key: key }), {
    expiresIn: env.SIGNED_URL_TTL_SECONDS,
  });
}
