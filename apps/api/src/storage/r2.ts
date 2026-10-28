/**
 * Cloudflare R2 (S3-compatible) implementation of Storage. No public bucket URL and no
 * custom-domain public access: objects are only reachable through signed URLs.
 */
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageUnavailableError, type Bucket, type Storage } from './storage.ts';

export type R2Settings = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  privateBucket: string;
  derivedBucket: string;
  signedUrlTtlSeconds: number;
};

export function createR2Storage(settings: R2Settings): Storage {
  const buckets: Record<Bucket, string> = { private: settings.privateBucket, derived: settings.derivedBucket };
  const configured = Boolean(
    settings.accountId && settings.accessKeyId && settings.secretAccessKey && settings.privateBucket && settings.derivedBucket,
  );
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${settings.accountId || 'not-configured'}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
  });
  const ready = () => {
    if (!configured) throw new StorageUnavailableError();
  };

  return {
    configured,
    async put(bucket, key, body, contentType) {
      ready();
      await client.send(new PutObjectCommand({ Bucket: buckets[bucket], Key: key, Body: body, ContentType: contentType }));
    },
    async delete(bucket, key) {
      ready();
      // S3/R2 DeleteObject succeeds for keys that no longer exist.
      await client.send(new DeleteObjectCommand({ Bucket: buckets[bucket], Key: key }));
    },
    async signedGetUrl(bucket, key) {
      ready();
      return getSignedUrl(client, new GetObjectCommand({ Bucket: buckets[bucket], Key: key }), {
        expiresIn: settings.signedUrlTtlSeconds,
      });
    },
  };
}
