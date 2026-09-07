/**
 * The upload module against **real Cloudflare R2**.
 *
 * The unit suite proves the state machine against two fakes. This swaps one of
 * them back for the real thing: the object store. Everything that touches
 * storage here is genuine — real SigV4 signing, real presigned PUTs, a real
 * multipart upload assembled by R2, real bytes fetched back and hashed.
 *
 * The database stays faked on purpose. Its half is already covered twice over
 * (the unit suite exercises every transition, and the migration's constraints
 * are enforced by Postgres itself), and the generated Prisma client is built
 * for `workerd` — it loads a WebAssembly query compiler that Vite's transform
 * cannot resolve, so importing it here would test the bundler rather than the
 * uploads. See the note in the summary about the pre-existing effect this has
 * on the Filesystem database suite.
 *
 * What only this file can prove:
 *
 * - R2 accepts the URLs we sign. This is the regression test for the checksum
 *   defaults, which silently sign headers a browser never sends.
 * - Our uniform-part rule produces a multipart upload R2 will actually
 *   assemble, rather than reject at completion.
 * - The bytes come back identical.
 * - The reaper rescues an upload whose caller vanished — against a real object.
 *
 * **Opt-in**, because it needs credentials and writes real objects:
 *
 *   set -a; . ./.env.local; set +a
 *   VERIFY_REAL_STORAGE=true pnpm test:transfer
 *
 * Every object it writes is deleted afterwards.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Db } from "@/db/client";
import type { Scope } from "@/db/scope";
import { createStorageClient, presignGet, type StorageClient } from "@/storage";

import { FakeFileMetadata, FakeUploadStore } from "./internal/fakes";
import {
  abort,
  complete,
  partUrls,
  reserve as reserveUpload,
  retry,
  status,
  type Deps,
} from "./internal/operations";
import { reap } from "./internal/reaper";
import { createObjectStore, type ObjectStore } from "./object-store";

const MIB = 1024 * 1024;

const enabled = process.env.VERIFY_REAL_STORAGE === "true";
const bucket = process.env.S3_BUCKET?.trim();
const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();

const ready = enabled && Boolean(bucket && accessKeyId && secretAccessKey);
const describeReal = ready ? describe : describe.skip;

const scope: Scope = {
  accountId: "00000000-0000-0000-0000-000000000001",
  podId: "00000000-0000-0000-0000-000000000002",
};

/** Deterministic bytes, so a mismatch is unmistakable rather than plausible. */
function bytes(size: number, seed: number): Uint8Array<ArrayBuffer> {
  // Backed by a real ArrayBuffer, not a SharedArrayBuffer, so it satisfies
  // `BodyInit` when handed to fetch.
  const buffer = new Uint8Array(new ArrayBuffer(size));
  for (let i = 0; i < size; i += 1) buffer[i] = (i * 31 + seed) % 251;
  return buffer;
}

async function digest(data: Uint8Array<ArrayBuffer>): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Exactly what a browser does: PUT to the signed URL with the signed headers. */
async function put(
  url: string,
  body: Uint8Array<ArrayBuffer>,
  headers: Record<string, string> = {},
): Promise<void> {
  const response = await fetch(url, { method: "PUT", body, headers });
  if (!response.ok) {
    throw new Error(
      `PUT ${response.status}: ${(await response.text()).slice(0, 400)}`,
    );
  }
}

