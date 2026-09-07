/**
 * The two faces, and the one resolution spine they both run.
 *
 * Everything public in this module funnels through `resolve`: token lookup,
 * subject liveness, owner-scope derivation, and — when the visitor names an
 * item — a rootward containment walk. There is exactly one implementation of
 * "may this link show that", so the Next.js first paint and the Worker's JSON
 * routes cannot drift into disagreeing about it.
 */

import type { Db } from "@/db/client";
import type { Scope } from "@/db/scope";
import {
  FilesystemError,
  ItemNotFoundError,
  type FolderPage,
  type Item,
  type PageInput,
} from "@/filesystem";

import { DownloadNotAllowedError, ShareNotFoundError } from "../errors";
import { attachmentContentType, inlineContentType } from "../preview";
import { mintShareToken, requireShareTokenShape } from "../token";
import type {
  Share,
  ShareDisposition,
  SharedDownload,
  SharedView,
  ShareSubject,
  SharingFileMetadata,
  SharingFilesystem,
} from "../types";
import {
  findActiveBySubject,
  findActiveByToken,
  insertShare,
  isUniqueViolation,
  revokeBySubject,
  serializeShare,
  updateActiveBySubject,
  type ShareRecord,
} from "./shares";

export type Deps = {
  db: Db;
  filesystem: SharingFilesystem;
  files: SharingFileMetadata;
};

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Confirms a Drive exists, is live, and belongs to this scope — and returns it.
 *
 * Goes through `listFolder` rather than a private drive read because that is
 * the seam: it already throws `DriveNotFoundError` for a missing or trashed
 * Drive and hands back the Drive summary the visitor needs. `limit: 1` keeps
 * the listing it also performs down to a single row we discard.
 */
async function readLiveDrive(
  deps: Deps,
  scope: Scope,
  driveId: string,
): Promise<FolderPage["drive"]> {
  const page = await deps.filesystem.listFolder(scope, {
    driveId,
    parentId: null,
    limit: 1,
  });
  return page.drive;
}

/**
 * The item and its live ancestors, root-first — or nothing.
 *
 * Thin wrapper so that every caller in this file gets the same fail-closed
 * behaviour and nobody is tempted to interpret a partial trail.
 */
async function readTrail(
  deps: Deps,
  scope: Scope,
  driveId: string | null,
  itemId: string,
): Promise<Item[]> {
  return deps.filesystem.readItemTrail(scope, driveId, itemId);
}

// ---------------------------------------------------------------------------
// Owner face
// ---------------------------------------------------------------------------

/**
 * Create-or-return, race-safe.
 *
 * The partial unique index is the arbiter, not a `SELECT` first: two tabs
 * clicking Share at the same moment both attempt the insert, one wins, and the
 * loser re-reads the winner's row. A read-then-write would produce two links to
 * the same folder, which is precisely the state the index exists to forbid.
 *
 * No transaction, and that is deliberate: this writes one row. The subject
 * liveness check above it can go stale in the same instant — the owner trashes
 * the folder between the check and the insert — and the outcome is a share row
 * pointing at a trashed subject, which resolution already treats as dark. If
 * they restore it, the link works, which is what they would want anyway. A
 * transaction would not prevent that race (the item row is not locked by it)
 * and would hold a connection for no gain.
 */
async function createOrReturn(
  deps: Deps,
  scope: Scope,
  subject: ShareSubject,
  driveId: string,
): Promise<Share> {
  const existing = await findActiveBySubject(deps.db, scope, subject);
  if (existing) return serializeShare(existing);

  try {
    const created = await insertShare(deps.db, scope, {
      driveId,
      itemId: subject.kind === "ITEM" ? subject.itemId : null,
      token: mintShareToken(),
    });
    return serializeShare(created);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;

    // Someone else won the race. Reading what they wrote is the whole
    // resolution: the point was one link, and one link now exists.
    const raced = await findActiveBySubject(deps.db, scope, subject);
    if (raced) return serializeShare(raced);
    throw error;
  }
}

export async function shareDrive(
  deps: Deps,
  scope: Scope,
  driveId: string,
): Promise<Share> {
  // Throws DriveNotFoundError for a missing, trashed, or out-of-scope Drive —
  // Filesystem's own error, unchanged, because the owner is a caller we are
  // allowed to be precise with.
  const drive = await readLiveDrive(deps, scope, driveId);
  return createOrReturn(deps, scope, { kind: "DRIVE", driveId: drive.id }, drive.id);
}

export async function shareItem(
  deps: Deps,
  scope: Scope,
  itemId: string,
): Promise<Share> {
  // Null drive: the row we are about to write has to be pinned to a Drive, and
  // the trail is where that Drive is discovered. An empty trail means the item
  // is missing, trashed, or someone else's — the same three cases the owner's
  // rename and move paths report as "not found".
  const trail = await readTrail(deps, scope, null, itemId);
  const item = trail.at(-1);
  // Filesystem's own error, deliberately: the owner face reports failures in
  // the vocabulary the rest of the owner API uses, so sharing a trashed item is
  // `item_not_found` exactly as renaming it would be. Only the *public* face
  // collapses everything into one denial.
  if (!item) throw new ItemNotFoundError();
  return createOrReturn(deps, scope, { kind: "ITEM", itemId: item.id }, item.driveId);
}

