/**
 * The upload state machine.
 *
 * Two rules run through every function here and explain most of the shape:
 *
 * 1. **Bytes land before the pointer moves.** A crash therefore leaves an
 *    unreferenced object — invisible, cheap, and traceable to the session row
 *    that owns it — rather than a file that claims to be ready and 404s. Every
 *    failure path is biased that way on purpose.
 * 2. **Only storage is believed.** The client says what it intends to upload;
 *    it never gets to assert what it uploaded. Completion HEADs the object and
 *    checks the length before anything becomes READY.
 *
 * The Item is settled before the session in both `complete` and `abort`,
 * because the Item is what a person sees. If the second write is lost the
 * session is left dangling, and the reaper settles it later by calling the
 * same idempotent operation.
 */

import type { Db } from "@/db/client";
import type { Scope } from "@/db/scope";
import type { FileMetadata, Item } from "@/filesystem";

import {
  PartPlanInvalidError,
  UploadExpiredError,
  UploadIncompleteError,
  UploadNotActiveError,
  UploadSizeMismatchError,
} from "../errors";
import {
  assertSizeAllowed,
  assertValidPartNumbers,
  auditParts,
  chooseMode,
  choosePartSize,
  planPartCount,
  sessionTtlMs,
  type TransferMode,
} from "../limits";
import type { ObjectStore } from "../object-store";
import type {
  PartTarget,
  ReserveUploadInput,
  ReserveUploadResult,
  UploadPlan,
  UploadStatusResult,
} from "../types";
import {
  extendSession,
  findActiveSessionForItem,
  loadSession,
  serializeSession,
  settleSession,
  type SessionRecord,
} from "./sessions";

/** Part URLs handed out with the reservation — enough to start immediately. */
const INITIAL_PART_URLS = 20;

export type Deps = { db: Db; files: FileMetadata; store: ObjectStore };

// ---------------------------------------------------------------------------
// Reserve
// ---------------------------------------------------------------------------

export async function reserve(
  deps: Deps,
  scope: Scope,
  input: ReserveUploadInput,
): Promise<ReserveUploadResult> {
  const sizeBytes = input.sizeBytes ?? null;
  assertSizeAllowed(sizeBytes);
  const mode = chooseMode(sizeBytes, input.mode ?? "auto");

  /*
    The Item is created first, by the module that owns Items. It also mints the
    object key, because it owns the column and the invariant that a FILE always
    has one.

    This commits before the session row does, so a crash in between leaves a
    PENDING Item with no session. That is the one gap the two-module split
    opens, and it is deliberate: the alternative is threading a transaction
    across a module boundary. The reaper's orphan sweep closes it.
  */
  const reservation = await deps.files.reserveFile(scope, {
    driveId: input.driveId,
    parentId: input.parentId,
    name: input.name,
    contentType: input.contentType ?? null,
    sizeBytes,
    storageBucket: deps.store.bucket,
    clientId: input.clientId,
  });

  const { item } = reservation;

  // A repeated clientId whose file already finished. Nothing left to transfer.
  if (item.uploadStatus === "READY") return { item, upload: null };

  // A repeated clientId whose last attempt failed: open a fresh one.
  if (item.uploadStatus === "FAILED") return retry(deps, scope, item.id);

  const existing = await findActiveSessionForItem(deps.db, item.id);
  if (existing) {
    /*
      A caller re-reserving is a caller still working, so push the deadline out
      and hand back fresh URLs. Re-minting a signature is stateless and free,
      which is why an expired URL is never a failure the client has to survive.
    */
    const expiresAt = new Date(Date.now() + sessionTtlMs(existing.mode));
    await extendSession(deps.db, existing.id, expiresAt);
    return {
      item,
      upload: await planFor(deps, { ...existing, expiresAt }, item.contentType),
    };
  }

  return {
    item,
    upload: await openSession(deps, scope, {
      itemId: item.id,
      driveId: input.driveId,
      storageBucket: deps.store.bucket,
      storageKey: reservation.storageKey,
      contentType: item.contentType,
      sizeBytes,
      mode,
    }),
  };
}

type OpenSessionInput = {
  itemId: string;
  driveId: string;
  storageBucket: string;
  storageKey: string;
  contentType: string | null;
  sizeBytes: number | null;
  mode: TransferMode;
};

/**
 * Create the session row and everything the client needs to start.
 *
 * For multipart the provider upload is created *before* the row, so the row is
 * never written without the id that makes it usable. If the insert then fails,
 * an empty multipart upload is orphaned — which R2 discards after seven days,
 * and which cost nothing because no bytes were ever sent to it.
 */
