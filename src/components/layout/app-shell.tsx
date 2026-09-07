"use client";

import { useParams } from "next/navigation";

import { MobileNav } from "./mobile-nav";
import { SidebarContent } from "./sidebar-content";
import {
  SidebarProvider,
  useSidebar,
} from "./sidebar-provider";
import { DropOverlay, UploadPicker, UploadProvider, UploadTray } from "@/components/upload";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";

/**
 * The application frame, in three parts: a sidebar rail on the left, an
 * optional top bar, and the content pane between and below them.
 *
 * The sidebar shares the page background and is separated by a hairline border
 * rather than a fill — a large tinted panel is what makes dark app UIs look
 * cheap (docs/design/principles.md). Below `lg:` it collapses into a drawer.
 *
 * `defaultCollapsed` is read from a cookie by the Server Component above this
 * one, so the rail renders at its real width in the first HTML response.
 *
 * `disableUpload` turns off every route into the upload flow — the provider,
 * the drop-anywhere overlay, the tray, and the mobile header's picker —
 * whatever the route params say. The share pages pass it, including for
 * signed-in visitors: they are looking at someone else's drive, and a drop
 * target that ends in a permissions error is worse than no drop target. It is
 * a prop rather than a happy accident of `/share/*` carrying no `driveId`,
 * because that accident would end the first time a route param was renamed.
 */
export function AppShell({
  defaultCollapsed,
  disableUpload = false,
  children,
}: {
  defaultCollapsed: boolean;
  disableUpload?: boolean;
  children: React.ReactNode;
}) {
  const params = useParams();
  const driveId = typeof params.driveId === "string" ? params.driveId : null;
  const parentId = typeof params.folderId === "string" ? params.folderId : null;

  const uploadDriveId = disableUpload ? null : driveId;

  return (
    <SidebarProvider defaultCollapsed={defaultCollapsed}>
      <UploadScope driveId={uploadDriveId} parentId={parentId}>
        <Frame hasDrive={Boolean(uploadDriveId)}>{children}</Frame>
      </UploadScope>
    </SidebarProvider>
  );
}

/**
 * Puts the upload queue above the sidebar rather than inside the page.
 *
 * It used to live in the browser view, which was fine while the Upload button
 * lived there too. Now that the button is in the sidebar, the provider has to
 * sit above both — the sidebar is not a descendant of the page, so a provider
 * mounted down there is invisible to it.
 *
 * The whole scope is absent outside a drive. There is no target to upload into
 * on the drive index, and mounting a provider with a null `driveId` would mean
 * every consumer handling a state that only exists on one route.
 */
function UploadScope({
  driveId,
  parentId,
  children,
}: {
  driveId: string | null;
  parentId: string | null;
  children: React.ReactNode;
}) {
  if (!driveId) return children;

  return (
    <UploadProvider driveId={driveId} parentId={parentId}>
      {children}
      {/* Fixed-position overlays. Rendered here, once, rather than by whichever
          page happens to be mounted — dropping a file is a property of the app,
          not of a route. */}
      <DropOverlay />
      <UploadTray />
    </UploadProvider>
  );
}

function Frame({
  hasDrive,
  children,
}: {
  hasDrive: boolean;
  children: React.ReactNode;
}) {
  const { isCollapsed } = useSidebar();

  return (
    <div className="flex min-h-dvh">
      {/*
        Two nested elements, and the split is what makes the collapse look
        deliberate instead of shuddery. The outer element animates its width and
        clips; the inner one snaps to the target width immediately with no
        transition of its own. Animating a single element would re-run
        truncation and text wrapping on every frame of the 200ms — the content
        would visibly reflow as the rail moved. This way the content is composed
        once and the rail slides over it.
      */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-20 overflow-hidden border-r border-border max-lg:hidden",
          "motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-out",
          isCollapsed ? "w-(--sidebar-width-icon)" : "w-(--sidebar-width)",
        )}
      >
        <div
          className={cn(
            "h-full",
            isCollapsed ? "w-(--sidebar-width-icon)" : "w-(--sidebar-width)",
          )}
        >
          <SidebarContent isCollapsed={isCollapsed} showCollapseToggle />
        </div>
      </aside>

      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col",
          "motion-safe:transition-[padding] motion-safe:duration-200 motion-safe:ease-out",
          isCollapsed
            ? "lg:pl-(--sidebar-width-icon)"
            : "lg:pl-(--sidebar-width)",
        )}
      >
        {/* Mobile only — on desktop the rail carries the navigation. */}
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur-sm lg:hidden">
          <MobileNav />
          <Logo />

          {/*
            Upload is duplicated here on purpose. On desktop it lives in the
            rail, which is always on screen; on a phone that rail is a drawer,
            and burying the product's primary action behind a hamburger means
            two taps and a guess to do the main thing. This is the only action
            that earns the duplication.
          */}
          <div className="flex flex-1 items-center justify-end">
            {hasDrive && <UploadPicker size="sm" />}
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
