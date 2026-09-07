import { getToken } from "@clerk/nextjs";

import { ApiError, API_BASE_URL } from "./api-error";
import { isAuthConfigured } from "./is-auth-configured";
import type {
  Drive,
  FolderPage,
  Item,
  MoveItemResult,
  Share,
  ShareSubjectRef,
  TrashItemResult,
} from "./types";

/**
 * The one module the UI talks to for drive data.
 *
 * Every component goes through here, so the Worker's URLs and wire format are
 * known in exactly one place. Mutations bump a revision counter that
 * `useResource` subscribes to, which is how a create refreshes the listing
 * without every component wiring up its own invalidation.
 */

type ErrorEnvelope = { error?: { code?: string; message?: string } };

/** One attempt, with credentials attached. Separated so it can be repeated. */
async function send(
  path: string,
  init: RequestInit | undefined,
  fresh: boolean,
): Promise<Response> {
  const auth = await authorization(fresh);

  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...auth,
      ...init?.headers,
    },
  });
}

/**
 * The caller's credentials for the Worker, as a header.
 *
 * The Worker is on a different origin, so this is a bearer token rather than a
 * cookie — deliberately, and the reasoning is in workers/api/src/lib/auth.ts:
 * a credential the browser attaches by itself to cross-origin requests is what
 * makes CSRF possible, and one the code has to fetch and attach cannot be sent
 * by a page the user never opened.
 *
 * Clerk's `getToken` is the non-hook accessor built for exactly this position —
 * a data layer that is not a React component. It waits for Clerk to finish
 * loading, serves a cached token while one is valid, and refreshes it before it
 * expires, so this costs a promise resolution rather than a network call on the
 * overwhelming majority of requests.
 *
 * Returns no header rather than throwing when there is no session. The Worker
 * answers 401 and `describeFailure` turns that into "your session has expired",
 * which is a better outcome than a client-side exception with no status behind
 * it — and it keeps the one code path for "signed out" identical whether the
 * token was missing here or rejected there.
 */
async function authorization(fresh = false): Promise<Record<string, string>> {
  // Without this guard, an app running with Clerk unconfigured would sit in
  // `getToken`'s ten-second wait-for-Clerk timeout on the very first request.
  if (!isAuthConfigured()) return {};

  try {
    // `skipCache` bypasses Clerk's in-memory token cache and mints a new one.
    // Only used on the retry below, because it costs a network round trip.
    const token = await getToken(fresh ? { skipCache: true } : undefined);
    return token ? { authorization: `Bearer ${token}` } : {};
  } catch {
    // Clerk failed to load, or the browser is offline. Both are already
    // failures the request itself will report accurately; swallowing here keeps
    // one error path instead of two.
    return {};
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await send(path, init, false);

    /*
      One retry with a freshly minted token, and only on a 401.

      A cached token can be stale in ways this client cannot see: it was issued
      while a session task was still outstanding and is now `pending` where the
      session is active, it expired a second ago, or Clerk rotated it. All of
      those produce a 401 that a *new* token would not, and all of them are
      invisible here — the token looks fine, it simply is not current any more.

      Without this the failure is silent and confusing rather than fatal: the
      screen says "you're signed out" to a user who is demonstrably signed in,
      and stays that way until they reload. That is exactly what completing the
      organisation task did before this existed.

      Bounded to a single attempt on purpose. If a token minted seconds ago is
      also refused, the session really is gone and looping would only turn a
      clear error into a hang.
    */
    if (response.status === 401) {
      response = await send(path, init, true);
    }
  } catch {
    // `fetch` only rejects when no HTTP response happened at all — the Worker
    // isn't running, DNS failed, the connection dropped, CORS refused the
    // preflight. Status 0 is the marker for that whole family; deciding what to
    // *tell the user* about it belongs to `describeFailure`, not here, so the
    // same outage cannot end up worded two ways in two places.
    throw new ApiError("network", "The API did not respond.", 0);
  }

  if (response.status === 204) return undefined as T;

  const payload = (await response.json().catch(() => ({}))) as T & ErrorEnvelope;

  if (!response.ok) {
    throw new ApiError(
      payload.error?.code ?? "unknown",
      payload.error?.message ?? `Request failed with status ${response.status}.`,
      response.status,
    );
  }

  return payload;
}

