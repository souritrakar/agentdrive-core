import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { UploadProvider } from "@/components/upload";
import { drive } from "@/fixtures";

import { EmptyFolder } from "./empty-folder";

/**
 * The first-run experience — designed last, seen first.
 *
 * Wrapped in `UploadProvider` because the empty state's whole job is to offer
 * the upload affordance, and `UploadPicker` reads the queue from that context.
 * Storybook found this by throwing: the section genuinely cannot render without
 * it, which is worth knowing and worth stating here rather than papering over.
 *
 * The provider holds queue state and attaches window drag listeners; mounting
 * it uploads nothing until a file is actually chosen, so the story is inert.
 *
 * Worth looking at at every width: the illustration, the heading and the upload
 * affordance have to stay one centred group rather than drifting apart on a
 * wide viewport.
 */
const meta = {
  title: "Sections/Empty folder",
  component: EmptyFolder,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <UploadProvider driveId={drive.id} parentId={null}>
        <Story />
      </UploadProvider>
    ),
  ],
} satisfies Meta<typeof EmptyFolder>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
