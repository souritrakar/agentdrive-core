"use client";

import { ItemActions } from "./item-actions";
import { useDownload } from "@/hooks/use-download";
import type { Item } from "@/lib/types";

type FolderItem = Extract<Item, { kind: "FOLDER" }>;
type FileItem = Extract<Item, { kind: "FILE" }>;

/**
 * What a listing does when you click something, and what sits in its action
 * slot. Shared by the grid and the list so the two cannot disagree.
 *
 * Two shapes, deliberately exclusive rather than one bag of optional props:
 *
 * - **Owned** — the caller names a drive, and everything else follows from it:
 *   folders link into `/drives/:id`, files download, each row carries the `⋯`
 *   menu.
 * - **Foreign** — any listing that is not the owner's own drive. Today that is
 *   a public share, which routes into `/share/:token`, opens files in a viewer
 *   instead of downloading them, and has no actions at all.
 *
 * The union is the point. A share listing that forgot to pass `folderHref`
 * would silently render links into the *owner's* drive — routes a visitor
 * cannot open and should never be shown. Making the three foreign props
 * required together turns that into a type error rather than a leak, which is
 * the same argument that makes `Scope` a required argument in the backend.
 */
export type EntryBehaviour =
  | {
      driveId: string;
      renderActions?: undefined;
      folderHref?: undefined;
      onOpenFile?: undefined;
    }
  | {
      driveId?: undefined;
      /** Return `null` for a listing with no actions at all. */
      renderActions: (item: Item) => React.ReactNode;
      folderHref: (folder: FolderItem) => string;
      onOpenFile: (file: FileItem) => void;
    };

/** The resolved behaviour a tile or row is handed. */
export type ResolvedBehaviour = {
  folderHref: (folder: FolderItem) => string;
  renderActions: (item: Item) => React.ReactNode;
  openFile: (file: FileItem) => void;
  /** The file currently opening, so its control can refuse a second click. */
  openingId: string | null;
};

/**
 * Fills in the owner defaults, or passes the foreign behaviour through.
 *
 * `useDownload` is called unconditionally because hooks must be — in a foreign
 * listing its result is simply unused, which costs a `useState` and no
 * request. The alternative, two components, would duplicate every tile
 * arrangement to avoid one idle hook.
 */
export function useEntryBehaviour(behaviour: EntryBehaviour): ResolvedBehaviour {
  const { download, pendingId } = useDownload();

  if (behaviour.driveId === undefined) {
    return {
      folderHref: behaviour.folderHref,
      renderActions: behaviour.renderActions,
      openFile: behaviour.onOpenFile,
      openingId: null,
    };
  }

  const driveId = behaviour.driveId;
  return {
    folderHref: (folder) => `/drives/${driveId}/f/${folder.id}`,
    renderActions: (item) => <ItemActions driveId={driveId} item={item} />,
    openFile: (file) => void download(file.id, file.name),
    openingId: pendingId,
  };
}