describeReal("upload module against real R2", () => {
  let client: StorageClient;
  let store: ObjectStore;
  let files: FakeFileMetadata;
  let uploads: FakeUploadStore;
  let deps: Deps;
  const writtenKeys = new Set<string>();

  beforeAll(() => {
    client = createStorageClient({
      endpoint: process.env.S3_ENDPOINT || undefined,
      region: process.env.S3_REGION || "auto",
      accessKeyId: accessKeyId!,
      secretAccessKey: secretAccessKey!,
    });
    store = createObjectStore(client, bucket!);
    files = new FakeFileMetadata();
    uploads = new FakeUploadStore();
    deps = { db: uploads as unknown as Db, files, store };
  });

  afterAll(async () => {
    // Leave the bucket as we found it, whatever happened above.
    for (const key of writtenKeys) {
      await store.delete({ bucket: bucket!, key }).catch(() => {});
    }
  }, 120_000);

  /** Reserve, and remember the key so cleanup can reclaim it. */
  async function reserve(
    name: string,
    sizeBytes: number | null,
    mode?: "multipart",
  ) {
    const result = await reserveUpload(deps, scope, {
      driveId: "drive-1",
      parentId: null,
      name,
      contentType: "application/octet-stream",
      sizeBytes,
      mode,
    });
    const key = files.items.get(result.item.id)!.storageKey;
    writtenKeys.add(key);
    return { ...result, key };
  }

  it("signs a PUT that R2 accepts, and verifies the stored object", async () => {
    const body = bytes(64 * 1024, 7);
    const { upload, key } = await reserve("small.bin", body.length);

    expect(upload?.mode).toBe("SINGLE");
    // The regression test for the checksum defaults: a URL signed with headers
    // the browser does not send fails here with SignatureDoesNotMatch.
    await put(upload!.put!.url, body, upload!.put!.requiredHeaders);

    const ready = await complete(deps, scope, upload!.id);
    expect(ready.uploadStatus).toBe("READY");
    // The size on the row is what R2 reported, not what we declared.
    expect(ready.sizeBytes).toBe(body.length);

    const head = await store.head({ bucket: bucket!, key });
    expect(head?.sizeBytes).toBe(body.length);

    // Clients retry this call, so it must stay harmless.
    expect((await complete(deps, scope, upload!.id)).uploadStatus).toBe("READY");
  }, 120_000);

  it("assembles a real multipart upload and returns the bytes unchanged", async () => {
    const partSize = 8 * MIB;
    const total = partSize * 2 + 1234;
    const body = bytes(total, 13);

    const { item, upload, key } = await reserve("large.bin", total, "multipart");
    expect(upload?.mode).toBe("MULTIPART");
    expect(upload?.partSizeBytes).toBe(partSize);
    expect(upload?.partCount).toBe(3);

    // Send parts 1 and 3 only. R2 must be seen to be missing part 2, rather
    // than us assembling a truncated object.
    const urls = new Map(
      upload!.partUrls!.map((part) => [part.partNumber, part.url]),
    );
    await put(urls.get(1)!, body.subarray(0, partSize));
    await put(urls.get(3)!, body.subarray(partSize * 2));

    await expect(complete(deps, scope, upload!.id)).rejects.toMatchObject({
      code: "upload_incomplete",
      details: { missing: [2] },
    });

    // Resume: ask what R2 holds, send only the difference.
    const state = await status(deps, scope, upload!.id);
    expect(state.parts!.map((part) => part.partNumber).sort()).toEqual([1, 3]);

    const [missing] = await partUrls(deps, scope, upload!.id, [2]);
    await put(missing.url, body.subarray(partSize, partSize * 2));

    const assembled = await complete(deps, scope, upload!.id);
    expect(assembled.uploadStatus).toBe("READY");
    // R2 accepted our uniform-part plan and reports the whole length.
    expect(assembled.sizeBytes).toBe(total);
    expect(assembled.id).toBe(item.id);

    const download = await presignGet(client, bucket!, key, "large.bin");
    const fetched = new Uint8Array(
      await (await fetch(download.url)).arrayBuffer(),
    );
    expect(fetched.length).toBe(total);
    expect(await digest(fetched)).toBe(await digest(body));
  }, 300_000);

  it("publishes an upload whose caller vanished before confirming", async () => {
    const body = bytes(32 * 1024, 29);
    const { item, upload } = await reserve("abandoned.bin", body.length);

    // The bytes land, then nothing else happens — the failure that used to
    // lose the file permanently.
    await put(upload!.put!.url, body, upload!.put!.requiredHeaders);
    uploads.byId(upload!.id).expiresAt = new Date(Date.now() - 60_000);

    const result = await reap(deps);
    expect(result.completed).toBe(1);

    const rescued = files.items.get(item.id)!;
    expect(rescued.uploadStatus).toBe("READY");
    expect(rescued.sizeBytes).toBe(body.length);
  }, 120_000);

  it("fails an upload whose bytes never reached R2", async () => {
    const { item, upload } = await reserve("never-sent.bin", 4096);
    uploads.byId(upload!.id).expiresAt = new Date(Date.now() - 60_000);

    const result = await reap(deps);
    expect(result.failed).toBe(1);
    expect(files.items.get(item.id)!.uploadStatus).toBe("FAILED");
  }, 120_000);

  it("refuses an object that is not the size the caller declared", async () => {
    const { item, upload, key } = await reserve("wrong-size.bin", 10_000);
    await put(upload!.put!.url, bytes(500, 3), upload!.put!.requiredHeaders);

    await expect(complete(deps, scope, upload!.id)).rejects.toMatchObject({
      code: "upload_size_mismatch",
    });
    expect(files.items.get(item.id)!.uploadStatus).toBe("FAILED");

    // The bytes it did write are reclaimed rather than left to leak.
    expect(await store.head({ bucket: bucket!, key })).toBeNull();
  }, 120_000);

  it("aborts a real multipart upload and reclaims it", async () => {
    const total = 8 * MIB + 10;
    const { item, upload, key } = await reserve(
      "cancelled.bin",
      total,
      "multipart",
    );
    const url = upload!.partUrls![0].url;
    await put(url, bytes(8 * MIB, 5));

    const cancelled = await abort(deps, scope, upload!.id);
    expect(cancelled.uploadStatus).toBe("FAILED");
    expect(cancelled.id).toBe(item.id);

    // R2 should be holding neither the assembled object nor the parts.
    expect(await store.head({ bucket: bucket!, key })).toBeNull();
    const row = uploads.byId(upload!.id);
    expect(
      await store.listParts({
        bucket: bucket!,
        key,
        uploadId: row.providerUploadId!,
      }),
    ).toBeNull();
  }, 180_000);

  it("keeps the file on retry and writes the new attempt to a new key", async () => {
    const { item, upload, key } = await reserve("retry-me.bin", 1024);

    const again = await retry(deps, scope, item.id);
    const newKey = files.items.get(item.id)!.storageKey;
    writtenKeys.add(newKey);

    expect(again.item.id).toBe(item.id);
    expect(newKey).not.toBe(key);
    expect(again.upload!.id).not.toBe(upload!.id);
    // Keys are written once and never rewritten — that is what keeps us clear
    // of R2's one-write-per-second-per-key limit.
    expect(
      uploads.rows.filter((row) => row.itemId === item.id && row.status === "ACTIVE"),
    ).toHaveLength(1);
  }, 120_000);
});
