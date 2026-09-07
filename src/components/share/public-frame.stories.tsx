import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { PublicFrame } from "./public-frame";

/**
 * The chrome an anonymous visitor gets.
 *
 * Judged against the app's own top bar, which it deliberately matches: same
 * height, same hairline, same background. If the two ever drift, a share link
 * starts looking like a different product from the one that sent it.
 */
const meta = {
  title: "Sections/Public frame",
  component: PublicFrame,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PublicFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty, so the frame itself is the only thing to look at. */
export const Default: Story = {
  args: {
    children: (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="type-body text-muted-foreground">Shared content sits here.</p>
      </div>
    ),
  },
};

/**
 * Long content. The header does not stick — a visitor scrolling a shared
 * folder gets the whole viewport for content, and the one link out is a scroll
 * away rather than permanently occupying a sixth of a phone screen.
 */
export const Scrolling: Story = {
  args: {
    children: (
      <div className="flex flex-col gap-4 p-8">
        {Array.from({ length: 40 }, (_, i) => (
          <p key={i} className="type-body text-muted-foreground">
            Row {i + 1} — scrolled content beneath the public header.
          </p>
        ))}
      </div>
    ),
  },
};
