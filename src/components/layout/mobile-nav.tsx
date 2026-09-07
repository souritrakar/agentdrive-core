"use client";

import { List } from "@phosphor-icons/react/ssr";
import { Dialog } from "radix-ui";
import { useState } from "react";

import { SidebarContent } from "./sidebar-content";
import { Button } from "@/components/ui/button";

/**
 * Navigation drawer for viewports below `lg:`.
 *
 * Built on the Dialog primitive directly rather than the shared `DialogContent`
 * because that one is a centred modal that zooms in — a panel anchored to the
 * left edge needs to slide, and overriding the zoom would mean fighting its
 * transform classes. Radix still gives focus trapping, scroll locking, and
 * escape handling.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button
          size="icon-lg"
          variant="ghost"
          className="relative -ml-1.5"
          aria-label="Open navigation"
        >
          <List />
          <span
            aria-hidden="true"
            className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2"
          />
        </Button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r border-border bg-background duration-200 outline-none data-open:animate-in data-open:slide-in-from-left data-closed:animate-out data-closed:slide-out-to-left">
          <Dialog.Title className="sr-only">Navigation</Dialog.Title>
          <SidebarContent onNavigate={() => setOpen(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
