import { Hono } from "hono";

import { createFilesystem } from "@/filesystem";
import * as s from "@/schemas";

import type { AppEnv } from "../lib/env";
import { requireScope } from "../lib/scope";
import { validate } from "../lib/validation";

/** Thin transport for Drive and folder metadata operations. */
export const driveRoutes = new Hono<AppEnv>();

driveRoutes.get("/", validate("query", s.pagination), async (c) => {
  const { db, scope } = await requireScope(c.env, c.req.raw);
  const page = c.req.valid("query");
  const result = await createFilesystem(db).listDrives(scope, {
    cursor: page.cursor,
    limit: page.limit,
    includeChildCounts: true,
  });
  return c.json(result);
});

driveRoutes.post("/", validate("json", s.createDriveInput), async (c) => {
  const { db, scope } = await requireScope(c.env, c.req.raw);
  const drive = await createFilesystem(db).createDrive(
    scope,
    c.req.valid("json"),
  );
  return c.json({ drive }, 201);
});

driveRoutes.get(
  "/:driveId/contents",
  validate("query", s.folderQuery),
  async (c) => {
    const { db, scope } = await requireScope(c.env, c.req.raw);
    const query = c.req.valid("query");
    const page = await createFilesystem(db).listFolder(scope, {
      driveId: c.req.param("driveId"),
      parentId: query.parentId ?? query.folderId ?? null,
      cursor: query.cursor,
      limit: query.limit,
      includeChildCounts: true,
    });
    return c.json(page);
  },
);

driveRoutes.post(
  "/:driveId/folders",
  validate("json", s.createFolderInput),
  async (c) => {
    const { db, scope } = await requireScope(c.env, c.req.raw);
    const body = c.req.valid("json");
    const item = await createFilesystem(db).createFolder(scope, {
      driveId: c.req.param("driveId"),
      parentId: body.parentId ?? body.parentFolderId ?? null,
      name: body.name,
      clientId: body.clientId,
    });
    return c.json({ item }, 201);
  },
);

driveRoutes.get(
  "/:driveId/trash",
  validate("query", s.pagination),
  async (c) => {
    const { db, scope } = await requireScope(c.env, c.req.raw);
    const query = c.req.valid("query");
    const page = await createFilesystem(db).listTrash(
      scope,
      c.req.param("driveId"),
      query,
    );
    return c.json(page);
  },
);

driveRoutes.patch(
  "/:driveId",
  validate("json", s.renameDriveInput),
  async (c) => {
    const { db, scope } = await requireScope(c.env, c.req.raw);
    const drive = await createFilesystem(db).renameDrive(
      scope,
      c.req.param("driveId"),
      c.req.valid("json").name,
    );
    return c.json({ drive });
  },
);

driveRoutes.delete("/:driveId", async (c) => {
  const { db, scope } = await requireScope(c.env, c.req.raw);
  await createFilesystem(db).trashDrive(scope, c.req.param("driveId"));
  return c.body(null, 204);
});

driveRoutes.post("/:driveId/restore", async (c) => {
  const { db, scope } = await requireScope(c.env, c.req.raw);
  const drive = await createFilesystem(db).restoreDrive(
    scope,
    c.req.param("driveId"),
  );
  return c.json({ drive });
});
