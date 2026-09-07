/**
 * Upload session routes.
 *
 * Thin by design: authenticate, resolve scope, validate, call one Transfer
 * operation, serialize. Every decision about state, ordering, and verification
 * lives in the module, so there is exactly one place to read it and exactly one
 * place a bug can hide.
 *
 * The minting of a presigned URL is the authorization point. Every URL these
 * routes hand out is for a key the server computed from a row it already
 * checked against the caller's scope — a client never names a bucket, a key,
 * or an upload it does not own.
 */

import { Hono } from "hono";

import { DriveNotFoundError, ItemNotFoundError } from "@/filesystem";
import * as s from "@/schemas";
import { createTransfer, createObjectStore } from "@/transfer";

import type { AppEnv } from "../lib/env";
import { requireBucket, requireScope } from "../lib/scope";
import { requireStorage } from "../lib/storage";
import { validate } from "../lib/validation";

function transferFor(env: AppEnv["Bindings"], db: Parameters<typeof createTransfer>[0]) {
  return createTransfer(
    db,
    createObjectStore(requireStorage(env), requireBucket(env)),
  );
}

/** Mounted under /v1/drives/:driveId/uploads. */
export const driveUploadRoutes = new Hono<AppEnv>();

driveUploadRoutes.post("/", validate("json", s.reserveUploadInput), async (c) => {
  const { db, scope } = await requireScope(c.env, c.req.raw);
  const driveId = c.req.param("driveId");
  if (!driveId) throw new DriveNotFoundError();

  const body = c.req.valid("json");
  const result = await transferFor(c.env, db).reserve(scope, {
    driveId,
    parentId: body.parentId ?? null,
    name: body.name,
    contentType: body.contentType ?? null,
    sizeBytes: body.sizeBytes ?? null,
    clientId: body.clientId,
    mode: body.mode,
  });

  return c.json(result, 201);
});

/** Mounted under /v1/uploads. */
export const uploadRoutes = new Hono<AppEnv>();

/**
 * Session state, plus what storage is holding.
 *
 * This is the whole of resume: a client that lost its progress asks what
 * landed and sends the difference. Nothing it remembered has to be correct.
 */
uploadRoutes.get("/:uploadId", async (c) => {
  const { db, scope } = await requireScope(c.env, c.req.raw);
  return c.json(
    await transferFor(c.env, db).status(scope, c.req.param("uploadId")),
  );
});

uploadRoutes.post(
  "/:uploadId/part-urls",
  validate("json", s.partUrlsInput),
  async (c) => {
    const { db, scope } = await requireScope(c.env, c.req.raw);
    const partUrls = await transferFor(c.env, db).partUrls(
      scope,
      c.req.param("uploadId"),
      c.req.valid("json").partNumbers,
    );
    return c.json({ partUrls });
  },
);

/**
 * Finish the upload.
 *
 * Takes no body on purpose. The server asks storage what arrived; a client
 * cannot assert that bytes exist, only that it is done sending them.
 */
uploadRoutes.post("/:uploadId/complete", async (c) => {
  const { db, scope } = await requireScope(c.env, c.req.raw);
  const item = await transferFor(c.env, db).complete(
    scope,
    c.req.param("uploadId"),
  );
  return c.json({ item });
});

uploadRoutes.post("/:uploadId/abort", async (c) => {
  const { db, scope } = await requireScope(c.env, c.req.raw);
  const item = await transferFor(c.env, db).abort(
    scope,
    c.req.param("uploadId"),
  );
  return c.json({ item });
});

/** Mounted under /v1/items/:itemId/upload — a new attempt for a failed file. */
export const itemUploadRoutes = new Hono<AppEnv>();

itemUploadRoutes.post("/retry", async (c) => {
  const { db, scope } = await requireScope(c.env, c.req.raw);
  // Supplied by the mount path rather than this sub-app's own pattern, so
  // TypeScript cannot know it is present.
  const itemId = c.req.param("itemId");
  if (!itemId) throw new ItemNotFoundError();

  const result = await transferFor(c.env, db).retry(scope, itemId);
  return c.json(result, 201);
});
