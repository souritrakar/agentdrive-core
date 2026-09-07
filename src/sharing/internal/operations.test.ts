/**
 * Resolution, against in-memory ports.
 *
 * These are the cases the design exists for: an item named by a visitor that
 * the link does not cover, a folder trashed underneath a shared drive, a
 * revoked link that must stay dead, two tabs clicking Share at once. None of
 * them needs Postgres to be wrong in an interesting way, so none is tested
 * against it — the two partial unique indexes get their real-database proof in
 * the `test:db` suite, which is the one thing a fake cannot establish.
 */

import { beforeEach, describe, expect, it } from "vitest";

import type { Db } from "@/db/client";
import type { Scope } from "@/db/scope";

import { createSharing } from "..";
import { isSharingError, sharingErrorStatus } from "../errors";
import { SHARE_TOKEN_LENGTH } from "../token";
import type { Sharing } from "../types";
import { FakeHierarchy, FakeShareStore } from "./fakes";

const scope: Scope = { accountId: "account-1", podId: "pod-1" };

let store: FakeShareStore;
let tree: FakeHierarchy;
let sharing: Sharing;

/**
 * drive-1
 *   shared/            (folder-shared)
 *     nested/          (folder-nested)
 *       deep/          (folder-deep)  — three levels, so a breadcrumb can have
 *       deep.pdf       (file-deep)      something strictly *between* its ends
 *     report.pdf       (file-report)
 *   outside.pdf        (file-outside)
 * drive-2
 *   other.pdf          (file-other)
 */
let folderShared: string;
let folderNested: string;
let folderDeep: string;
let fileDeep: string;
let fileReport: string;
let fileOutside: string;
let fileOther: string;

beforeEach(() => {
  store = new FakeShareStore();
  tree = new FakeHierarchy();
  sharing = createSharing(store as unknown as Db, tree, tree);

  tree.addDrive("drive-1", "Work");
  tree.addDrive("drive-2", "Other");
  folderShared = tree.addFolder("drive-1", null, "shared");
  folderNested = tree.addFolder("drive-1", folderShared, "nested");
  folderDeep = tree.addFolder("drive-1", folderNested, "deep");
  fileDeep = tree.addFile("drive-1", folderNested, "deep.pdf");
  fileReport = tree.addFile("drive-1", folderShared, "report.pdf");
  fileOutside = tree.addFile("drive-1", null, "outside.pdf");
  fileOther = tree.addFile("drive-2", null, "other.pdf");
});

/** Asserts a rejection is the module's collapsed denial, not something else. */
async function expectDenied(promise: Promise<unknown>) {
  await expect(promise).rejects.toMatchObject({ code: "share_not_found" });
}

describe("creating a share", () => {
  it("mints a token of the specified shape", async () => {
    const share = await sharing.shareItem(scope, folderShared);
    expect(share.token).toHaveLength(SHARE_TOKEN_LENGTH);
    expect(share.token).toMatch(/^[0-9A-Za-z]+$/);
    expect(share.subject).toEqual({ kind: "ITEM", itemId: folderShared });
    expect(share.allowDownload).toBe(true);
    expect(share.role).toBe("VIEWER");
  });

  it("returns the existing share rather than a second one", async () => {
    const first = await sharing.shareItem(scope, folderShared);
    const second = await sharing.shareItem(scope, folderShared);
    expect(second.id).toBe(first.id);
    expect(second.token).toBe(first.token);
    expect(store.rows).toHaveLength(1);
  });

  it("resolves a double-share race to one row via the unique index", async () => {
    // Both callers see no existing share, both attempt the insert. The index
    // fails one, and the loser must return the winner's row — not raise.
    const [a, b] = await Promise.all([
      sharing.shareItem(scope, folderShared),
      sharing.shareItem(scope, folderShared),
    ]);
    expect(a.id).toBe(b.id);
    expect(a.token).toBe(b.token);
    expect(store.rows.filter((row) => row.deletedAt === null)).toHaveLength(1);
  });

  it("shares a drive and an item in it independently", async () => {
    const drive = await sharing.shareDrive(scope, "drive-1");
    const item = await sharing.shareItem(scope, folderShared);
    expect(drive.subject).toEqual({ kind: "DRIVE", driveId: "drive-1" });
    expect(item.subject).toEqual({ kind: "ITEM", itemId: folderShared });
    expect(drive.token).not.toBe(item.token);
  });

  it("refuses a trashed item, in Filesystem's own vocabulary", async () => {
    tree.trash(folderShared);
    await expect(sharing.shareItem(scope, folderShared)).rejects.toMatchObject({
      code: "item_not_found",
    });
  });

  it("refuses a trashed drive", async () => {
    tree.trashDrive("drive-1");
    await expect(sharing.shareDrive(scope, "drive-1")).rejects.toMatchObject({
      code: "drive_not_found",
    });
  });
});