// ---------------------------------------------------------------------------
// Change notification
// ---------------------------------------------------------------------------

const listeners = new Set<() => void>();
let revision = 0;

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getRevision() {
  return revision;
}

function changed() {
  revision += 1;
  for (const listener of listeners) listener();
}

/**
 * Tell every live reader to re-read.
 *
 * Same mechanism a mutation uses, exposed for one other event that is just as
 * global: the API coming back. Two components reading the same resource hold
 * separate state, so a recovery that only heals the one the user clicked leaves
 * the other still claiming the backend is down.
 */
export function revalidate() {
  changed();
}

// ---------------------------------------------------------------------------
// Drives and folders
// ---------------------------------------------------------------------------

export async function listDrives(): Promise<Drive[]> {
  const drives: Drive[] = [];
  let cursor: string | undefined;

  // The current UI renders one compact list in both the index and sidebar.
  // Follow bounded Worker pages here so Drive 51 never silently disappears.
  // The cap guards a malformed response that repeats a cursor forever.
  for (let page = 0; page < 100; page += 1) {
    const query = new URLSearchParams({ limit: "100" });
    if (cursor) query.set("cursor", cursor);
    const result = await request<{
      drives: Drive[];
      nextCursor?: string | null;
    }>(`/v1/drives?${query.toString()}`);
    drives.push(...result.drives);
    if (!result.nextCursor) return drives;
    cursor = result.nextCursor;
  }

  throw new ApiError(
    "pagination_limit",
    "The drive list exceeded the safe pagination limit.",
    500,
  );
}

/**
 * Creates a drive.
 *
 * `clientId` is the Worker's idempotency key, and passing one turns a retry
 * into a re-read: the second request with the same key returns the first
 * request's drive rather than making another. Optional because the interactive
 * dialog does not need it — a person who presses the button twice has usually
 * *meant* two drives, and the duplicate is visible and deletable.
 *
 * Onboarding is the case that does need it. There the create is one leg of an
 * unattended two-step flow, where a refresh or a double-submit would silently
 * leave a brand-new user with two identical drives and no idea why.
 */
export async function createDrive(
  name: string,
  clientId?: string,
): Promise<Drive> {
  const { drive } = await request<{ drive: Drive }>("/v1/drives", {
    method: "POST",
    // Spread rather than always sending the key, because the schema treats
    // an explicit `null` and an absent field differently — Postgres counts
    // nulls as distinct, which is what lets unkeyed creates coexist.
    body: JSON.stringify({ name, ...(clientId ? { clientId } : {}) }),
  });
  changed();
  return drive;
}

export async function getFolderContents(
  driveId: string,
  parentId: string | null,
  cursor?: string,
): Promise<FolderPage> {
  const query = new URLSearchParams({ limit: "50" });
  if (parentId) query.set("parentId", parentId);
  if (cursor) query.set("cursor", cursor);

  return request<FolderPage>(
    `/v1/drives/${encodeURIComponent(driveId)}/contents?${query.toString()}`,
  );
}

export async function createFolder(
  driveId: string,
  parentId: string | null,
  name: string,
): Promise<Item> {
  const { item } = await request<{ item: Item }>(
    `/v1/drives/${encodeURIComponent(driveId)}/folders`,
    { method: "POST", body: JSON.stringify({ name, parentId }) },
  );
  changed();
  return item;
}

// ---------------------------------------------------------------------------
// Metadata actions
// ---------------------------------------------------------------------------

export async function renameItem(itemId: string, name: string): Promise<Item> {
  const { item } = await request<{ item: Item }>(
    `/v1/items/${encodeURIComponent(itemId)}`,
    { method: "PATCH", body: JSON.stringify({ name }) },
  );
  changed();
  return item;
}

export async function moveItem(
  itemId: string,
  newParentId: string | null,
): Promise<MoveItemResult> {
  const result = await request<MoveItemResult>(
    `/v1/items/${encodeURIComponent(itemId)}/move`,
    { method: "POST", body: JSON.stringify({ newParentId }) },
  );
  changed();
  return result;
}

