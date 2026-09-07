"use client";

import { Plus } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { CreateDriveDialog } from "@/components/drives";
import { SidebarActions } from "./sidebar-actions";
import { SidebarProfile } from "./sidebar-profile";
import { SidebarToggle } from "./sidebar-toggle";
import { InlineError } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Logo, LogoMark } from "@/components/ui/logo";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useResource } from "@/hooks/use-resource";
import { listDrives } from "@/lib/drive-api";
import type { Drive } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Sidebar body, shared by the desktop rail and the mobile drawer so there is
 * one definition of the navigation.
 *
 * Top to bottom: brand, the two actions worth doing, the drives that are the
 * navigation, and who you are. Actions sit above the list rather than in a page
 * header because they should not move when you navigate — a control that
 * changes position between pages is one you have to locate again each time.
 *
 * The drive list *is* the navigation — there is no separate "Drives" nav item
 * pointing at a page that lists the same things the sidebar already shows.
 *
 * Rows carry no per-item icon when expanded. A column of identical drive
 * glyphs is decoration that repeats what the label already says, and removing
 * it is what lets the rows breathe at `h-10` without the rail growing wider.
 * Collapsed, where there is no label left to read, the initial takes over as
 * the identity.
 *
 * `isCollapsed` arrives as a prop rather than being read from context, because
 * the mobile drawer renders this same component and must always render it
 * expanded — a 72px rail inside a 288px drawer would be nonsense.
 *
 * `showCollapseToggle` is separate from `isCollapsed` and is not its negation.
 * The drawer is uncollapsed but must still not offer the control: collapsing a
 * rail that is currently a modal sheet does nothing visible, and because Radix
 * moves focus to the first focusable element on open, that dead control was
 * being focused — and tooltipped — every time the drawer opened.
 */
