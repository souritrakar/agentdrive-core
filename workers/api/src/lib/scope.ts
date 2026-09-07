import { HTTPException } from "hono/http-exception";

import { createDb, type Db } from "@/db/client";
import { AccountDeletedError, resolveScope, type Scope } from "@/db/scope";

import { requireIdentity } from "./auth";
import type { Bindings } from "./env";

/**
 * A database client, or a 503 that says which binding is missing.
 *
 * Split out from `requireScope` because the public share routes need a
 * database and deliberately have no scope: their authorization is the share
 * token, resolved by the Sharing module, not an identity. Every other data
 * route still goes through `requireScope`, which calls this itself — so
 * "database without scope" remains a visible, deliberate choice at the call
 * site rather than something a route can drift into.
 */
export function requireDb(env: Bindings): Db {
  if (!env.DATABASE_URL) {
    throw new HTTPException(503, {
      message:
        "DATABASE_URL is not set. Add it to workers/api/.dev.vars locally, or `wrangler secret put DATABASE_URL` in production.",
    });
  }
  return createDb(env.DATABASE_URL);
}

/**
 * Resolves the database client and tenant scope for a request.
 *
 * Every data route starts here, and no route receives a scope from the client.
 * That second half is the important one: a `podId` or `accountId` taken from a
 * query string would be a request to be someone else, and there is no code path
 * in this Worker that accepts one. The scope is *derived* — from a verified
 * token, through the account it maps to — so a caller cannot name a tenant they
 * are not.
 */
export async function requireScope(
  env: Bindings,
  request: Request,
): Promise<{ db: Db; scope: Scope }> {
  if (!env.DATABASE_URL) {
    throw new HTTPException(503, {
      message:
        "DATABASE_URL is not set. Add it to workers/api/.dev.vars locally, or `wrangler secret put DATABASE_URL` in production.",
    });
  }

  // Before the database is touched. An unauthenticated request should cost us
  // a signature check and nothing else — not a connection from the pool.
  const identity = await requireIdentity(env, request);

  const db = requireDb(env);

  try {
    const scope = await resolveScope(db, identity);
    return { db, scope };
  } catch (error) {
    /*
      The token is valid but the account behind it is gone — Clerk's
      `user.deleted` webhook soft-deleted the row while this session token was
      still within its lifetime.

      401 rather than 403: the correct client behaviour is to discard the
      session and stop, which is what a 401 means. A 403 would suggest that a
      different token might work, and none will.
    */
    if (error instanceof AccountDeletedError) {
      throw new HTTPException(401, { message: error.message });
    }
    throw error;
  }
}

/** The bucket every object goes into. One bucket, opaque per-drive key prefixes. */
export function requireBucket(env: Bindings): string {
  if (!env.S3_BUCKET) {
    throw new HTTPException(503, {
      message: "S3_BUCKET is not configured.",
    });
  }
  return env.S3_BUCKET;
}
