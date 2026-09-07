/**
 * The Upload/Storage module.
 *
 * Owns transfer sessions, presigned URLs, resume, verification, and
 * reconciliation. It reaches Item rows only through `FileMetadata` and object
 * storage only through `ObjectStore`, so neither Prisma models nor S3 commands
 * appear in its callers — and both can be faked wholesale in a test.
 *
 * Design and rationale: docs/architecture/upload-storage-module-spec.md
 */

import type { Db } from "@/db/client";
import { createFileMetadata, type FileMetadata } from "@/filesystem";

import {
  abort,
  complete,
  partUrls,
  reserve,
  retry,
  status,
  type Deps,
} from "./internal/operations";
import { reap } from "./internal/reaper";
import type { ObjectStore } from "./object-store";
import type { Transfer } from "./types";

export function createTransfer(
  db: Db,
  store: ObjectStore,
  files: FileMetadata = createFileMetadata(db),
): Transfer {
  const deps: Deps = { db, files, store };

  return {
    reserve: (scope, input) => reserve(deps, scope, input),
    status: (scope, uploadId) => status(deps, scope, uploadId),
    partUrls: (scope, uploadId, partNumbers) =>
      partUrls(deps, scope, uploadId, partNumbers),
    complete: (scope, uploadId) => complete(deps, scope, uploadId),
    abort: (scope, uploadId) => abort(deps, scope, uploadId),
    retry: (scope, itemId) => retry(deps, scope, itemId),
    reap: (options) => reap(deps, options),
  };
}

export { createObjectStore } from "./object-store";
export type { ObjectStore } from "./object-store";

export {
  isTransferError,
  transferErrorStatus,
  TransferError,
  type TransferErrorCode,
} from "./errors";

export {
  MAX_FILE_SIZE_BYTES,
  MAX_PART_URLS_PER_CALL,
  SINGLE_PUT_MAX_BYTES,
  SINGLE_PUT_THRESHOLD_BYTES,
} from "./limits";

export type {
  PartTarget,
  PresignedTarget,
  RequestedMode,
  ReserveUploadInput,
  ReserveUploadResult,
  Transfer,
  TransferMode,
  UploadPlan,
  UploadSession,
  UploadState,
  UploadStatusResult,
  ReapResult,
} from "./types";
