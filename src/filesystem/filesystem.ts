import type { Db } from "@/db/client";

import {
  DriveNotFoundError,
  FolderCycleError,
  HierarchyTooDeepError,
  InvalidFilesystemInputError,
  ItemNotFoundError,
} from "./errors";
import {
  decodeDriveCursor,
  decodeItemCursor,
  decodeTrashCursor,
  encodeDriveCursor,
  encodeItemCursor,
  encodeTrashCursor,
  isUuid,
} from "./internal/cursors";
import {
  countDriveChildren,
  countFolderChildren,
  findActiveDrive,
  listActiveDrives,
  listActiveItems,
  listTrashRoots,
  readActiveFolderTrail,
  readActiveItemTrail,
} from "./internal/queries";
import { serializeDrive, serializeItem } from "./internal/serialization";
import {
  createDrive,
  createFolder,
  moveItem,
  renameDrive,
  renameItem,
  restoreDrive,
  restoreItem,
  trashDrive,
  trashItem,
} from "./internal/mutations";
import type {
  DrivePage,
  Filesystem,
  FolderPage,
  Item,
  ListFolderInput,
  PageInput,
  TrashPage,
} from "./types";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function pageSize(limit: number | undefined): number {
  const value = limit ?? DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(value) || value < 1 || value > MAX_PAGE_SIZE) {
    throw new InvalidFilesystemInputError(
      `Page limit must be an integer from 1 to ${MAX_PAGE_SIZE}.`,
    );
  }
  return value;
}

function requirePublicId(value: string, field: string): void {
  if (!isUuid(value)) {
    throw new InvalidFilesystemInputError(`${field} must be a UUID.`);
  }
}

export function createFilesystem(db: Db): Filesystem {
  return {
    listDrives: (scope, page) => listDrives(db, scope, page),
    listFolder: (scope, input) => listFolder(db, scope, input),
    readItemTrail: (scope, driveId, itemId) =>
      readItemTrail(db, scope, driveId, itemId),
    createDrive: (scope, input) => createDrive(db, scope, input),
    renameDrive: (scope, driveId, name) =>
      renameDrive(db, scope, driveId, name),
    trashDrive: (scope, driveId) => trashDrive(db, scope, driveId),
    restoreDrive: (scope, driveId) => restoreDrive(db, scope, driveId),
    createFolder: (scope, input) => createFolder(db, scope, input),
    renameItem: (scope, itemId, name) =>
      renameItem(db, scope, itemId, name),
    moveItem: (scope, itemId, newParentId) =>
      moveItem(db, scope, itemId, newParentId),
    trashItem: (scope, itemId) => trashItem(db, scope, itemId),
    restoreItem: (scope, itemId) => restoreItem(db, scope, itemId),
    listTrash: (scope, driveId, page) => listTrash(db, scope, driveId, page),
  };
}

/**
 * The live rootward trail for any Item, or nothing at all.
 *
 * Unlike `listFolder`, a broken chain here is not an error to report — it is an
 * answer. The only caller is Sharing's containment check, which must treat "the
 * item is gone", "an ancestor is trashed", "the hierarchy is corrupt", and
 * "that item was never yours" as the same denial, so that a probing visitor
 * cannot tell them apart. Returning an empty trail for every one of them is
 * what makes that collapse structural rather than a discipline the caller has
 * to remember.
 */
async function readItemTrail(
  db: Db,
  scope: Parameters<Filesystem["readItemTrail"]>[0],
  driveId: string | null,
  itemId: string,
): Promise<Item[]> {
  if (driveId !== null && !isUuid(driveId)) return [];
  if (!isUuid(itemId)) return [];

  const trail = await readActiveItemTrail(db, scope, driveId, itemId);
  if (trail.length === 0) return [];
  if (trail.some((row) => row.cycle)) return [];

  // Rows are root-to-item. A non-null parent on the rootmost row means the walk
  // stopped short: a missing, deleted, trashed, or non-Folder ancestor, or the
  // depth bound. In every case the item is not reachable from the drive root
  // through live rows, so it is not inside anything a share could cover.
  const rootmost = trail[0];
  if (!rootmost || rootmost.parentId !== null) return [];

  return trail.map((row) => serializeItem(row));
}

