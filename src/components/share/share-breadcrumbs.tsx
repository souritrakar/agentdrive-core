"use client";

// The `/ssr` entry exports only components; the shared types come from the
// package root, and `import type` erases at compile time so no barrel is pulled.
import type { Icon } from "@phosphor-icons/react";
import { CaretRight, Folder, HardDrive } from "@phosphor-icons/react/ssr";
import Link from "next/link";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Item } from "@/lib/types";
import { cn } from "@/lib/utils";

type Crumb = { id: string; name: string; href: string; isRoot: boolean };

/**
 * The path above the current folder — inside the share, and never above it.
 *
 * A separate component from the owner's `BreadcrumbTrail` rather than the same
 * one with a different root, because the two differ in *kind*. The owner's
 * trail starts at "All drives" and names the drive a folder lives in; a
 * visitor's world begins at whatever was shared, and naming the drive or any
 * ancestor above the grant would leak structure the owner did not share. The
 * module already truncates `ancestors` at the subject
 * (docs/architecture/sharing/01-sharing-module.md §4); this component is the
 * half of that rule that lives in the UI, and it cannot climb higher than the
 * data it is given.
 *
 * At the subject root the trail is empty, and the caller renders no bar at all
 * — an empty bar is worse than no bar, the same rule the app's top bar follows.
 *
 * Glyph, weight, and overflow behaviour match the owner trail: the root is the
 * context everything below it hangs from, so it keeps full strength while the
 * folders under it are supporting text; past five crumbs the middle collapses
 * into a dropdown and the first two are always kept.
 */
export function ShareBreadcrumbs({
  token,
  subjectName,
  subjectKind,
  ancestors,
}: {
  token: string;
  /** The shared folder's or drive's own name — the root of the visitor's world. */
  subjectName: string;
  subjectKind: "DRIVE" | "FOLDER";
  /** Folders between the subject and the current one, already clipped. */
  ancestors: Array<Pick<Item, "id" | "name">>;
}) {
  const crumbs: Crumb[] = [
    {
      id: "subject",
      name: subjectName,
      href: `/share/${token}`,
      isRoot: true,
    },
    ...ancestors.map((ancestor) => ({
      id: ancestor.id,
      name: ancestor.name,
      href: `/share/${token}/f/${ancestor.id}`,
      isRoot: false,
    })),
  ];

  const RootGlyph: Icon = subjectKind === "DRIVE" ? HardDrive : Folder;

  const isOverflowing = crumbs.length > 5;
  const leading = isOverflowing ? crumbs.slice(0, 2) : crumbs;
  const hidden = isOverflowing ? crumbs.slice(2, -2) : [];
  const trailing = isOverflowing ? crumbs.slice(-2) : [];

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol role="list" className="flex min-w-0 items-center gap-1">
        {leading.map((crumb, index) => (
          <CrumbLink
            key={crumb.id}
            crumb={crumb}
            glyph={crumb.isRoot ? RootGlyph : Folder}
            isFirst={index === 0}
          />
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
                {hidden.map((crumb) => (
                  <DropdownMenuItem key={crumb.id} asChild>
                    <Link href={crumb.href}>
                      <Folder weight="duotone" className="size-4 shrink-0" />
                      {crumb.name}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        )}

        {trailing.map((crumb) => (
          <CrumbLink
            key={crumb.id}
            crumb={crumb}
            glyph={crumb.isRoot ? RootGlyph : Folder}
          />
        ))}
      </ol>
    </nav>
  );
}

function CrumbLink({
  crumb,
  glyph: Glyph,
  isFirst,
}: {
  crumb: Crumb;
  glyph: Icon;
  isFirst?: boolean;
}) {
  return (
    <li className="flex min-w-0 items-center gap-1">
      {!isFirst && <Separator />}
      <Link
        href={crumb.href}
        className={cn(
          "flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 outline-none hover:bg-muted/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
          crumb.isRoot
            ? "type-label text-foreground/85"
            : "type-body text-muted-foreground",
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
