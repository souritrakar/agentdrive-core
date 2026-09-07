/**
 * Share routes — the owner's controls, and the public surface a link opens.
 *
 * Thin by the same rule as every other route file: authorize, validate, call
 * one Sharing operation, serialize. Nothing here decides what a token may
 * reach; that is the module's containment walk, and duplicating any part of it
 * at the transport would create a second authorization implementation to drift.
 *
 * Nothing here logs. If that ever changes, log the share `id` returned by a
 * resolution — never the token, which is the credential itself
 * (docs/architecture/sharing/02-public-access-security.md §2, §6).
 *
 * Routes: docs/architecture/sharing/01-sharing-module.md §5.
 */

import { Hono } from "hono";

import { DriveNotFoundError, ItemNotFoundError } from "@/filesystem";
import * as s from "@/schemas";
import { createSharing, type ShareSubject } from "@/sharing";
import { presignGet, SHARE_PRESIGN_EXPIRES_IN } from "@/storage";

import type { AppEnv } from "../lib/env";
import { requireDb, requireScope } from "../lib/scope";
import { requireStorage } from "../lib/storage";
import { validate } from "../lib/validation";

// ---------------------------------------------------------------------------
// Owner face
//
// Ordinary authenticated routes: `requireScope` resolves the caller's Account
// and Pod server-side, and the module re-checks the subject against that scope,
// so a Drive or Item id belonging to someone else is a 404 rather than a leak.
// ---------------------------------------------------------------------------

/**
 * Four operations, two subjects, one shape.
 *
 * Drive and Item shares differ only in how the subject is named, so the
 * handlers are written once and bound to both mounts. Writing them twice would
 * be eight places for the envelope or the status code to disagree.
 */
function ownerShareRoutes(
  subjectFrom: (c: { req: { param: (name: string) => string | undefined } }) => ShareSubject,
) {
  const routes = new Hono<AppEnv>();

  /*
    Create-or-return, and therefore 200 rather than 201.

    A second POST with the same subject returns the share that already exists —
    that is the point, it is what makes a double-clicked Share button safe — so
    the route cannot honestly claim "Created" on every call. The module settles
    the race in Postgres via the partial unique index, not by asking first.
  */
  routes.post("/", async (c) => {
    const { db, scope } = await requireScope(c.env, c.req.raw);
    const subject = subjectFrom(c);
    const sharing = createSharing(db);
    const share =
      subject.kind === "DRIVE"
        ? await sharing.shareDrive(scope, subject.driveId)
        : await sharing.shareItem(scope, subject.itemId);
    return c.json({ share });
  });

  /** `{ share: null }` is the answer the dialog opens on. Not a 404: the caller
   *  asked about a subject they own, and "not shared" is a fact about it. */
  routes.get("/", async (c) => {
    const { db, scope } = await requireScope(c.env, c.req.raw);
    const share = await createSharing(db).getShareForSubject(
      scope,
      subjectFrom(c),
    );
    return c.json({ share });
  });

  routes.patch("/", validate("json", s.updateShareInput), async (c) => {
    const { db, scope } = await requireScope(c.env, c.req.raw);
    const share = await createSharing(db).updateShare(
      scope,
      subjectFrom(c),
      c.req.valid("json"),
    );
    return c.json({ share });
  });

  /** Idempotent: revoking an already-revoked share is still 204. */
  routes.delete("/", async (c) => {
    const { db, scope } = await requireScope(c.env, c.req.raw);
    await createSharing(db).revokeShare(scope, subjectFrom(c));
    return c.body(null, 204);
  });

  return routes;
}

/*
  The mount always supplies the parameter, so the guards below are unreachable
  in practice — they exist so that a future re-mount at a path without it fails
  as a 404 rather than by handing the module an empty id to look up. Same
  pattern as routes/files.ts and routes/uploads.ts.
*/

/** Mounted under /v1/drives/:driveId/share. */
export const driveShareRoutes = ownerShareRoutes((c) => {
  const driveId = c.req.param("driveId");
  if (!driveId) throw new DriveNotFoundError();
  return { kind: "DRIVE", driveId };
});

/** Mounted under /v1/items/:itemId/share. */
export const itemShareRoutes = ownerShareRoutes((c) => {
  const itemId = c.req.param("itemId");
  if (!itemId) throw new ItemNotFoundError();
  return { kind: "ITEM", itemId };
});

