import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { ShareGone } from "./share-gone";

/**
 * The page a dead link lands on.
 *
 * One story, and that is the design: unknown token, revoked link, trashed
 * file, trashed parent — four different facts, one identical page. The API
 * answers all four with the same 404 so a stranger cannot learn from the
 * difference, and a UI that drew four variants would hand back exactly what
 * the API withheld.
 *
 * Two details to check: there is no retry button — retrying a revocation
 * provably cannot work — and the one action is outline rather than lime. A
 * filled accent on a page that just refused someone reads as a pitch.
 */
const meta = {
  title: "Pages/Share gone",
  component: ShareGone,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="flex h-dvh flex-col">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ShareGone>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