export async function getShareForSubject(
  deps: Deps,
  scope: Scope,
  subject: ShareSubject,
): Promise<Share | null> {
  const record = await findActiveBySubject(deps.db, scope, subject);
  return record ? serializeShare(record) : null;
}

export async function updateShare(
  deps: Deps,
  scope: Scope,
  subject: ShareSubject,
  patch: { allowDownload: boolean },
): Promise<Share> {
  const affected = await updateActiveBySubject(deps.db, scope, subject, patch);
  if (affected === 0) throw new ShareNotFoundError();

  const updated = await findActiveBySubject(deps.db, scope, subject);
  if (!updated) throw new ShareNotFoundError();
  return serializeShare(updated);
}

export async function revokeShare(
  deps: Deps,
  scope: Scope,
  subject: ShareSubject,
): Promise<void> {
  // No error when nothing was affected. Revoking an already-revoked share is
  // the state the caller asked for, and a second click on a stale dialog should
  // not raise.
  await revokeBySubject(deps.db, scope, subject);
}

// ---------------------------------------------------------------------------
// Public face — the resolution spine
// ---------------------------------------------------------------------------

type Resolved = {
  record: ShareRecord;
  /** The owner's scope, built from the row. Never from the request. */
  scope: Scope;
  subject:
    | { kind: "DRIVE"; drive: FolderPage["drive"] }
    | { kind: "ITEM"; item: Item };
};

/**
 * Token to a live subject, or `ShareNotFoundError`.
 *
 * Steps 1–3 of the spine. Note what is *not* here: any input from the caller
 * beyond the token. The Pod, the Drive, the item ids — all of it comes off the
 * row or out of the hierarchy the row points into.
 */
async function resolve(deps: Deps, token: string): Promise<Resolved> {
  const record = await findActiveByToken(deps.db, requireShareTokenShape(token));
  if (!record) throw new ShareNotFoundError();

  const scope: Scope = { accountId: record.accountId, podId: record.podId };

  try {
    if (record.itemId === null) {
      const drive = await readLiveDrive(deps, scope, record.driveId);
      return { record, scope, subject: { kind: "DRIVE", drive } };
    }

    // One predicate covers deleted *and* trashed: trashing sets deleted_at
    // across the whole subtree, with trashed_root_id as restore bookkeeping.
    const trail = await readTrail(deps, scope, record.driveId, record.itemId);
    const item = trail.at(-1);
    if (!item) throw new ShareNotFoundError();

    return { record, scope, subject: { kind: "ITEM", item } };
  } catch (error) {
    // A dead subject reaches here as Filesystem's DriveNotFoundError. To the
    // visitor that is the same "not here" as an unknown token, and it must be
    // indistinguishable from one — anything else is an oracle.
    if (error instanceof FilesystemError) throw new ShareNotFoundError();
    throw error;
  }
}

/**
 * Step 4: is the item the visitor named inside what the link grants?
 *
 * Returns the item's live trail when it is, throws when it is not. The walk
 * follows only rows with `deleted_at IS NULL`, so a trashed folder anywhere
 * between the item and the subject breaks the chain — a folder trashed inside a
 * shared drive leaves public view the moment it is trashed, with no bookkeeping
 * on the share at all.
 */
async function requireContained(
  deps: Deps,
  resolved: Resolved,
  itemId: string,
): Promise<Item[]> {
  const trail = await readTrail(
    deps,
    resolved.scope,
    resolved.record.driveId,
    itemId,
  );
  if (trail.length === 0) throw new ShareNotFoundError();

  if (resolved.subject.kind === "DRIVE") {
    // Reaching the root of the right Drive *is* the grant. The trail is already
    // pinned to that Drive, and `readItemTrail` only returns a trail that
    // reaches a root, so arriving here with rows is the proof.
    return trail;
  }

  const subjectId = resolved.subject.item.id;
  if (!trail.some((row) => row.id === subjectId)) throw new ShareNotFoundError();
  return trail;
}

export async function resolveShare(
  deps: Deps,
  token: string,
): Promise<SharedView> {
  const resolved = await resolve(deps, token);
  return {
    share: { role: "VIEWER", allowDownload: resolved.record.allowDownload },
    subject:
      resolved.subject.kind === "DRIVE"
        ? {
            kind: "DRIVE",
            drive: {
              id: resolved.subject.drive.id,
              name: resolved.subject.drive.name,
            },
          }
        : { kind: "ITEM", item: resolved.subject.item },
  };
}

