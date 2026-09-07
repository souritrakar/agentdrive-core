/**
 * Session rows: reading them under scope, and moving them between states.
 *
 * Every transition here is a guarded conditional update rather than a
 * read-then-write, so concurrent finishers serialize in the database and
 * exactly one does the work. The losers learn they lost from an affected-row
 * count of zero and re-read the winner's outcome, which is what makes the
 * whole completion path safe to call twice.
 */

import type { Db } from "@/db/client";
import type { Scope } from "@/db/scope";

import { UploadNotFoundError } from "../errors";
import type { TransferMode, UploadSession, UploadState } from "../types";

/** Everything the module needs about an attempt, including its bytes pointer. */
export type SessionRecord = {
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
  expectedSizeBytes: number | null;
  expiresAt: Date;
  createdAt: Date;
};

const SELECT = {
  id: true,
  podId: true,
  driveId: true,
  itemId: true,
  status: true,
  mode: true,
  storageBucket: true,
  storageKey: true,
  providerUploadId: true,
  partSizeBytes: true,
  expectedSizeBytes: true,
  expiresAt: true,
  createdAt: true,
} as const;

type RawSession = {
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
};

function toRecord(row: RawSession): SessionRecord {
  return {
    ...row,
    expectedSizeBytes:
      row.expectedSizeBytes === null ? null : Number(row.expectedSizeBytes),
  };
}

/**
 * Load one session, or 404.
 *
 * Scoped by Pod, so an id belonging to another tenant is indistinguishable
 * from one that never existed — the same rule every other route follows, and
 * the reason this returns "not found" rather than "forbidden".
 */
export async function loadSession(
  db: Db,
  scope: Scope,
  uploadId: string,
): Promise<SessionRecord> {
  const row = await db.upload.findFirst({
    where: { id: uploadId, podId: scope.podId },
    select: SELECT,
  });
  if (!row) throw new UploadNotFoundError();
  return toRecord(row as RawSession);
}

/** The live attempt for an Item, if there is one. */
export async function findActiveSessionForItem(
  db: Db,
  itemId: string,
): Promise<SessionRecord | null> {
  const row = await db.upload.findFirst({
    where: { itemId, status: "ACTIVE" },
    select: SELECT,
  });
  return row ? toRecord(row as RawSession) : null;
}

/**
 * Move a session out of ACTIVE, once.
 *
 * Returns false when it was already settled — by another caller, or by the
 * reaper. That is not an error anywhere in this module; it means somebody else
 * finished the job and the caller should read their result.
 */
export async function settleSession(
  db: Db,
  uploadId: string,
  next: Exclude<UploadState, "ACTIVE">,
): Promise<boolean> {
  const { count } = await db.upload.updateMany({
    where: { id: uploadId, status: "ACTIVE" },
    data: { status: next },
  });
  return count > 0;
}

/**
 * Push an active session's deadline out.
 *
 * Called when a caller re-reserves an upload it is evidently still working on.
 * The reaper only settles sessions nobody has touched, so touching one is how
 * a slow upload says it is alive.
 */
export async function extendSession(
  db: Db,
  uploadId: string,
  expiresAt: Date,
): Promise<void> {
  await db.upload.updateMany({
    where: { id: uploadId, status: "ACTIVE" },
    data: { expiresAt },
  });
}

export function serializeSession(record: SessionRecord): UploadSession {
  return {
    id: record.id,
    itemId: record.itemId,
    driveId: record.driveId,
    status: record.status,
    mode: record.mode,
    partSizeBytes: record.partSizeBytes,
    expectedSizeBytes: record.expectedSizeBytes,
    expiresAt: record.expiresAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
  };
}
