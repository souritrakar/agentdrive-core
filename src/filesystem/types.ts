import type { Scope } from "@/db/scope";

export type ItemKind = "FOLDER" | "FILE";
export type UploadStatus = "PENDING" | "READY" | "FAILED";

export type Drive = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  childCount?: number;
};

export type Item = {
  id: string;
  driveId: string;
  parentId: string | null;
  kind: ItemKind;
  name: string;
  contentType: string | null;
  sizeBytes: number | null;
  uploadStatus: UploadStatus | null;
  childCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type PageInput = {
  cursor?: string | null;
  limit?: number;
  includeChildCounts?: boolean;
};

export type DrivePage = {
  drives: Drive[];
  nextCursor: string | null;
};

export type ListFolderInput = PageInput & {
  driveId: string;
  /** Null represents the Drive root; no synthetic root Item exists. */
  parentId: string | null;
};

export type FolderPage = {
  drive: Drive;
  currentFolder: Item | null;
  ancestors: Array<Pick<Item, "id" | "name">>;
  items: Item[];
  nextCursor: string | null;
};

export type CreateDriveInput = {
  name: string;
  clientId?: string | null;
};

export type CreateFolderInput = {
  driveId: string;
  parentId: string | null;
  name: string;
  clientId?: string | null;
};

export type MoveItemResult = {
  item: Item;
  previous: Pick<Item, "parentId" | "name">;
};

export type TrashItemResult = {
  itemId: string;
  previous: Pick<Item, "parentId" | "name">;
};

export type TrashPage = {
  items: Item[];
  nextCursor: string | null;
};

export type CompatibilityFileInput = {
  driveId: string;
  parentId: string | null;
  name: string;
  contentType: string | null;
  sizeBytes: number | null;
  storageBucket: string;
  clientId?: string | null;
};

export type CompatibilityFileReservation = {
  item: Item;
  storageKey: string;
};

export type DownloadPointer = {
  name: string;
  storageBucket: string;
  storageKey: string;
};

/**
 * The metadata operations a file transfer needs, and nothing else.
 *
 * The Transfer module holds only this interface. It cannot list a folder, move
 * an Item, or see a cursor; Filesystem in turn never learns what a presigned
 * URL or a multipart part is.
 */
export type FileMetadata = {
  /** Create a FILE Item at PENDING with a freshly minted object key. */
  reserveFile(
    scope: Scope,
    input: CompatibilityFileInput,
  ): Promise<CompatibilityFileReservation>;
  /**
   * Guarded PENDING -> READY | FAILED. `sizeBytes`, when given, is the size
   * storage reported and replaces whatever the caller declared.
   */
  setFileStatus(
    scope: Scope,
    itemId: string,
    status: "READY" | "FAILED",
    options?: { sizeBytes?: number | null },
  ): Promise<Item>;
  /**
   * Repoint an unfinished file at a new object key, for a retry of the same
   * Item. Accepts PENDING and FAILED; READY is terminal.
   */
  retargetFile(
    scope: Scope,
    itemId: string,
    storageBucket: string,
  ): Promise<CompatibilityFileReservation>;
  getDownload(scope: Scope, itemId: string): Promise<DownloadPointer>;
};

/** @deprecated Name kept only while the pre-session upload routes exist. */
export type TransferCompatibility = FileMetadata;

/**
 * The caller and integration-test surface for hierarchy reads.
 *
 * Prisma, SQL rows, cursor payloads, and recursive-query details remain behind
 * this interface. Scope is still explicit on every operation so omitting
 * tenancy is a type error.
 */
export type Filesystem = {
  listDrives(scope: Scope, page?: PageInput): Promise<DrivePage>;
  listFolder(scope: Scope, input: ListFolderInput): Promise<FolderPage>;
  /**
   * The Item and its live ancestors, root-first and inclusive of the Item
   * itself. The last element is always the Item; the first is always a
   * drive-root child.
   *
   * `driveId` may be null, meaning "whichever Drive this Item is in, within
   * this Pod" — the trail's rows carry the answer. Tenancy is scoped either
   * way; passing null only declines to assert the Drive in advance.
   *
   * Empty when the walk cannot be completed through live rows: the Item is
   * missing, deleted, or trashed; an ancestor is; the chain does not reach the
   * drive root within the 64-level bound; or the hierarchy contains a cycle.
   * It reports absence rather than throwing because its caller — Sharing — is
   * answering an authorization question on a public path, where every one of
   * those cases must fail closed and be indistinguishable from the others.
   *
   * This is the one read Sharing needed that Filesystem did not already have,
   * and it exists so ancestry has exactly one implementation.
   */
  readItemTrail(
    scope: Scope,
    driveId: string | null,
    itemId: string,
  ): Promise<Item[]>;
  createDrive(scope: Scope, input: CreateDriveInput): Promise<Drive>;
  renameDrive(scope: Scope, driveId: string, name: string): Promise<Drive>;
  trashDrive(scope: Scope, driveId: string): Promise<void>;
  restoreDrive(scope: Scope, driveId: string): Promise<Drive>;
  createFolder(scope: Scope, input: CreateFolderInput): Promise<Item>;
  renameItem(scope: Scope, itemId: string, name: string): Promise<Item>;
  moveItem(
    scope: Scope,
    itemId: string,
    newParentId: string | null,
  ): Promise<MoveItemResult>;
  trashItem(scope: Scope, itemId: string): Promise<TrashItemResult>;
  restoreItem(scope: Scope, itemId: string): Promise<Item>;
  listTrash(
    scope: Scope,
    driveId: string,
    page?: PageInput,
  ): Promise<TrashPage>;
};
