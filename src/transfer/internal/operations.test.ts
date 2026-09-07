/**
 * The upload state machine, against in-memory ports.
 *
 * These are the cases the whole design exists for: a client that disappears
 * after its bytes land, two callers finishing the same upload, a client that
 * lies about a size, a multipart upload the provider has already discarded.
 * None of them needs Postgres or R2 to be wrong in an interesting way, so none
 * of them is tested against either.
 */

import { beforeEach, describe, expect, it } from "vitest";

import type { Db } from "@/db/client";
import type { Scope } from "@/db/scope";

import { isTransferError } from "../errors";
import {
  FakeFileMetadata,
  FakeObjectStore,
  FakeUploadStore,
} from "./fakes";
import {
  abort,
  complete,
  partUrls,
  reserve,
  retry,
  status,
  type Deps,
} from "./operations";
import { reap } from "./reaper";

const MIB = 1024 * 1024;
const scope: Scope = { accountId: "account-1", podId: "pod-1" };

let files: FakeFileMetadata;
let store: FakeObjectStore;
let uploads: FakeUploadStore;
let deps: Deps;

beforeEach(() => {
  files = new FakeFileMetadata();
  store = new FakeObjectStore();
  uploads = new FakeUploadStore();
  deps = { db: uploads as unknown as Db, files, store };
});

function reserveInput(overrides: Record<string, unknown> = {}) {
  return {
    driveId: "drive-1",
    parentId: null,
    name: "report.pdf",
    contentType: "application/pdf",
    sizeBytes: 1024,
    ...overrides,
  };
}

/** Everything a well-behaved single-PUT client does before completing. */
async function reserveAndUpload(sizeBytes = 1024) {
  const reserved = await reserve(deps, scope, reserveInput({ sizeBytes }));
  const key = files.items.get(reserved.item.id)!.storageKey;
  store.putObject(key, sizeBytes);
  return { ...reserved, key };
}

describe("reserve", () => {
  it("creates a pending item and a single-PUT plan for a small file", async () => {
    const { item, upload } = await reserve(deps, scope, reserveInput());

    expect(item.uploadStatus).toBe("PENDING");
    expect(upload?.mode).toBe("SINGLE");
    expect(upload?.put?.url).toContain("?put");
    // Content-Type is signed into the URL, so the client must echo it back.
    expect(upload?.put?.requiredHeaders).toEqual({
      "Content-Type": "application/pdf",
    });
  });

  it("plans multipart for a large file and hands out a first batch of parts", async () => {
    const { upload } = await reserve(
      deps,
      scope,
      reserveInput({ sizeBytes: 300 * MIB }),
    );

    expect(upload?.mode).toBe("MULTIPART");
    expect(upload?.partSizeBytes).toBe(8 * MIB);
    expect(upload?.partCount).toBe(Math.ceil((300 * MIB) / (8 * MIB)));
    expect(upload?.partUrls).toHaveLength(20);
  });

  it("uses multipart when the size is unknown", async () => {
    const { upload } = await reserve(
      deps,
      scope,
      reserveInput({ sizeBytes: null }),
    );
    expect(upload?.mode).toBe("MULTIPART");
    expect(upload?.partCount).toBeNull();
  });

  it("refuses a file past the product ceiling before writing anything", async () => {
    await expect(
      reserve(deps, scope, reserveInput({ sizeBytes: 2 * 1024 * 1024 * MIB })),
    ).rejects.toMatchObject({ code: "file_too_large" });
    expect(files.items.size).toBe(0);
    expect(uploads.rows).toHaveLength(0);
  });

  it("returns the same session for a repeated clientId, not a second one", async () => {
    const first = await reserve(deps, scope, reserveInput({ clientId: "k1" }));
    const second = await reserve(deps, scope, reserveInput({ clientId: "k1" }));

    expect(second.item.id).toBe(first.item.id);
    expect(second.upload?.id).toBe(first.upload?.id);
    expect(uploads.rows.filter((row) => row.status === "ACTIVE")).toHaveLength(1);
  });

  it("returns no plan when a repeated clientId's file is already finished", async () => {
    const { item, upload } = await reserve(
      deps,
      scope,
      reserveInput({ clientId: "k1" }),
    );
    store.putObject(files.items.get(item.id)!.storageKey, 1024);
    await complete(deps, scope, upload!.id);

    const again = await reserve(deps, scope, reserveInput({ clientId: "k1" }));
    expect(again.item.uploadStatus).toBe("READY");
    expect(again.upload).toBeNull();
  });

  it("adopts the winner when two reserves race the one-active-attempt rule", async () => {
    // Same Item, two concurrent openings: the unique index lets one through.
    const first = await reserve(deps, scope, reserveInput({ clientId: "k1" }));
    uploads.rows[0].status = "ACTIVE";

    const second = await reserve(deps, scope, reserveInput({ clientId: "k1" }));
    expect(second.upload?.id).toBe(first.upload?.id);
  });
});

