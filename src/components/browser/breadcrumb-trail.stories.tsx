import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { deepAncestors, drive } from "@/fixtures";

import { BreadcrumbTrail } from "./breadcrumb-trail";

const meta = {
  title: "Components/Breadcrumb trail",
  component: BreadcrumbTrail,
  parameters: { layout: "padded" },
  args: { drive },
} satisfies Meta<typeof BreadcrumbTrail>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * At a drive root the drive name is the page title, so the trail deliberately
 * omits it — repeating it would be the same word twice on one screen.
 */
export const AtDriveRoot: Story = {
  args: { ancestors: [], isRoot: true },
};

export const OneLevelDeep: Story = {
  args: { ancestors: deepAncestors.slice(0, 1), isRoot: false },
};

/**
 * Deep enough that the middle collapses into a menu. This is the story that
 * matters: the first and last crumbs must survive, and the menu must be
 * reachable by keyboard.
 */
export const Deep: Story = {
  args: { ancestors: deepAncestors, isRoot: false },
};

/** Long names at every level — the case where a trail wants to wrap and must not. */
export const LongNames: Story = {
  args: {
    isRoot: false,
    ancestors: [
      { id: "a", name: "Competitive analysis and market positioning" },
      { id: "b", name: "Enterprise segment — second pass" },
    ],
  },
};
