import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { EmptySharedFolder } from "./empty-shared-folder";

/**
 * A shared folder with nothing in it.
 *
 * Worth comparing against `Components/Empty folder`, which is the owner's
 * version: same skeleton, one element fewer. The button is absent because
 * there is nothing a visitor can do here, and an empty state in a read-only
 * world is complete information rather than a dead end — the trail above it is
 * already the way back.
 */
const meta = {
  title: "Components/Empty shared folder",
  component: EmptySharedFolder,
  parameters: { layout: "padded" },
} satisfies Meta<typeof EmptySharedFolder>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