export function SidebarContent({
  isCollapsed = false,
  showCollapseToggle = false,
  onNavigate,
}: {
  isCollapsed?: boolean;
  showCollapseToggle?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { data: drives, isLoading, error, refresh } = useResource(
    "drives",
    listDrives,
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className={cn(
          "flex h-16 shrink-0 items-center",
          isCollapsed ? "justify-center px-2" : "justify-between px-4",
        )}
      >
        <Link
          href="/drives"
          aria-label="Homepage"
          onClick={onNavigate}
          className="flex items-center rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {isCollapsed ? <LogoMark /> : <Logo />}
        </Link>

        {showCollapseToggle && !isCollapsed && <SidebarToggle />}
      </div>

      {/*
        Collapsed, the toggle joins the icon column instead of the header row —
        there is no width beside a centred logo mark to put it in. It has to be
        somewhere in the rail either way: the top bar that used to carry it is
        breadcrumbs-only now and does not render on every page.
      */}
      {showCollapseToggle && isCollapsed && (
        <div className="flex shrink-0 justify-center px-2 pb-2">
          <SidebarToggle />
        </div>
      )}

      <SidebarActions isCollapsed={isCollapsed} />

      <div
        className={cn(
          "flex shrink-0 items-center gap-2 pt-3 pb-2",
          isCollapsed ? "justify-center px-2" : "justify-between px-4",
        )}
      >
        {!isCollapsed && (
          // A section label, not a heading: one step down in size from the rows
          // it introduces, so it frames them instead of competing with them.
          <h2 className="type-meta font-medium text-muted-foreground">
            Drives
          </h2>
        )}
        <CreateDriveDialog
          trigger={
            <Button
              size="icon-sm"
              variant="ghost"
              className="relative text-muted-foreground hover:text-foreground"
              aria-label="New drive"
            >
              <Plus />
              <span
                aria-hidden="true"
                className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2"
              />
            </Button>
          }
        />
      </div>

      <nav
        className={cn(
          "min-h-0 flex-1 overflow-y-auto pb-4",
          isCollapsed ? "px-2" : "px-3",
        )}
      >
        {isLoading ? (
          <ul role="list" className="flex flex-col gap-1">
            {["w-28", "w-20", "w-24"].map((width) => (
              <li key={width} className="flex h-10 items-center px-3">
                {isCollapsed ? (
                  <Skeleton className="size-7 rounded-md" />
                ) : (
                  <Skeleton className={cn("h-3.5 rounded-sm", width)} />
                )}
              </li>
            ))}
          </ul>
        ) : error ? (
          /*
            Not "No drives yet" — that was a confident lie whenever the backend
            was down, and the two facts are different: an empty list is a real
            answer, a failed request is no answer at all. Collapsed there is no
            width for either sentence, so the rail says nothing and the pane
            beside it carries the explanation.
          */
          !isCollapsed && <InlineError error={error} onRetry={refresh} />
        ) : drives && drives.length > 0 ? (
          <ul role="list" className="flex flex-col gap-1">
            {drives.map((drive) => (
              <DriveRow
                key={drive.id}
                drive={drive}
                isActive={pathname.startsWith(`/drives/${drive.id}`)}
                isCollapsed={isCollapsed}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        ) : (
          !isCollapsed && (
            <p className="type-body px-3 py-1 text-muted-foreground">
              No drives yet.
            </p>
          )
        )}
      </nav>

      <SidebarProfile isCollapsed={isCollapsed} />
    </div>
  );
}

function DriveRow({
  drive,
  isActive,
  isCollapsed,
  onNavigate,
}: {
  drive: Drive;
  isActive: boolean;
  isCollapsed: boolean;
  onNavigate?: () => void;
}) {
  const href = `/drives/${drive.id}`;

  if (isCollapsed) {
    return (
      <li>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={isActive ? "page" : undefined}
              className="grid h-10 place-items-center rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {/*
                The initial, not a generic drive glyph. Ten drives rendered as
                ten identical icons is a rail you cannot navigate without
                hovering each one in turn.
              */}
              <span
                className={cn(
                  "type-monogram-sm grid size-7 place-items-center rounded-md",
                  isActive
                    ? // No room for the rail marker at 72px, so the tile itself
                      // carries the state — teal fill, teal letter, teal ring.
                      // The ring is what makes it read as selected rather than
                      // merely tinted.
                      "bg-teal/15 text-teal inset-ring inset-ring-teal/30"
                    : // Matches the expanded rows' inactive tone, so collapsing
                      // does not silently dim the whole list.
                      "bg-secondary text-foreground/70",
                )}
              >
                {drive.name.slice(0, 1)}
              </span>
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">{drive.name}</TooltipContent>
        </Tooltip>
      </li>
    );
  }

  return (
    <li className="relative">
      {/*
        The active marker sits on the rail, not inside the row.

        It used to be an absolutely-positioned bar at the row's own `left-0`,
        which put it exactly where a `rounded-lg` corner curves away — so it
        read as a stray tick half-swallowed by the background rather than as an
        indicator. Anchoring it to the `<li>` and pushing it into the nav's own
        padding gives it a straight edge to sit against, and it now lines up
        down the rail across every row.
      */}
      {isActive && (
        <span
          aria-hidden="true"
          className="absolute top-1/2 -left-2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-teal"
        />
      )}

      <Link
        href={href}
        onClick={onNavigate}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          // `font-medium` on every state, never only the active one. Weight is
          // the loudest signal typography has, and swapping it on selection
          // reflows the row by a pixel or two — the label visibly twitches as
          // you move between drives. Colour and background carry the state.
          "type-label flex h-10 items-center rounded-lg px-3 outline-none",
          "focus-visible:ring-3 focus-visible:ring-ring/50",
          isActive
            ? // The ring is what stops the fill reading as a flat grey slab: it
              // catches the top edge the way the tiles elsewhere do, so the
              // selected row sits slightly proud of the rail instead of being
              // a hole cut in it.
              "bg-secondary text-foreground inset-ring inset-ring-white/8"
            : // Brighter than `muted-foreground`, which is tuned for supporting
              // text. These are the app's primary navigation and were reading
              // as though they had been disabled.
              "text-foreground/70 hover:bg-muted/60 hover:text-foreground",
        )}
      >
        <span className="min-w-0 truncate">{drive.name}</span>
      </Link>
    </li>
  );
}
