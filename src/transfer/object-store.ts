/**
 * The bytes half of a transfer, as a narrow port.
 *
 * The Transfer module talks to storage only through this, for two reasons that
 * both pay off immediately: tests get a fake with no network and no provider,
 * and the S3 SDK's vocabulary — commands, ETags, continuation tokens — stays
 * on the far side of a boundary the domain never crosses.
 *
 * Deliberately not a general storage interface. It has exactly the operations
 * an upload needs; listing, copying, and downloading are somebody else's job.
 */

import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  deleteObject,
  headObject,
  presignPut,
  presignUploadPart,
  listParts,
  type ObjectHead,
  type PresignedUrl,
  type StorageClient,
  type UploadedPart,
} from "@/storage";

export type { ObjectHead, PresignedUrl, UploadedPart };

export type ObjectStore = {
  /** The bucket new objects are written to. Existing rows carry their own. */
  readonly bucket: string;

  presignPut(input: {
    bucket: string;
    key: string;
    contentType?: string;
  }): Promise<PresignedUrl>;

  /** `null` when the key does not exist — an ordinary answer, not a failure. */
  head(input: { bucket: string; key: string }): Promise<ObjectHead | null>;

  delete(input: { bucket: string; key: string }): Promise<void>;

  createMultipartUpload(input: {
    bucket: string;
    key: string;
    contentType?: string;
    metadata?: Record<string, string>;
  }): Promise<string>;

  presignUploadPart(input: {
    bucket: string;
    key: string;
    uploadId: string;
    partNumber: number;
  }): Promise<PresignedUrl>;

  /** `null` when the provider no longer holds the upload. */
  listParts(input: {
    bucket: string;
    key: string;
    uploadId: string;
  }): Promise<UploadedPart[] | null>;

  /** `false` when the provider no longer holds the upload. */
  completeMultipartUpload(input: {
    bucket: string;
    key: string;
    uploadId: string;
    parts: Array<Pick<UploadedPart, "partNumber" | "etag">>;
  }): Promise<boolean>;

  /** Idempotent: an upload that is already gone is a success. */
  abortMultipartUpload(input: {
    bucket: string;
    key: string;
    uploadId: string;
  }): Promise<void>;
};

/** Bind the S3-API storage functions to one client and default bucket. */
export function createObjectStore(
  client: StorageClient,
  bucket: string,
): ObjectStore {
  return {
    bucket,
    presignPut: ({ bucket: b, key, contentType }) =>
      presignPut(client, b, key, contentType),
    head: ({ bucket: b, key }) => headObject(client, b, key),
    delete: ({ bucket: b, key }) => deleteObject(client, b, key),
    createMultipartUpload: ({ bucket: b, key, contentType, metadata }) =>
      createMultipartUpload(client, b, key, contentType, metadata),
    presignUploadPart: ({ bucket: b, key, uploadId, partNumber }) =>
      presignUploadPart(client, b, key, uploadId, partNumber),
    listParts: ({ bucket: b, key, uploadId }) =>
      listParts(client, b, key, uploadId),
    completeMultipartUpload: ({ bucket: b, key, uploadId, parts }) =>
      completeMultipartUpload(client, b, key, uploadId, parts),
    abortMultipartUpload: ({ bucket: b, key, uploadId }) =>
      abortMultipartUpload(client, b, key, uploadId),
  };
}
