// Two-phase (multipart) upload orchestration.
//
// WIP: the upload session model moves under the unified node table, so the
// initiate/sign/complete flow is stubbed on this branch. The presign and part
// bookkeeping logic was pulled out with the storage-mapping rework and will be
// reinstated against the new node layout. Not runnable as-is.

import { StorageError } from "./errors";

const PENDING = "multipart upload flow is mid-migration (node-model rework)";

export async function initiateUpload(): Promise<never> {
  throw new StorageError(PENDING);
}

export async function signPart(): Promise<never> {
  throw new StorageError(PENDING);
}

export async function completeUpload(): Promise<never> {
  throw new StorageError(PENDING);
}

export async function abortUpload(): Promise<never> {
  throw new StorageError(PENDING);
}
