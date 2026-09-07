/**
 * The Sharing module.
 *
 * Owns the `shares` table and everything about "who may see what through a
 * link". It reads the hierarchy only through the Filesystem seam and byte
 * pointers only through `FileMetadata`, so no Prisma model of another module's
 * table and no S3 vocabulary appears here — and both ports can be faked whole
 * in a test.
 *
 * Nothing is copied by a share. A shared file is served from the same
 * `storageBucket`/`storageKey` its owner downloads, through the same presigned
 * GET; deleting the original darkens every link to it. That is the intended
 * Google Drive semantic, not a defect.
 *
 * Design and rationale: docs/architecture/sharing/01-sharing-module.md
 * Token, URL, and abuse handling: docs/architecture/sharing/02-public-access-security.md
 */

import type { Db } from "@/db/client";
import { createFileMetadata, createFilesystem } from "@/filesystem";

import {
  getSharedDownload,
  getSharedFileView,
  getShareForSubject,
  listSharedContents,
  resolveShare,
  revokeShare,
  shareDrive,
  shareItem,
  updateShare,
  type Deps,
} from "./internal/operations";
import type {
  Sharing,
  SharingFileMetadata,
  SharingFilesystem,
} from "./types";

export function createSharing(
  db: Db,
  filesystem: SharingFilesystem = createFilesystem(db),
  files: SharingFileMetadata = createFileMetadata(db),
): Sharing {
  const deps: Deps = { db, filesystem, files };

  return {
    shareDrive: (scope, driveId) => shareDrive(deps, scope, driveId),
    shareItem: (scope, itemId) => shareItem(deps, scope, itemId),
    getShareForSubject: (scope, subject) =>
      getShareForSubject(deps, scope, subject),
    updateShare: (scope, subject, patch) =>
      updateShare(deps, scope, subject, patch),
    revokeShare: (scope, subject) => revokeShare(deps, scope, subject),

    resolveShare: (token) => resolveShare(deps, token),
    listSharedContents: (token, input) =>
      listSharedContents(deps, token, input),
    getSharedFileView: (token, itemId) =>
      getSharedFileView(deps, token, itemId),
    getSharedDownload: (token, itemId, disposition) =>
      getSharedDownload(deps, token, itemId, disposition),
  };
}

export {
  DownloadNotAllowedError,
  InvalidShareInputError,
  isSharingError,
  ShareNotFoundError,
  SharingError,
  sharingErrorStatus,
  type SharingErrorCode,
} from "./errors";

export {
  attachmentContentType,
  FALLBACK_CONTENT_TYPE,
  inlineContentType,
  isInlinePreviewable,
} from "./preview";

export {
  isShareTokenShape,
  SHARE_TOKEN_LENGTH,
} from "./token";

export type {
  Share,
  SharedDownload,
  SharedView,
  ShareDisposition,
  ShareSubject,
  Sharing,
  SharingFileMetadata,
  SharingFilesystem,
} from "./types";
