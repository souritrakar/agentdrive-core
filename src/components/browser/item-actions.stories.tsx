import { useState } from "react";

import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { drive, folders } from "@/fixtures";
import type { FolderPage, Item } from "@/lib/types";

import {
  ItemActions,
  MoveItemDialog,
  RenameItemDialog,
  TrashItemDialog,
} from "./item-actions";

const item = folders[0];

const meta = {
  title: "Components/Item actions",
  component: ItemActions,
  parameters: { layout: "centered" },
  args: { driveId: drive.id, item },
} satisfies Meta<typeof ItemActions>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Open the compact menu to see every metadata action. */
export const Menu: Story = {};

export const Rename: Story = {
  render: function RenameStory() {
    const [open, setOpen] = useState(true);
    return (
      <RenameItemDialog
        item={item}
        open={open}
        onOpenChange={setOpen}
        rename={async (_itemId, name) => ({ ...item, name })}
      />
    );
  },
};

const destinationPage: FolderPage = {
  drive,
  currentFolder: null,
  ancestors: [],
  items: folders.slice(1),
  nextCursor: null,
};

export const Move: Story = {
  render: function MoveStory() {
    const [open, setOpen] = useState(true);
    return (
      <MoveItemDialog
        driveId={drive.id}
        item={item}
        open={open}
        onOpenChange={setOpen}
        loadFolder={async () => destinationPage}
        move={async (_itemId, newParentId) => ({
          item: { ...item, parentId: newParentId },
          previous: { parentId: item.parentId, name: item.name },
        })}
      />
    );
  },
};

export const EmptyDestination: Story = {
  render: function EmptyDestinationStory() {
    const [open, setOpen] = useState(true);
    return (
      <MoveItemDialog
        driveId={drive.id}
        item={item}
        open={open}
        onOpenChange={setOpen}
        loadFolder={async () => ({ ...destinationPage, items: [] })}
        move={async () => ({
          item,
          previous: { parentId: item.parentId, name: item.name },
        })}
      />
    );
  },
};

export const MoveError: Story = {
  render: function MoveErrorStory() {
    const [open, setOpen] = useState(true);
    return (
      <MoveItemDialog
        driveId={drive.id}
        item={item}
        open={open}
        onOpenChange={setOpen}
        loadFolder={async () => {
          throw new Error("The folder list could not be loaded.");
        }}
      />
    );
  },
};

export const TrashConfirmation: Story = {
  render: function TrashStory() {
    const [open, setOpen] = useState(true);
    return (
      <TrashItemDialog
        item={item}
        open={open}
        onOpenChange={setOpen}
        trash={async () => ({
          itemId: item.id,
          previous: { parentId: item.parentId, name: item.name },
        })}
        restore={async (): Promise<Item> => item}
      />
    );
  },
};
