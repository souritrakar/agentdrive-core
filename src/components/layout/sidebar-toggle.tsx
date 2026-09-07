"use client";

import { SidebarSimple } from "@phosphor-icons/react/ssr";

import { useSidebar } from "./sidebar-provider";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Collapses and expands the desktop rail.
 *
 * The same glyph in both states, which is the convention every app that has
 * this control settled on — it names the thing being toggled (the panel), not
 * the direction of travel, so it never has to be read. `aria-expanded` carries
 * the state for anyone who cannot see which way the rail went.
 *
 * Rendered twice: once in the rail's own header, once in the content header.
 * The second is not a duplicate — without it, collapsing the rail would hide
 * the only control that brings it back.
 */
export function SidebarToggle({ className }: { className?: string }) {
  const { isCollapsed, toggle } = useSidebar();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={toggle}
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "relative text-muted-foreground hover:text-foreground",
            className,
          )}
        >
          <SidebarSimple />
          {/* Meets the 48px touch target on coarse pointers without
              changing the rendered size on a mouse. */}
          <span
            aria-hidden="true"
            className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2"
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      </TooltipContent>
    </Tooltip>
  );
}
