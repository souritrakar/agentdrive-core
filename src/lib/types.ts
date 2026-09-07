/**
 * Public domain types consumed by the product UI.
 *
 * The hierarchy is one Item collection. Folder and File are not separate wire
 * resources: `kind` discriminates the fields a caller may use, while
 * `parentId` is the single hierarchy pointer for both.
 */

export type UploadStatus = "PENDING" | "READY" | "FAILED";

type Timestamped = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type Drive = Timestamped & {
  slug: string;
  /** Direct active children only. */
  childCount?: number;
};

type ItemBase = Timestamped & {
  driveId: string;
  parentId: string | null;
};

type FolderItem = ItemBase & {
  kind: "FOLDER";
  contentType: null;
  sizeBytes: null;
  uploadStatus: null;
  /** Direct active children only. */
  childCount?: number;
};

type FileItem = ItemBase & {
  kind: "FILE";
  contentType: string | null;
  sizeBytes: number | null;
  uploadStatus: UploadStatus;
  childCount?: never;
};

/** One metadata resource for every Folder and File in a Drive. */
export type Item = FolderItem | FileItem;

/**
 * One bounded page of immediate children plus the path to its parent.
 *
 * `ancestors` excludes `currentFolder`; the current location is the page title.
 */
export type FolderPage = {
  drive: Drive;
  currentFolder: FolderItem | null;
  ancestors: Array<Pick<Item, "id" | "name">>;
  items: Item[];
  nextCursor: string | null;
};

export type MoveItemResult = {
  item: Item;
  previous: Pick<Item, "parentId" | "name">;
};

export type TrashItemResult = {
  itemId: string;
  previous: Pick<Item, "parentId" | "name">;
};

// ---------------------------------------------------------------------------
// Sharing
// ---------------------------------------------------------------------------

export type ShareRole = "VIEWER";

/**
 * Which subject a share is being asked about.
 *
 * The owner routes are mounted twice — once under a Drive, once under an Item —
 * and the client mirrors that rather than growing eight near-identical
 * functions: the subject picks the path, and one function per verb covers both.
 */
export type ShareSubjectRef =
  | { kind: "DRIVE"; driveId: string }
  | { kind: "ITEM"; itemId: string };

/**
 * A share as its owner sees it, including the token — the dialog's whole job is
 * to hand that over, and it is the only place in the product that renders one.
 *
 * `src/components/share/types.ts` declares the same shape for the presentational
 * layer, which may not import a client module. The two are checked against each
 * other structurally wherever this type is passed into `ShareDialog`, so a
 * divergence is a compile error at the wiring seam rather than a runtime
 * surprise.
 */
export type Share = {
  id: string;
  token: string;
  subject: ShareSubjectRef;
  role: ShareRole;
  allowDownload: boolean;
  createdAt: string;
  updatedAt: string;
};
