import { Hono } from "hono";
import { z } from "zod";

import * as s from "@/schemas";
import { createBucket, listBuckets } from "@/storage";

import { allowedOrigins, type AppEnv } from "../lib/env";
import { requireStorage } from "../lib/storage";
import { validate } from "../lib/validation";

/**
 * Bucket collection routes. Mounted at /buckets.
 *
 * There is no delete: R2 requires a bucket be empty first, and removing a whole
 * workspace is not part of this milestone.
 */
export const bucketRoutes = new Hono<AppEnv>();

bucketRoutes.get("/", async (c) => {
  const buckets = await listBuckets(requireStorage(c.env));
  return c.json({ buckets });
});

bucketRoutes.post(
  "/",
  validate("json", z.object({ name: s.bucketName })),
  async (c) => {
    const { name } = c.req.valid("json");

    const bucket = await createBucket(requireStorage(c.env), name, allowedOrigins(c.env));

    return c.json({ bucket }, 201);
  },
);
