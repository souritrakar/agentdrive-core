import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { deepAncestors, drive, folders, shareToken } from "@/fixtures";

import { ShareBreadcrumbs } from "./share-breadcrumbs";

/**
 * The path above the current folder, inside a share.
 *
 * The rule this component exists to enforce is visible in every story: the
 * first crumb is whatever was *shared*, never "All drives" and never the drive
 * a shared folder happens to live in. Naming an ancestor above the grant would
 * leak structure the owner did not share.
 */
const meta = {
  title: "Components/Share breadcrumbs",
  component: ShareBreadcrumbs,
  parameters: { layout: "padded" },
  args: { token: shareToken },
} satisfies Meta<typeof ShareBreadcrumbs>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * At the shared subject itself the trail is a single crumb naming the page's
 * own title — which is why the view renders no bar at all here. Shown alone so
 * the crumb's treatment can still be checked.
 */
export const SubjectRoot: Story = {
  args: { subjectName: drive.name, subjectKind: "DRIVE", ancestors: [] },
};

/** One level into a shared drive. */
export const OneLevel: Story = {
  args: {
    subjectName: drive.name,
    subjectKind: "DRIVE",
    ancestors: [{ id: "fld_x", name: "Interviews" }],
  },
};

/**
 * A shared *folder* rather than a drive: the root crumb takes the folder
 * glyph, so a visitor can tell what kind of thing they were given.
 */
export const SharedFolder: Story = {
  args: {
    subjectName: folders[0].name,
    subjectKind: "FOLDER",
    ancestors: [{ id: "fld_y", name: "2026" }],
  },
};

/**
 * Deep enough to collapse. The first two crumbs are kept — swapping one crumb
 * for an ellipsis of the same width saves nothing and costs a click.
 */
export const Overflowing: Story = {
  args: {
    subjectName: drive.name,
    subjectKind: "DRIVE",
    ancestors: deepAncestors,
  },
};

/** A shared folder whose name has no natural break. */
export const LongNames: Story = {
  args: {
    subjectName: folders[3].name,
    subjectKind: "FOLDER",
    ancestors: [{ id: "fld_z", name: "Competitive analysis — second pass" }],
  },
};
