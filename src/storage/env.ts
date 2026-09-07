/**
 * Node-only environment wiring.
 *
 * Kept out of `index.ts` on purpose: the Cloudflare Worker compiles against
 * `@cloudflare/workers-types`, where `process` does not exist. The Worker
 * builds its config from `c.env` instead — see `workers/api/src/lib/storage.ts`.
 *
 * Import this from scripts and Node-side code only.
 */

import type { StorageConfig } from "./client";

/** False until the S3_* vars are filled in. */
export function isStorageConfigured(): boolean {
  return Boolean(process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY);
}

export function envStorageConfig(): StorageConfig {
  if (!isStorageConfigured()) {
    throw new Error(
      "S3 storage is not configured. Set S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY in .env.local.",
    );
  }

  return {
    endpoint: process.env.S3_ENDPOINT || undefined,
    region: process.env.S3_REGION || "auto",
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  };
}