async function openSession(
  deps: Deps,
  scope: Scope,
  input: OpenSessionInput,
): Promise<UploadPlan> {
  const partSizeBytes =
    input.mode === "MULTIPART" ? choosePartSize(input.sizeBytes) : null;

  const providerUploadId =
    input.mode === "MULTIPART"
      ? await deps.store.createMultipartUpload({
          bucket: input.storageBucket,
          key: input.storageKey,
          contentType: input.contentType ?? undefined,
          metadata: objectMetadata(scope, input.itemId),
        })
      : null;

  const expiresAt = new Date(Date.now() + sessionTtlMs(input.mode));

  try {
    const created = await deps.db.upload.create({
      data: {
        podId: scope.podId,
        driveId: input.driveId,
        itemId: input.itemId,
        mode: input.mode,
        storageBucket: input.storageBucket,
        storageKey: input.storageKey,
        providerUploadId,
        partSizeBytes,
        expectedSizeBytes:
          input.sizeBytes === null ? null : BigInt(input.sizeBytes),
        expiresAt,
      },
      select: { id: true },
    });

    return planFor(
      deps,
      {
        id: created.id,
        podId: scope.podId,
        driveId: input.driveId,
        itemId: input.itemId,
        status: "ACTIVE",
        mode: input.mode,
        storageBucket: input.storageBucket,
        storageKey: input.storageKey,
        providerUploadId,
        partSizeBytes,
        expectedSizeBytes: input.sizeBytes,
        expiresAt,
        createdAt: new Date(),
      },
      input.contentType,
    );
  } catch (error) {
    /*
      `uploads_one_active_per_item` fired: another request opened an attempt
      for this Item first. Its session is as good as the one we were about to
      create, so adopt it rather than failing a caller who did nothing wrong.
    */
    if (isUniqueViolation(error)) {
      const winner = await findActiveSessionForItem(deps.db, input.itemId);
      if (winner) {
        if (providerUploadId) {
          await bestEffort(() =>
            deps.store.abortMultipartUpload({
              bucket: input.storageBucket,
              key: input.storageKey,
              uploadId: providerUploadId,
            }),
          );
        }
        return planFor(deps, winner, input.contentType);
      }
    }
    throw error;
  }
}

/**
 * Descriptive object metadata, for reading a bucket during an incident.
 *
 * Never read back to answer a question about structure, naming, or
 * permissions — Postgres is the only authority for those, and a second one
 * would be a second thing to disagree with.
 */
function objectMetadata(scope: Scope, itemId: string): Record<string, string> {
  return { "item-id": itemId, "pod-id": scope.podId };
}

async function planFor(
  deps: Deps,
  session: SessionRecord,
  contentType: string | null,
): Promise<UploadPlan> {
  const base = {
    id: session.id,
    mode: session.mode,
    expiresAt: session.expiresAt.toISOString(),
  };

  if (session.mode === "SINGLE") {
    const put = await deps.store.presignPut({
      bucket: session.storageBucket,
      key: session.storageKey,
      contentType: contentType ?? undefined,
    });
    return {
      ...base,
      put: {
        url: put.url,
        expiresAt: put.expiresAt,
        // Signed into the URL, so the client must echo it back exactly.
        requiredHeaders: contentType ? { "Content-Type": contentType } : {},
      },
    };
  }

  const partSizeBytes = session.partSizeBytes ?? 0;
  const partCount = planPartCount(session.expectedSizeBytes, partSizeBytes);
  const firstBatch = Array.from(
    { length: Math.min(partCount ?? INITIAL_PART_URLS, INITIAL_PART_URLS) },
    (_, index) => index + 1,
  );

  return {
    ...base,
    partSizeBytes,
    partCount,
    partUrls: await mintPartUrls(deps, session, firstBatch),
  };
}

// ---------------------------------------------------------------------------
// Status and part URLs
// ---------------------------------------------------------------------------

export async function status(
  deps: Deps,
  scope: Scope,
  uploadId: string,
): Promise<UploadStatusResult> {
  const session = await loadSession(deps.db, scope, uploadId);

  if (session.status !== "ACTIVE" || session.mode !== "MULTIPART") {
    return { upload: serializeSession(session) };
  }

  const parts = await listPartsOrExpire(deps, scope, session);
  return {
    upload: serializeSession(session),
    parts: parts.map(({ partNumber, sizeBytes }) => ({
      partNumber,
      sizeBytes,
    })),
  };
}

export async function partUrls(
  deps: Deps,
  scope: Scope,
  uploadId: string,
  partNumbers: number[],
): Promise<PartTarget[]> {
  const session = await loadSession(deps.db, scope, uploadId);
  requireActive(session);
  if (session.mode !== "MULTIPART") {
    throw new PartPlanInvalidError(
      "This upload is a single request; it has no parts.",
    );
  }
  assertValidPartNumbers(partNumbers);
  return mintPartUrls(deps, session, partNumbers);
}