export async function trashItem(itemId: string): Promise<TrashItemResult> {
  const result = await request<TrashItemResult>(
    `/v1/items/${encodeURIComponent(itemId)}`,
    { method: "DELETE" },
  );
  changed();
  return result;
}

export async function restoreItem(itemId: string): Promise<Item> {
  const { item } = await request<{ item: Item }>(
    `/v1/items/${encodeURIComponent(itemId)}/restore`,
    { method: "POST" },
  );
  changed();
  return item;
}

export async function renameDrive(driveId: string, name: string): Promise<Drive> {
  const { drive } = await request<{ drive: Drive }>(
    `/v1/drives/${encodeURIComponent(driveId)}`,
    { method: "PATCH", body: JSON.stringify({ name }) },
  );
  changed();
  return drive;
}

export async function trashDrive(driveId: string): Promise<void> {
  await request<void>(`/v1/drives/${encodeURIComponent(driveId)}`, {
    method: "DELETE",
  });
  changed();
}

export async function restoreDrive(driveId: string): Promise<Drive> {
  const { drive } = await request<{ drive: Drive }>(
    `/v1/drives/${encodeURIComponent(driveId)}/restore`,
    { method: "POST" },
  );
  changed();
  return drive;
}

// ---------------------------------------------------------------------------
// Sharing — the owner's side
// ---------------------------------------------------------------------------

/*
  These four are authenticated, which is why they live here and not in
  `share-api.ts`: minting or revoking a link is an act of ownership and carries
  the caller's bearer token like every other mutation. The *public* side of the
  same feature — what a visitor holding the token can read — has no credentials
  at all and therefore has its own module. The split is by trust boundary, not
  by feature.

  One function per verb rather than one per verb per subject, mirroring the
  Worker, which binds the same four handlers under both mounts.
*/

/** `/v1/drives/:id/share` or `/v1/items/:id/share`, from the subject. */
function sharePath(subject: ShareSubjectRef): string {
  return subject.kind === "DRIVE"
    ? `/v1/drives/${encodeURIComponent(subject.driveId)}/share`
    : `/v1/items/${encodeURIComponent(subject.itemId)}/share`;
}

/**
 * The current share, or null when the subject has none.
 *
 * Null rather than a 404: the caller asked about something they own, and "not
 * shared" is a fact about it, not a missing resource. It is the state the
 * dialog opens on.
 */
export async function getShare(subject: ShareSubjectRef): Promise<Share | null> {
  const { share } = await request<{ share: Share | null }>(sharePath(subject));
  return share;
}

/**
 * Create-or-return. Pressing Share twice, or in two tabs, yields one link —
 * the Worker settles that in Postgres rather than by asking first.
 */
export async function createShare(subject: ShareSubjectRef): Promise<Share> {
  const { share } = await request<{ share: Share }>(sharePath(subject), {
    method: "POST",
  });
  return share;
}

export async function setShareDownload(
  subject: ShareSubjectRef,
  allowDownload: boolean,
): Promise<Share> {
  const { share } = await request<{ share: Share }>(sharePath(subject), {
    method: "PATCH",
    body: JSON.stringify({ allowDownload }),
  });
  return share;
}

