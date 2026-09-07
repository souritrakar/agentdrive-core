import { createDb, type Db } from "./client";

export { createDb } from "./client";
export type { Db } from "./client";

/** False until DATABASE_URL is present. Lets callers render an empty state. */
export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

function requireDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy it from the Neon project into .env.local.",
    );
  }
  return url;
}

// Next.js dev reloads modules on every edit. Without a global cache each reload
// would build a new client and a new connection pool, and Neon would start
// refusing connections after a few dozen saves.
const globalForDb = globalThis as unknown as { db?: Db };

/**
 * Server-side client for the Next.js app.
 *
 * Constructed lazily behind a Proxy so that importing this module never throws
 * at build time in an environment that has no database configured. Workers must
 * use `createDb(url)` directly — there is no `process.env` there.
 */
export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    globalForDb.db ??= createDb(requireDatabaseUrl());
    return Reflect.get(globalForDb.db, prop, receiver);
  },
});
