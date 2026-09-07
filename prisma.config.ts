import { config as loadEnv } from "dotenv";
import { defineConfig, env } from "prisma/config";

// The app keeps its secrets in .env.local (Next.js convention, gitignored).
// Prisma only reads .env by default, so point it at the same file rather than
// maintaining two copies of the connection string.
loadEnv({ path: ".env.local", quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // CLI-only. Under Prisma 7 the runtime connection comes from the driver
    // adapter (see src/db/client.ts), so this URL is used solely by
    // `prisma migrate` and `prisma studio`.
    //
    // It is deliberately the DIRECT (unpooled) connection: DDL needs advisory
    // locks and session state that PgBouncer in transaction mode cannot hold.
    // DIRECT_URL is the same database without the `-pooler` host segment.
    url: env("DIRECT_URL"),
  },
});
