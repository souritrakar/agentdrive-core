"use client";

import { FolderPlus } from "@phosphor-icons/react/ssr";
import { useParams } from "next/navigation";

import { CreateFolderDialog } from "@/components/drives";
import { UploadPicker } from "@/components/upload";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Upload and New folder, at the top of the sidebar.
 *
 * These live in the shell rather than the page because they are the two things
 * a person comes here to do, and an action that moves depending on which page
 * you are on is an action you have to find again every time. Fixed position,
 * always the same two shapes, directly under the logo.
 *
 * They are still *contextual* — both need a drive to act on, so the block is
 * absent on the drive index. Rendering them disabled there would be worse: a
 * permanently greyed-out primary button teaches people to ignore the one
 * control the product most wants them to use.
 *
 * The route is read with `useParams` rather than threaded down from the shell,
 * because the mobile drawer renders this same tree from a different branch and
 * would otherwise need to forward props it has no other use for.
 */
export function SidebarActions({ isCollapsed }: { isCollapsed: boolean }) {
  const params = useParams();
  const driveId = typeof params.driveId === "string" ? params.driveId : null;
  const parentId = typeof params.folderId === "string" ? params.folderId : null;

  // No drive in the URL means no target for either action, and — importantly —
  // no UploadProvider mounted above us, so `UploadPicker` must not render.
  if (!driveId) return null;

  if (isCollapsed) {
    return (
      <div className="flex shrink-0 flex-col items-center gap-1.5 px-2 pb-2">
        <UploadPicker size="icon-lg" tooltip="Upload" />

        {/*
          The Tooltip root sits outside the dialog, with only its trigger
          passed in. `DialogTrigger asChild` clones a single element and
          forwards props to it — handing it a Tooltip root, which renders no
          DOM of its own, would drop the click handler on the floor. Nesting
          the two `asChild` triggers is the composition that actually works.
        */}
        <Tooltip>
          <CreateFolderDialog
            driveId={driveId}
            parentId={parentId}
            trigger={
              <TooltipTrigger asChild>
                <Button size="icon-lg" variant="outline" aria-label="New folder">
                  <FolderPlus />
                </Button>
              </TooltipTrigger>
            }
          />
          <TooltipContent side="right">New folder</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-col gap-2 px-3 pb-2">
      {/* Left-aligned, not centred: these read as menu entries in a column, and
          centred labels in a full-width button look like a dialog footer. */}
      <UploadPicker className="w-full justify-start" />
      <CreateFolderDialog
        driveId={driveId}
        parentId={parentId}
        trigger={
          <Button
            size="lg"
            variant="outline"
            className="w-full justify-start py-2 pr-3 pl-2"
          >
            <FolderPlus data-icon="inline-start" />
            New folder
          </Button>
        }
      />
    </div>
  );
}