describe("complete", () => {
  it("verifies the bytes, publishes the file, and records the real size", async () => {
    const { item, upload } = await reserveAndUpload(2048);

    const finished = await complete(deps, scope, upload!.id);

    expect(finished.uploadStatus).toBe("READY");
    // The size comes from storage, not from what the caller declared.
    expect(finished.sizeBytes).toBe(2048);
    expect(uploads.byId(upload!.id).status).toBe("COMPLETED");
    expect(item.id).toBe(finished.id);
  });

  it("refuses to publish a file whose bytes never arrived", async () => {
    const { upload } = await reserve(deps, scope, reserveInput());

    await expect(complete(deps, scope, upload!.id)).rejects.toMatchObject({
      code: "upload_incomplete",
    });
    // Still ACTIVE: the client can PUT the bytes and complete again.
    expect(uploads.byId(upload!.id).status).toBe("ACTIVE");
  });

  it("fails the attempt when the object is not the size that was declared", async () => {
    const reserved = await reserve(deps, scope, reserveInput({ sizeBytes: 1024 }));
    const key = files.items.get(reserved.item.id)!.storageKey;
    store.putObject(key, 9999);

    await expect(
      complete(deps, scope, reserved.upload!.id),
    ).rejects.toMatchObject({ code: "upload_size_mismatch" });

    expect(files.items.get(reserved.item.id)!.uploadStatus).toBe("FAILED");
    expect(uploads.byId(reserved.upload!.id).status).toBe("ABORTED");
    // The bytes it did write are reclaimed rather than left to leak.
    expect(store.deleted).toContain(key);
  });

  it("is idempotent: a second completion reads the first one's result", async () => {
    const { upload } = await reserveAndUpload();

    const first = await complete(deps, scope, upload!.id);
    const second = await complete(deps, scope, upload!.id);

    expect(second.id).toBe(first.id);
    expect(second.uploadStatus).toBe("READY");
  });

  it("assembles a multipart upload from what storage holds", async () => {
    // Forced, so the assembly path is exercised with a handful of parts
    // rather than the ~38 a file over the auto threshold would need.
    const size = 20 * MIB;
    const reserved = await reserve(
      deps,
      scope,
      reserveInput({ sizeBytes: size, mode: "multipart" }),
    );
    const row = uploads.byId(reserved.upload!.id);
    const partSize = reserved.upload!.partSizeBytes!;

    store.putPart(row.providerUploadId!, 1, partSize);
    store.putPart(row.providerUploadId!, 2, partSize);
    store.putPart(row.providerUploadId!, 3, size - 2 * partSize);

    const finished = await complete(deps, scope, reserved.upload!.id);

    expect(finished.uploadStatus).toBe("READY");
    expect(finished.sizeBytes).toBe(size);
  });

  it("names the missing parts instead of just refusing", async () => {
    const size = 20 * MIB;
    const reserved = await reserve(
      deps,
      scope,
      reserveInput({ sizeBytes: size, mode: "multipart" }),
    );
    const row = uploads.byId(reserved.upload!.id);
    const partSize = reserved.upload!.partSizeBytes!;

    store.putPart(row.providerUploadId!, 1, partSize);
    store.putPart(row.providerUploadId!, 3, size - 2 * partSize);

    await expect(
      complete(deps, scope, reserved.upload!.id),
    ).rejects.toMatchObject({
      code: "upload_incomplete",
      details: { missing: [2], malformed: [] },
    });
    // Retryable in place: the session survives so the gap can be filled.
    expect(uploads.byId(reserved.upload!.id).status).toBe("ACTIVE");
  });

  it("reports an expiry when the provider has discarded the upload", async () => {
    const reserved = await reserve(
      deps,
      scope,
      reserveInput({ sizeBytes: 300 * MIB }),
    );
    store.expireMultipart(uploads.byId(reserved.upload!.id).providerUploadId!);

    await expect(
      complete(deps, scope, reserved.upload!.id),
    ).rejects.toMatchObject({ code: "upload_expired" });
    expect(files.items.get(reserved.item.id)!.uploadStatus).toBe("FAILED");
  });

  it("accepts an object a concurrent caller already assembled", async () => {
    const reserved = await reserve(
      deps,
      scope,
      reserveInput({ sizeBytes: 300 * MIB }),
    );
    const key = files.items.get(reserved.item.id)!.storageKey;
    // Someone else completed the multipart upload between our two calls.
    store.expireMultipart(uploads.byId(reserved.upload!.id).providerUploadId!);
    store.putObject(key, 300 * MIB);

    const finished = await complete(deps, scope, reserved.upload!.id);
    expect(finished.uploadStatus).toBe("READY");
  });
});

