import { db, isDatabaseConfigured } from "@/db";

/**
 * Database connectivity check for the Next.js (Node) runtime.
 *
 * The Worker has its own at `GET /health/db`; this one exercises the same
 * generated client and driver adapter from the other side, which is the point
 * — one Prisma client has to work in both runtimes.
 *
 * Route Handlers are uncached by default in Next 16, so this always reflects
 * live state.
 */
export async function GET() {
  if (!isDatabaseConfigured()) {
    return Response.json(
      { ok: false, error: "DATABASE_URL is not set." },
      { status: 503 },
    );
  }

  const [accounts, pods, drives, items] = await Promise.all([
    db.account.count(),
    db.pod.count(),
    db.drive.count(),
    db.item.count(),
  ]);

  return Response.json({
    ok: true,
    runtime: "nodejs",
    driver: "prisma + @prisma/adapter-neon",
    counts: { accounts, pods, drives, items },
  });
}