describe("resolving a token", () => {
  it("shows a shared folder without echoing the token back", async () => {
    const { token } = await sharing.shareItem(scope, folderShared);
    const view = await sharing.resolveShare(token);
    expect(view.subject).toMatchObject({
      kind: "ITEM",
      item: { id: folderShared, name: "shared" },
    });
    expect(view.share).toEqual({ role: "VIEWER", allowDownload: true });
    expect(JSON.stringify(view)).not.toContain(token);
  });

  it("shows a shared drive by name", async () => {
    const { token } = await sharing.shareDrive(scope, "drive-1");
    const view = await sharing.resolveShare(token);
    expect(view.subject).toEqual({
      kind: "DRIVE",
      drive: { id: "drive-1", name: "Work" },
    });
  });

  it("denies an unknown token", async () => {
    await expectDenied(sharing.resolveShare("a".repeat(SHARE_TOKEN_LENGTH)));
  });

  it("rejects a malformed token before touching the database", async () => {
    await expect(sharing.resolveShare("short")).rejects.toMatchObject({
      code: "invalid_input",
    });
    expect(store.rows).toHaveLength(0);
  });

  it("goes dark when the subject is trashed, and lights up on restore", async () => {
    const { token } = await sharing.shareItem(scope, folderShared);

    tree.trash(folderShared);
    await expectDenied(sharing.resolveShare(token));

    tree.restore(folderShared);
    const view = await sharing.resolveShare(token);
    expect(view.subject).toMatchObject({ kind: "ITEM" });
  });

  it("goes dark when a shared drive is trashed", async () => {
    const { token } = await sharing.shareDrive(scope, "drive-1");
    tree.trashDrive("drive-1");
    await expectDenied(sharing.resolveShare(token));
  });
});

describe("containment", () => {
  it("grants an item deep inside the shared folder", async () => {
    const { token } = await sharing.shareItem(scope, folderShared);
    const file = await sharing.getSharedFileView(token, fileDeep);
    expect(file.id).toBe(fileDeep);
  });

  it("denies a sibling of the subject", async () => {
    const { token } = await sharing.shareItem(scope, folderShared);
    await expectDenied(sharing.getSharedFileView(token, fileOutside));
  });

  it("denies an item in another drive", async () => {
    const { token } = await sharing.shareItem(scope, folderShared);
    await expectDenied(sharing.getSharedFileView(token, fileOther));
  });

  it("grants everything in a shared drive and nothing outside it", async () => {
    const { token } = await sharing.shareDrive(scope, "drive-1");
    await expect(sharing.getSharedFileView(token, fileOutside)).resolves
      .toMatchObject({ id: fileOutside });
    await expect(sharing.getSharedFileView(token, fileDeep)).resolves
      .toMatchObject({ id: fileDeep });
    await expectDenied(sharing.getSharedFileView(token, fileOther));
  });

  it("denies an item whose ancestor was trashed between it and the subject", async () => {
    const { token } = await sharing.shareDrive(scope, "drive-1");
    await expect(sharing.getSharedFileView(token, fileDeep)).resolves
      .toMatchObject({ id: fileDeep });

    // The subject — the drive — is untouched. Only a folder in the middle went.
    tree.trash(folderNested);
    await expectDenied(sharing.getSharedFileView(token, fileDeep));
  });

  it("denies an item moved out of the shared subtree", async () => {
    const { token } = await sharing.shareItem(scope, folderShared);
    await expect(sharing.getSharedFileView(token, fileReport)).resolves
      .toMatchObject({ id: fileReport });

    tree.nodes.get(fileReport)!.parentId = null;
    await expectDenied(sharing.getSharedFileView(token, fileReport));
  });

  it("denies a folder id where a file is expected", async () => {
    const { token } = await sharing.shareItem(scope, folderShared);
    await expectDenied(sharing.getSharedFileView(token, folderNested));
  });
});

