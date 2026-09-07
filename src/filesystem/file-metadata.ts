import type { Db } from "@/db/client";

import {
  createCompatibilityFile,
  getCompatibilityDownload,
  retargetCompatibilityFile,
  setCompatibilityFileStatus,
} from "./internal/mutations";
import type { FileMetadata } from "./types";

/**
 * The metadata half of a file transfer.
 *
 * This is the seam the Transfer module calls through, and the only way it is
 * allowed to touch Item rows. Transfer owns sessions, presigned URLs, retries,
 * and reconciliation; Filesystem owns the Item's identity, its place in the
 * tree, its name, and its byte pointer. Neither reaches past the other's
 * interface, which is why the object key is minted here — the column lives
 * here, so the invariant that a FILE always has one lives here too.
 *
 * Deliberately separate from `createFilesystem`: hierarchy callers have no
 * business seeing upload-state transitions, and transfer callers have no
 * business seeing folder listings.
 */
export function createFileMetadata(db: Db): FileMetadata {
  return {
    reserveFile: (scope, input) => createCompatibilityFile(db, scope, input),
    setFileStatus: (scope, itemId, status, options) =>
      setCompatibilityFileStatus(db, scope, itemId, status, options),
    retargetFile: (scope, itemId, storageBucket) =>
      retargetCompatibilityFile(db, scope, itemId, storageBucket),
    getDownload: (scope, itemId) => getCompatibilityDownload(db, scope, itemId),
  };
}

/**
 * @deprecated Use `createFileMetadata`. Kept while the pre-session upload
 * routes are still mounted; removed with them.
 */
export const createTransferCompatibility = createFileMetadata;
