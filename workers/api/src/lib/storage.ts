import { HTTPException } from "hono/http-exception";

import { createStorageClient, type StorageClient } from "@/storage";

import type { Bindings } from "./env";

/**
 * Build a storage client from Worker bindings.
 *
 * Mirrors `requireDb` in index.ts: routes that need storage call this and get a
 * 503 with a fixable message if the secrets are missing, rather than an opaque
 * SDK error at the first API call.
 */
export function requireStorage(env: Bindings): StorageClient {
  if (!env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
    throw new HTTPException(503, {
      message:
        "S3 credentials are not set. Add S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY to workers/api/.dev.vars locally, or `wrangler secret put` them in production.",
    });
  }

  return createStorageClient({
    endpoint: env.S3_ENDPOINT || undefined,
    region: env.S3_REGION || "auto",
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  });
}