function mintPartUrls(
  deps: Deps,
  session: SessionRecord,
  partNumbers: number[],
): Promise<PartTarget[]> {
  const uploadId = session.providerUploadId;
  if (!uploadId) {
    throw new PartPlanInvalidError("This upload has no multipart session.");
  }
  return Promise.all(
    partNumbers.map(async (partNumber) => {
      const signed = await deps.store.presignUploadPart({
        bucket: session.storageBucket,
        key: session.storageKey,
        uploadId,
        partNumber,
      });
      return { partNumber, url: signed.url, expiresAt: signed.expiresAt };
    }),
  );
}

// ---------------------------------------------------------------------------
// Complete
// ---------------------------------------------------------------------------

/**
 * Verify the bytes and publish the file. The only writer of READY.
 *
 * Safe to call more than once and from more than one place: the client calls
 * it, its retry calls it again, and the reaper calls it for clients that never
 * did. Whoever arrives second reads the first one's result.
 */
export async function complete(
  deps: Deps,
  scope: Scope,
  uploadId: string,
): Promise<Item> {
  const session = await loadSession(deps.db, scope, uploadId);

  if (session.status === "ABORTED") throw new UploadNotActiveError("aborted");
  if (session.status === "EXPIRED") throw new UploadExpiredError();

  /*
    A session that is already COMPLETED still goes through verification rather
    than short-circuiting to READY. It costs one HEAD on the double-call path
    and removes a way for an Item to be published without anyone having looked
    at its bytes — which is the single thing this module exists to prevent.
  */
  if (session.status === "ACTIVE" && session.mode === "MULTIPART") {
    await assembleMultipart(deps, scope, session);
  }

  const head = await deps.store.head({
    bucket: session.storageBucket,
    key: session.storageKey,
  });

  if (!head) {
    /*
      Nothing at the key. For a single PUT that simply means the upload never
      happened — the caller retries the PUT against the same session, so the
      session stays ACTIVE and no state changes here.
    */
    throw new UploadIncompleteError({});
  }

  if (
    session.expectedSizeBytes !== null &&
    head.sizeBytes !== session.expectedSizeBytes
  ) {
    /*
      A presigned PUT cannot bind Content-Length, so this is the check that
      makes a declared size trustworthy after the fact. The attempt fails
      rather than committing a row whose size is a lie; the object it wrote
      becomes garbage the reaper reclaims.
    */
    // Only a live attempt can be failed; a settled one is already someone
    // else's verdict and re-settling it would fight them.
    if (session.status === "ACTIVE") await failAttempt(deps, scope, session);
    throw new UploadSizeMismatchError(
      session.expectedSizeBytes,
      head.sizeBytes,
    );
  }

  // The Item first: it is what a person sees. A lost session write leaves a
  // dangling ACTIVE row, which the reaper settles by calling this again.
  const item = await deps.files.setFileStatus(scope, session.itemId, "READY", {
    sizeBytes: head.sizeBytes,
  });
  await settleSession(deps.db, session.id, "COMPLETED");
  return item;
}

/**
 * Turn the uploaded parts into one object.
 *
 * The part list comes from the provider, never from the request body: what
 * landed is a question only storage can answer, and asking the client would
 * let a buggy or hostile one assemble something other than what it sent.
 */
async function assembleMultipart(
  deps: Deps,
  scope: Scope,
  session: SessionRecord,
): Promise<void> {
  const uploadId = session.providerUploadId;
  if (!uploadId) throw new UploadExpiredError();

  const parts = await deps.store.listParts({
    bucket: session.storageBucket,
    key: session.storageKey,
    uploadId,
  });

  if (parts === null) {
    /*
      The provider has no such upload. Either a concurrent caller already
      assembled it — in which case the object exists and the HEAD after this
      will find it — or it was aborted, or R2 reaped it at seven days.
    */
    const assembled = await deps.store.head({
      bucket: session.storageBucket,
      key: session.storageKey,
    });
    if (assembled) return;
    await expireAttempt(deps, scope, session);
    throw new UploadExpiredError();
  }

  const audit = auditParts(
    parts,
    session.partSizeBytes ?? 0,
    session.expectedSizeBytes,
  );
  if (!audit.complete) {
    // Retryable in place: send what is missing, then complete again.
    throw new UploadIncompleteError({
      missing: audit.missing,
      malformed: audit.malformed,
    });
  }

  const assembled = await deps.store.completeMultipartUpload({
    bucket: session.storageBucket,
    key: session.storageKey,
    uploadId,
    parts,
  });

  if (!assembled) {
    const existing = await deps.store.head({
      bucket: session.storageBucket,
      key: session.storageKey,
    });
    if (existing) return; // a concurrent completer won; its object stands
    await expireAttempt(deps, scope, session);
    throw new UploadExpiredError();
  }
}

