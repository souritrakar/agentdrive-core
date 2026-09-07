import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { shareableFiles } from "@/fixtures";

import { ShareFileViewer } from "./share-file-viewer";

/**
 * A shared file, as the whole page.
 *
 * The URL-minting function is the seam every story pulls on: it is what the
 * page would call against `/v1/shares/:token/items/:id/download`, and faking
 * it here is what makes the states that need an expired credential or a dead
 * object reachable without a backend.
 *
 * The media sources are data URIs so the stages render real content in a
 * browser with no network — a stage judged against a broken-image glyph is not
 * judged at all.
 */
const meta = {
  title: "Pages/Share file viewer",
  component: ShareFileViewer,
  parameters: { layout: "fullscreen" },
  args: { allowDownload: true, onDownload: () => {} },
  decorators: [
    (Story) => (
      <div className="flex h-dvh flex-col">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ShareFileViewer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A 2×2 PNG, scaled by `object-contain` — enough to prove the stage fits. */
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAHElEQVQI12P4z8DwHwAF/gL+2ZgvSgAAAABJRU5ErkJggg==";

const TEXT = `# Ingest notes

The worker retries three times, then parks the message.

- 2026-08-14  first pass
- 2026-08-15  added the checksum compare
`;

const textUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(TEXT)}`;

const resolve = (url: string) => () => Promise.resolve(url);

/** Never resolves, so the stage stays in its skeleton. */
const never = () => new Promise<string>(() => {});

export const Image: Story = {
  args: { file: shareableFiles.image, getPreviewUrl: resolve(PNG) },
};

/**
 * Native controls rather than a custom scrubber: a bespoke player is a project
 * of its own, and the native one is the control people already know.
 */
export const Video: Story = {
  args: {
    file: shareableFiles.video,
    getPreviewUrl: resolve("data:video/mp4;base64,AAAAHGZ0eXBtcDQy"),
  },
};

/**
 * Audio gets a designed stage rather than a lone 54px control adrift in a
 * viewport — picture, name, control, the empty-state vocabulary.
 */
export const Audio: Story = {
  args: {
    file: shareableFiles.audio,
    getPreviewUrl: resolve("data:audio/mpeg;base64,SUQzAwAAAAAAAA=="),
  },
};

/**
 * The PDF frame is sandboxed and points at the storage origin. In Storybook the
 * frame renders whatever the browser makes of a data URI; what this story is
 * for is the frame's size and border, not the document inside it.
 */
export const Pdf: Story = {
  args: {
    file: shareableFiles.pdf,
    getPreviewUrl: resolve("data:application/pdf;base64,JVBERi0xLjQK"),
  },
};

/** Markdown, shown as source. No highlighting in v1 — the text is the point. */
export const Text: Story = {
  args: { file: shareableFiles.text, getPreviewUrl: resolve(textUrl) },
};

/** Past the 256 KB cap: the pane fills, and says so rather than pretending. */
export const TextTruncated: Story = {
  args: {
    file: { ...shareableFiles.text, name: "worker.log", contentType: "text/plain" },
    getPreviewUrl: resolve(
      `data:text/plain;charset=utf-8,${encodeURIComponent(
        "2026-08-18T07:10:04Z  retrying part 3 of 9\n".repeat(9_000),
      )}`,
    ),
  },
};

/**
 * An archive: nothing a browser can render, so the stage says so plainly and
 * repeats Download as an outline button — the one place it appears twice.
 */
export const NoPreview: Story = {
  args: { file: shareableFiles.archive, getPreviewUrl: never },
};

/**
 * A spreadsheet with a name long enough to truncate in the header. The meta
 * line under it must survive: type and size are what tell a visitor whether
 * the download is worth starting.
 */
export const NoPreviewLongName: Story = {
  args: { file: shareableFiles.spreadsheet, getPreviewUrl: never },
};

/**
 * Downloads turned off. The button is gone from the header *and* from the
 * no-preview stage — which leaves that stage as information only, and is the
 * honest shape of a toggle that governs affordance rather than possession.
 */
export const DownloadDisabled: Story = {
  args: {
    file: shareableFiles.archive,
    allowDownload: false,
    getPreviewUrl: never,
  },
};

/** The owner shared a file whose bytes never finished arriving. */
export const NotReady: Story = {
  args: { file: shareableFiles.pending, getPreviewUrl: never },
};

/** And one whose upload failed outright. No download offered either way. */
export const UploadFailed: Story = {
  args: { file: shareableFiles.failed, getPreviewUrl: never },
};

/** Waiting on the first URL. Stage-shaped, so nothing jumps when it lands. */
export const Loading: Story = {
  args: { file: shareableFiles.image, getPreviewUrl: never },
};

/**
 * The URL expired while the tab sat open, and the silent re-mint worked.
 *
 * The first mint hands back a dead URL; the image fails; the viewer spends its
 * one free retry and the second mint returns a good one. What you should see
 * is the picture — the recovery leaves no trace, which is the point.
 */
export const ExpiredThenRecovered: Story = {
  args: {
    file: shareableFiles.image,
    getPreviewUrl: (() => {
      let attempt = 0;
      return () =>
        Promise.resolve(attempt++ === 0 ? "data:image/png;base64,BROKEN" : PNG);
    })(),
  },
};

/**
 * Both attempts failed, so this is a broken object rather than an expired
 * credential. The stage says the *file* is still shared and only the preview
 * failed — a visitor should not conclude the link is dead when it is not.
 */
export const PreviewFailed: Story = {
  args: {
    file: shareableFiles.image,
    getPreviewUrl: resolve("data:image/png;base64,BROKEN"),
  },
};

/** The mint itself refused — the API is down rather than the object. */
export const MintFailed: Story = {
  args: {
    file: shareableFiles.image,
    getPreviewUrl: () =>
      Promise.reject(
        Object.assign(new Error("Backend unavailable"), {
          status: 503,
          code: "unavailable",
        }),
      ),
  },
};