describe("listing", () => {
  it("lists the shared folder itself when no folder is named", async () => {
    const { token } = await sharing.shareItem(scope, folderShared);
    const page = await sharing.listSharedContents(token);
    expect(page.items.map((item) => item.name)).toEqual([
      "nested",
      "report.pdf",
    ]);
  });

  it("lists the drive root for a drive share", async () => {
    const { token } = await sharing.shareDrive(scope, "drive-1");
    const page = await sharing.listSharedContents(token);
    expect(page.items.map((item) => item.name)).toEqual([
      "shared",
      "outside.pdf",
    ]);
  });

  it("truncates breadcrumbs at the grant", async () => {
    const { token } = await sharing.shareItem(scope, folderShared);
    const page = await sharing.listSharedContents(token, {
      folderId: folderNested,
    });
    /*
      The visitor is inside `nested`, one level below the shared folder, so
      there is nothing *between* the two: `ancestors` is what lies strictly
      between the subject and the current folder, both ends excluded.

      Filesystem would have returned the whole chain to the drive root. The
      subject is excluded because `ShareBreadcrumbs` renders it as the root
      crumb itself — including it here is what produced `shared › shared` on
      screen. The current folder is excluded because it is the page's heading.
    */
    expect(page.ancestors).toEqual([]);
  });

  it("keeps the folders between the grant and the current one", async () => {
    const { token } = await sharing.shareItem(scope, folderShared);
    const page = await sharing.listSharedContents(token, {
      folderId: folderDeep,
    });
    // shared › nested › deep — `nested` is the one crumb strictly between.
    expect(page.ancestors).toEqual([{ id: folderNested, name: "nested" }]);
  });

  it("gives a drive share the full chain below the drive", async () => {
    const { token } = await sharing.shareDrive(scope, "drive-1");
    const page = await sharing.listSharedContents(token, {
      folderId: folderNested,
    });
    // A Drive is not an Item, so it never appears here; the component prepends
    // it. `shared` is a genuine ancestor and must survive.
    expect(page.ancestors).toEqual([{ id: folderShared, name: "shared" }]);
  });

  it("refuses to list a folder outside the grant", async () => {
    const { token } = await sharing.shareItem(scope, folderNested);
    await expectDenied(
      sharing.listSharedContents(token, { folderId: folderShared }),
    );
  });

  it("refuses to list a shared file", async () => {
    const { token } = await sharing.shareItem(scope, fileReport);
    await expectDenied(sharing.listSharedContents(token));
  });

  it("stops listing a folder trashed inside a shared drive", async () => {
    const { token } = await sharing.shareDrive(scope, "drive-1");
    await expect(
      sharing.listSharedContents(token, { folderId: folderNested }),
    ).resolves.toMatchObject({ nextCursor: null });

    tree.trash(folderShared);
    await expectDenied(
      sharing.listSharedContents(token, { folderId: folderNested }),
    );
  });
});

