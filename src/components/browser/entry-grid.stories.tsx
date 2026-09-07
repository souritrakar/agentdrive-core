import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { awkwardFiles, drive, files, folders, manyFiles } from "@/fixtures";

import { EntryGrid } from "./entry-grid";

/**
 * Grid view of a folder's contents.
 *
 * Imported relatively rather than through `@/components/browser`, because a
 * story is allowed to see inside its own feature and nothing else is.
 *
 * Every story picks one of the two behaviours the grid accepts: `driveId` for
 * the owner's own drive — folders link into `/drives`, files download, each
 * tile carries the `⋯` menu — or the explicit foreign trio a public share
 * passes. See `ReadOnly` at the bottom.
 */
const meta = {
  title: "Sections/Entry grid",
  component: EntryGrid,
  parameters: { layout: "padded" },
  args: { driveId: drive.id },
} satisfies Meta<typeof EntryGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

/** What a healthy folder looks like: a few folders, a mix of file types. */
export const Typical: Story = {
  args: { items: [...folders, ...files] },
};

/**
 * Files only. The grid must not leave the gap where the folder row would have
 * been — a section that reserves space for content it does not have reads as a
 * loading state that never finished.
 */
export const FilesOnly: Story = {
  args: { items: files },
};

/** Folders only — the shape of a freshly organised drive. */
export const FoldersOnly: Story = {
  args: { items: folders },
};

/**
 * Nothing at all.
 *
 * `EmptyFolder` is what a user actually sees here — `BrowserView` swaps to it
 * rather than rendering an empty grid. This story exists to prove the grid
 * collapses to nothing instead of leaving a gap, which is what makes that swap
 * safe to do.
 */
export const Empty: Story = {
  args: { items: [] },
};

/**
 * The rows that break layouts: a filename with no natural break, a file still
 * uploading, one that failed, one with no content type, and one of zero bytes.
 *
 * Every one of these is a shape the product will really receive, and every one
 * is normally first seen in production.
 */
export const AwkwardContent: Story = {
  args: { items: [...folders.slice(3), ...awkwardFiles] },
};

/**
 * Sixty files. Checks that the grid keeps its rhythm at length and that the
 * four tints are still telling files apart rather than blurring into one field.
 */
export const Dense: Story = {
  args: { items: [...folders, ...manyFiles] },
};

/**
 * The same grid inside a public share: no `⋯` menu anywhere, folders routed
 * into `/share/:token`, and a file click that opens a viewer rather than
 * starting a download.
 *
 * Worth looking at beside `Typical`. The tiles must not gain a gap or shift
 * where the menu used to be — a read-only listing should read as a listing,
 * not as one with something taken out of it.
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
