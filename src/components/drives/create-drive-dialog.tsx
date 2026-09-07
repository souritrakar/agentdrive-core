"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { NameDialog } from "@/components/shared";
import { createDrive } from "@/lib/drive-api";

/**
 * Creating a drive navigates straight into it — a new empty drive is something
 * you made in order to put things in, so landing on the list would just mean
 * one more click.
 */
export function CreateDriveDialog({ trigger }: { trigger: React.ReactNode }) {
  const router = useRouter();

  return (
    <NameDialog
      trigger={trigger}
      title="New drive"
      description="A drive is a workspace for files. You can create as many as you need."
      label="Name"
      placeholder="Research Agent"
      submitLabel="Create drive"
      onSubmit={async (name) => {
        const drive = await createDrive(name);
        toast.success(`Created ${drive.name}`);
        router.push(`/drives/${drive.id}`);
      }}
    />
  );
}
