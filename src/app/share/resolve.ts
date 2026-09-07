import "server-only";

import { db, isDatabaseConfigured } from "@/db";
import type { FolderPage as WireFolderPage, Item as WireItem } from "@/lib/types";
import { createSharing, isSharingError, sharingErrorStatus } from "@/sharing";
import type { SharedView, Sharing } from "@/sharing";

/**
 * The server side of a share page: resolve the token, or decide it is gone.
 *
 * First paint calls the Sharing module **directly** rather than the Worker
 * (01 §5). The module is runtime-agnostic by construction, so a server-to-server
 * hop to our own API would add a failure mode and a round trip and buy nothing.
 * Everything the visitor does *after* the page renders — paging, opening a
 * file, minting a download URL — goes browser → Worker → the same module, so
 * there is one resolution spine and no second authorization implementation to
 * drift from it.
 */

export function sharing(): Sharing {
  return createSharing(db);
}

/**
 * Every terminal denial, collapsed into one boolean.
 *
 * Unknown token, revoked link, trashed subject, trashed ancestor, a folder id
 * from outside the grant — the module answers all of them with the same
 * `ShareNotFoundError`, deliberately, so that a stranger cannot learn from the
 * difference whether a token was ever real (02 §2). The page must not try to
 * recover the distinction the module withheld: every one of these renders the
 * same gone page.
 *
 * A database that is not configured is folded in here too. It is not the same
 * fact, but it is the same *answer* — there is nothing to show — and a share
 * page has no signed-in operator to explain a misconfiguration to.
 */
export function isGone(cause: unknown): boolean {
  if (!isSharingError(cause)) return false;

  /*
    404 is the collapsed denial. 400 — a token of the wrong shape — is folded in
    with it deliberately: to the person holding a truncated or mistyped link,
    "malformed" and "no longer available" are the same fact, and distinguishing
    them on screen would hand back the oracle the module just closed. The API
    still answers 400 there, because a status code is for a client; a page is
    for a person.
  */
  const status = sharingErrorStatus(cause);
  return status === 404 || status === 400;
}

/*
  Every read a share page makes comes back as "the data, or null for gone".

  The try/catch lives here, in plain TypeScript, rather than in the pages —
  partly because `isGone` is one rule and should be applied in one place, and
  partly because a `catch` wrapped around JSX is a lie: React renders the
  element later, so a render error never reaches the handler that appears to
  cover it. The pages therefore branch on a value and construct JSX in exactly
  one place each.
*/

/** Resolves a token to its subject, or null when the link is dead. */
export async function resolveShareOrNull(
  token: string,
): Promise<SharedView | null> {
  if (!isDatabaseConfigured()) return null;

  try {
    return await sharing().resolveShare(token);
  } catch (cause) {
    if (isGone(cause)) return null;
    throw cause;
  }
}

/**
 * One level inside the share, or null when it is gone.
 *
 * `folderId` is visitor-supplied and is not validated here: the module walks it
 * back to the share's own subject before listing anything, so an id from
 * another drive — or one above the grant — arrives as the same denial as a
 * fabricated token, and lands on the same page.
 */
export async function listSharedContentsOrNull(
  token: string,
  folderId?: string,
): Promise<WireFolderPage | null> {
  try {
    const page = await sharing().listSharedContents(token, {
      ...(folderId ? { folderId } : {}),
      includeChildCounts: true,
    });
    return toWireFolderPage(page);
  } catch (cause) {
    if (isGone(cause)) return null;
    throw cause;
  }
}

/** One file's metadata, or null when the link — or the file — is gone. */
export async function getSharedFileOrNull(
  token: string,
  itemId: string,
): Promise<Extract<WireItem, { kind: "FILE" }> | null> {
  try {
    const item = toWireItem(await sharing().getSharedFileView(token, itemId));
    // The module only returns files from this call; the check is the type
    // system's, not a doubt about the module.
    return item.kind === "FILE" ? item : null;
  } catch (cause) {
    if (isGone(cause)) return null;
    throw cause;
  }
}

// ---------------------------------------------------------------------------
// Wire shaping
// ---------------------------------------------------------------------------

/*
  The module speaks the Filesystem's `Item`, where `kind` is a plain field. The
  UI speaks `@/lib/types`'s `Item`, which is a discriminated union — a folder
  there *cannot* carry an upload status, and the components rely on that to know
  which fields exist without checking. The two are the same data; the narrowing
  is what a Server Component owes a Client Component, and doing it here means it
  happens once rather than in every consumer.

  Both shapes are already plain JSON — no Date, no BigInt — so nothing else has
  to be converted to cross the boundary.
*/

type ModuleItem = Awaited<ReturnType<Sharing["getSharedFileView"]>>;

export function toWireItem(item: ModuleItem): WireItem {
  const base = {
    id: item.id,
    driveId: item.driveId,
    parentId: item.parentId,
    name: item.name,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };

  if (item.kind === "FOLDER") {
    return {
      ...base,
      kind: "FOLDER",
      contentType: null,
      sizeBytes: null,
      uploadStatus: null,
      // Folders alone carry one; the wire type declares `never` for files, and
      // dropping it here rather than passing it through is what satisfies that.
      ...(item.childCount === undefined ? {} : { childCount: item.childCount }),
    };
  }

  return {
    ...base,
    kind: "FILE",
    contentType: item.contentType,
    sizeBytes: item.sizeBytes,
    /*
      A FILE with no upload status is a malformed row rather than a state the
      module produces. Reading it as PENDING renders "this file isn't available
      yet", which is the honest answer to "we cannot show that it is ready" —
      the alternative would be claiming READY for bytes that may not exist.
    */
    uploadStatus: item.uploadStatus ?? "PENDING",
  };
}

export function toWireFolderPage(
  page: Awaited<ReturnType<Sharing["listSharedContents"]>>,
): WireFolderPage {
  const currentFolder = page.currentFolder
    ? toWireItem(page.currentFolder)
    : null;

  return {
    drive: page.drive,
    // A share's current folder is always a FOLDER; the cast is narrowing, not
    // an assumption about data — `toWireItem` already decided by `kind`.
    currentFolder:
      currentFolder && currentFolder.kind === "FOLDER" ? currentFolder : null,
    ancestors: page.ancestors,
    items: page.items.map(toWireItem),
    nextCursor: page.nextCursor,
  };
}
