/**
 * Private file storage, behind one interface so tests can use memory instead of R2 (r2.ts).
 * Both buckets are private; browsers only ever get short-lived signed URLs, and only after the API
 * has checked the viewer may see that object (spec 8.3, R11).
 *
 *   private bucket : ID documents, payment proofs, original photos
 *   derived bucket : blurred photo copies made by sharp
 */
import { randomUUID } from 'node:crypto';

export type Bucket = 'private' | 'derived';

export interface Storage {
  readonly configured: boolean;
  put(bucket: Bucket, key: string, body: Buffer, contentType: string): Promise<void>;
  /** Deleting a missing object is not an error. */
  delete(bucket: Bucket, key: string): Promise<void>;
  /** Call ONLY after the API has authorised this viewer for this object. Never cache publicly. */
  signedGetUrl(bucket: Bucket, key: string): Promise<string>;
}

/** Object keys are random (no names, emails or profile data), e.g. "documents/2026/10/5f0c...". */
export function newObjectKey(prefix: 'documents' | 'payment-proofs' | 'photos'): string {
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${prefix}/${now.getUTCFullYear()}/${month}/${randomUUID()}`;
}

export class StorageUnavailableError extends Error {
  constructor() {
    super('File storage (R2) is not configured.');
  }
}