describe("downloads", () => {
  it("hands back the owner's own byte pointer, never a copy", async () => {
    const { token } = await sharing.shareItem(scope, folderShared);
    const download = await sharing.getSharedDownload(
      token,
      fileReport,
      "attachment",
    );
    const owner = await tree.getDownload(scope, fileReport);
    expect(download.storageBucket).toBe(owner.storageBucket);
    expect(download.storageKey).toBe(owner.storageKey);
  });

  it("refuses an attachment when allowDownload is off but still previews", async () => {
    const imageId = tree.addFile("drive-1", folderShared, "shot.png", "image/png");
    const { token } = await sharing.shareItem(scope, folderShared);
    await sharing.updateShare(
      scope,
      { kind: "ITEM", itemId: folderShared },
      { allowDownload: false },
    );

    await expect(
      sharing.getSharedDownload(token, imageId, "attachment"),
    ).rejects.toMatchObject({ code: "download_not_allowed" });

    // Viewing still works: an image on screen *is* the file, and a preview-less
    // share of a picture is an empty page. The toggle governs the invitation.
    const preview = await sharing.getSharedDownload(token, imageId, "inline");
    expect(preview.disposition).toBe("inline");
    expect(preview.contentType).toBe("image/png");
  });

  it("keeps listing and viewing working when downloads are off", async () => {
    const { token } = await sharing.shareItem(scope, folderShared);
    await sharing.updateShare(
      scope,
      { kind: "ITEM", itemId: folderShared },
      { allowDownload: false },
    );
    await expect(sharing.listSharedContents(token)).resolves.toMatchObject({
      nextCursor: null,
    });
    await expect(
      sharing.getSharedFileView(token, fileReport),
    ).resolves.toMatchObject({ id: fileReport });
    expect((await sharing.resolveShare(token)).share.allowDownload).toBe(false);
  });

  it("refuses to serve an executable type inline", async () => {
    const pageId = tree.addFile("drive-1", folderShared, "evil.html", "text/html");
    const svgId = tree.addFile("drive-1", folderShared, "logo.svg", "image/svg+xml");
    const { token } = await sharing.shareItem(scope, folderShared);

    for (const id of [pageId, svgId]) {
      await expect(
        sharing.getSharedDownload(token, id, "inline"),
      ).rejects.toMatchObject({ code: "download_not_allowed" });
    }

    // As an attachment they are fine, but never under their own content type:
    // the disposition header must not be the only thing keeping them inert.
    const attachment = await sharing.getSharedDownload(token, pageId, "attachment");
    expect(attachment.contentType).toBe("application/octet-stream");
  });

  it("re-types markdown to text/plain for inline preview", async () => {
    const noteId = tree.addFile("drive-1", folderShared, "notes.md", "text/markdown");
    const { token } = await sharing.shareItem(scope, folderShared);
    const preview = await sharing.getSharedDownload(token, noteId, "inline");
    expect(preview.contentType).toBe("text/plain");
  });

  it("refuses a file whose upload has not finished, but still shows it", async () => {
    tree.setUploadStatus(fileReport, "PENDING");
    const { token } = await sharing.shareItem(scope, folderShared);

    await expect(
      sharing.getSharedFileView(token, fileReport),
    ).resolves.toMatchObject({ uploadStatus: "PENDING" });
    await expect(
      sharing.getSharedDownload(token, fileReport, "attachment"),
    ).rejects.toMatchObject({ code: "download_not_allowed" });
  });

  it("denies a download for an item outside the grant", async () => {
    const { token } = await sharing.shareItem(scope, folderShared);
    await expectDenied(
      sharing.getSharedDownload(token, fileOutside, "attachment"),
    );
  });
});