/** Idempotent. Sharing again afterwards mints a *new* token, never this one. */
export async function revokeShare(subject: ShareSubjectRef): Promise<void> {
  await request<void>(sharePath(subject), { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

/**
 * The upload client.
 *
 * The server owns the session; this owns nothing durable. Everything below is
 * a consequence of that split: the client never records what it uploaded,
 * because the one authority on what landed is storage, and the server will
 * tell us on request. That is what makes an interrupted upload resumable and a
 * lost confirmation harmless.
 *
 * Protocol and reasoning: docs/architecture/upload-storage-module-spec.md §7.
 */

/** Attempts per request before a failure is real. */
const MAX_ATTEMPTS = 6;
const BACKOFF_BASE_MS = 500;
const BACKOFF_CAP_MS = 32_000;

/**
 * How many times one request may re-mint an expired signature.
 *
 * Bounded only so a server that keeps handing back stale URLs cannot spin
 * forever; in practice this is hit zero or once.
 */
const MAX_REMINTS = 3;

/** Parts in flight per file. Four saturates a link without starving the tab. */
const PART_CONCURRENCY = 4;

/** Part URLs fetched per round trip. Matches what reserve seeds. */
const PART_URL_BATCH = 20;

/** How many times completion may ask for missing bytes before giving up. */
const COMPLETE_ROUNDS = 3;

/**
 * A transfer with no progress event for this long is treated as dead.
 *
 * A fixed overall timeout would kill exactly the slow uploads that most need
 * to survive. Silence is the honest signal: bytes still moving means the
 * connection is alive however slowly, and bytes stopped means it is not.
 */
const STALL_TIMEOUT_MS = 60_000;

type PartTarget = { partNumber: number; url: string; expiresAt: string };

type UploadPlan = {
  id: string;
  mode: "SINGLE" | "MULTIPART";
  expiresAt: string;
  put?: { url: string; expiresAt: string; requiredHeaders: Record<string, string> };
  partSizeBytes?: number;
  partCount?: number | null;
  partUrls?: PartTarget[];
};

type ReserveResponse = { item: Item; upload: UploadPlan | null };

type UploadStatusResponse = {
  upload: { id: string; itemId: string; status: string; mode: string };
  parts?: Array<{ partNumber: number; sizeBytes: number }>;
};

export type UploadHandle = {
  /** The session the server opened. Null once there is nothing left to send. */
  uploadId: string | null;
  item: Item;
};

/** Progress in absolute bytes, so a caller can aggregate across parts. */
type ByteProgress = (loaded: number) => void;

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Full jitter, not fixed backoff.
 *
 * A hundred files failing on the same flaky connection would otherwise retry
 * in lockstep and fail together again. Spreading them over the window is what
 * lets the connection recover at all.
 */
function backoffMs(attempt: number): number {
  const ceiling = Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_CAP_MS);
  return Math.random() * ceiling;
}

/**
 * Whether the same request, unchanged, could succeed later.
 *
 * Status 0 is our marker for "no HTTP response happened" — a dropped
 * connection, a stall, DNS. Those and the server's own "later" answers are
 * worth repeating; a refusal is not, and repeating one just delays the error.
 */
function isRetryableStatus(status: number): boolean {
  return status === 0 || status === 429 || status >= 500;
}

/**
 * PUTs one blob to a presigned URL, reporting bytes as they go.
 *
 * `XMLHttpRequest` rather than `fetch` purely for `upload.onprogress` — fetch
 * still has no upload progress in browsers, and an upload with no progress bar
 * is the thing that makes a file UI feel broken on a slow connection.
 */
function putBlob(
  url: string,
  headers: Record<string, string>,
  body: Blob,
  onBytes: ByteProgress,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) {
      request.setRequestHeader(name, value);
    }

    /*
      Silence, not elapsed time, is what marks a dead transfer. The timer is
      reset by every progress event, so a genuinely slow upload runs as long as
      it needs and a stalled socket is abandoned in a minute.
    */
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    let stalled = false;
    const armStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        stalled = true;
        request.abort();
      }, STALL_TIMEOUT_MS);
    };
    const disarm = () => {
      if (stallTimer) clearTimeout(stallTimer);
    };

    request.upload.onprogress = (event) => {
      armStallTimer();
      if (event.lengthComputable) onBytes(event.loaded);
    };

    request.onload = () => {
      disarm();
      if (request.status >= 200 && request.status < 300) {
        onBytes(body.size);
        resolve();
        return;
      }
      reject(
        new ApiError(
          "upload_rejected",
          `Storage rejected the upload (${request.status}).`,
          request.status,
        ),
      );
    };

    request.onerror = () => {
      disarm();
      reject(
        new ApiError(
          "upload_failed",
          "The upload could not reach storage. This is usually the bucket's CORS policy.",
          0,
        ),
      );
    };

    request.onabort = () => {
      disarm();
      reject(
        stalled
          ? // Retryable: report it the same way as any other lost connection.
            new ApiError("upload_stalled", "The upload stopped responding.", 0)
          : new ApiError("upload_aborted", "Upload cancelled.", 0),
      );
    };

    armStallTimer();
    request.send(body);
  });
}