// ---------------------------------------------------------------------------
// Public face
//
// These four handlers deliberately do not call `requireScope`, and that is the
// design rather than an omission.
//
// Protection in this Worker has always been per-route: every authenticated
// route resolves its own scope, and there is no path-matching middleware whose
// list could drift and fail open. A public share route is therefore not a hole
// carved out of a blanket rule — it is a route whose authorization step is
// `resolveShare(token)` instead of `requireScope(request)`. Both are one
// explicit call, and a handler with neither would fail review.
//
// Two properties keep that safe, and both belong to the module, not here:
// the tenant scope is derived from the share row (the caller never names a Pod
// or a Drive), and every visitor-supplied item id goes through the containment
// walk before any hierarchy or byte pointer is read.
//
// Everything behind a token is a GET. There is no write anywhere on this
// surface, so the worst a leaked link yields is what its owner chose to
// publish. See docs/architecture/sharing/02-public-access-security.md §5.
// ---------------------------------------------------------------------------

/** Mounted under /v1/shares. */
export const shareRoutes = new Hono<AppEnv>();

/*
  Response hygiene for the whole public surface, set in one place so a new
  route cannot be added without it.

  - `X-Robots-Tag: noindex` — a share link is unlisted, not public in the
    search-engine sense, and crawlers reach the API independently of the page.
  - `Referrer-Policy: no-referrer` — belt and braces. The load-bearing copy of
    this header is on the /share/* pages, where the token sits in the URL and a
    referrer *is* the credential; a header on a JSON response governs nothing
    by itself, but the two surfaces should not disagree about the policy.
  - `Cache-Control: private, no-store` — these responses carry presigned URLs
    and the contents of someone's folder. Neither belongs in a shared cache,
    and a token in the path makes every such response look cacheable per-URL.
*/
shareRoutes.use("*", async (c, next) => {
  await next();
  c.header("X-Robots-Tag", "noindex");
  c.header("Referrer-Policy", "no-referrer");
  c.header("Cache-Control", "private, no-store");
});

/** What this link shows: the subject, and the settings a viewer must respect. */
shareRoutes.get("/:token", async (c) => {
  const view = await createSharing(requireDb(c.env)).resolveShare(
    c.req.param("token"),
  );
  return c.json(view);
});

/**
 * One level inside a shared Drive or Folder.
 *
 * `folderId` is a visitor-supplied id and is treated as such: the module walks
 * it back to the share's subject before listing anything, so a folder from
 * another drive — or one above the grant — is the same 404 as a bad token.
 */
shareRoutes.get(
  "/:token/contents",
  validate("query", s.sharedContentsQuery),
  async (c) => {
    const query = c.req.valid("query");
    const page = await createSharing(requireDb(c.env)).listSharedContents(
      c.req.param("token"),
      {
        folderId: query.folderId ?? null,
        cursor: query.cursor,
        limit: query.limit,
        includeChildCounts: true,
      },
    );
    return c.json(page);
  },
);

/** Metadata for the single-file viewer. Never a byte pointer. */
shareRoutes.get("/:token/items/:itemId", async (c) => {
  const item = await createSharing(requireDb(c.env)).getSharedFileView(
    c.req.param("token"),
    c.req.param("itemId"),
  );
  return c.json({ item });
});

/**
 * The one route that reaches toward bytes, and the authorization point for
 * them — the same property the upload routes have.
 *
 * The bucket and key are read off the row the containment walk just validated;
 * a visitor never names a storage coordinate. The disposition and the content
 * type both come back from the module rather than from the request: whether
 * bytes may be rendered in a browser is an authorization decision (the inline
 * allowlist), and echoing a caller-supplied content type to a third party is
 * how an uploaded SVG becomes someone else's XSS.
 */
shareRoutes.get(
  "/:token/items/:itemId/download",
  validate("query", s.shareDispositionQuery),
  async (c) => {
    const file = await createSharing(requireDb(c.env)).getSharedDownload(
      c.req.param("token"),
      c.req.param("itemId"),
      c.req.valid("query").disposition,
    );

    const download = await presignGet(
      requireStorage(c.env),
      file.storageBucket,
      file.storageKey,
      file.name,
      {
        disposition: file.disposition,
        contentType: file.contentType,
        expiresIn: SHARE_PRESIGN_EXPIRES_IN,
      },
    );

    return c.json({ download });
  },
);