describe("revocation", () => {
  it("kills the token immediately", async () => {
    const { token } = await sharing.shareItem(scope, folderShared);
    await sharing.revokeShare(scope, { kind: "ITEM", itemId: folderShared });
    await expectDenied(sharing.resolveShare(token));
  });

  it("mints a different token on re-share, leaving the old one dead", async () => {
    const first = await sharing.shareItem(scope, folderShared);
    await sharing.revokeShare(scope, { kind: "ITEM", itemId: folderShared });
    const second = await sharing.shareItem(scope, folderShared);

    expect(second.token).not.toBe(first.token);
    expect(second.id).not.toBe(first.id);
    await expectDenied(sharing.resolveShare(first.token));
    await expect(sharing.resolveShare(second.token)).resolves.toMatchObject({
      subject: { kind: "ITEM" },
    });
  });

  it("is idempotent", async () => {
    await sharing.shareItem(scope, folderShared);
    const subject = { kind: "ITEM", itemId: folderShared } as const;
    await sharing.revokeShare(scope, subject);
    await expect(sharing.revokeShare(scope, subject)).resolves.toBeUndefined();
  });

  it("leaves other subjects alone", async () => {
    const drive = await sharing.shareDrive(scope, "drive-1");
    await sharing.shareItem(scope, folderShared);
    await sharing.revokeShare(scope, { kind: "ITEM", itemId: folderShared });

    await expect(sharing.resolveShare(drive.token)).resolves.toMatchObject({
      subject: { kind: "DRIVE" },
    });
  });
});

describe("the owner's view of a share", () => {
  it("reports null before there is one", async () => {
    await expect(
      sharing.getShareForSubject(scope, { kind: "ITEM", itemId: folderShared }),
    ).resolves.toBeNull();
  });

  it("reports null again after revocation", async () => {
    const subject = { kind: "ITEM", itemId: folderShared } as const;
    await sharing.shareItem(scope, folderShared);
    await sharing.revokeShare(scope, subject);
    await expect(sharing.getShareForSubject(scope, subject)).resolves.toBeNull();
  });

  it("refuses to update a share that is not there", async () => {
    await expect(
      sharing.updateShare(
        scope,
        { kind: "ITEM", itemId: folderShared },
        { allowDownload: false },
      ),
    ).rejects.toMatchObject({ code: "share_not_found" });
  });

  it("does not leak another pod's share", async () => {
    const { token } = await sharing.shareItem(scope, folderShared);
    const intruder: Scope = { accountId: "account-2", podId: "pod-2" };

    await expect(
      sharing.getShareForSubject(intruder, {
        kind: "ITEM",
        itemId: folderShared,
      }),
    ).resolves.toBeNull();

    // Revoking under the wrong scope must not touch the row.
    await sharing.revokeShare(intruder, { kind: "ITEM", itemId: folderShared });
    await expect(sharing.resolveShare(token)).resolves.toMatchObject({
      subject: { kind: "ITEM" },
    });
  });
});

describe("the error surface", () => {
  it("maps every code to a status", async () => {
    const { token } = await sharing.shareItem(scope, folderShared);
    await sharing.updateShare(
      scope,
      { kind: "ITEM", itemId: folderShared },
      { allowDownload: false },
    );

    const seen: Array<[string, number]> = [];
    for (const attempt of [
      () => sharing.resolveShare("nope"),
      () => sharing.resolveShare("z".repeat(SHARE_TOKEN_LENGTH)),
      () => sharing.getSharedDownload(token, fileReport, "attachment"),
    ]) {
      await attempt().catch((error: unknown) => {
        if (!isSharingError(error)) throw error;
        seen.push([error.code, sharingErrorStatus(error)]);
      });
    }

    expect(seen).toEqual([
      ["invalid_input", 400],
      ["share_not_found", 404],
      ["download_not_allowed", 403],
    ]);
  });

  it("never puts the token in the message", async () => {
    const { token } = await sharing.shareItem(scope, folderShared);
    await sharing.revokeShare(scope, { kind: "ITEM", itemId: folderShared });

    const error = await sharing.resolveShare(token).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(token);
  });
});
