import { CircleNotch, WarningCircle } from "@phosphor-icons/react/ssr";

import { fileKind, TINT_TEXT } from "@/lib/file-kind";
import { formatBytes } from "@/lib/format";
import type { Item } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * A file in the grid.
 *
 * The glyph sits directly on the card with no inner panel behind it. An icon in
 * a tinted container is decoration; an icon given room is an object. The
 * generous `aspect-4/3` above the name is what makes the difference — it is the
 * space a thumbnail would eventually occupy, and reserving it now means adding
 * previews later changes nothing about the layout.
 *
 * Upload state replaces the glyph rather than sitting beside it as a badge.
 * One glyph per tile keeps a folder mid-upload quiet, and the state is
 * temporary — a permanent slot for a transient condition is how listings
 * accumulate clutter.
 *
 * What *happens* when the name is pressed is the grid's decision, not the
 * tile's: in the owner's drive a click downloads, in a share it opens the
 * viewer. The tile only knows that the control is a button, that it is
 * disabled until the bytes exist, and that a pending open must not be
 * clickable twice.
 */
export function FileTile({
  file,
  actions,
  onOpen,
  isOpening = false,
}: {
  file: Extract<Item, { kind: "FILE" }>;
  /** The `⋯` menu, or nothing at all in a read-only listing. */
  actions?: React.ReactNode;
  onOpen?: () => void;
  isOpening?: boolean;
}) {
  const kind = fileKind(file.name, file.contentType);

  const isUploading = file.uploadStatus === "PENDING";
  const isFailed = file.uploadStatus === "FAILED";
  // Bytes only exist once storage has them; offering the click earlier would
  // hand the user a 404 dressed up as a download.
  const isReady = file.uploadStatus === "READY";

  return (
    <li className="relative">
      <div
        className={cn(
          "flex flex-col gap-3 rounded-xl bg-card p-3 inset-ring inset-ring-white/5",
          "has-[button:focus-visible]:ring-3 has-[button:focus-visible]:ring-ring/50",
          isReady && "has-[button:hover]:bg-accent",
        )}
      >
        {actions && (
          <div className="absolute top-2 right-2 z-10 shrink-0">{actions}</div>
        )}

        <div className="flex aspect-4/3 items-center justify-center">
          {isUploading ? (
            <CircleNotch className="size-10 shrink-0 animate-spin text-lime" />
          ) : isFailed ? (
            <WarningCircle
              weight="duotone"
              className="size-10 shrink-0 text-destructive"
            />
          ) : (
            <kind.Icon
              weight="duotone"
              className={cn("size-10 shrink-0", TINT_TEXT[kind.tint])}
            />
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-0.5">
          <p
            className={cn(
              "type-label truncate",
              !isReady && "text-muted-foreground",
            )}
          >
            <button
              type="button"
              disabled={!isReady || isOpening || !onOpen}
              onClick={onOpen}
              className="outline-none after:absolute after:inset-0 after:rounded-xl disabled:cursor-default"
            >
              {file.name}
            </button>
          </p>
          <p className="type-meta truncate text-muted-foreground">
            {/*
              Type and size only. A tile is ~150px wide, and adding the
              modified date pushes this past the truncation point — at which
              point all three facts become unreadable to save one. The date
              lives in the list view, where there is a column for it.
            */}
            {isFailed
              ? "Upload failed"
              : isUploading
                ? "Uploading…"
                : `${kind.label} · ${formatBytes(file.sizeBytes)}`}
          </p>
        </div>
      </div>
    </li>
  );
}
