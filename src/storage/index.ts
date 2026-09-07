/**
 * Public surface of the storage layer.
 *
 * Everything here is framework-free and takes an injected client, so the same
 * functions serve the Cloudflare Worker (credentials from `c.env`) and any Node
 * script (credentials from `process.env`). Nothing in this directory reads the
 * environment on its own — see `envStorageConfig` for the Node-side helper.
 */

export { createStorageClient } from "./client";
export type { StorageClient, StorageConfig } from "./client";

export {
  BUCKET_NAME_MAX,
  BUCKET_NAME_MIN,
  createBucket,
  listBuckets,
  putBucketCors,
  validateBucketName,
} from "./buckets";

export {
  deleteObject,
  headObject,
  listObjects,
  presignGet,
  presignPut,
  PRESIGN_EXPIRES_IN,
  PRESIGN_UPLOAD_EXPIRES_IN,
  SHARE_PRESIGN_EXPIRES_IN,
} from "./objects";
export type { PresignGetOptions } from "./objects";

export {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  listParts,
  presignUploadPart,
} from "./multipart";

export { isStorageError, StorageError, toStorageError } from "./errors";
export type { StorageErrorCode } from "./errors";

export type {
  BucketSummary,
  ObjectHead,
  ObjectPage,
  ObjectSummary,
  PresignedUrl,
  UploadedPart,
} from "./types";

// `./env` is deliberately not re-exported here — it reads `process.env`, which
// does not exist in the Worker runtime. Node callers import it directly.