export async function listSharedContents(
  deps: Deps,
  token: string,
  input: PageInput & { folderId?: string | null } = {},
): Promise<FolderPage> {
  const resolved = await resolve(deps, token);
  const { folderId = null, ...page } = input;

  // Where the listing starts when the visitor has not navigated anywhere: the
  // drive root for a Drive share, the folder itself for a Folder share.
  const subjectFolderId =
    resolved.subject.kind === "DRIVE" ? null : resolved.subject.item.id;
  const target = folderId ?? subjectFolderId;

  // A FILE subject has no listing. Asking for one is a malformed request from
  // our own UI, and an unremarkable probe from anyone else; both get the denial.
  if (
    resolved.subject.kind === "ITEM" &&
    resolved.subject.item.kind === "FILE" &&
    target === subjectFolderId
  ) {
    throw new ShareNotFoundError();
  }

  const trail = target ? await requireContained(deps, resolved, target) : [];
  if (target && trail.at(-1)?.kind !== "FOLDER") throw new ShareNotFoundError();

  let listed: FolderPage;
  try {
    listed = await deps.filesystem.listFolder(resolved.scope, {
      ...page,
      driveId: resolved.record.driveId,
      parentId: target,
    });
  } catch (error) {
    if (error instanceof FilesystemError) throw new ShareNotFoundError();
    throw error;
  }

  return { ...listed, ancestors: truncateAncestors(resolved, listed, trail) };
}

/**
 * Breadcrumbs, cut off at the grant.
 *
 * Filesystem returns ancestors all the way to the drive root, which for a
 * shared *folder* names folders the visitor was never given. Slicing the trail
 * at the subject is the whole implementation — no second ancestry query, and no
 * chance of the two disagreeing.
 *
 * `ancestors` means **strictly between the subject and the current folder**,
 * and that definition is load-bearing rather than a matter of taste. Both ends
 * of it are excluded, for different reasons:
 *
 * - The **current folder** is the page's own `<h1>`; a crumb for it would print
 *   the same name twice at two sizes. Same rule the owner's `BreadcrumbTrail`
 *   follows.
 * - The **subject** is rendered by `ShareBreadcrumbs` as its own root crumb,
 *   because for a Drive share the subject is not an Item and could never appear
 *   in this list at all. That component must prepend it, so this one must not
 *   include it.
 *
 * Returning it from here as well is what produced `shared › shared › nested`
 * on every folder share below its root (browser test pass 2026-08-28): two
 * files each added the subject, and each documented the opposite contract.
 *
 * A Drive share keeps the full chain untouched: its ancestors only ever contain
 * Items, so the Drive is already absent and the same prepend is correct.
 */
function truncateAncestors(
  resolved: Resolved,
  listed: FolderPage,
  trail: Item[],
): FolderPage["ancestors"] {
  if (resolved.subject.kind === "DRIVE") return listed.ancestors;

  const subjectId = resolved.subject.item.id;
  const start = trail.findIndex((row) => row.id === subjectId);
  if (start === -1) return [];

  // `start + 1` drops the subject, `-1` drops the current folder.
  return trail
    .slice(start + 1, -1)
    .map((row) => ({ id: row.id, name: row.name }));
}

export async function getSharedFileView(
  deps: Deps,
  token: string,
  itemId: string,
): Promise<Item> {
  const resolved = await resolve(deps, token);
  const trail = await requireContained(deps, resolved, itemId);
  const item = trail.at(-1);
  if (!item || item.kind !== "FILE") throw new ShareNotFoundError();
  return item;
}

/**
 * The only method that reaches toward bytes.
 *
 * Two refusals live here and they mean different things:
 *
 * - **`allowDownload: false`** refuses the *attachment* delivery only. Inline
 *   previews still work, because they must: a shared image with previews off is
 *   an empty page, and the setting was never a claim that the bytes cannot be
 *   obtained — an image on screen is the file. It removes the invitation, not
 *   the possibility, and the UI copy says so.
 * - **The inline allowlist** refuses *inline* delivery of anything a browser
 *   might execute. That one is not a preference and cannot be toggled.
 */
export async function getSharedDownload(
  deps: Deps,
  token: string,
  itemId: string,
  disposition: ShareDisposition,
): Promise<SharedDownload> {
  const resolved = await resolve(deps, token);
  const trail = await requireContained(deps, resolved, itemId);
  const item = trail.at(-1);
  if (!item || item.kind !== "FILE") throw new ShareNotFoundError();

  if (disposition === "attachment" && !resolved.record.allowDownload) {
    throw new DownloadNotAllowedError();
  }

  const inlineType =
    disposition === "inline" ? inlineContentType(item.contentType) : null;
  if (disposition === "inline" && inlineType === null) {
    throw new DownloadNotAllowedError(
      "This file cannot be previewed in the browser.",
    );
  }

  let pointer;
  try {
    pointer = await deps.files.getDownload(resolved.scope, itemId);
  } catch (error) {
    // A file that is still uploading, or whose upload failed, is not a missing
    // link — the visitor can see it in the listing and needs to be told why it
    // will not open. Anything else Filesystem raises here is a subject that
    // went dark between the walk and this read, which is the ordinary denial.
    if (error instanceof FilesystemError) {
      if (error.code === "file_not_ready") {
        throw new DownloadNotAllowedError("This file is not available yet.");
      }
      throw new ShareNotFoundError();
    }
    throw error;
  }

  return {
    ...pointer,
    disposition,
    contentType: inlineType ?? attachmentContentType(item.contentType),
  };
}
