import type { Scope } from "@/db/scope";
import type {
  DownloadPointer,
  Drive,
  FolderPage,
  Item,
  PageInput,
} from "@/filesystem";

/** What a share grants access to. Exactly one of the two, never both. */
export type ShareSubject =
  | { kind: "DRIVE"; driveId: string }
  | { kind: "ITEM"; itemId: string };

/** A share as its owner sees it. The token is present because they may copy it. */
export type Share = {
  id: string;
  token: string;
  subject: ShareSubject;
  role: "VIEWER";
  allowDownload: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * A share as a visitor sees it — no token echoed back, no owner named.
 *
 * The token is omitted because the visitor already has it and returning it
 * invites it into logs and analytics that have no business holding a
 * credential. The owner is omitted because sharing a file is not consent to
 * publish your name alongside it.
 */
export type SharedView = {
  share: {
    role: "VIEWER";
    allowDownload: boolean;
  };
  subject:
    | { kind: "DRIVE"; drive: Pick<Drive, "id" | "name"> }
    | { kind: "ITEM"; item: Item };
};

export type ShareDisposition = "inline" | "attachment";

/**
 * A byte pointer plus the two response headers the transport must pin.
 *
 * `DownloadPointer` alone would force the transport to look the content type up
 * a second time to satisfy the "never echo an unverified type" rule in
 * security §3 — a second read of a row this module has already resolved, and a
 * second place for the allowlist decision to be made differently. Carrying the
 * decision with the pointer keeps it in one place.
 */
export type SharedDownload = DownloadPointer & {
  disposition: ShareDisposition;
  /** What to declare as `ResponseContentType`. Never the raw stored value. */
  contentType: string;
};

/** The reads the public face needs from the hierarchy, and nothing more. */
export type SharingFilesystem = {
  listFolder(
    scope: Scope,
    input: PageInput & { driveId: string; parentId: string | null },
  ): Promise<FolderPage>;
  /** `driveId` may be null: "whichever Drive this Item is in, in this Pod". */
  readItemTrail(
    scope: Scope,
    driveId: string | null,
    itemId: string,
  ): Promise<Item[]>;
};

/** The one byte-pointer read the public face needs. */
export type SharingFileMetadata = {
  getDownload(scope: Scope, itemId: string): Promise<DownloadPointer>;
};

export type Sharing = {
  // -------------------------------------------------------------------------
  // Owner face — takes a Scope, like every Filesystem operation. Omitting
  // tenancy is a type error.
  // -------------------------------------------------------------------------

  /** Create-or-return. Verifies the Drive exists, is live, and is in scope. */
  shareDrive(scope: Scope, driveId: string): Promise<Share>;
  /** Create-or-return. Verifies the Item exists, is live, and is in scope. */
  shareItem(scope: Scope, itemId: string): Promise<Share>;

  /** Null when the subject has no active share — how the dialog knows. */
  getShareForSubject(
    scope: Scope,
    subject: ShareSubject,
  ): Promise<Share | null>;

  updateShare(
    scope: Scope,
    subject: ShareSubject,
    patch: { allowDownload: boolean },
  ): Promise<Share>;

  /** Soft-deletes the row. Idempotent; a second revoke is a no-op. */
  revokeShare(scope: Scope, subject: ShareSubject): Promise<void>;

  // -------------------------------------------------------------------------
  // Public face — the token is the authorization.
  //
  // No Scope parameter, and that absence is the design: the visitor has no
  // identity, and every method re-resolves the token from scratch. There is no
  // session and nothing cached, so a revocation has nothing to lag behind.
  // -------------------------------------------------------------------------

  /** Token -> what this link shows. The entry point for every share page. */
  resolveShare(token: string): Promise<SharedView>;

  /**
   * One level of a shared Drive or Folder, with ancestors truncated at the
   * subject so a visitor's breadcrumbs can never climb above the grant.
   */
  listSharedContents(
    token: string,
    input?: PageInput & { folderId?: string | null },
  ): Promise<FolderPage>;

  /** Metadata for the single-file viewer. */
  getSharedFileView(token: string, itemId: string): Promise<Item>;

  /** The only method that reaches toward bytes. */
  getSharedDownload(
    token: string,
    itemId: string,
    disposition: ShareDisposition,
  ): Promise<SharedDownload>;
};
