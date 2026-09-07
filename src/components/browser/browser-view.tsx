"use client";

import { LinkSimple } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { useState } from "react";

import { BreadcrumbTrail } from "./breadcrumb-trail";
import { EmptyFolder } from "./empty-folder";
import { EntryGrid } from "./entry-grid";
import { EntryList } from "./entry-list";
import { TopBar } from "@/components/layout";
import { ShareDialog } from "@/components/share";
import {
  ErrorState,
  ListingSkeleton,
  PageContainer,
  ViewToggle,
} from "@/components/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useResource } from "@/hooks/use-resource";
import {
  createShare,
  getFolderContents,
  getShare,
  revokeShare,
  setShareDownload,
} from "@/lib/drive-api";
import { shareUrl } from "@/lib/share-url";
import { formatItemCount } from "@/lib/format";
import type { FolderPage, Item, ShareSubjectRef } from "@/lib/types";
import {
  persistPreference,
  VIEW_MODE_COOKIE,
  type ViewMode,
} from "@/lib/ui-preferences";

/**
 * One level of a drive: the trail in the top bar, the listing in the pane.
 *
 * The same component renders a drive root and any folder inside it — the only
 * difference is which name is the title and what the trail contains. Treating
 * them as one view is why navigating deeper never changes layout.
 *
 * It owns no actions any more. Upload and New folder live in the sidebar, where
 * they hold the same position on every page; the view toggle sits with the
 * listing it controls rather than in the bar, because it changes what is
 * directly beneath it and nothing else.
 */
export function BrowserView({
  driveId,
  parentId,
  defaultViewMode,
}: {
  driveId: string;
  parentId: string | null;
  defaultViewMode: ViewMode;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>(defaultViewMode);
  const [sharing, setSharing] = useState(false);

  const { data, isLoading, error, refresh } = useResource(
    `contents:${driveId}:${parentId ?? "root"}`,
    () => getFolderContents(driveId, parentId),
  );

  const [extension, setExtension] = useState<{
    base: FolderPage;
    items: Item[];
    nextCursor: string | null;
    pending: boolean;
    error: Error | null;
  } | null>(null);

  const extended = data && extension?.base === data ? extension : null;
  const items = extended?.items ?? data?.items ?? [];
  const nextCursor = extended?.nextCursor ?? data?.nextCursor ?? null;

  function changeView(next: ViewMode) {
    setViewMode(next);
    persistPreference(VIEW_MODE_COOKIE, next);
  }

  const itemCount = items.length;
  const isEmpty = Boolean(data) && itemCount === 0;

  /*
    What Share means here. A folder page shares the folder; a drive root shares
    the drive. Derived from the loaded page rather than from `parentId` so the
    dialog's subject and its heading can never name two different things.
  */
  const shareSubject: ShareSubjectRef = data?.currentFolder
    ? { kind: "ITEM", itemId: data.currentFolder.id }
    : { kind: "DRIVE", driveId };

  async function loadMore() {
    if (!data || !nextCursor || extended?.pending) return;

    setExtension({
      base: data,
      items,
      nextCursor,
      pending: true,
      error: null,
    });

    try {
      const page = await getFolderContents(driveId, parentId, nextCursor);
      setExtension({
        base: data,
        items: [...items, ...page.items],
        nextCursor: page.nextCursor,
        pending: false,
        error: null,
      });
    } catch (cause) {
      setExtension({
        base: data,
        items,
        nextCursor,
        pending: false,
        error: cause instanceof Error ? cause : new Error(String(cause)),
      });
    }
  }

  return (
    <>
      <TopBar>
        {data ? (
          <BreadcrumbTrail
            drive={data.drive}
            ancestors={data.ancestors}
            isRoot={!data.currentFolder}
          />
        ) : error ? (
          /*
            The trail is built from the response, so there is nothing to draw.
            A skeleton here would sit and pulse forever, which reads as "still
            loading" and strands the user on a page with no way out — the trail
            is the only route back when the listing itself has failed.
          */
          <Link
            href="/drives"
            className="type-body rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            All drives
          </Link>
        ) : (
          <Skeleton className="h-4 w-40 rounded-sm" />
        )}
      </TopBar>

      <PageContainer className="flex flex-col gap-8 py-8 sm:py-10">
        {isLoading ? (
          <ListingSkeleton />
        ) : error ? (
          /*
            No title above it. Every other state on this page is headed by the
            folder's name, and the one thing we do not have when the request
            failed is the folder's name — inventing "Not available" as an <h1>
            put a placeholder where the identity goes and made the error look
            like a folder called "Not available".
          */
          <ErrorState
            error={error}
            noun="folder"
            onRetry={refresh}
            action={{ label: "Back to drives", href: "/drives" }}
          />
        ) : data ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
              <div className="flex min-w-0 flex-col gap-1">
                <h1 className="type-display truncate">
                  {data.currentFolder ? data.currentFolder.name : data.drive.name}
                </h1>
                <p className="type-meta text-muted-foreground">
                  {nextCursor ? `${itemCount}+ items` : formatItemCount(itemCount)}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {/*
                  Share always names *what you are looking at* — the drive at a
                  root, the folder once you are inside one. The row's ⋯ menu
                  still shares a folder from its parent, and both routes reach
                  the same row: one active share per subject is settled in
                  Postgres, so the two entry points cannot mint two links.
                */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSharing(true)}
                >
                  <LinkSimple />
                  Share
                </Button>

                {/* Nothing to switch between when there is nothing to show. */}
                {!isEmpty && <ViewToggle value={viewMode} onChange={changeView} />}
              </div>
            </div>

            {isEmpty ? (
              <EmptyFolder />
            ) : viewMode === "grid" ? (
              <EntryGrid driveId={driveId} items={items} />
            ) : (
              <EntryList driveId={driveId} items={items} />
            )}

            <ShareDialog
              name={data.currentFolder ? data.currentFolder.name : data.drive.name}
              targetKind={data.currentFolder ? "folder" : "drive"}
              open={sharing}
              onOpenChange={setSharing}
              loadShare={() => getShare(shareSubject)}
              createShare={() => createShare(shareSubject)}
              setAllowDownload={(allow) => setShareDownload(shareSubject, allow)}
              revokeShare={() => revokeShare(shareSubject)}
              shareUrl={shareUrl}
            />

            {(nextCursor || extended?.error) && (
              <div className="flex flex-col items-center gap-2">
                {extended?.error && (
                  <p role="alert" className="type-detail text-destructive">
                    Could not load more items.
                  </p>
                )}
                {nextCursor && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={extended?.pending}
                    onClick={() => void loadMore()}
                  >
                    {extended?.pending ? "Loading…" : "Load more"}
                  </Button>
                )}
              </div>
            )}
          </>
        ) : null}
      </PageContainer>
    </>
  );
}
