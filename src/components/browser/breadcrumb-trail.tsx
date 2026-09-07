"use client";

// The `/ssr` entry exports only components; the shared types come from the
// package root, and `import type` erases at compile time so no barrel is pulled.
import type { Icon } from "@phosphor-icons/react";
import { CaretRight, Folder, HardDrive, HardDrives } from "@phosphor-icons/react/ssr";
import Link from "next/link";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Drive, Item } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Each level gets its own glyph, so depth is readable without parsing names. */
type Level = "index" | "drive" | "folder";

type Crumb = {
  id: string;
  name: string;
  href: string;
  level: Level;
};

const GLYPH: Record<Level, Icon> = {
  index: HardDrives,
  drive: HardDrive,
  folder: Folder,
};

/**
 * The path *above* the current location.
 *
 * The current folder is deliberately excluded — it is the `<h1>` directly
 * below, and repeating it in the trail would say the same thing twice at two
 * sizes.
 *
 * Every crumb carries a glyph for its *kind*, which is what makes a deep path
 * readable at a glance: plural drives for the index, a single drive for the one
 * you are in, a folder for each level under it. Without them a four-level trail
 * is four indistinguishable words and the only way to tell a drive from a
 * folder is to already know.
 *
 * Weight reinforces the same thing. The drive is the root of the current
 * context and sits at full strength; folders below it are supporting text.
 * Making them all one colour would flatten exactly the hierarchy the glyphs are
 * there to express.
 *
 * At a drive root the trail is not empty, which it used to be: it shows "All
 * drives". A bar whose contents vanish at the top level looks broken, and more
 * usefully there was previously no way back out of a drive except the sidebar.
 */
export function BreadcrumbTrail({
  drive,
  ancestors,
  isRoot,
}: {
  drive: Drive;
  ancestors: Array<Pick<Item, "id" | "name">>;
  isRoot: boolean;
}) {
  const crumbs: Crumb[] = [
    { id: "index", name: "All drives", href: "/drives", level: "index" },
    // At a drive root the drive name is the page title, so including it here
    // would be the duplicate the rule above rules out.
    ...(isRoot
      ? []
      : [
          {
            id: drive.id,
            name: drive.name,
            href: `/drives/${drive.id}`,
            level: "drive" as const,
          },
        ]),
    ...ancestors.map((ancestor) => ({
      id: ancestor.id,
      name: ancestor.name,
      href: `/drives/${drive.id}/f/${ancestor.id}`,
      level: "folder" as const,
    })),
  ];

  /*
    Overflow keeps the first *two* crumbs, not just the first.

    The second is the drive, and it is the one piece of context that must never
    be collapsed: which drive you are in changes what everything below it means,
    and an earlier version that kept only "All drives" pushed the drive name
    into the menu the moment a path got deep — losing exactly the distinction
    the glyphs are there to draw.

    The threshold is 6 rather than 5 so that collapsing always hides at least
    two crumbs. Replacing a single crumb with an ellipsis of the same width
    saves nothing and costs a click.
  */
  const isOverflowing = crumbs.length > 5;
  const leading = isOverflowing ? crumbs.slice(0, 2) : crumbs;
  const hidden = isOverflowing ? crumbs.slice(2, -2) : [];
  const trailing = isOverflowing ? crumbs.slice(-2) : [];

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol role="list" className="flex min-w-0 items-center gap-1">
        {/*
          `isFirst` is per-crumb, not per-group: when the trail is short enough
          not to overflow, `leading` holds every crumb, and marking them all
          first suppressed every separator in the common case.
        */}
        {leading.map((crumb, index) => (
          <CrumbLink key={crumb.id} crumb={crumb} isFirst={index === 0} />
        ))}

        {hidden.length > 0 && (
          <li className="flex shrink-0 items-center gap-1">
            <Separator />
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={`Show ${hidden.length} more levels`}
                className="type-body rounded-md px-1.5 py-1 text-muted-foreground outline-none hover:bg-muted/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                &hellip;
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {hidden.map((crumb) => {
                  const Glyph = GLYPH[crumb.level];
                  return (
                    <DropdownMenuItem key={crumb.id} asChild>
                      <Link href={crumb.href}>
                        <Glyph weight="duotone" className="size-4 shrink-0" />
                        {crumb.name}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        )}

        {trailing.map((crumb) => (
          <CrumbLink key={crumb.id} crumb={crumb} />
        ))}
      </ol>
    </nav>
  );
}

function CrumbLink({ crumb, isFirst }: { crumb: Crumb; isFirst?: boolean }) {
  const Glyph = GLYPH[crumb.level];
  // The drive is the root of the context you are inside; the folders under it
  // are the route you took to get here.
  const isDrive = crumb.level === "drive";

  return (
    <li className="flex min-w-0 items-center gap-1">
      {!isFirst && <Separator />}
      <Link
        href={crumb.href}
        className={cn(
          "flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 outline-none hover:bg-muted/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
          isDrive ? "type-label text-foreground/85" : "type-body text-muted-foreground",
        )}
      >
        <Glyph weight="duotone" className="size-4 shrink-0" />
        <span className="min-w-0 truncate">{crumb.name}</span>
      </Link>
    </li>
  );
}

function Separator() {
  return (
    <CaretRight
      aria-hidden="true"
      className="size-3.5 shrink-0 text-muted-foreground/40"
    />
  );
}
