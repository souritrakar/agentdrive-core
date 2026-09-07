import { PrismaNeon } from "@prisma/adapter-neon";

import { PrismaClient } from "@/generated/prisma/client";

/**
 * Runtime-agnostic Prisma client factory.
 *
 * The connection string is always passed in rather than read from the
 * environment, so the same code runs in Node, in Next.js server components, and
 * inside `workerd` — where `process.env` does not exist. Per-runtime entry
 * points stay thin: see `src/db/index.ts` for the Next.js one, and the Worker
 * builds its own from Hono's `c.env`.
 *
 * Prisma 7 has no Rust query engine in the SQL path — queries go through a
 * driver adapter — which is what makes this work on Workers at all, without
 * Prisma Accelerate or any other hosted proxy in the request path.
 *
 * `PrismaNeon` is the WebSocket-pool adapter rather than `PrismaNeonHttp`,
 * because the HTTP driver cannot hold an interactive transaction open and
 * multi-row writes here are transactional by policy. See
 * docs/architecture/backend-principles.md §3.
 */
export function createDb(connectionString: string): Db {
  const adapter = new PrismaNeon({ connectionString });
  return new PrismaClient({ adapter });
}

export type Db = PrismaClient;
