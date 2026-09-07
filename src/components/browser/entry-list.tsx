"use client";

import { CircleNotch, Folder, WarningCircle } from "@phosphor-icons/react/ssr";
import Link from "next/link";

import {
  useEntryBehaviour,
  type EntryBehaviour,
  type ResolvedBehaviour,
} from "./entry-behaviour";
import { fileKind, TINT_TEXT } from "@/lib/file-kind";
import {
  formatAbsoluteTime,
  formatBytes,
  formatItemCount,
  formatRelativeTime,
} from "@/lib/format";
import type { Item } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * One level of a drive, as a list.
 *
 * The peer of the grid, not a fallback for it: same glyphs, same tints, same
 * ordering. Only the density and the number of visible facts change, which is
 * the whole reason to offer the toggle — a folder of twelve photos wants the
 * grid, a folder of four hundred logs wants this.
 *
 * Sits directly on the page background with horizontal row dividers only. No
 * card, no outer border, no column rules — the treatment that makes a listing
 * read as content rather than as a control panel.
 *
 * Type and size drop below `sm:`. Name and modified are what matter on a phone,
 * and four columns squeezed onto a narrow screen helps nobody.
 *
 * Routing and the action slot arrive as `EntryBehaviour`, exactly as in the
 * grid — see `entry-behaviour.tsx` for why the foreign variant makes all three
 * required together.
 */
export function EntryList({ items, ...behaviour }: { items: Item[] } & EntryBehaviour) {
  const resolved = useEntryBehaviour(behaviour);

  const folders = items.filter(
    (item): item is Extract<Item, { kind: "FOLDER" }> => item.kind === "FOLDER",
  );
  const files = items.filter(
    (item): item is Extract<Item, { kind: "FILE" }> => item.kind === "FILE",
  );

  return (
    <div className="-mx-4 -my-2 overflow-x-auto whitespace-nowrap sm:-mx-6 lg:-mx-8">
      <div className="inline-block min-w-full px-4 py-2 align-middle sm:px-6 lg:px-8">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border">
              <th
                scope="col"
                className="type-label py-2.5 pr-3 whitespace-nowrap text-muted-foreground"
              >
                Name
              </th>
              <th
                scope="col"
                className="type-label px-3 py-2.5 whitespace-nowrap text-muted-foreground max-sm:hidden"
              >
                Type
              </th>
              <th
                scope="col"
                className="type-label px-3 py-2.5 text-right whitespace-nowrap text-muted-foreground max-sm:hidden"
              >
                Size
              </th>
              <th
                scope="col"
                className="type-label py-2.5 pl-3 text-right whitespace-nowrap text-muted-foreground"
              >
                Modified
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-border">
            {folders.map((folder) => {
              const actions = resolved.renderActions(folder);
              return (
                <tr
                  key={folder.id}
                  className="has-[a:hover]:bg-muted/40 has-[a:focus-visible]:bg-muted/40"
                >
                  <td className="py-0 pr-3">
                    <div className="flex min-w-0 items-center gap-1">
                      <Link
                        href={resolved.folderHref(folder)}
                        className="flex min-w-0 flex-1 items-center gap-3 rounded-md py-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <Folder
                          weight="duotone"
                          className="size-5 shrink-0 text-foreground/90"
                        />
                      {/*
                        Sized explicitly. The name cell sets no size of its own,
                        so it inherited the 16px document default while every
                        sibling cell rendered at 14px — the name column came out
                        visibly larger than the rest of the table.
                      */}
                        <span className="type-body min-w-0 truncate">
                          {folder.name}
                        </span>
                      </Link>
                      {actions}
                    </div>
                  </td>
                  <td className="type-meta px-3 py-3 whitespace-nowrap text-muted-foreground max-sm:hidden">
                    Folder
                  </td>
                  <td className="type-meta px-3 py-3 text-right whitespace-nowrap text-muted-foreground max-sm:hidden">
                    {formatItemCount(folder.childCount ?? 0)}
                  </td>
                  <td className="type-meta py-3 pl-3 text-right whitespace-nowrap text-muted-foreground">
                    <ModifiedAt at={folder.updatedAt} />
                  </td>
                </tr>
              );
            })}

            {files.map((file) => (
              <FileRow key={file.id} file={file} behaviour={resolved} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FileRow({
  file,
  behaviour,
}: {
  file: Extract<Item, { kind: "FILE" }>;
  behaviour: ResolvedBehaviour;
}) {
  const kind = fileKind(file.name, file.contentType);

  const isUploading = file.uploadStatus === "PENDING";
  const isFailed = file.uploadStatus === "FAILED";
  const isReady = file.uploadStatus === "READY";

  return (
    <tr
      className={cn(
        "has-[button:focus-visible]:bg-muted/40",
        isReady && "has-[button:hover]:bg-muted/40",
      )}
    >
      <td className="py-0 pr-3">
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            disabled={!isReady || behaviour.openingId === file.id}
            onClick={() => behaviour.openFile(file)}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-md py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default"
          >
          {isUploading ? (
            <CircleNotch className="size-5 shrink-0 animate-spin text-lime" />
          ) : isFailed ? (
            <WarningCircle
              weight="duotone"
              className="size-5 shrink-0 text-destructive"
            />
          ) : (
            <kind.Icon
              weight="duotone"
              className={cn("size-5 shrink-0", TINT_TEXT[kind.tint])}
            />
          )}
          <span
            className={cn(
              "type-body min-w-0 truncate",
              !isReady && "text-muted-foreground",
            )}
          >
            {file.name}
          </span>
          </button>
          {behaviour.renderActions(file)}
        </div>
      </td>
      <td className="type-meta px-3 py-3 whitespace-nowrap text-muted-foreground max-sm:hidden">
        {isFailed ? "Upload failed" : kind.label}
      </td>
      <td className="type-meta px-3 py-3 text-right whitespace-nowrap text-muted-foreground max-sm:hidden">
        {formatBytes(file.sizeBytes)}
      </td>
      <td className="type-meta py-3 pl-3 text-right whitespace-nowrap text-muted-foreground">
        <ModifiedAt at={file.updatedAt} />
      </td>
    </tr>
  );
}

/**
 * Relative by default, with the exact time available on demand.
 *
 * A `<time>` element rather than the Radix tooltip this replaces, for two
 * reasons. Radix's `Trigger asChild` does not make a non-focusable child
 * focusable, so wrapping a bare `<span>` left the absolute timestamp reachable
 * by mouse only — the exact information a keyboard user has no other route to.
 * And a tooltip root per row is a lot of machinery to mount four hundred times
 * in a large folder to serve a string.
 *
 * `dateTime` also makes the value machine-readable, which the span never was.
 */
function ModifiedAt({ at }: { at: string }) {
  return (
    <time dateTime={at} title={formatAbsoluteTime(at)}>
      {formatRelativeTime(at)}
    </time>
  );
}
