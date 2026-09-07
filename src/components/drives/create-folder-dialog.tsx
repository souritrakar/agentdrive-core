"use client";

import { toast } from "sonner";

import { NameDialog } from "@/components/shared";
import { createFolder } from "@/lib/drive-api";

/**
 * Creating a folder stays put rather than navigating into it — you usually make
 * a folder to move things into from where you already are.
 */
export function CreateFolderDialog({
  driveId,
  parentId,
  trigger,
}: {
  driveId: string;
  parentId: string | null;
  trigger: React.ReactNode;
}) {
  return (
    <NameDialog
      trigger={trigger}
      title="New folder"
      description="Folders can hold files and other folders."
      label="Name"
      placeholder="Reports"
      submitLabel="Create folder"
      onSubmit={async (name) => {
        const item = await createFolder(driveId, parentId, name);
        toast.success(`Created ${item.name}`);
      }}
    />
  );
}
