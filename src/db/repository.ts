import type { Db } from "./client";
import type { Scope } from "./scope";

/**
 * Every read and write against drive data.
 *
 * Two rules hold throughout, and they are why this file exists rather than
 * routes calling Prisma directly:
 *
 * 1. **Scope is a required first argument** and is applied to every query, so a
 *    caller cannot accidentally reach another tenant's rows.
 * 2. **`deletedAt: null` is applied to every read.** Soft deletes mean a query
 *    that forgets this shows trashed files (data-model.md §6). Centralising the
 *    filter means it is written once instead of remembered everywhere.
 */

/**
 * Direct-children counts.
 *
 * The two shapes differ because the relation names do: a Drive's subfolders are
 * `folders`, while a Folder's are `children` — it is a self-relation, and
 * "folders" would have read as ambiguous on the model itself.
 */
/**
 * Both count *direct* children only, so "3 items" means the same thing on a
 * drive card as on a folder row: what you will see when you open it.
 *
 * The drive side has to filter explicitly. Its `folders` and `files` relations
 * span the whole drive, so an unfiltered count would report every nested folder
 * and file as a direct child. The folder side needs no such filter because
 * `children` is the self-relation and is already one level.
 *
 * Both exclude soft-deleted rows — a trashed file must not be counted (§6).
 */
const driveChildCounts = {
  _count: {
    select: {
      folders: { where: { parentFolderId: null, deletedAt: null } },
      files: { where: { folderId: null, deletedAt: null } },
    },
  },
} as const;

const folderChildCounts = {
  _count: {
    select: {
      children: { where: { deletedAt: null } },
      files: { where: { deletedAt: null } },
    },
  },
} as const;

type DriveCounts = { _count: { folders: number; files: number } };
type FolderCounts = { _count: { children: number; files: number } };

const driveChildTotal = (row: DriveCounts) =>
  row._count.folders + row._count.files;

const folderChildTotal = (row: FolderCounts) =>
  row._count.children + row._count.files;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Thrown when a row is absent *or* outside the caller's scope. */
