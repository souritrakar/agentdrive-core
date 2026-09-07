/**
 * In-memory stand-ins for the three ports, for testing resolution.
 *
 * Faithful about exactly the things the module's correctness rests on, and
 * indifferent about everything else:
 *
 * - the share store enforces both partial unique indexes, because
 *   create-or-return is built on a unique violation rather than a `SELECT`;
 * - the hierarchy walks only live rows and refuses to return a trail that does
 *   not reach a drive root, because that is what makes a trashed ancestor a
 *   denial;
 * - `getDownload` distinguishes "not a file" from "not ready", because the two
 *   produce different refusals on the public path.
 *
 * Kept in `internal/` rather than in the test file so a drift in the real ports
 * shows up here as a type error rather than as a passing test that proves
 * nothing.
 */

import type { Scope } from "@/db/scope";
import {
  DriveNotFoundError,
  FileNotReadyError,
  ItemNotDownloadableError,
  ItemNotFoundError,
  type DownloadPointer,
  type FolderPage,
  type Item,
  type PageInput,
  type UploadStatus,
} from "@/filesystem";

import type { SharingFileMetadata, SharingFilesystem } from "../types";

// ---------------------------------------------------------------------------
// The share table
// ---------------------------------------------------------------------------

export class UniqueViolation extends Error {
  readonly code = "P2002";
  constructor(index: string) {
    super(`unique constraint failed: ${index}`);
  }
}

type ShareRow = {
  id: string;
  podId: string;
  driveId: string;
  itemId: string | null;
  token: string;
  allowDownload: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  pod: { accountId: string };
};

type Where = Record<string, unknown>;

function matches(row: ShareRow, where: Where): boolean {
  return Object.entries(where).every(([key, expected]) => {
    const actual = (row as unknown as Record<string, unknown>)[key];
    if (expected === null) return actual === null;
    return actual === expected;
  });
}

export class FakeShareStore {
  readonly rows: ShareRow[] = [];
  private sequence = 0;
  accountId = "account-1";

  readonly share = {
    findFirst: async ({ where }: { where: Where; select?: unknown }) =>
      this.rows.find((row) => matches(row, where)) ?? null,

    create: async ({ data }: { data: Where; select?: unknown }) => {
      const driveId = data.driveId as string;
      const itemId = (data.itemId as string | null) ?? null;

      // The two partial unique indexes, enforced exactly where Postgres would.
      if (itemId === null) {
        const clash = this.rows.some(
          (row) =>
            row.driveId === driveId &&
            row.itemId === null &&
            row.deletedAt === null,
        );
        if (clash) throw new UniqueViolation("shares_one_active_per_drive");
      } else {
        const clash = this.rows.some(
          (row) => row.itemId === itemId && row.deletedAt === null,
        );
        if (clash) throw new UniqueViolation("shares_one_active_per_item");
      }
      if (this.rows.some((row) => row.token === data.token)) {
        throw new UniqueViolation("shares_token_key");
      }

      this.sequence += 1;
      const now = new Date();
      const row: ShareRow = {
        id: `share-${this.sequence}`,
        podId: data.podId as string,
        driveId,
        itemId,
        token: data.token as string,
        allowDownload: (data.allowDownload as boolean) ?? true,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
        pod: { accountId: this.accountId },
      };
      this.rows.push(row);
      return row;
    },

    updateMany: async ({ where, data }: { where: Where; data: Where }) => {
      const affected = this.rows.filter((row) => matches(row, where));
      for (const row of affected) {
        Object.assign(row, data, { updatedAt: new Date() });
      }
      return { count: affected.length };
    },
  };

  byToken(token: string): ShareRow {
    const row = this.rows.find((candidate) => candidate.token === token);
    if (!row) throw new Error(`no such share token: ${token}`);
    return row;
  }
}

// ---------------------------------------------------------------------------
// The hierarchy
// ---------------------------------------------------------------------------

type FakeNode = {
  id: string;
  driveId: string;
  parentId: string | null;
  kind: "FOLDER" | "FILE";
  name: string;
  contentType: string | null;
  sizeBytes: number | null;
  uploadStatus: UploadStatus | null;
  deleted: boolean;
};

type FakeDrive = { id: string; name: string; deleted: boolean };

/** The `item_kind` enum's declaration order, which is its sort order. */
const KIND_ORDER = { FOLDER: 0, FILE: 1 } as const;

/**
 * A tiny filesystem, implementing both hierarchy ports.
 *
 * Trash is modelled the way the real schema models it: trashing marks the whole
 * subtree, so "is this row live" is one flag rather than a walk. Tests that
 * trash a folder and then assert its child is unreachable are therefore
 * exercising the module's containment logic, not this fake's bookkeeping.
 */
export class FakeHierarchy implements SharingFilesystem, SharingFileMetadata {
  readonly drives = new Map<string, FakeDrive>();
  readonly nodes = new Map<string, FakeNode>();
  private sequence = 0;

  addDrive(id: string, name = id): void {
    this.drives.set(id, { id, name, deleted: false });
  }

  addFolder(driveId: string, parentId: string | null, name: string): string {
    return this.add(driveId, parentId, name, "FOLDER", null, null);
  }

