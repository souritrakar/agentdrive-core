/**
 * Share rows: reading them, creating them, retiring them.
 *
 * The only file in the codebase that touches the `shares` table. Everything
 * above it deals in `Share` and `ShareSubject`; nothing below it knows what a
 * token is for.
 */

import type { Db } from "@/db/client";
import type { Scope } from "@/db/scope";

import type { Share, ShareSubject } from "../types";

/**
 * A share row plus the one fact the public face needs that the row itself does
 * not carry: the Account behind the Pod.
 *
 * Resolution builds the *owner's* `Scope` from this, server-side, and calls
 * Filesystem with it. That is what keeps "scope is never client-supplied" true
 * on a path where the caller has no identity at all: here it is
 * share-row-supplied, and the visitor named nothing but a token.
 */
export type ShareRecord = {
  id: string;
  podId: string;
  accountId: string;
  driveId: string;
  itemId: string | null;
  token: string;
  allowDownload: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type RawShare = {
  id: string;
  podId: string;
  driveId: string;
  itemId: string | null;
  token: string;
  allowDownload: boolean;
  createdAt: Date;
  updatedAt: Date;
  pod: { accountId: string };
};

const SELECT = {
  id: true,
  podId: true,
  driveId: true,
  itemId: true,
  token: true,
  allowDownload: true,
  createdAt: true,
  updatedAt: true,
  pod: { select: { accountId: true } },
} as const;

function toRecord(row: RawShare): ShareRecord {
  return {
    id: row.id,
    podId: row.podId,
    accountId: row.pod.accountId,
    driveId: row.driveId,
    itemId: row.itemId,
    token: row.token,
    allowDownload: row.allowDownload,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Prisma's unique-constraint violation. Same check as db/scope.ts. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}

/**
 * The subject as a `where` fragment.
 *
 * A Drive subject is `item_id IS NULL`, not "any row for this drive" — the
 * distinction is the whole reason there are two partial unique indexes. A drive
 * with ten shared folders inside it still has at most one share *of the drive*.
 */
function subjectWhere(subject: ShareSubject) {
  return subject.kind === "DRIVE"
    ? { driveId: subject.driveId, itemId: null }
    : { itemId: subject.itemId };
}

/** The token lookup. One indexed read, and the entry point for every visitor. */
export async function findActiveByToken(
  db: Db,
  token: string,
): Promise<ShareRecord | null> {
  const row = await db.share.findFirst({
    where: { token, deletedAt: null },
    select: SELECT,
  });
  return row ? toRecord(row as RawShare) : null;
}

export async function findActiveBySubject(
  db: Db,
  scope: Scope,
  subject: ShareSubject,
): Promise<ShareRecord | null> {
  const row = await db.share.findFirst({
    where: { ...subjectWhere(subject), podId: scope.podId, deletedAt: null },
    select: SELECT,
  });
  return row ? toRecord(row as RawShare) : null;
}

export async function insertShare(
  db: Db,
  scope: Scope,
  input: { driveId: string; itemId: string | null; token: string },
): Promise<ShareRecord> {
  const row = await db.share.create({
    data: {
      podId: scope.podId,
      driveId: input.driveId,
      itemId: input.itemId,
      token: input.token,
    },
    select: SELECT,
  });
  return toRecord(row as RawShare);
}

/**
 * Conditional update rather than read-then-write, like every other guarded
 * transition in this codebase: the row is matched and changed in one statement,
 * so a concurrent revoke cannot be overwritten by a settings save that read the
 * row a moment earlier. An affected count of zero means the share was revoked
 * in between, and the caller re-reads to find nothing.
 */
export async function updateActiveBySubject(
  db: Db,
  scope: Scope,
  subject: ShareSubject,
  data: { allowDownload: boolean },
): Promise<number> {
  const result = await db.share.updateMany({
    where: { ...subjectWhere(subject), podId: scope.podId, deletedAt: null },
    data,
  });
  return result.count;
}

/** Revocation: a soft delete, idempotent by construction. */
export async function revokeBySubject(
  db: Db,
  scope: Scope,
  subject: ShareSubject,
): Promise<number> {
  const result = await db.share.updateMany({
    where: { ...subjectWhere(subject), podId: scope.podId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return result.count;
}

/** The owner-facing shape. The visitor-facing one deliberately omits the token. */
export function serializeShare(record: ShareRecord): Share {
  return {
    id: record.id,
    token: record.token,
    subject:
      record.itemId === null
        ? { kind: "DRIVE", driveId: record.driveId }
        : { kind: "ITEM", itemId: record.itemId },
    role: "VIEWER",
    allowDownload: record.allowDownload,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