describe("abort and retry", () => {
  it("cancels an upload and reclaims what it wrote", async () => {
    const { item, upload, key } = await reserveAndUpload();

    const failed = await abort(deps, scope, upload!.id);

    expect(failed.uploadStatus).toBe("FAILED");
    expect(uploads.byId(upload!.id).status).toBe("ABORTED");
    expect(store.deleted).toContain(key);
    expect(failed.id).toBe(item.id);
  });

  it("refuses to cancel an upload that already finished", async () => {
    const { upload } = await reserveAndUpload();
    await complete(deps, scope, upload!.id);

    await expect(abort(deps, scope, upload!.id)).rejects.toMatchObject({
      code: "upload_not_active",
    });
  });

  it("keeps the file but writes to a new key on retry", async () => {
    const { item, upload, key } = await reserveAndUpload();
    await abort(deps, scope, upload!.id);

    const again = await retry(deps, scope, item.id);

    expect(again.item.id).toBe(item.id); // same file, same place in the tree
    expect(again.item.uploadStatus).toBe("PENDING");
    expect(files.items.get(item.id)!.storageKey).not.toBe(key);
    expect(again.upload?.id).not.toBe(upload?.id);
  });

  it("retries a file the client never managed to report as failed", async () => {
    // The commonest failure: the connection dies mid-transfer, so the item is
    // still PENDING and its session still live. Retry must work anyway.
    const { item, upload } = await reserveAndUpload();
    expect(files.items.get(item.id)!.uploadStatus).toBe("PENDING");

    const again = await retry(deps, scope, item.id);

    expect(again.item.id).toBe(item.id);
    expect(again.item.uploadStatus).toBe("PENDING");
    expect(uploads.byId(upload!.id).status).toBe("ABORTED");
    expect(again.upload?.id).not.toBe(upload?.id);
  });

  it("refuses to repoint a file whose bytes are already verified", async () => {
    const { item, upload } = await reserveAndUpload();
    await complete(deps, scope, upload!.id);

    // READY is terminal: a retry must never be able to lose a good upload.
    await expect(retry(deps, scope, item.id)).rejects.toMatchObject({
      code: "invalid_upload_transition",
    });
  });

  it("clears a session left live by a lost write, so a retry is not blocked", async () => {
    const { item, upload } = await reserveAndUpload();
    // The Item settled but the session write was lost: the exact state the
    // partial unique index would otherwise deadlock a retry on.
    await files.setFileStatus(scope, item.id, "FAILED");
    expect(uploads.byId(upload!.id).status).toBe("ACTIVE");

    const again = await retry(deps, scope, item.id);

    expect(uploads.byId(upload!.id).status).toBe("ABORTED");
    expect(again.upload).not.toBeNull();
  });
});

