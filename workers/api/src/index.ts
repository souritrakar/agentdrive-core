import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";

import { createDb } from "@/db/client";
import { FilesystemError } from "@/filesystem";
import { isSharingError, sharingErrorStatus } from "@/sharing";
import { createStorageClient, isStorageError } from "@/storage";
import {
  createObjectStore,
  createTransfer,
  isTransferError,
  transferErrorStatus,
} from "@/transfer";

import {
  allowedOrigins,
  rawStorageRoutesEnabled,
  type AppEnv,
} from "./lib/env";
import { requireDb } from "./lib/scope";
import { bucketRoutes } from "./routes/buckets";
import { driveRoutes } from "./routes/drives";
import { driveFileRoutes, fileRoutes } from "./routes/files";
import { itemRoutes } from "./routes/items";
import { objectRoutes } from "./routes/objects";
import {
  driveShareRoutes,
  itemShareRoutes,
  shareRoutes,
} from "./routes/shares";
import {
  driveUploadRoutes,
  itemUploadRoutes,
  uploadRoutes,
} from "./routes/uploads";

const app = new Hono<AppEnv>();

/**
 * CORS is restricted to the configured app origins.
 *
 * CORS is a browser rule, not a security boundary — `curl` and any server-side
 * caller ignore it entirely. What actually protects this API is the token check
 * in lib/auth.ts, which runs for every caller regardless of origin. This narrows
 * which *web pages* may call us with the user's credentials attached, which is a
 * real but separate job.
 *
 * Built per request because the allowed origins come from the env bindings.
 */
app.use("*", (c, next) =>
  cors({
    origin: allowedOrigins(c.env),
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    // Without this the browser's preflight refuses the `Authorization` header
    // and every authenticated call fails before it is sent — as a CORS error,
    // which looks nothing like an auth problem and is why it is called out here.
    allowHeaders: ["authorization", "content-type"],
  })(c, next),
);

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "agentdrive-api",
    database: c.env.DATABASE_URL ? "configured" : "not configured",
    storage: c.env.S3_ACCESS_KEY_ID ? "configured" : "not configured",
    auth: c.env.CLERK_SECRET_KEY ? "configured" : "not configured",
  }),
);

/*
  The raw storage layer — a debugging surface, not part of the product API, and
  off unless ENABLE_RAW_STORAGE_ROUTES is exactly "true".

  These routes take a bucket and an object key straight from the request and
  hand back a presigned URL, which is a working credential for that object.
  Requiring a token would establish *who* is calling but not *what they may
  reach*: storage keys are `drives/<driveId>/<fileId>` with no tenant prefix, so
  there is nothing for an authenticated request to be constrained to, and any
  signed-in user could still mint a URL for anyone else's object.

  Fixing that properly means prefixing keys per Pod — a storage change, not an
  auth one, and one that has to migrate existing objects. Until then the only
  honest setting is off, so a deployment cannot expose the surface by omission.
  The product path is unaffected: /v1/drives/:driveId/files derives its key from
  a scoped database row and presigns that, never a client-supplied one.

  Enable locally with ENABLE_RAW_STORAGE_ROUTES="true" in workers/api/.dev.vars.
*/
app.use("/buckets/*", async (c, next) => {
  if (!rawStorageRoutesEnabled(c.env)) {
    // 404, not 403: an endpoint that is switched off should not advertise that
    // it exists and could be switched on.
    return c.json(
      { error: { code: "not_found", message: "Not found." } },
      404,
    );
  }
  await next();
});

app.route("/buckets", bucketRoutes);
app.route("/buckets/:bucket/objects", objectRoutes);

/**
 * The product API. Versioned from the start: these are the routes an external
 * client will eventually hold, and adding `/v1` later means breaking them.
 *
 * The `/buckets` routes above are the raw storage layer and are not part of it.
 */
app.route("/v1/drives", driveRoutes);
app.route("/v1/drives/:driveId/files", driveFileRoutes);
app.route("/v1/drives/:driveId/share", driveShareRoutes);
app.route("/v1/drives/:driveId/uploads", driveUploadRoutes);
app.route("/v1/files", fileRoutes);
app.route("/v1/items", itemRoutes);
app.route("/v1/items/:itemId/share", itemShareRoutes);
app.route("/v1/items/:itemId/upload", itemUploadRoutes);
app.route("/v1/uploads", uploadRoutes);

