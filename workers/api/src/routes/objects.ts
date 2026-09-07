import { Hono } from "hono";
import { z } from "zod";

import * as s from "@/schemas";
import { deleteObject, listObjects, presignGet, presignPut } from "@/storage";

import type { AppEnv } from "../lib/env";
import { requireStorage } from "../lib/storage";
import { validate } from "../lib/validation";

/**
 * Object routes. Mounted at /buckets/:bucket/objects.
 *
 * Object keys arrive percent-encoded, so a key never spans path segments and
 * `:key` stays a single parameter.
 */
export const objectRoutes = new Hono<AppEnv>();

const bucketOf = (c: { req: { param: (k: string) => string | undefined } }) =>
  decodeURIComponent(c.req.param("bucket") ?? "");

objectRoutes.get(
  "/",
  validate(
    "query",
    z.object({
      prefix: z.string().max(1024).optional(),
      cursor: z.string().max(1024).optional(),
    }),
  ),
  async (c) => {
    const { prefix, cursor } = c.req.valid("query");

    const page = await listObjects(requireStorage(c.env), bucketOf(c), { prefix, cursor });
    return c.json(page);
  },
);

objectRoutes.post(
  "/presign-put",
  validate("json", z.object({ key: s.objectKey, contentType: s.optionalContentType })),
  async (c) => {
    const { key, contentType } = c.req.valid("json");

    const presigned = await presignPut(requireStorage(c.env), bucketOf(c), key, contentType);

    return c.json(presigned);
  },
);

objectRoutes.get("/:key/presign-get", async (c) => {
  const key = decodeURIComponent(c.req.param("key"));
  const presigned = await presignGet(
    requireStorage(c.env),
    bucketOf(c),
    key,
    c.req.query("filename") ?? key,
  );
  return c.json(presigned);
});

objectRoutes.delete("/:key", async (c) => {
  await deleteObject(requireStorage(c.env), bucketOf(c), decodeURIComponent(c.req.param("key")));
  return c.body(null, 204);
});