/**
 * One blob, delivered — through whatever it takes.
 *
 * Two failure families are handled differently on purpose. An expired
 * signature is not a failure at all: the URL simply aged out, so it is
 * re-minted and retried without spending any of the attempt budget. A dropped
 * connection is a real failure and pays the backoff.
 */
async function putBlobWithRetry(input: {
  url: string;
  headers: Record<string, string>;
  body: Blob;
  onBytes: ByteProgress;
  remint?: () => Promise<{ url: string; headers: Record<string, string> }>;
}): Promise<void> {
  let { url, headers } = input;
  let attempt = 0;
  let reminted = 0;

  for (;;) {
    try {
      await putBlob(url, headers, input.body, input.onBytes);
      return;
    } catch (cause) {
      const status = cause instanceof ApiError ? cause.status : 0;

      if (status === 403 && input.remint && reminted < MAX_REMINTS) {
        reminted += 1;
        ({ url, headers } = await input.remint());
        continue;
      }

      attempt += 1;
      if (!isRetryableStatus(status) || attempt >= MAX_ATTEMPTS) throw cause;
      // Reset the byte count: the next attempt starts this blob from zero.
      input.onBytes(0);
      await sleep(backoffMs(attempt));
    }
  }
}

/**
 * Runs tasks with a bounded number in flight, failing on the first error.
 *
 * Bounded because a drag of two hundred files must not open two hundred
 * sockets: browsers cap connections per origin anyway, and queueing above that
 * cap only makes every upload slower and the progress bars less honest.
 */
async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let cursor = 0;
  let failure: unknown = null;

  async function worker(): Promise<void> {
    for (;;) {
      if (failure !== null) return;
      const index = cursor;
      cursor += 1;
      if (index >= tasks.length) return;
      try {
        results[index] = await tasks[index]();
      } catch (cause) {
        failure ??= cause;
        return;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, worker),
  );
  if (failure !== null) throw failure;
  return results;
}

// ---------------------------------------------------------------------------
// Session API
// ---------------------------------------------------------------------------