describe("status and part urls", () => {
  it("reports what storage holds, which is the whole of resume", async () => {
    const reserved = await reserve(
      deps,
      scope,
      reserveInput({ sizeBytes: 300 * MIB }),
    );
    const row = uploads.byId(reserved.upload!.id);
    store.putPart(row.providerUploadId!, 1, 8 * MIB);
    store.putPart(row.providerUploadId!, 2, 8 * MIB);

    const state = await status(deps, scope, reserved.upload!.id);

    expect(state.upload.status).toBe("ACTIVE");
    expect(state.parts).toEqual([
      { partNumber: 1, sizeBytes: 8 * MIB },
      { partNumber: 2, sizeBytes: 8 * MIB },
    ]);
  });

  it("mints fresh urls for named parts, so an expired one is never fatal", async () => {
    const reserved = await reserve(
      deps,
      scope,
      reserveInput({ sizeBytes: 300 * MIB }),
    );
    const minted = await partUrls(deps, scope, reserved.upload!.id, [7, 8]);
    expect(minted.map((part) => part.partNumber)).toEqual([7, 8]);
  });

  it("has no parts to offer for a single-request upload", async () => {
    const { upload } = await reserve(deps, scope, reserveInput());
    await expect(
      partUrls(deps, scope, upload!.id, [1]),
    ).rejects.toMatchObject({ code: "part_plan_invalid" });
  });

  it("hides another tenant's upload behind a 404", async () => {
    const { upload } = await reserve(deps, scope, reserveInput());
    await expect(
      status(deps, { accountId: "other", podId: "pod-2" }, upload!.id),
    ).rejects.toMatchObject({ code: "upload_not_found" });
  });
});

describe("the reaper", () => {
  /** Age a session past its deadline, as a vanished client would. */
  function expire(uploadId: string) {
    uploads.byId(uploadId).expiresAt = new Date(Date.now() - 1000);
  }

  it("publishes a file whose bytes landed but whose caller never confirmed", async () => {
    const { item, upload } = await reserveAndUpload(4096);
    expire(upload!.id);

    const result = await reap(deps);

    expect(result).toMatchObject({ scanned: 1, completed: 1, failed: 0 });
    expect(files.items.get(item.id)!.uploadStatus).toBe("READY");
    expect(files.items.get(item.id)!.sizeBytes).toBe(4096);
    expect(uploads.byId(upload!.id).status).toBe("COMPLETED");
  });

  it("fails an upload whose bytes never arrived, and reclaims nothing", async () => {
    const { item, upload } = await reserve(deps, scope, reserveInput());
    expire(upload!.id);

    const result = await reap(deps);

    expect(result).toMatchObject({ scanned: 1, completed: 0, failed: 1 });
    expect(files.items.get(item.id)!.uploadStatus).toBe("FAILED");
    expect(uploads.byId(upload!.id).status).toBe("EXPIRED");
  });

  it("aborts and fails a half-finished multipart upload", async () => {
    const reserved = await reserve(
      deps,
      scope,
      reserveInput({ sizeBytes: 300 * MIB }),
    );
    const row = uploads.byId(reserved.upload!.id);
    store.putPart(row.providerUploadId!, 1, 8 * MIB);
    expire(reserved.upload!.id);

    await reap(deps);

    expect(files.items.get(reserved.item.id)!.uploadStatus).toBe("FAILED");
    expect(store.multiparts.has(row.providerUploadId!)).toBe(false);
  });

  it("leaves a session alone when storage is unreachable", async () => {
    const { item, upload } = await reserveAndUpload();
    expire(upload!.id);
    store.failNext = new Error("connection reset");

    const result = await reap(deps);

    // An outage is not a verdict: nothing is marked failed on its evidence.
    expect(result).toMatchObject({ scanned: 1, completed: 0, failed: 0 });
    expect(uploads.byId(upload!.id).status).toBe("ACTIVE");
    expect(files.items.get(item.id)!.uploadStatus).toBe("PENDING");
  });

  it("ignores sessions that have not expired yet", async () => {
    await reserveAndUpload();
    expect(await reap(deps)).toMatchObject({ scanned: 0 });
  });

  it("is safe to run twice over the same work", async () => {
    const { upload } = await reserveAndUpload();
    expire(upload!.id);

    await reap(deps);
    const second = await reap(deps);

    expect(second).toMatchObject({ scanned: 0, completed: 0, failed: 0 });
  });
});

describe("error surface", () => {
  it("keeps every failure inside the module's own error family", async () => {
    const { upload } = await reserve(deps, scope, reserveInput());
    await complete(deps, scope, upload!.id).catch((error) => {
      expect(isTransferError(error)).toBe(true);
    });
  });
});
