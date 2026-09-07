import { ShareGone } from "@/components/share";

import { ShareFile } from "../share-file";
import { ShareListing } from "../share-listing";
import {
  listSharedContentsOrNull,
  resolveShareOrNull,
  toWireItem,
} from "../resolve";

/**
 * What a share link opens on.
 *
 * One route, two entirely different pages, chosen by what was shared: a file
 * link *is* the viewer — the content fills the page, Google-Drive style — while
 * a folder or drive link is the listing an owner would see, minus everything a
 * visitor cannot do.
 *
 * Both start from the same `resolveShare`, and every way that can fail arrives
 * as the same gone page. The token is never checked twice against two different
 * ideas of what it means.
 */
export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const view = await resolveShareOrNull(token);
  if (!view) return <ShareGone />;

  if (view.subject.kind === "ITEM" && view.subject.item.kind === "FILE") {
    const file = toWireItem(view.subject.item);
    // Narrowing for the type system; `toWireItem` already decided by `kind`.
    if (file.kind !== "FILE") return <ShareGone />;

    return (
      <ShareFile
        token={token}
        file={file}
        allowDownload={view.share.allowDownload}
      />
    );
  }

  /*
    A drive or a folder: list its top level.

    No `folderId` means "the subject itself" — for a shared folder that is the
    folder, not the drive root. The module resolves that from the share row,
    which is what keeps a visitor from ever addressing something above the
    grant.
  */
  const page = await listSharedContentsOrNull(token);

  // Alive a moment ago and not now: trashed between the two reads. Same answer.
  if (!page) return <ShareGone />;

  return (
    <ShareListing
      token={token}
      subjectName={
        view.subject.kind === "DRIVE"
          ? view.subject.drive.name
          : view.subject.item.name
      }
      subjectKind={view.subject.kind === "DRIVE" ? "DRIVE" : "FOLDER"}
      subjectId={view.subject.kind === "DRIVE" ? null : view.subject.item.id}
      initialPage={page}
    />
  );
}