export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found.`);
    this.name = "NotFoundError";
  }
}

/** Thrown when a name collides with a live sibling. */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

// ---------------------------------------------------------------------------
// Drives
// ---------------------------------------------------------------------------

export async function listDrives(db: Db, scope: Scope) {
  const rows = await db.drive.findMany({
    where: { podId: scope.podId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    include: driveChildCounts,
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    childCount: driveChildTotal(row),
  }));
}

/**
 * Turns a display name into a slug that is unique within the pod.
 *
 * Collisions get a numeric suffix rather than being rejected: two drives called
 * "Invoices" is a reasonable thing to want, and the slug is plumbing the user did
 * not ask to think about.
 */
async function uniqueDriveSlug(db: Db, scope: Scope, name: string) {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "drive";

  const taken = new Set(
    (
      await db.drive.findMany({
        where: { podId: scope.podId, slug: { startsWith: base } },
        select: { slug: true },
      })
    ).map((row) => row.slug),
  );

  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export async function createDrive(
  db: Db,
  scope: Scope,
  input: { name: string; clientId?: string | null },
) {
  // Idempotency: a retry with the same client id returns the original row rather
  // than creating a second drive.
  if (input.clientId) {
    const existing = await db.drive.findUnique({
      where: { podId_clientId: { podId: scope.podId, clientId: input.clientId } },
      include: driveChildCounts,
    });
    if (existing) {
      return {
        id: existing.id,
        name: existing.name,
        slug: existing.slug,
        createdAt: existing.createdAt.toISOString(),
        updatedAt: existing.updatedAt.toISOString(),
        childCount: driveChildTotal(existing),
      };
    }
  }

  const slug = await uniqueDriveSlug(db, scope, input.name);

  try {
    const created = await db.drive.create({
      data: {
        podId: scope.podId,
        name: input.name,
        slug,
        clientId: input.clientId ?? null,
      },
      include: driveChildCounts,
    });

    return {
      id: created.id,
      name: created.name,
      slug: created.slug,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
      childCount: driveChildTotal(created),
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(`A drive named "${input.name}" already exists.`);
    }
    throw error;
  }
}

async function requireDrive(db: Db, scope: Scope, driveId: string) {
  const drive = await db.drive.findFirst({
    where: { id: driveId, podId: scope.podId, deletedAt: null },
    include: driveChildCounts,
  });
  if (!drive) throw new NotFoundError("Drive");
  return drive;
}

// ---------------------------------------------------------------------------
// Folder contents
// ---------------------------------------------------------------------------

/**
 * One level of a drive, plus the breadcrumb trail to reach it.
 *
 * The trail is walked server-side so a deep link renders correct breadcrumbs on
 * first paint instead of after a series of client round trips.
 */
export async function getFolderContents(
  db: Db,
  scope: Scope,
  driveId: string,
  folderId: string | null,
) {
  const drive = await requireDrive(db, scope, driveId);

  let folder = null;
  const ancestors: { id: string; name: string }[] = [];

  if (folderId) {
    folder = await db.folder.findFirst({
      where: { id: folderId, driveId, podId: scope.podId, deletedAt: null },
      include: folderChildCounts,
    });
    if (!folder) throw new NotFoundError("Folder");

    let cursor = folder.parentFolderId;
    // Bounded so a cycle — which the schema should prevent — cannot hang a request.
    for (let depth = 0; cursor && depth < 64; depth++) {
      const parent = await db.folder.findFirst({
        where: { id: cursor, driveId, podId: scope.podId, deletedAt: null },
        select: { id: true, name: true, parentFolderId: true },
      });
      if (!parent) break;
      ancestors.unshift({ id: parent.id, name: parent.name });
      cursor = parent.parentFolderId;
    }
  }

  const [folders, files] = await Promise.all([
    db.folder.findMany({
      where: {
        driveId,
        podId: scope.podId,
        parentFolderId: folderId,
        deletedAt: null,
      },
      orderBy: { name: "asc" },
      include: folderChildCounts,
    }),
    db.file.findMany({
      where: { driveId, podId: scope.podId, folderId, deletedAt: null },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    drive: {
      id: drive.id,
      name: drive.name,
      slug: drive.slug,
      createdAt: drive.createdAt.toISOString(),
      updatedAt: drive.updatedAt.toISOString(),
      childCount: driveChildTotal(drive),
    },
    folder: folder
      ? {
          id: folder.id,
          driveId: folder.driveId,
          parentFolderId: folder.parentFolderId,
          name: folder.name,
          createdAt: folder.createdAt.toISOString(),
          updatedAt: folder.updatedAt.toISOString(),
          childCount: folderChildTotal(folder),
        }
      : null,
    ancestors,
    folders: folders.map((row) => ({
      id: row.id,
      driveId: row.driveId,
      parentFolderId: row.parentFolderId,
      name: row.name,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      childCount: folderChildTotal(row),
    })),
    files: files.map(serializeFile),
  };
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

export async function createFolder(
  db: Db,
  scope: Scope,
  input: {
    driveId: string;
    parentFolderId: string | null;
    name: string;
    clientId?: string | null;
  },
) {
  await requireDrive(db, scope, input.driveId);

  if (input.clientId) {
    const existing = await db.folder.findUnique({
      where: {
        driveId_clientId: { driveId: input.driveId, clientId: input.clientId },
      },
      include: folderChildCounts,
    });
    if (existing) return serializeFolder(existing);
  }

  if (input.parentFolderId) {
    const parent = await db.folder.findFirst({
      where: {
        id: input.parentFolderId,
        driveId: input.driveId,
        podId: scope.podId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!parent) throw new NotFoundError("Parent folder");
  }

  try {
    const created = await db.folder.create({
      data: {
        podId: scope.podId,
        driveId: input.driveId,
        parentFolderId: input.parentFolderId,
        name: input.name,
        clientId: input.clientId ?? null,
      },
      include: folderChildCounts,
    });
    return serializeFolder(created);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(
        `A folder named "${input.name}" already exists here.`,
      );
    }
    throw error;
  }
}

function serializeFolder(row: {
  id: string;
  driveId: string;
  parentFolderId: string | null;
  name: string;
  createdAt: Date;
  updatedAt: Date;
} & FolderCounts) {
  return {
    id: row.id,
    driveId: row.driveId,
    parentFolderId: row.parentFolderId,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    childCount: folderChildTotal(row),
  };
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

function serializeFile(row: {
  id: string;
  driveId: string;
  folderId: string | null;
  name: string;
  contentType: string | null;
  sizeBytes: bigint | null;
  status: "PENDING" | "READY" | "FAILED";
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    driveId: row.driveId,
    folderId: row.folderId,
    name: row.name,
    contentType: row.contentType,
    // BigInt has no JSON representation; Number is exact to 8 PiB.
    sizeBytes: row.sizeBytes === null ? null : Number(row.sizeBytes),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Reserves a name among live siblings.
 *
 * Uploading `report.pdf` twice should give you two files, the way a desktop
 * would, rather than an error — so a collision is suffixed instead of rejected.
 * The database's partial unique index is still the authority; this just avoids
 * hitting it for the common case.
 */
async function availableFileName(
  db: Db,
  scope: Scope,
  driveId: string,
  folderId: string | null,
  name: string,
) {
  const taken = new Set(
    (
      await db.file.findMany({
        where: { driveId, podId: scope.podId, folderId, deletedAt: null },
        select: { name: true },
      })
    ).map((row) => row.name.toLowerCase()),
  );

  if (!taken.has(name.toLowerCase())) return name;

  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";

  let n = 2;
  while (taken.has(`${stem} (${n})${extension}`.toLowerCase())) n++;
  return `${stem} (${n})${extension}`;
}

/**
 * Creates the metadata row for an upload, before any bytes exist.
 *
 * The row lands at `PENDING` and the caller then moves the bytes with the
 * returned storage key. Metadata and object storage have no shared transaction,
 * which is exactly why the status column exists (data-model.md §3).
 */
export async function createFile(
  db: Db,
  scope: Scope,
  input: {
    driveId: string;
    folderId: string | null;
    name: string;
    contentType: string | null;
    sizeBytes: number | null;
    storageBucket: string;
    clientId?: string | null;
  },
) {
  await requireDrive(db, scope, input.driveId);

  if (input.clientId) {
    const existing = await db.file.findUnique({
      where: {
        driveId_clientId: { driveId: input.driveId, clientId: input.clientId },
      },
    });
    if (existing) {
      return { file: serializeFile(existing), storageKey: existing.storageKey };
    }
  }

  if (input.folderId) {
    const folder = await db.folder.findFirst({
      where: {
        id: input.folderId,
        driveId: input.driveId,
        podId: scope.podId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!folder) throw new NotFoundError("Folder");
  }

  const name = await availableFileName(
    db,
    scope,
    input.driveId,
    input.folderId,
    input.name,
  );

  // Keys are opaque and never derived from the visible path, so renaming or
  // moving a file is a metadata update that touches no bytes (data-model.md §3).
  const id = crypto.randomUUID();
  const storageKey = `drives/${input.driveId}/${id}`;

  const created = await db.file.create({
    data: {
      id,
      podId: scope.podId,
      driveId: input.driveId,
      folderId: input.folderId,
      name,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes === null ? null : BigInt(input.sizeBytes),
      storageBucket: input.storageBucket,
      storageKey,
      status: "PENDING",
      clientId: input.clientId ?? null,
    },
  });

  return { file: serializeFile(created), storageKey };
}

/** Second phase of an upload: the bytes either landed or they didn't. */
export async function setFileStatus(
  db: Db,
  scope: Scope,
  fileId: string,
  status: "READY" | "FAILED",
) {
  const updated = await db.file.updateMany({
    where: { id: fileId, podId: scope.podId, deletedAt: null },
    data: { status },
  });
  if (updated.count === 0) throw new NotFoundError("File");

  const row = await db.file.findFirst({
    where: { id: fileId, podId: scope.podId },
  });
  if (!row) throw new NotFoundError("File");
  return serializeFile(row);
}

/** Storage pointer for a file, for minting a download URL. */
export async function getFileStorage(db: Db, scope: Scope, fileId: string) {
  const row = await db.file.findFirst({
    where: { id: fileId, podId: scope.podId, deletedAt: null },
    select: {
      name: true,
      storageBucket: true,
      storageKey: true,
      status: true,
    },
  });
  if (!row) throw new NotFoundError("File");
  return row;
}
