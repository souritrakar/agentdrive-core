import type { Scope } from "@/db/scope";
import type { Item } from "@/filesystem";

import type { RequestedMode, TransferMode } from "./limits";

export type { RequestedMode, TransferMode };

export type UploadState = "ACTIVE" | "COMPLETED" | "ABORTED" | "EXPIRED";

export type PresignedTarget = {
  url: string;
  expiresAt: string;
  /**
   * Headers the client must send for the signature to verify. `Content-Type`
   * appears when one was declared, because it is signed into the URL — the one
   * property of the request we can bind. Omitting it produces a signature
   * mismatch, which reads like a credentials problem and is not one.
   */
  requiredHeaders: Record<string, string>;
};

export type PartTarget = {
  partNumber: number;
  url: string;
  expiresAt: string;
};

/** What the client needs in order to move the bytes. */
export type UploadPlan = {
  id: string;
  mode: TransferMode;
  expiresAt: string;
  /** SINGLE only. */
  put?: PresignedTarget;
  /** MULTIPART only. Fixed for the session; the client never picks it. */
  partSizeBytes?: number;
  /** MULTIPART with a declared size. Null when the length is unknown. */
  partCount?: number | null;
  /** MULTIPART only: a first batch, enough to start. More on request. */
  partUrls?: PartTarget[];
};

export type ReserveUploadInput = {
  driveId: string;
  parentId: string | null;
  name: string;
  contentType?: string | null;
  sizeBytes?: number | null;
  clientId?: string | null;
  mode?: RequestedMode;
};

/**
 * `upload` is null when there is nothing left to transfer — a repeated
 * `clientId` whose file is already READY. The caller has its Item and is done.
 */
export type ReserveUploadResult = {
  item: Item;
  upload: UploadPlan | null;
};

export type UploadSession = {
  id: string;
  itemId: string;
  driveId: string;
  status: UploadState;
  mode: TransferMode;
  partSizeBytes: number | null;
  expectedSizeBytes: number | null;
  expiresAt: string;
  createdAt: string;
};

/**
 * Session state plus, for a live multipart upload, the parts storage is
 * actually holding. That second half is the resume primitive: a client asks
 * what landed and sends only the difference, so no client-side bookkeeping
 * has to survive a crash.
 */
export type UploadStatusResult = {
  upload: UploadSession;
  parts?: Array<{ partNumber: number; sizeBytes: number }>;
};

export type ReapResult = {
  scanned: number;
  completed: number;
  failed: number;
  /** Superseded or abandoned objects deleted this run. */
  reclaimed: number;
};

/**
 * The Transfer module's whole surface.
 *
 * Every operation takes the resolved scope first, so forgetting tenancy is a
 * type error rather than a leak, and every id is re-checked against it — an
 * upload belonging to another Pod is a 404, never a 403.
 */
export type Transfer = {
  reserve(
    scope: Scope,
    input: ReserveUploadInput,
  ): Promise<ReserveUploadResult>;

  /** Session state, and what storage holds. The resume primitive. */
  status(scope: Scope, uploadId: string): Promise<UploadStatusResult>;

  /** Fresh URLs for named parts. Re-mintable without limit. */
  partUrls(
    scope: Scope,
    uploadId: string,
    partNumbers: number[],
  ): Promise<PartTarget[]>;

  /**
   * Verify the bytes and flip the Item to READY.
   *
   * The only writer of READY, and idempotent: a client, its retry, and the
   * reaper may all call it, and only the first does any work.
   */
  complete(scope: Scope, uploadId: string): Promise<Item>;

  /** Cancel: abort the provider upload, fail the Item, reclaim the bytes. */
  abort(scope: Scope, uploadId: string): Promise<Item>;

  /** Open a new attempt against a fresh key for a FAILED file. */
  retry(scope: Scope, itemId: string): Promise<ReserveUploadResult>;

  /**
   * Settle sessions whose caller vanished, and reclaim superseded objects.
   *
   * Runs on a schedule with no scope, because it works across tenants by
   * definition. Bounded per call and idempotent, so a crashed run costs
   * nothing but the next run's time.
   */
  reap(options?: { now?: Date; limit?: number }): Promise<ReapResult>;
};
