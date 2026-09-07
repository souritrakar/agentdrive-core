import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import {
  awkwardFiles,
  deepAncestors,
  drive,
  files,
  folders,
  manyFiles,
  shareToken,
} from "@/fixtures";

import { ShareBrowserView } from "./share-browser-view";

/**
 * A shared drive or folder, read-only.
 *
 * The comparison worth making is against `Sections/Entry grid`: this must read
 * as the same listing with the owner's actions absent, not as a cut-down
 * imitation of it.
 */
const meta = {
  title: "Pages/Share browser view",
  component: ShareBrowserView,
  parameters: { layout: "fullscreen" },
  args: {
    token: shareToken,
    subjectName: drive.name,
    subjectKind: "DRIVE",
    // A Drive subject is not an Item, so it has no id to compare against.
    subjectId: null,
    onOpenFile: () => {},
  },
} satisfies Meta<typeof ShareBrowserView>;

export default meta;
type Story = StoryObj<typeof meta>;

const page = (overrides: Partial<Parameters<typeof ShareBrowserView>[0]["page"] & object> = {}) => ({
  drive,
  currentFolder: null,
  ancestors: [],
  items: [...folders, ...files],
  nextCursor: null,
  ...overrides,
});

/**
 * A shared drive at its root. No breadcrumb bar at all — the trail would hold
 * one crumb naming the page's own `<h1>`, and an empty bar is worse than none.
 */
export const DriveRoot: Story = {
  args: { page: page() },
};

/**
 * A shared *folder* at its own root, in the shape the module actually returns:
 * `currentFolder` is the shared folder itself, not null.
 *
 * That distinction is the whole story. Deciding "am I at the subject?" by
 * `!currentFolder` — which is only true for a Drive share — drew a one-crumb
 * bar here that linked to this very page and repeated the `<h1>` beneath it.
 * There must be no bar.
 */
export const FolderRoot: Story = {
  args: {
    subjectName: folders[0].name,
    subjectKind: "FOLDER",
    subjectId: folders[0].id,
    page: page({ currentFolder: folders[0], items: files }),
  },
};

/**
 * A shared folder, two levels in — the case that used to print the subject's
 * name twice.
 *
 * `ancestors` holds only what lies *strictly between* the subject and the
 * current folder, so "2026" is the sole entry and the trail reads
 * `‹shared folder› › 2026`. The subject appears exactly once, as the root
 * crumb this component prepends.
 */
export const FolderShareNested: Story = {
  args: {
    subjectName: folders[0].name,
    subjectKind: "FOLDER",
    subjectId: folders[0].id,
    page: page({
      currentFolder: folders[1],
      ancestors: [{ id: "fld_x", name: "2026" }],
      items: files,
    }),
  },
};

/**
 * One level down. The trail appears, rooted at the shared subject — it never
 * names the drive a shared folder lives in, because that is above the grant.
 */
export const NestedFolder: Story = {
  args: {
    page: page({
      currentFolder: folders[0],
      ancestors: [{ id: "fld_x", name: "2026" }],
      items: awkwardFiles,
    }),
  },
};

/**
 * Deep enough that the trail collapses. The first two crumbs survive — the
 * shared subject is the context everything below it hangs from.
 */
export const DeepTrail: Story = {
  args: {
    page: page({
      currentFolder: folders[1],
      ancestors: deepAncestors,
      items: files,
    }),
  },
};

/**
 * An empty shared folder. No upload invitation and no button: there is nothing
 * a visitor can do here, and the state must not pretend otherwise.
 */
export const Empty: Story = {
  args: {
    page: page({ currentFolder: folders[2], ancestors: [], items: [] }),
  },
};

/** More than one page. The visitor pages through exactly as an owner does. */
export const LoadMore: Story = {
  args: {
    page: page({ items: manyFiles.slice(0, 24), nextCursor: "cursor_2" }),
    onLoadMore: () => {},
  },
};

/** The second page is on its way. */
export const LoadingMore: Story = {
  args: {
    page: page({ items: manyFiles.slice(0, 24), nextCursor: "cursor_2" }),
    onLoadMore: () => {},
    isLoadingMore: true,
  },
};

/** It did not arrive. Said out loud, with the button still there to retry. */
export const LoadMoreFailed: Story = {
  args: {
    page: page({ items: manyFiles.slice(0, 24), nextCursor: "cursor_2" }),
    onLoadMore: () => {},
    loadMoreError: true,
  },
};

/** First paint. Eight tiles of the real shape, so nothing jumps. */
export const Loading: Story = {
  args: { page: null, isLoading: true },
};

/**
 * The API could not be reached.
 *
 * A 404 never lands here — that is the gone page — so what is left is the
 * class of failure that heals on its own, and the state rechecks quietly while
 * it is on screen.
 */
export const Failed: Story = {
  args: {
    page: null,
    error: Object.assign(new Error("Backend unavailable"), {
      status: 503,
      code: "unavailable",
    }),
    onRetry: () => {},
  },
};
