import { Folder } from "@phosphor-icons/react/ssr";
import Link from "next/link";

import { formatItemCount } from "@/lib/format";
import type { Item } from "@/lib/types";

/**
 * A folder in the grid.
 *
 * Deliberately a different *shape* from a file tile — wide and short against
 * the file's tall portrait — so the two classes of object are separable before
 * you read a single character. That shape difference is doing the work colour
 * would normally do, which is what lets folders stay neutral and keeps teal
 * free for its one job.
 *
 * The link is stretched over the whole card with `after:inset-0` rather than
 * wrapping it, so the name can live in a real `<p>` (block markup inside an
 * `<a>` is legal, but the same trick is what lets the file tile use a
 * `<button>`, and the two tiles are easier to keep in sync built the same way).
 *
 * `href` and `actions` are handed in rather than derived. The tile is rendered
 * by two different listings now — the owner's drive and a public share — and
 * they disagree about both: one routes to `/drives/:id/f/:id` with a `⋯` menu,
 * the other to `/share/:token/f/:id` with nothing. Deriving either here would
 * mean the tile knowing which world it is in, which is the knowledge the grid
 * above it already has.
 */
export function FolderTile({
  folder,
  href,
  actions,
}: {
  folder: Extract<Item, { kind: "FOLDER" }>;
  href: string;
  /** The `⋯` menu, or nothing at all in a read-only listing. */
  actions?: React.ReactNode;
}) {
  return (
    <li className="relative">
      <div className="flex items-center gap-3 rounded-xl bg-card p-3 inset-ring inset-ring-white/5 has-[a:hover]:bg-accent has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50">
        {/*
          Duotone in plain foreground. A folder is a container, not a type —
          it gets no tint, which is also what stops a drive full of folders
          from reading as one flat colour field.
        */}
        <Folder
          weight="duotone"
          className="size-8 shrink-0 text-foreground/90"
        />

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="type-label truncate">
            <Link
              href={href}
              className="outline-none after:absolute after:inset-0 after:rounded-xl"
            >
              {folder.name}
            </Link>
          </p>
          <p className="type-meta truncate text-muted-foreground">
            {formatItemCount(folder.childCount ?? 0)}
          </p>
        </div>

        {actions && <div className="relative z-10 shrink-0">{actions}</div>}
      </div>
    </li>
  );
}
