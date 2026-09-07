import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { awkwardFiles, drive, files, folders, manyFiles } from "@/fixtures";

import { EntryList } from "./entry-list";

const meta = {
  title: "Sections/Entry list",
  component: EntryList,
  parameters: { layout: "padded" },
  args: { driveId: drive.id },
} satisfies Meta<typeof EntryList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Typical: Story = {
  args: { items: [...folders, ...files] },
};

/**
 * The one to check at a narrow viewport.
 *
 * Two of the four columns are `max-sm:hidden`, and the list scrolls
 * horizontally rather than wrapping. Resize the pane below 640px: the name and
 * size columns must survive, and the row must not start wrapping filenames.
 */
export const AwkwardContent: Story = {
  args: { items: [...folders.slice(3), ...awkwardFiles] },
};

/**
 * A column of sizes, which is what `type-meta`'s tabular figures exist for.
 * With proportional digits this column does not line up, and a column that does
 * not line up is one the eye cannot scan.
 */
export const Dense: Story = {
  args: { items: manyFiles },
};

export const FilesOnly: Story = {
  args: { items: files },
};

export const Empty: Story = {
  args: { items: [] },
};

/**
 * The same list inside a public share: no `⋯` column, folders routed into
 * `/share/:token`, and a file click that opens the viewer instead of
 * downloading.
 *
 * The check worth making here is alignment. The actions button is the widest
 * thing in the name cell after the name itself, and pulling it out must not
 * let the name column drift away from the header above it.
 */
export const ReadOnly: Story = {
  args: {
    items: [...folders, ...files],
    driveId: undefined,
    renderActions: () => null,
    folderHref: (folder) => `/share/tok_9f2b/f/${folder.id}`,
    onOpenFile: () => {},
  },
};
