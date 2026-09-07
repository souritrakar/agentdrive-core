import { useState } from "react";

import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { ViewMode } from "@/lib/ui-preferences";

import { ViewToggle } from "./view-toggle";

const meta = {
  title: "Primitives/View toggle",
  component: ViewToggle,
  parameters: { layout: "centered" },
} satisfies Meta<typeof ViewToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Grid: Story = {
  args: { value: "grid", onChange: () => {} },
};

export const List: Story = {
  args: { value: "list", onChange: () => {} },
};

/**
 * Live, so the selected-segment treatment can be judged while moving between
 * the two rather than by comparing two static stories.
 */
export const Interactive: Story = {
  args: { value: "grid", onChange: () => {} },
  render: function Interactive() {
    const [value, setValue] = useState<ViewMode>("grid");
    return <ViewToggle value={value} onChange={setValue} />;
  },
};
