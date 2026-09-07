/**
 * Reconciliation — what makes an upload survive its client.
 *
 * A person closes the laptop between the last byte and the confirmation. An
 * agent crashes after its PUT succeeds. A Worker dies between assembling a
 * multipart object and committing the row. In every one of those the bytes are
 * safely in storage and only the message saying so was lost, so the honest
 * answer is to look at storage and finish the job — not to lose the file.
 *
 * That is all this does: find attempts nobody is driving any more, ask storage
 * what actually happened, and settle them through the same completion path a
 * live client would have used. Nothing here is a second set of rules; a second
 * set is exactly how two stores drift apart.
 *
 * Bounded per run, ordered by a partial index, and idempotent throughout — a
 * crashed run costs the next run's time and nothing else.
 */

import { Prisma } from "@/generated/prisma/client";

import type { Scope } from "@/db/scope";

import { isTransferError } from "../errors";
import type { ReapResult } from "../types";
import { complete, reclaim, type Deps } from "./operations";
import { settleSession, type SessionRecord } from "./sessions";

/** Sessions and orphans handled per invocation. Keeps a cron tick short. */
const DEFAULT_LIMIT = 100;

/**
 * How long a PENDING file with no live session is left alone.
 *
 * Long enough that a session row simply being slow to commit is never mistaken
 * for an abandoned upload.
 */
const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

export async function reap(
  deps: Deps,
  options: { now?: Date; limit?: number } = {},
): Promise<ReapResult> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? DEFAULT_LIMIT;

  const sessions = await settleExpiredSessions(deps, now, limit);
  const orphans = await settleOrphanedItems(deps, now, limit);

  return {
    scanned: sessions.scanned + orphans.scanned,
    completed: sessions.completed + orphans.completed,
    failed: sessions.failed + orphans.failed,
    reclaimed: sessions.reclaimed,
  };
}

// ---------------------------------------------------------------------------
// Expired sessions
// ---------------------------------------------------------------------------

async function settleExpiredSessions(
  deps: Deps,
  now: Date,
  limit: number,
): Promise<ReapResult> {
  const rows = await deps.db.upload.findMany({
    where: { status: "ACTIVE", expiresAt: { lt: now } },
    orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
    take: limit,
    select: {
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
      pod: { select: { accountId: true } },
    },
  });

  const result: ReapResult = {
    scanned: rows.length,
    completed: 0,
    failed: 0,
    reclaimed: 0,
  };

  for (const row of rows) {
    const scope: Scope = { accountId: row.pod.accountId, podId: row.podId };
    const session: SessionRecord = {
      ...row,
      expectedSizeBytes:
        row.expectedSizeBytes === null ? null : Number(row.expectedSizeBytes),
    };

    try {
      /*
        The same call a live client makes. If the bytes are there this promotes
        the file exactly as the client's own confirmation would have — the
        upload succeeded, and only the acknowledgement was lost.
      */
      await complete(deps, scope, session.id);
      result.completed += 1;
    } catch (error) {
      if (!isTransferError(error)) {
        /*
          Storage or the database is unhappy. Leave the session ACTIVE and let
          the next run try again: an outage must not be able to mark a user's
          files failed.
        */
        console.warn("reaper: leaving session for the next run", error);
        continue;
      }

      // A real verdict: the bytes are not there, or do not add up.
      await deps.files.setFileStatus(scope, session.itemId, "FAILED");
      const settled = await settleSession(deps.db, session.id, "EXPIRED");
      await reclaim(deps, session);
      if (settled) result.reclaimed += 1;
      result.failed += 1;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Orphaned PENDING files
// ---------------------------------------------------------------------------

type OrphanRow = {
  id: string;
  pod_id: string;
  account_id: string;
  storage_bucket: string | null;
  storage_key: string | null;
  size_bytes: bigint | null;
};

/**
 * PENDING files with no live attempt behind them.
 *
 * Two things land here. Rows reserved before this module existed, which no job
 * has ever cleaned up; and rows whose session insert was lost in the gap
 * between the two modules' transactions. Both are settled the same way — by
 * asking storage — and both are why the gap is acceptable in the first place.
 */
async function settleOrphanedItems(
  deps: Deps,
  now: Date,
  limit: number,
): Promise<Pick<ReapResult, "scanned" | "completed" | "failed">> {
  const cutoff = new Date(now.getTime() - ORPHAN_GRACE_MS);

  const rows = await deps.db.$queryRaw<OrphanRow[]>(Prisma.sql`
    SELECT i.id,
           i.pod_id,
           p.account_id,
           i.storage_bucket,
           i.storage_key,
           i.size_bytes
    FROM items i
    JOIN pods p ON p.id = i.pod_id
    WHERE i.kind = 'FILE'
      AND i.upload_status = 'PENDING'
      AND i.deleted_at IS NULL
      AND i.updated_at < ${cutoff}
      AND NOT EXISTS (
        SELECT 1 FROM uploads u
        WHERE u.item_id = i.id AND u.status = 'ACTIVE'
      )
    ORDER BY i.updated_at ASC, i.id ASC
    LIMIT ${limit}
  `);

  let completed = 0;
  let failed = 0;

  for (const row of rows) {
    const scope: Scope = { accountId: row.account_id, podId: row.pod_id };

    if (!row.storage_bucket || !row.storage_key) {
      await deps.files.setFileStatus(scope, row.id, "FAILED");
      failed += 1;
      continue;
    }

    try {
      const head = await deps.store.head({
        bucket: row.storage_bucket,
        key: row.storage_key,
      });
      const expected = row.size_bytes === null ? null : Number(row.size_bytes);

      if (head && (expected === null || head.sizeBytes === expected)) {
        await deps.files.setFileStatus(scope, row.id, "READY", {
          sizeBytes: head.sizeBytes,
        });
        completed += 1;
      } else {
        await deps.files.setFileStatus(scope, row.id, "FAILED");
        failed += 1;
      }
    } catch (error) {
      // Same rule as above: an outage is not a verdict.
      console.warn("reaper: leaving orphan for the next run", error);
    }
  }

  return { scanned: rows.length, completed, failed };
}
