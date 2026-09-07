import { Hono } from "hono";

import { createTransferCompatibility, DriveNotFoundError } from "@/filesystem";
import * as s from "@/schemas";
import { presignGet, presignPut } from "@/storage";

import type { AppEnv } from "../lib/env";
import { requireBucket, requireScope } from "../lib/scope";
import { requireStorage } from "../lib/storage";
import { validate } from "../lib/validation";

/** Existing transfer transport, backed by Item metadata during the cutover. */
export const driveFileRoutes = new Hono<AppEnv>();

driveFileRoutes.post("/", validate("json", s.createFileInput), async (c) => {
  const { db, scope } = await requireScope(c.env, c.req.raw);
  const bucket = requireBucket(c.env);
  const body = c.req.valid("json");
  const driveId = c.req.param("driveId");
  if (!driveId) throw new DriveNotFoundError();

  const transfer = createTransferCompatibility(db);
  const { item, storageKey } = await transfer.reserveFile(scope, {
    driveId,
    parentId: body.parentId ?? body.folderId ?? null,
    name: body.name,
    contentType: body.contentType ?? null,
    sizeBytes: body.sizeBytes ?? null,
    storageBucket: bucket,
    clientId: body.clientId,
  });
  const upload = await presignPut(
    requireStorage(c.env),
    bucket,
    storageKey,
    body.contentType ?? undefined,
  );
  return c.json({ item, upload }, 201);
});

export const fileRoutes = new Hono<AppEnv>();

fileRoutes.post(
  "/:fileId/status",
  validate("json", s.fileStatusInput),
  async (c) => {
    const { db, scope } = await requireScope(c.env, c.req.raw);
    const item = await createTransferCompatibility(db).setFileStatus(
      scope,
      c.req.param("fileId"),
      c.req.valid("json").status,
    );
    return c.json({ item });
  },
);

fileRoutes.get("/:fileId/download", async (c) => {
  const { db, scope } = await requireScope(c.env, c.req.raw);
  const file = await createTransferCompatibility(db).getDownload(
    scope,
    c.req.param("fileId"),
  );
  const download = await presignGet(
    requireStorage(c.env),
    file.storageBucket,
    file.storageKey,
    file.name,
  );
  return c.json({ download });
});