async function listTrash(
  db: Db,
  scope: Parameters<Filesystem["listTrash"]>[0],
  driveId: string,
  page: PageInput = {},
): Promise<TrashPage> {
  requirePublicId(driveId, "driveId");
  const limit = pageSize(page.limit);
  const cursor = page.cursor ? decodeTrashCursor(page.cursor) : null;
  const drive = await findActiveDrive(db, scope, driveId);
  if (!drive) throw new DriveNotFoundError();
  const rows = await listTrashRoots(db, scope, driveId, limit + 1, cursor);
  const hasNextPage = rows.length > limit;
  const visibleRows = hasNextPage ? rows.slice(0, limit) : rows;
  const last = visibleRows.at(-1);
  return {
    items: visibleRows.map((row) => serializeItem(row)),
    nextCursor:
      hasNextPage && last
        ? encodeTrashCursor({
            id: last.id,
            deletedAt: last.deletedAt.toISOString(),
          })
        : null,
  };
}

async function listDrives(
  db: Db,
  scope: Parameters<Filesystem["listDrives"]>[0],
  page: PageInput = {},
): Promise<DrivePage> {
  const limit = pageSize(page.limit);
  const cursor = page.cursor ? decodeDriveCursor(page.cursor) : null;
  const rows = await listActiveDrives(db, scope, limit + 1, cursor);
  const hasNextPage = rows.length > limit;
  const visibleRows = hasNextPage ? rows.slice(0, limit) : rows;
  const childCounts = page.includeChildCounts
    ? await countDriveChildren(
        db,
        scope,
        visibleRows.map((row) => row.id),
      )
    : new Map<string, number>();
  const last = visibleRows.at(-1);

  return {
    drives: visibleRows.map((row) =>
      serializeDrive(
        row,
        page.includeChildCounts ? (childCounts.get(row.id) ?? 0) : undefined,
      ),
    ),
    nextCursor:
      hasNextPage && last
        ? encodeDriveCursor({
            id: last.id,
            updatedAt: last.updatedAt.toISOString(),
          })
        : null,
  };
}

async function listFolder(
  db: Db,
  scope: Parameters<Filesystem["listFolder"]>[0],
  input: ListFolderInput,
): Promise<FolderPage> {
  requirePublicId(input.driveId, "driveId");
  if (input.parentId !== null) requirePublicId(input.parentId, "parentId");

  const limit = pageSize(input.limit);
  const cursor = input.cursor ? decodeItemCursor(input.cursor) : null;
  const driveRow = await findActiveDrive(db, scope, input.driveId);
  if (!driveRow) throw new DriveNotFoundError();

  const trail = input.parentId
    ? await readActiveFolderTrail(db, scope, input.driveId, input.parentId)
    : [];

  if (input.parentId && trail.length === 0) throw new ItemNotFoundError();
  if (trail.some((row) => row.cycle)) throw new FolderCycleError();

  // Rows are root-to-current. A non-null parent on the rootmost row means the
  // CTE hit its depth bound or encountered a missing/deleted/non-Folder parent.
  const rootmost = trail[0];
  if (rootmost && rootmost.parentId !== null) {
    if (rootmost.depth >= 64) throw new HierarchyTooDeepError();
    throw new ItemNotFoundError();
  }

  const rows = await listActiveItems(db, scope, {
    driveId: input.driveId,
    parentId: input.parentId,
    limit: limit + 1,
    cursor,
  });
  const hasNextPage = rows.length > limit;
  const visibleRows = hasNextPage ? rows.slice(0, limit) : rows;
  const folderIds = visibleRows
    .filter((row) => row.kind === "FOLDER")
    .map((row) => row.id);
  const childCounts = input.includeChildCounts
    ? await countFolderChildren(db, scope, input.driveId, folderIds)
    : new Map<string, number>();
  const last = visibleRows.at(-1);
  const currentRow = trail.find((row) => row.depth === 1) ?? null;

  return {
    drive: serializeDrive(driveRow),
    currentFolder: currentRow ? serializeItem(currentRow) : null,
    ancestors: trail
      .filter((row) => row.depth > 1)
      .map((row) => ({ id: row.id, name: row.name })),
    items: visibleRows.map((row) =>
      serializeItem(
        row,
        input.includeChildCounts && row.kind === "FOLDER"
          ? (childCounts.get(row.id) ?? 0)
          : undefined,
      ),
    ),
    nextCursor:
      hasNextPage && last
        ? encodeItemCursor({
            id: last.id,
            kind: last.kind,
            normalizedName: last.normalizedName,
          })
        : null,
  };
}
