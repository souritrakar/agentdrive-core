/**
 * In-memory stand-ins for the two ports, for testing the state machine.
 *
 * Both are deliberately faithful about the things the module depends on and
 * indifferent about everything else: the session store enforces the partial
 * unique index and the guarded transitions, and the object store distinguishes
 * "no such key" from "no such upload" — because those are exactly the
 * distinctions the real failure paths turn on.
 *
 * Kept in `internal/` rather than a test file so both the unit tests and any
 * future harness use the same fake, and a drift in the real ports shows up as
 * a type error here rather than as a passing test that proves nothing.
 */

import type { Scope } from "@/db/scope";
import type { CompatibilityFileInput, FileMetadata, Item } from "@/filesystem";

import type { ObjectHead, ObjectStore, UploadedPart } from "../object-store";
import type { TransferMode, UploadState } from "../types";

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export type FakeItem = Item & {
  podId: string;
  storageBucket: string;
  storageKey: string;
};

/** Raised by the fake exactly where the real module raises it. */
export class FakeInvalidTransition extends Error {
  readonly code = "invalid_upload_transition";
}

export class FakeFileMetadata implements FileMetadata {
  readonly items = new Map<string, FakeItem>();
  private sequence = 0;
  /** Reservations keyed by clientId, so a repeated key returns the same Item. */
  private byClientId = new Map<string, string>();

  constructor(private readonly driveId = "drive-1") {}

  private nextKey(scope: Scope): string {
    this.sequence += 1;
    return `pods/${scope.podId}/objects/key-${this.sequence}`;
  }

  async reserveFile(
    scope: Scope,
    input: CompatibilityFileInput,
  ): Promise<{ item: Item; storageKey: string }> {
    if (input.clientId) {
      const existingId = this.byClientId.get(input.clientId);
      if (existingId) {
        const existing = this.items.get(existingId) as FakeItem;
        return { item: existing, storageKey: existing.storageKey };
      }
    }

    this.sequence += 1;
    const id = `item-${this.sequence}`;
    const storageKey = this.nextKey(scope);
    const now = new Date().toISOString();
    const item: FakeItem = {
      id,
      podId: scope.podId,
      driveId: input.driveId || this.driveId,
      parentId: input.parentId,
      kind: "FILE",
      name: input.name,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      uploadStatus: "PENDING",
      storageBucket: input.storageBucket,
      storageKey,
      createdAt: now,
      updatedAt: now,
    };
    this.items.set(id, item);
    if (input.clientId) this.byClientId.set(input.clientId, id);
    return { item, storageKey };
  }

  async setFileStatus(
    _scope: Scope,
    itemId: string,
    status: "READY" | "FAILED",
    options: { sizeBytes?: number | null } = {},
  ): Promise<Item> {
    const item = this.items.get(itemId);
    if (!item) throw new Error(`no such item: ${itemId}`);
    if (item.uploadStatus === status) return item;
    if (item.uploadStatus !== "PENDING") throw new FakeInvalidTransition();

    item.uploadStatus = status;
    if (options.sizeBytes !== undefined) item.sizeBytes = options.sizeBytes;
    return item;
  }

  async retargetFile(
    scope: Scope,
    itemId: string,
    storageBucket: string,
  ): Promise<{ item: Item; storageKey: string }> {
    const item = this.items.get(itemId);
    if (!item) throw new Error(`no such item: ${itemId}`);
    // Mirrors the real rule: READY is terminal, everything else is retryable.
    if (item.uploadStatus === "READY") throw new FakeInvalidTransition();

    item.storageKey = this.nextKey(scope);
    item.storageBucket = storageBucket;
    item.uploadStatus = "PENDING";
    return { item, storageKey: item.storageKey };
  }

  async getDownload(): Promise<never> {
    throw new Error("not used by the transfer state machine");
  }
}

// ---------------------------------------------------------------------------
// Object storage
// ---------------------------------------------------------------------------

type FakeMultipart = { key: string; parts: Map<number, UploadedPart> };

export class FakeObjectStore implements ObjectStore {
  readonly bucket = "test-bucket";
  readonly objects = new Map<string, ObjectHead>();
  readonly multiparts = new Map<string, FakeMultipart>();
  /** Keys deleted through the port — the reclamation assertions read this. */
  readonly deleted: string[] = [];
  private sequence = 0;
  /** Set to make the next storage call throw, standing in for an outage. */
  failNext: Error | null = null;

  private check(): void {
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
  }

  async presignPut({ key }: { key: string }) {
    this.check();
    return { url: `https://storage.test/${key}?put`, expiresAt: iso() };
  }

  async head({ key }: { key: string }): Promise<ObjectHead | null> {
    this.check();
    return this.objects.get(key) ?? null;
  }

  async delete({ key }: { key: string }): Promise<void> {
    this.check();
    this.objects.delete(key);
    this.deleted.push(key);
  }

  async createMultipartUpload({ key }: { key: string }): Promise<string> {
    this.check();
    this.sequence += 1;
    const uploadId = `mpu-${this.sequence}`;
    this.multiparts.set(uploadId, { key, parts: new Map() });
    return uploadId;
  }

  async presignUploadPart({
    key,
    partNumber,
  }: {
    key: string;
    partNumber: number;
  }) {
    this.check();
    return {
      url: `https://storage.test/${key}?part=${partNumber}`,
      expiresAt: iso(),
    };
  }

