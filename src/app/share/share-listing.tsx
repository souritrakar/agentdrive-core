"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ShareBrowserView } from "@/components/share";
import { getSharedContents } from "@/lib/share-api";
import type { FolderPage, Item } from "@/lib/types";

/**
 * The interactive half of a shared listing.
 *
 * The first page arrives already rendered — the Server Component above called
 * the Sharing module directly — so this mounts with data and never shows an
 * initial spinner. It exists for the two things a server render cannot do:
 * fetch the next page when someone asks for it, and route a click on a file to
 * the viewer.
 *
 * Paging goes to the Worker rather than back through a server action, because
 * the Worker's public share routes are the same module behind the same
 * resolution spine — and because a revoked link must stop working mid-session,
 * which it does: every request re-resolves the token from scratch.
 */
export function ShareListing({
  token,
  subjectName,
  subjectKind,
  subjectId,
  initialPage,
}: {
  token: string;
  subjectName: string;
  subjectKind: "DRIVE" | "FOLDER";
  /** The shared folder's Item id, or null when a whole Drive was shared. */
  subjectId: string | null;
  initialPage: FolderPage;
}) {
  const router = useRouter();

  const [page, setPage] = useState<FolderPage>(initialPage);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);

  const folderId = initialPage.currentFolder?.id ?? null;

  async function loadMore() {
    if (isLoadingMore || !page.nextCursor) return;

    setIsLoadingMore(true);
    setLoadMoreError(false);
    try {
      const next = await getSharedContents(token, folderId, page.nextCursor);
      // Append rather than replace: the cursor walks forward, and the visitor
      // is reading a list, not paging through screens.
      setPage((current) => ({
        ...next,
        items: [...current.items, ...next.items],
      }));
    } catch {
      /*
        No `describeFailure` sentence here. This is the *second* page of a list
        that is already on screen, and the view renders one quiet line for it;
        the failure that deserves a full explanation is the one that leaves the
        visitor with nothing, and that one was handled server-side.
      */
      setLoadMoreError(true);
    } finally {
      setIsLoadingMore(false);
    }
  }

  return (
    <ShareBrowserView
      token={token}
      subjectName={subjectName}
      subjectKind={subjectKind}
      subjectId={subjectId}
      page={page}
      onOpenFile={(file: Extract<Item, { kind: "FILE" }>) => {
        /*
          Navigate to the viewer; never download on click.

          In the owner's own drive a click downloads, because they know what
          the file is. A stranger's expected verb is "look" — download is one
          explicit, visible click away inside the viewer.
        */
        router.push(`/share/${encodeURIComponent(token)}/file/${file.id}`);
      }}
      onLoadMore={page.nextCursor ? () => void loadMore() : undefined}
      isLoadingMore={isLoadingMore}
      loadMoreError={loadMoreError}
    />
  );
}