  addFile(
    driveId: string,
    parentId: string | null,
    name: string,
    contentType: string | null = "application/pdf",
    uploadStatus: UploadStatus = "READY",
  ): string {
    return this.add(driveId, parentId, name, "FILE", contentType, uploadStatus);
  }

  private add(
    driveId: string,
    parentId: string | null,
    name: string,
    kind: "FOLDER" | "FILE",
    contentType: string | null,
    uploadStatus: UploadStatus | null,
  ): string {
    this.sequence += 1;
    const id = `item-${this.sequence}`;
    this.nodes.set(id, {
      id,
      driveId,
      parentId,
      kind,
      name,
      contentType,
      sizeBytes: kind === "FILE" ? 1024 : null,
      uploadStatus,
      deleted: false,
    });
    return id;
  }

  /** Trash marks the whole subtree, exactly as the real mutation does. */
  trash(itemId: string): void {
    const mark = (id: string) => {
      const node = this.nodes.get(id);
      if (!node) return;
      node.deleted = true;
      for (const child of this.nodes.values()) {
        if (child.parentId === id) mark(child.id);
      }
    };
    mark(itemId);
  }

  restore(itemId: string): void {
    const unmark = (id: string) => {
      const node = this.nodes.get(id);
      if (!node) return;
      node.deleted = false;
      for (const child of this.nodes.values()) {
        if (child.parentId === id) unmark(child.id);
      }
    };
    unmark(itemId);
  }

  trashDrive(driveId: string): void {
    const drive = this.drives.get(driveId);
    if (drive) drive.deleted = true;
  }

  setUploadStatus(itemId: string, status: UploadStatus): void {
    const node = this.nodes.get(itemId);
    if (node) node.uploadStatus = status;
  }

  private serialize(node: FakeNode): Item {
    return {
      id: node.id,
      driveId: node.driveId,
      parentId: node.parentId,
      kind: node.kind,
      name: node.name,
      contentType: node.kind === "FOLDER" ? null : node.contentType,
      sizeBytes: node.kind === "FOLDER" ? null : node.sizeBytes,
      uploadStatus: node.kind === "FOLDER" ? null : node.uploadStatus,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
  }

  async readItemTrail(
    _scope: Scope,
    driveId: string | null,
    itemId: string,
  ): Promise<Item[]> {
    const seed = this.nodes.get(itemId);
    if (!seed || seed.deleted) return [];
    if (driveId !== null && seed.driveId !== driveId) return [];

    const trail: FakeNode[] = [seed];
    let cursor = seed;

    while (cursor.parentId !== null) {
      const parent = this.nodes.get(cursor.parentId);
      // A missing, deleted, or non-Folder ancestor breaks the chain, and a
      // broken chain is no trail at all — never a partial one.
      if (!parent || parent.deleted || parent.kind !== "FOLDER") return [];
      if (parent.driveId !== cursor.driveId) return [];
      if (trail.length >= 64) return [];
      trail.push(parent);
      cursor = parent;
    }

    return trail.reverse().map((node) => this.serialize(node));
  }

  async listFolder(
    _scope: Scope,
    input: PageInput & { driveId: string; parentId: string | null },
  ): Promise<FolderPage> {
    const drive = this.drives.get(input.driveId);
    if (!drive || drive.deleted) throw new DriveNotFoundError();

    let currentFolder: Item | null = null;
    const ancestors: Array<{ id: string; name: string }> = [];

    if (input.parentId !== null) {
      const trail = await this.readItemTrail(
        _scope,
        input.driveId,
        input.parentId,
      );
      if (trail.length === 0) throw new ItemNotFoundError();
      currentFolder = trail.at(-1) ?? null;
      for (const row of trail.slice(0, -1)) {
        ancestors.push({ id: row.id, name: row.name });
      }
    }

    const items = [...this.nodes.values()]
      .filter(
        (node) =>
          node.driveId === input.driveId &&
          node.parentId === input.parentId &&
          !node.deleted,
      )
      // `ORDER BY kind, lower(name), id`, and `kind` is a Postgres enum, so it
      // sorts by declaration order — FOLDER before FILE — not alphabetically.
      .sort(
        (a, b) =>
          KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
          a.name.toLowerCase().localeCompare(b.name.toLowerCase()) ||
          a.id.localeCompare(b.id),
      )
      .map((node) => this.serialize(node));

    return {
      drive: {
        id: drive.id,
        name: drive.name,
        slug: drive.id,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      currentFolder,
      ancestors,
      items,
      nextCursor: null,
    };
  }

  async getDownload(_scope: Scope, itemId: string): Promise<DownloadPointer> {
    const node = this.nodes.get(itemId);
    if (!node || node.deleted) throw new ItemNotFoundError();
    if (node.kind !== "FILE") throw new ItemNotDownloadableError();
    if (node.uploadStatus !== "READY") {
      throw new FileNotReadyError(
        node.uploadStatus === "FAILED" ? "FAILED" : "PENDING",
      );
    }
    return {
      name: node.name,
      storageBucket: "bucket",
      storageKey: `pods/pod-1/objects/${node.id}`,
    };
  }
}
