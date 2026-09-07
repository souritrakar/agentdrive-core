import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { drive, folders } from "@/fixtures";

import { FolderTile } from "./folder-tile";
import { ItemActions } from "./item-actions";

/**
 * A single folder in grid view.
 *
 * `href` and `actions` are handed in rather than derived, because the same
 * tile is rendered by the owner's drive and by a public share and the two
 * disagree about both. The stories therefore supply them the way each caller
 * would — which is also the cheapest way to see that a read-only tile is a
 * tile with one element missing, not a different component.
 */
const meta = {
  title: "Components/Folder tile",
  component: FolderTile,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <ul role="list" className="w-72">
        <Story />
      </ul>
    ),
  ],
} satisfies Meta<typeof FolderTile>;

export default meta;
type Story = StoryObj<typeof meta>;

/** As the owner sees it: a drive-relative link and the `⋯` menu. */
export const Default: Story = {
  args: {
    folder: folders[0],
    href: `/drives/${drive.id}/f/${folders[0].id}`,
    actions: <ItemActions driveId={drive.id} item={folders[0]} />,
  },
};

/** Singular. The place a naive pluralisation shows itself. */
export const OneItem: Story = {
  args: {
    folder: { ...folders[0], name: "Legal", childCount: 1 },
    href: `/drives/${drive.id}/f/${folders[0].id}`,
    actions: <ItemActions driveId={drive.id} item={folders[0]} />,
  },
};

/** Zero. "Empty" rather than "0 items", which reads as a bug. */
export const EmptyFolder: Story = {
  args: {
    folder: folders[2],
    href: `/drives/${drive.id}/f/${folders[2].id}`,
    actions: <ItemActions driveId={drive.id} item={folders[2]} />,
  },
};

/** A name with no natural break — the truncation check. */
export const LongName: Story = {
  args: {
    folder: folders[3],
    href: `/drives/${drive.id}/f/${folders[3].id}`,
    actions: <ItemActions driveId={drive.id} item={folders[3]} />,
  },
};

/**
 * As a visitor sees it in a share: the link points into `/share/:token`, and
 * there is no actions slot at all — not a disabled one, which would be a menu
 * of refusals.
 */
export const ReadOnly: Story = {
  args: {
    folder: folders[0],
    href: `/share/tok_9f2b/f/${folders[0].id}`,
  },
};