function reserveUpload(
  driveId: string,
  body: Record<string, unknown>,
): Promise<ReserveResponse> {
  return request<ReserveResponse>(
    `/v1/drives/${encodeURIComponent(driveId)}/uploads`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

function getUploadStatus(uploadId: string): Promise<UploadStatusResponse> {
  return request<UploadStatusResponse>(
    `/v1/uploads/${encodeURIComponent(uploadId)}`,
  );
}

function fetchPartUrls(
  uploadId: string,
  partNumbers: number[],
): Promise<PartTarget[]> {
  return request<{ partUrls: PartTarget[] }>(
    `/v1/uploads/${encodeURIComponent(uploadId)}/part-urls`,
    { method: "POST", body: JSON.stringify({ partNumbers }) },
  ).then((payload) => payload.partUrls);
}

function finishUpload(uploadId: string): Promise<Item> {
  return request<{ item: Item }>(
    `/v1/uploads/${encodeURIComponent(uploadId)}/complete`,
    { method: "POST" },
  ).then((payload) => payload.item);
}

/** Cancel a session. Best-effort: the reaper settles it either way. */
export async function abortUpload(uploadId: string): Promise<void> {
  await request<{ item: Item }>(
    `/v1/uploads/${encodeURIComponent(uploadId)}/abort`,
    { method: "POST" },
  ).catch(() => {});
  changed();
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

/**
 * Aggregates per-part byte counts into one never-decreasing fraction.
 *
 * A retried part restarts at zero bytes, so the raw sum can go backwards. A
 * progress bar that slides left reads as corruption to a person watching it,
 * which is a worse lie than briefly standing still.
 */
function createProgress(total: number, report: (fraction: number) => void) {
  const loaded = new Map<number, number>();
  let highWater = 0;

  return {
    set(key: number, bytes: number) {
      loaded.set(key, bytes);
      if (total <= 0) return;
      let sum = 0;
      for (const value of loaded.values()) sum += value;
      const fraction = Math.min(sum / total, 1);
      if (fraction > highWater) {
        highWater = fraction;
        report(fraction);
      }
    },
    finish() {
      report(1);
    },
  };
}

// ---------------------------------------------------------------------------
// The transfer
// ---------------------------------------------------------------------------

function partRange(
  partNumber: number,
  partSizeBytes: number,
  size: number,
): [number, number] {
  const start = (partNumber - 1) * partSizeBytes;
  return [start, Math.min(start + partSizeBytes, size)];
}

function partNumbersFor(plan: UploadPlan, size: number): number[] {
  const partSize = plan.partSizeBytes ?? 0;
  const count = plan.partCount ?? (partSize > 0 ? Math.ceil(size / partSize) : 0);
  return Array.from({ length: Math.max(count, 1) }, (_, index) => index + 1);
}

/** Upload the named parts, minting URLs a batch at a time. */
async function sendParts(
  plan: UploadPlan,
  file: File,
  partNumbers: number[],
  progress: ReturnType<typeof createProgress>,
): Promise<void> {
  const partSize = plan.partSizeBytes ?? 0;
  const seeded = new Map(
    (plan.partUrls ?? []).map((target) => [target.partNumber, target.url]),
  );

  /*
    Whole batches at a time rather than one URL per part: a 200-part upload
    costs ten round trips instead of two hundred, and the batch boundary is
    also a natural place for the four workers to regroup.
  */
  for (let offset = 0; offset < partNumbers.length; offset += PART_URL_BATCH) {
    const batch = partNumbers.slice(offset, offset + PART_URL_BATCH);
    const missing = batch.filter((partNumber) => !seeded.has(partNumber));
    if (missing.length > 0) {
      for (const target of await fetchPartUrls(plan.id, missing)) {
        seeded.set(target.partNumber, target.url);
      }
    }

    await runWithConcurrency(
      batch.map((partNumber) => async () => {
        const url = seeded.get(partNumber);
        if (!url) {
          throw new ApiError(
            "upload_failed",
            `The server did not return a URL for part ${partNumber}.`,
            0,
          );
        }
        const [start, end] = partRange(partNumber, partSize, file.size);
        await putBlobWithRetry({
          url,
          // UploadPart is signed without a content type, so sending one would
          // break the signature rather than describe the bytes.
          headers: {},
          body: file.slice(start, end),
          onBytes: (bytes) => progress.set(partNumber, bytes),
          remint: async () => {
            const [fresh] = await fetchPartUrls(plan.id, [partNumber]);
            return { url: fresh.url, headers: {} };
          },
        });
      }),
      PART_CONCURRENCY,
    );
  }
}

/**
 * Ask the server to publish the file, sending anything it says is missing.
 *
 * Completion is the server's judgement, made against storage rather than
 * against anything this client believes. When it disagrees with us, it is
 * right, and the loop below simply supplies what it asked for.
 */
async function completeWithRepair(
  plan: UploadPlan,
  file: File,
  progress: ReturnType<typeof createProgress>,
): Promise<Item> {
  for (let round = 0; ; round += 1) {
    try {
      return await finishUpload(plan.id);
    } catch (cause) {
      const incomplete =
        cause instanceof ApiError && cause.code === "upload_incomplete";
      if (!incomplete || round >= COMPLETE_ROUNDS - 1) throw cause;

      if (plan.mode === "SINGLE") {
        // The PUT never landed. Nothing to diff — send it again.
        await sendSingle(plan, file, progress);
        continue;
      }

      const { parts = [] } = await getUploadStatus(plan.id);
      const present = new Set(parts.map((part) => part.partNumber));
      const gap = partNumbersFor(plan, file.size).filter(
        (partNumber) => !present.has(partNumber),
      );
      // Nothing missing but still refused: repeating cannot help.
      if (gap.length === 0) throw cause;
      await sendParts(plan, file, gap, progress);
    }
  }
}

async function sendSingle(
  plan: UploadPlan,
  file: File,
  progress: ReturnType<typeof createProgress>,
): Promise<void> {
  if (!plan.put) {
    throw new ApiError(
      "upload_failed",
      "The server did not return an upload URL.",
      0,
    );
  }

  await putBlobWithRetry({
    url: plan.put.url,
    // Content-Type is signed into the URL when one was declared, so it has to
    // be echoed back exactly. Anything else is a signature mismatch, which
    // reads like a credentials problem and is not one.
    headers: plan.put.requiredHeaders,
    body: file,
    onBytes: (bytes) => progress.set(0, bytes),
  });
}

/** Carry the bytes, then publish. Shared by a first attempt and a retry. */
async function transfer(
  plan: UploadPlan,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<Item> {
  const progress = createProgress(file.size, onProgress);

  try {
    if (plan.mode === "SINGLE") {
      await sendSingle(plan, file, progress);
    } else {
      await sendParts(plan, file, partNumbersFor(plan, file.size), progress);
    }
  } catch (cause) {
    /*
      The transfer is over — retries are spent, or storage refused the bytes
      outright. Closing the session says so: it settles the file as failed now
      rather than leaving it pending until the reaper expires it, and it
      reclaims whatever was written.

      Best-effort, because the usual reason to be here is that the network is
      gone, and this call needs the same network. When it does not land, the
      reaper settles the session on its own schedule.
    */
    await abortUpload(plan.id);
    throw cause;
  }

  const item = await completeWithRepair(plan, file, progress);
  progress.finish();
  changed();
  return item;
}

/**
 * Uploads one file end to end.
 *
 * Reserve, transfer, complete. The bytes go straight to object storage and
 * never pass through our compute, which is what removes any ceiling on their
 * size; the server verifies them before the file becomes visible, which is
 * what stops a client from being able to publish a file it never sent.
 *
 * `clientId` is the idempotency key and should be stable for one intended
 * upload: a double-submit, a retried reserve, or a resumed session with the
 * same key returns the same file rather than a second copy of it.
 */
export async function uploadFile(
  target: { driveId: string; parentId: string | null },
  file: File,
  onProgress: (fraction: number) => void,
  options: { clientId?: string; onReserved?: (item: Item) => void } = {},
): Promise<Item> {
  const { item, upload } = await reserveUpload(target.driveId, {
    name: file.name || "pasted-file",
    parentId: target.parentId,
    contentType: file.type || undefined,
    sizeBytes: file.size,
    ...(options.clientId ? { clientId: options.clientId } : {}),
  });

  /*
    Hand the caller the Item before the bytes move. A transfer that fails after
    this point still has a row behind it, and knowing its id is what lets a
    retry reuse the file rather than create a second, suffixed copy of it.
  */
  options.onReserved?.(item);

  // The row exists now, so the listing should already show it as pending.
  changed();

  // Nothing to send: this key's file finished on an earlier attempt.
  if (!upload) {
    onProgress(1);
    return item;
  }

  return transfer(upload, file, onProgress);
}

/**
 * Try a failed file again, keeping the file.
 *
 * Deliberately not "upload it once more": the Item survives, so its id, its
 * name, its position in the tree and anything already pointing at it are all
 * preserved, and only the bytes are replaced. A fresh upload would leave the
 * failed row behind and add a second, suffixed one beside it.
 */
export async function retryUpload(
  itemId: string,
  file: File,
  onProgress: (fraction: number) => void,
  options: { onReserved?: (item: Item) => void } = {},
): Promise<Item> {
  const { item, upload } = await request<ReserveResponse>(
    `/v1/items/${encodeURIComponent(itemId)}/upload/retry`,
    { method: "POST" },
  );
  options.onReserved?.(item);
  changed();

  if (!upload) {
    onProgress(1);
    return item;
  }

  return transfer(upload, file, onProgress);
}

/** Presigned download URL, valid briefly. */
export async function getDownloadUrl(fileId: string): Promise<string> {
  const { download } = await request<{ download: { url: string } }>(
    `/v1/files/${encodeURIComponent(fileId)}/download`,
  );
  return download.url;
}
