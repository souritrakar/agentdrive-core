"use client";

import { useEntryBehaviour, type EntryBehaviour } from "./entry-behaviour";
import { FileTile } from "./file-tile";
import { FolderTile } from "./folder-tile";
import type { Item } from "@/lib/types";

/**
 * One level of a drive, as a grid.
 *
 * Two grids rather than one, because folders and files are different shapes and
 * a single track sizing cannot serve both. Folders sort above files — what
 * every file manager does, and what people expect when scanning.
 *
 * Column counts come from `auto-fill` + `minmax`, not from breakpoints. The
 * grid then responds to its own width rather than the viewport's, which matters
 * here specifically: collapsing the sidebar hands the content column ~200px
 * without the viewport changing at all, and a `sm:`/`lg:` grid would sit at the
 * old column count until the window itself was resized.
 *
 * The two groups are separated by space alone. A "Folders" heading above a row
 * of obvious folder tiles is a label that states the obvious, and the tiles
 * already announce which class they belong to.
 *
 * Where the tiles link and what the `⋯` slot holds comes from `EntryBehaviour`
 * — `driveId` for the owner's own drive, or explicit routing for a listing
 * that is not theirs. The arrangement below is the same either way, which is
 * the reason a public share reuses this component instead of copying it.
 */
export function EntryGrid({ items, ...behaviour }: { items: Item[] } & EntryBehaviour) {
  const { folderHref, renderActions, openFile, openingId } =
    useEntryBehaviour(behaviour);

  const folders = items.filter(
    (item): item is Extract<Item, { kind: "FOLDER" }> => item.kind === "FOLDER",
  );
  const files = items.filter(
    (item): item is Extract<Item, { kind: "FILE" }> => item.kind === "FILE",
  );

  return (
    <div className="flex flex-col gap-8">
      {folders.length > 0 && (
        <ul
          role="list"
          className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3 sm:gap-4"
        >
          {folders.map((folder) => (
            <FolderTile
              key={folder.id}
              folder={folder}
              href={folderHref(folder)}
              actions={renderActions(folder)}
            />
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <ul
          role="list"
          className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3 sm:gap-4"
        >
          {files.map((file) => (
            <FileTile
              key={file.id}
              file={file}
              actions={renderActions(file)}
              onOpen={() => openFile(file)}
              isOpening={openingId === file.id}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
