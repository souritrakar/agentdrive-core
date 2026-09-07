import { Hono } from "hono";

import { createFilesystem } from "@/filesystem";
import * as s from "@/schemas";

import type { AppEnv } from "../lib/env";
import { requireScope } from "../lib/scope";
import { validate } from "../lib/validation";

/** Thin transport for metadata-only Item mutations. */
export const itemRoutes = new Hono<AppEnv>();

itemRoutes.patch(
  "/:itemId",
  validate("json", s.renameItemInput),
  async (c) => {
    const { db, scope } = await requireScope(c.env, c.req.raw);
    const item = await createFilesystem(db).renameItem(
      scope,
      c.req.param("itemId"),
      c.req.valid("json").name,
    );
    return c.json({ item });
  },
);

itemRoutes.post(
  "/:itemId/move",
  validate("json", s.moveItemInput),
  async (c) => {
    const { db, scope } = await requireScope(c.env, c.req.raw);
    const result = await createFilesystem(db).moveItem(
      scope,
      c.req.param("itemId"),
      c.req.valid("json").newParentId,
    );
    return c.json(result);
  },
);

itemRoutes.delete("/:itemId", async (c) => {
  const { db, scope } = await requireScope(c.env, c.req.raw);
  const result = await createFilesystem(db).trashItem(
    scope,
    c.req.param("itemId"),
  );
  return c.json(result);
});

itemRoutes.post("/:itemId/restore", async (c) => {
  const { db, scope } = await requireScope(c.env, c.req.raw);
  const item = await createFilesystem(db).restoreItem(
    scope,
    c.req.param("itemId"),
  );
  return c.json({ item });
});
