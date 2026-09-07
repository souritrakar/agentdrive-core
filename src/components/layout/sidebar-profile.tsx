"use client";

import { UserButton } from "@clerk/nextjs";
import { User } from "@phosphor-icons/react/ssr";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { clerkAppearance } from "@/lib/clerk-appearance";
// From this dedicated module, not "@/lib/auth" — that file also dynamically
// imports "@clerk/nextjs/server", which must never reach a Client Component's
// bundle. See src/lib/is-auth-configured.ts.
import { isAuthConfigured } from "@/lib/is-auth-configured";

/**
 * The account row pinned to the bottom of the sidebar.
 *
 * Renders something in every configuration, which the version this replaces did
 * not: with Clerk unset it returned `null`, so the sidebar simply stopped —
 * leaving a column of nav items ending in dead space and no indication of who
 * you were signed in as. An unconfigured app is still an app someone is looking
 * at, and "Local account" is a truthful answer where nothing was the wrong one.
 *
 * Collapsed, the row narrows to the avatar alone. The name is not truncated to
 * fit a 72px rail — it is removed, and the tooltip carries it.
 */
export function SidebarProfile({ isCollapsed }: { isCollapsed: boolean }) {
  return (
    <div className="shrink-0 border-t border-border p-3">
      {isAuthConfigured() ? (
        <UserButton
          showName={!isCollapsed}
          appearance={{
            ...clerkAppearance,
            elements: {
              rootBox: "w-full",
              userButtonTrigger: isCollapsed
                ? "flex w-full justify-center rounded-lg p-1 outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
                : "type-body w-full rounded-lg p-2 text-muted-foreground outline-none hover:bg-muted/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
              userButtonBox: isCollapsed
                ? ""
                : "w-full flex-row-reverse justify-between gap-2",
              userButtonOuterIdentifier: "type-body text-foreground",
            },
          }}
        />
      ) : (
        <LocalAccountRow isCollapsed={isCollapsed} />
      )}
    </div>
  );
}

/**
 * Stand-in for the signed-in user when Clerk is not configured.
 *
 * Not a button. There is genuinely nothing to open — offering a menu that does
 * nothing is worse than offering none, and a hover state on an element that
 * cannot be clicked is a lie about what will happen.
 */
function LocalAccountRow({ isCollapsed }: { isCollapsed: boolean }) {
  const avatar = (
    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary outline-1 -outline-offset-1 outline-white/10">
      <User weight="duotone" className="size-4 text-muted-foreground" />
    </span>
  );

  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex justify-center py-1">
            {avatar}
            {/*
              Collapsed, the row is an unlabelled icon and the tooltip is the
              only thing naming it — but Radix's `asChild` does not make a
              non-focusable child focusable, so that name reached a mouse and
              nothing else. This carries it unconditionally.
            */}
            <span className="sr-only">
              Local account — authentication is not configured
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">
          Local account — authentication is not configured
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="flex items-center gap-2.5 px-2 py-1">
      {avatar}
      {/*
        Sized up on mobile, because this component is not desktop-only: the
        drawer renders the sidebar expanded, so every string in here is phone
        copy too and has to clear the 16px floor there.
      */}
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="type-label truncate">
          Local account
        </p>
        <p className="type-meta truncate text-muted-foreground">
          Authentication not configured
        </p>
      </div>
    </div>
  );
}