// ---------------------------------------------------------------------------
// Abort and retry
// ---------------------------------------------------------------------------

export async function abort(
  deps: Deps,
  scope: Scope,
  uploadId: string,
): Promise<Item> {
  const session = await loadSession(deps.db, scope, uploadId);
  if (session.status === "COMPLETED") {
    throw new UploadNotActiveError("completed");
  }
  if (session.status === "ACTIVE") await failAttempt(deps, scope, session);
  // Idempotent: an already-aborted session settles to the same place.
  return deps.files.setFileStatus(scope, session.itemId, "FAILED");
}

/**
 * Try again, keeping the file.
 *
 * The Item survives — its id, its name, its place in the tree, anything
 * already pointing at it — and only the bytes it points at are replaced. The
 * new attempt writes to a new key, because keys are written once and never
 * rewritten: that is what keeps a reader from seeing a half-replaced object,
 * and what keeps us clear of R2's one-write-per-second-per-key limit.
 */
export async function retry(
  deps: Deps,
  scope: Scope,
  itemId: string,
): Promise<ReserveUploadResult> {
  /*
    Clear any lingering live attempt first. Without this the partial unique
    index would reject the new session — and a session left ACTIVE by a lost
    write is exactly the situation a retry is trying to recover from.
  */
  const lingering = await findActiveSessionForItem(deps.db, itemId);
  if (lingering) {
    await settleSession(deps.db, lingering.id, "ABORTED");
    await reclaim(deps, lingering);
  }

  const reservation = await deps.files.retargetFile(
    scope,
    itemId,
    deps.store.bucket,
  );
  const { item } = reservation;
  const sizeBytes = item.sizeBytes;

  return {
    item,
    upload: await openSession(deps, scope, {
      itemId: item.id,
      driveId: item.driveId,
      storageBucket: deps.store.bucket,
      storageKey: reservation.storageKey,
      contentType: item.contentType,
      sizeBytes,
      mode: chooseMode(sizeBytes, "auto"),
    }),
  };
}

// ---------------------------------------------------------------------------
// Shared settlement helpers
// ---------------------------------------------------------------------------

function requireActive(session: SessionRecord): void {
  if (session.status === "ACTIVE") return;
  if (session.status === "EXPIRED") throw new UploadExpiredError();
  throw new UploadNotActiveError(session.status);
}

/** ACTIVE -> ABORTED, plus best-effort reclamation of whatever it wrote. */
async function failAttempt(
  deps: Deps,
  scope: Scope,
  session: SessionRecord,
): Promise<void> {
  await deps.files.setFileStatus(scope, session.itemId, "FAILED");
  await settleSession(deps.db, session.id, "ABORTED");
  await reclaim(deps, session);
}

/** ACTIVE -> EXPIRED. Used when the provider, not the caller, gave up. */
async function expireAttempt(
  deps: Deps,
  scope: Scope,
  session: SessionRecord,
): Promise<void> {
  await deps.files.setFileStatus(scope, session.itemId, "FAILED");
  await settleSession(deps.db, session.id, "EXPIRED");
}

/**
 * Delete what a dead attempt left behind.
 *
 * Best-effort by design. A failure here leaks an object, which costs storage
 * and nothing else — the row still records the key, so it stays findable. The
 * opposite bias, blocking a state change on a storage delete, would be able to
 * strand a file in the UI.
 */
export async function reclaim(
  deps: Deps,
  session: Pick<
    SessionRecord,
    "storageBucket" | "storageKey" | "providerUploadId"
  >,
): Promise<void> {
  if (session.providerUploadId) {
    await bestEffort(() =>
      deps.store.abortMultipartUpload({
        bucket: session.storageBucket,
        key: session.storageKey,
        uploadId: session.providerUploadId as string,
      }),
    );
  }
  await bestEffort(() =>
    deps.store.delete({
      bucket: session.storageBucket,
      key: session.storageKey,
    }),
  );
}

/** Read the parts, treating a vanished provider upload as an expiry. */
async function listPartsOrExpire(
  deps: Deps,
  scope: Scope,
  session: SessionRecord,
): Promise<Array<{ partNumber: number; sizeBytes: number }>> {
  const uploadId = session.providerUploadId;
  if (!uploadId) throw new UploadExpiredError();
  const parts = await deps.store.listParts({
    bucket: session.storageBucket,
    key: session.storageKey,
    uploadId,
  });
  if (parts === null) {
    await expireAttempt(deps, scope, session);
    throw new UploadExpiredError();
  }
  return parts;
}

async function bestEffort(operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
  } catch (error) {
    console.warn("transfer: cleanup failed, leaving an orphan", error);
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
