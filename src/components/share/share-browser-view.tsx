"use client";

import { useState } from "react";

import { ShareBreadcrumbs } from "./share-breadcrumbs";
import { EmptySharedFolder } from "./empty-shared-folder";
import type { SharedFolderPage } from "./types";
import { EntryGrid, EntryList } from "@/components/browser";
import { TopBar } from "@/components/layout";
import {
  ErrorState,
  ListingSkeleton,
  PageContainer,
  ViewToggle,
} from "@/components/shared";
import { Button } from "@/components/ui/button";
import { formatItemCount } from "@/lib/format";
import type { Item } from "@/lib/types";
import type { ViewMode } from "@/lib/ui-preferences";

/**
 * One level of a shared drive or folder, read-only.
 *
 * The same arrangement the owner sees — title, count, toggle, grid or list,
 * Load more — composed over share data instead of drive data. It reuses
 * `EntryGrid` and `EntryList` through the browser feature's public barrel and
 * hands them the *foreign* behaviour: folder links go to `/share/:token/f/:id`,
 * clicking a file opens the viewer, and the actions slot renders nothing.
 *
 * Everything a visitor cannot do is absent rather than disabled: no `⋯` menu
 * (a menu of things you cannot do is a list of refusals), no rename, move or
 * trash, no upload, no New folder. That is the whole difference, and it is
 * expressed as props rather than as a `readonly` flag threaded through four
 * components.
 *
 * One interaction differs on purpose. In the owner's grid a click on a file
 * downloads it; here it opens the viewer. In a stranger's browser the expected
 * verb is "look", and download is one explicit click away on the page it opens.
 *
 * The view toggle is local state defaulting to grid, and writes no cookie: the
 * owner's `ad_view` preference belongs to a session this visitor may not have,
 * and setting a cookie from a public page is a fingerprinting surface with no
 * benefit.
 */
export function ShareBrowserView({
  token,
  subjectName,
  subjectKind,
  subjectId,
  page,
  isLoading = false,
  error,
  onRetry,
  onOpenFile,
  onLoadMore,
  isLoadingMore = false,
  loadMoreError = false,
}: {
  token: string;
  /** The shared drive's or folder's own name — the root of the trail. */
  subjectName: string;
  subjectKind: "DRIVE" | "FOLDER";
  /**
   * The shared folder's Item id, or `null` when a whole Drive was shared.
   *
   * Needed to tell "at the subject" from "one level into it", which the page
   * alone cannot answer for a folder share: the module returns the shared
   * folder as `currentFolder` at its own root, so the absence of a current
   * folder means "drive root", not "subject root".
   */
  subjectId: string | null;
  page: SharedFolderPage | null;
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => Promise<unknown> | unknown;
  onOpenFile: (file: Extract<Item, { kind: "FILE" }>) => void;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  loadMoreError?: boolean;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const items = page?.items ?? [];
  const itemCount = items.length;
  const isEmpty = Boolean(page) && itemCount === 0;
  const nextCursor = page?.nextCursor ?? null;

  // The current folder's name is the page title; the subject's name is the
  // root of the trail. At the subject itself they are the same thing, and the
  // trail is therefore empty — which is when the bar is not rendered at all.
  const currentName = page?.currentFolder?.name ?? subjectName;
  const ancestors = page?.ancestors ?? [];
  /*
    "Is the visitor looking at the thing that was shared?" — asked by identity,
    not by absence.

    `!page.currentFolder` was the old test and it is only right for a Drive
    share, where the subject is not a folder and the root listing genuinely has
    no current folder. A shared *folder* is returned as `currentFolder` at its
    own root, so that test said "no" and drew a one-crumb bar linking to the
    page you were already on, under a heading that repeated it.
  */
  const isSubjectRoot = page?.currentFolder
    ? page.currentFolder.id === subjectId
    : true;

  const behaviour = {
    renderActions: () => null,
    folderHref: (folder: Extract<Item, { kind: "FOLDER" }>) =>
      `/share/${token}/f/${folder.id}`,
    onOpenFile,
  } as const;

  return (
    <>
      {/* An empty bar is worse than no bar — the same rule the app follows at
          a drive root. */}
      {!isSubjectRoot && page && (
        <TopBar>
          {/* `ancestors` arrives clipped to the folders strictly between the
              subject and the current one, so the root crumb this component
              prepends is the only place the subject appears. */}
          <ShareBreadcrumbs
            token={token}
            subjectName={subjectName}
            subjectKind={subjectKind}
            ancestors={ancestors}
          />
        </TopBar>
      )}

      <PageContainer className="flex flex-col gap-8 py-8 sm:py-10">
        {isLoading ? (
          <ListingSkeleton />
        ) : error ? (
          /*
            No title above it. Every other state on this page is headed by the
            folder's name, and the one thing we do not have when the request
            failed is the folder's name.

            A 404 never reaches here — the page renders the gone state for
            that. What is left is offline, backend and fault, all of which can
            heal, so the self-healing recheck is worth having.
          */
          <ErrorState
            error={error}
            noun="folder"
            onRetry={onRetry}
            action={{ label: "Go to AgentDrive", href: "/" }}
            actionVariant="outline"
          />
        ) : page ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
              <div className="flex min-w-0 flex-col gap-1">
                <h1 className="type-display truncate">{currentName}</h1>
                <p className="type-meta text-muted-foreground">
                  {nextCursor ? `${itemCount}+ items` : formatItemCount(itemCount)}
                </p>
              </div>

              {/* Nothing to switch between when there is nothing to show. */}
              {!isEmpty && <ViewToggle value={viewMode} onChange={setViewMode} />}
            </div>

            {isEmpty ? (
              <EmptySharedFolder />
            ) : viewMode === "grid" ? (
              <EntryGrid items={items} {...behaviour} />
            ) : (
              <EntryList items={items} {...behaviour} />
            )}

            {(nextCursor || loadMoreError) && (
              <div className="flex flex-col items-center gap-2">
                {loadMoreError && (
                  <p role="alert" className="type-detail text-destructive">
                    Could not load more items.
                  </p>
                )}
                {nextCursor && onLoadMore && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isLoadingMore}
                    onClick={onLoadMore}
                  >
                    {isLoadingMore ? "Loading…" : "Load more"}
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
