import { ShareGone } from "@/components/share";

import { ShareListing } from "../../../share-listing";
import {
  listSharedContentsOrNull,
  resolveShareOrNull,
} from "../../../resolve";

/**
 * A folder inside a shared folder or drive.
 *
 * `folderId` comes from the URL, which means it comes from the visitor — and is
 * treated that way. It is never used to address anything directly; the module
 * walks it rootward to the share's own subject first, so a folder from another
 * drive, or one *above* the grant, is refused with the same answer as a
 * fabricated token. This page therefore does no checking of its own: there is
 * one containment rule and it lives in the module.
 *
 * The same view component renders here and at the subject root. Only the trail
 * differs, and the module supplies it already clipped at the subject, so
 * breadcrumbs cannot name an ancestor the owner never shared.
 */
export default async function SharedFolderPage({
  params,
}: {
  params: Promise<{ token: string; folderId: string }>;
}) {
  const { token, folderId } = await params;

  const view = await resolveShareOrNull(token);
  if (!view) return <ShareGone />;

  // A file subject has no inside. Reaching this URL means a hand-edited path.
  if (view.subject.kind === "ITEM" && view.subject.item.kind === "FILE") {
    return <ShareGone />;
  }

  const page = await listSharedContentsOrNull(token, folderId);
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