/**
 * The public share surface — the only routes here that serve a caller with no
 * token of their own. Their authorization is the share token, checked by the
 * Sharing module on every request; see the note at the top of routes/shares.ts.
 */
app.route("/v1/shares", shareRoutes);

/**
 * Proves the Prisma-on-workerd path actually works: driver adapter, generated
 * client, and a real round trip to Neon. Deliberately a count rather than a
 * read of any domain data, so it stays a connectivity probe and never becomes
 * an unscoped way to see what is in someone's drive.
 */
app.get("/health/db", async (c) => {
  const db = requireDb(c.env);

  const [accounts, pods, drives, items] = await Promise.all([
    db.account.count(),
    db.pod.count(),
    db.drive.count(),
    db.item.count(),
  ]);

  return c.json({
    ok: true,
    driver: "prisma + @prisma/adapter-neon",
    counts: { accounts, pods, drives, items },
  });
});

/**
 * One error shape for the whole API: `{ error: { code, message } }`.
 *
 * StorageError already carries the right HTTP status, so a route never has to
 * translate storage failures itself.
 */
app.onError((err, c) => {
  if (isTransferError(err)) {
    return c.json(
      {
        error: {
          code: err.code,
          message: err.message,
          ...(err.details ? { details: err.details } : {}),
        },
      },
      transferErrorStatus(err),
    );
  }

  /*
    Sharing decides its own status, and the codes are deliberately few: one
    404 covers unknown, revoked, dead-subject, and out-of-subtree alike, so a
    probing client cannot tell them apart. Preserving that here means never
    re-deriving a status from the message.
  */
  if (isSharingError(err)) {
    return c.json(
      { error: { code: err.code, message: err.message } },
      sharingErrorStatus(err),
    );
  }

  if (isStorageError(err)) {
    return c.json({ error: { code: err.code, message: err.message } }, err.status);
  }

  if (err instanceof FilesystemError) {
    const status = err.code === "invalid_input"
      ? 400
      : err.code === "drive_not_found" || err.code === "item_not_found"
        ? 404
        : 409;
    return c.json(
      { error: { code: err.code, message: err.message } },
      status,
    );
  }

  if (err instanceof HTTPException) {
    /*
      One envelope, but the code has to distinguish these — the client acts on
      them differently. A 401 means "get a new token and retry"; a 503 means
      "this deployment is misconfigured, retrying changes nothing". Collapsing
      both to "unavailable", as this used to, made a signed-out user look like
      an outage.
    */
    const code =
      err.status === 401
        ? "unauthenticated"
        : err.status === 403
          ? "forbidden"
          : "unavailable";

    return c.json({ error: { code, message: err.message } }, err.status);
  }

  console.error("Unhandled error", err);
  return c.json({ error: { code: "internal", message: "Something went wrong." } }, 500);
});

/**
 * Reconciliation, on a schedule.
 *
 * The upload path is caller-driven: a client PUTs the bytes and then tells us
 * to verify them. R2 publishes no object-level events, so when that second
 * call never arrives — a closed laptop, a crashed agent, a dropped
 * connection — nothing else would ever notice. This is what notices.
 *
 * It is bounded and idempotent, so a run that fails costs the next tick's time
 * and nothing else. Cloudflare Cron Triggers are only the transport: the work
 * itself is `transfer.reap()`, which a plain Node script can call the same way.
 */
async function scheduled(
  _event: ScheduledController,
  env: AppEnv["Bindings"],
  ctx: ExecutionContext,
): Promise<void> {
  if (!env.DATABASE_URL || !env.S3_ACCESS_KEY_ID || !env.S3_BUCKET) {
    console.warn("reaper: skipped, storage or database is not configured");
    return;
  }

  const transfer = createTransfer(
    createDb(env.DATABASE_URL),
    createObjectStore(
      createStorageClient({
        endpoint: env.S3_ENDPOINT || undefined,
        region: env.S3_REGION || "auto",
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      }),
      env.S3_BUCKET,
    ),
  );

  ctx.waitUntil(
    transfer
      .reap()
      .then((result) => {
        // Quiet when there was nothing to do; a cron that logs every tick
        // trains everyone to ignore it.
        if (result.scanned > 0) console.log("reaper", result);
      })
      .catch((error) => console.error("reaper failed", error)),
  );
}

const worker = { fetch: app.fetch, scheduled };

export default worker;