  async listParts({
    uploadId,
  }: {
    uploadId: string;
  }): Promise<UploadedPart[] | null> {
    this.check();
    const upload = this.multiparts.get(uploadId);
    if (!upload) return null;
    return [...upload.parts.values()].sort(
      (a, b) => a.partNumber - b.partNumber,
    );
  }

  async completeMultipartUpload({
    key,
    uploadId,
  }: {
    key: string;
    uploadId: string;
  }): Promise<boolean> {
    this.check();
    const upload = this.multiparts.get(uploadId);
    if (!upload) return false;
    const sizeBytes = [...upload.parts.values()].reduce(
      (total, part) => total + part.sizeBytes,
      0,
    );
    this.objects.set(key, { sizeBytes, etag: `"${uploadId}-assembled"` });
    this.multiparts.delete(uploadId);
    return true;
  }

  async abortMultipartUpload({
    uploadId,
  }: {
    uploadId: string;
  }): Promise<void> {
    this.check();
    this.multiparts.delete(uploadId);
  }

  // -- test helpers ---------------------------------------------------------

  /** Stand in for a client's successful single PUT. */
  putObject(key: string, sizeBytes: number): void {
    this.objects.set(key, { sizeBytes, etag: `"${key}"` });
  }

  /** Stand in for a client's successful part PUT. */
  putPart(uploadId: string, partNumber: number, sizeBytes: number): void {
    const upload = this.multiparts.get(uploadId);
    if (!upload) throw new Error(`no such multipart upload: ${uploadId}`);
    upload.parts.set(partNumber, {
      partNumber,
      sizeBytes,
      etag: `"${uploadId}-${partNumber}"`,
    });
  }

  /** Stand in for R2 discarding an incomplete upload after seven days. */
  expireMultipart(uploadId: string): void {
    this.multiparts.delete(uploadId);
  }
}

function iso(): string {
  return new Date(Date.now() + 3600_000).toISOString();
}

// ---------------------------------------------------------------------------
// Session rows
// ---------------------------------------------------------------------------

type UploadRow = {
  id: string;
  podId: string;
  driveId: string;
  itemId: string;
  status: UploadState;
  mode: TransferMode;
  storageBucket: string;
  storageKey: string;
  providerUploadId: string | null;
  partSizeBytes: number | null;
  expectedSizeBytes: bigint | null;
  expiresAt: Date;
  createdAt: Date;
  pod: { accountId: string };
};

/** Mimics Prisma's P2002 so the module's real branch is exercised. */
class UniqueViolation extends Error {
  readonly code = "P2002";
}

/**
 * Just enough of the Prisma client for the `uploads` delegate.
 *
 * The partial unique index is enforced here rather than assumed, because the
 * concurrent-reserve path is one of the few places the module *relies* on the
 * database saying no.
 */
export class FakeUploadStore {
  readonly rows: UploadRow[] = [];
  private sequence = 0;
  accountId = "account-1";

  readonly upload = {
    findFirst: async ({ where }: { where: Record<string, unknown>; select?: unknown }) =>
      this.rows.find((row) => matches(row, where)) ?? null,

    findMany: async ({
      where,
      take,
    }: {
      where: Record<string, unknown>;
      orderBy?: unknown;
      take?: number;
      select?: unknown;
    }) => {
      const found = this.rows
        .filter((row) => matches(row, where))
        .sort(
          (a, b) =>
            a.expiresAt.getTime() - b.expiresAt.getTime() ||
            a.id.localeCompare(b.id),
        );
      return take ? found.slice(0, take) : found;
    },

    create: async ({ data }: { data: Record<string, unknown> }) => {
      const itemId = data.itemId as string;
      if (
        this.rows.some((row) => row.itemId === itemId && row.status === "ACTIVE")
      ) {
        throw new UniqueViolation("uploads_one_active_per_item");
      }
      this.sequence += 1;
      const row: UploadRow = {
        id: `upload-${this.sequence}`,
        podId: data.podId as string,
        driveId: data.driveId as string,
        itemId,
        status: "ACTIVE",
        mode: data.mode as TransferMode,
        storageBucket: data.storageBucket as string,
        storageKey: data.storageKey as string,
        providerUploadId: (data.providerUploadId as string | null) ?? null,
        partSizeBytes: (data.partSizeBytes as number | null) ?? null,
        expectedSizeBytes: (data.expectedSizeBytes as bigint | null) ?? null,
        expiresAt: data.expiresAt as Date,
        createdAt: new Date(),
        pod: { accountId: this.accountId },
      };
      this.rows.push(row);
      return row;
    },

    updateMany: async ({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => {
      const affected = this.rows.filter((row) => matches(row, where));
      for (const row of affected) Object.assign(row, data);
      return { count: affected.length };
    },
  };

  /** The orphan sweep's raw query. Nothing here creates orphan rows. */
  async $queryRaw<T>(): Promise<T> {
    return [] as unknown as T;
  }

  byId(id: string): UploadRow {
    const row = this.rows.find((candidate) => candidate.id === id);
    if (!row) throw new Error(`no such upload: ${id}`);
    return row;
  }
}

function matches(row: UploadRow, where: Record<string, unknown>): boolean {
  for (const [field, condition] of Object.entries(where)) {
    const value = row[field as keyof UploadRow];
    if (
      condition !== null &&
      typeof condition === "object" &&
      "lt" in (condition as Record<string, unknown>)
    ) {
      const bound = (condition as { lt: Date }).lt;
      if (!((value as Date) < bound)) return false;
      continue;
    }
    if (value !== condition) return false;
  }
  return true;
}
