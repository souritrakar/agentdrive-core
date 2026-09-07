import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { awkwardFiles, drive, files } from "@/fixtures";

import { FileTile } from "./file-tile";
import { ItemActions } from "./item-actions";

/**
 * A single file in grid view.
 *
 * Wrapped in a `<ul>` because the tile renders an `<li>` — an `li` outside a
 * list is an accessibility violation the a11y panel will (correctly) report,
 * and fixing it in the story rather than muting the rule keeps the panel
 * trustworthy.
 *
 * The tile is presentational: what a click does, and what sits in the actions
 * slot, are handed in by whichever listing rendered it. These stories supply
 * the owner's arrangement by default and drop it in `ReadOnly`.
 */
const meta = {
  title: "Components/File tile",
  component: FileTile,
  parameters: { layout: "centered" },
  args: { onOpen: () => {} },
  render: (args) => (
    <FileTile
      {...args}
      actions={<ItemActions driveId={drive.id} item={args.file} />}
    />
  ),
  decorators: [
    (Story) => (
      <ul role="list" className="w-56">
        <Story />
      </ul>
    ),
  ],
} satisfies Meta<typeof FileTile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = { args: { file: files[0] } };

/** Each tint against the same card, which is the only fair comparison. */
export const Document: Story = { args: { file: files[4] } };
export const Media: Story = { args: { file: files[1] } };
export const Code: Story = { args: { file: files[2] } };
export const Archive: Story = { args: { file: files[3] } };

/**
 * Still uploading. No size yet, and deliberately not clickable — offering the
 * download before storage has the bytes hands the user a 404 dressed up as a
 * file.
 */
export const Uploading: Story = { args: { file: awkwardFiles[1] } };

/** The upload failed. Visible and explained, never a silent dead end. */
export const Failed: Story = { args: { file: awkwardFiles[2] } };

/** A name with no natural break — the truncation check. */
export const LongName: Story = { args: { file: awkwardFiles[0] } };

/**
 * No content type at all, which is what an agent-written file with no
 * extension looks like on arrival. It must still get a glyph and a label.
 */
export const UnknownType: Story = { args: { file: awkwardFiles[3] } };

/** Zero bytes is a real state, and reads wrong in a naive size formatter. */
export const EmptyFile: Story = { args: { file: awkwardFiles[4] } };

/**
 * As a visitor sees it in a share: no actions slot at all. The tile must not
 * leave a gap in the top-right corner where the menu was — the glyph stays
 * centred and the card keeps its shape.
 */
export const ReadOnly: Story = {
  args: { file: files[1] },
  render: (args) => <FileTile {...args} />,
};

/** The moment between the click and the browser taking over. */
export const Opening: Story = {
  args: { file: files[0], isOpening: true },
};
