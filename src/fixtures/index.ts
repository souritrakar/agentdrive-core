/**
 * Story fixtures.
 *
 * Story-only data. Nothing in `src/app` or `src/components` may import this —
 * enforced in eslint.config.mjs, because a fixture that leaks into the product
 * is how placeholder copy ends up in front of a user.
 *
 * The values are chosen to be *awkward*, not tidy. Fixtures that are all
 * short names and round numbers make every layout look correct, which is the
 * opposite of what a workbench is for. Real drives contain a file called
 * `Screenshot 2026-08-14 at 11.32.07.png`.
 */
import type { Drive, Item } from "@/lib/types";

const T = (iso: string) => new Date(iso).toISOString();

export const drive: Drive = {
  id: "drv_1",
  name: "Research",
  slug: "research",
  childCount: 24,
  createdAt: T("2026-01-12T09:00:00Z"),
  updatedAt: T("2026-08-18T07:30:00Z"),
};

export const drives: Drive[] = [
  drive,
  { ...drive, id: "drv_2", name: "Product", slug: "product", childCount: 7 },
  {
    ...drive,
    id: "drv_3",
    // A one-item drive: the place a naive pluralisation shows itself.
    name: "Legal",
    slug: "legal",
    childCount: 1,
  },
  {
    ...drive,
    id: "drv_4",
    // A name with no natural break, to check truncation rather than wrapping.
    name: "Q3-2026-consolidated-financial-reporting-workstream",
    slug: "q3-2026-consolidated",
    childCount: 412,
  },
];

const folder = (
  id: string,
  name: string,
  childCount: number,
  updatedAt: string,
): Extract<Item, { kind: "FOLDER" }> => ({
  id,
  name,
  driveId: drive.id,
  parentId: null,
  kind: "FOLDER",
  contentType: null,
  sizeBytes: null,
  uploadStatus: null,
  childCount,
  createdAt: T("2026-02-01T09:00:00Z"),
  updatedAt: T(updatedAt),
});

export const folders: Array<Extract<Item, { kind: "FOLDER" }>> = [
  folder("fld_1", "Interviews", 18, "2026-08-18T06:00:00Z"),
  folder("fld_2", "Raw transcripts", 204, "2026-08-17T14:10:00Z"),
  folder("fld_3", "Archive", 0, "2026-05-02T11:00:00Z"),
  folder(
    "fld_4",
    "Competitive analysis and market positioning — second pass",
    3,
    "2026-08-11T16:45:00Z",
  ),
];

const file = (
  id: string,
  name: string,
  contentType: string | null,
  sizeBytes: number | null,
  updatedAt: string,
  uploadStatus: Extract<Item, { kind: "FILE" }>["uploadStatus"] = "READY",
): Extract<Item, { kind: "FILE" }> => ({
  id,
  name,
  driveId: drive.id,
  parentId: null,
  kind: "FILE",
  contentType,
  sizeBytes,
  uploadStatus,
  createdAt: T("2026-03-01T09:00:00Z"),
  updatedAt: T(updatedAt),
});

/** One of each tint, so a grid shows whether the four are distinguishable. */
export const files: Array<Extract<Item, { kind: "FILE" }>> = [
  file("fil_1", "Q3 financial model.xlsx", "application/vnd.ms-excel", 4_284_112, "2026-08-18T05:20:00Z"),
  file("fil_2", "onboarding-flow.png", "image/png", 812_004, "2026-08-17T19:02:00Z"),
  file("fil_3", "ingest-worker.ts", "text/typescript", 14_820, "2026-08-16T10:14:00Z"),
  file("fil_4", "2026-archive.zip", "application/zip", 1_288_490_188, "2026-07-30T08:00:00Z"),
  file("fil_5", "Board memo.pdf", "application/pdf", 220_881, "2026-08-15T12:00:00Z"),
  file("fil_6", "notes.md", "text/markdown", 3_204, "2026-08-14T09:41:00Z"),
];

/**
 * The rows that break layouts. Every one of these is a shape the product will
 * actually receive, and each is normally only discovered in production.
 */
export const awkwardFiles: Array<Extract<Item, { kind: "FILE" }>> = [
  file(
    "fil_long",
    "Screenshot 2026-08-14 at 11.32.07 — annotated for the platform review.png",
    "image/png",
    2_004_112,
    "2026-08-14T11:32:00Z",
  ),
  // Still uploading: no size yet, and not clickable.
  file("fil_pending", "recording.mp4", "video/mp4", null, "2026-08-18T07:29:00Z", "PENDING"),
  // The upload died. Visible, explained, retryable — never a dead end.
  file("fil_failed", "dataset.csv", "text/csv", 88_120_004, "2026-08-18T07:10:00Z", "FAILED"),
  // Partial: no content type at all, which is what an agent-written file with
  // no extension looks like on arrival.
  file("fil_untyped", "checkpoint", null, 1_024, "2026-08-13T22:00:00Z"),
  // Zero bytes is a real state and reads wrong in a naive formatter.
  file("fil_empty", "placeholder.txt", "text/plain", 0, "2026-08-12T10:00:00Z"),
];

/** A folder deep enough that the breadcrumb has to collapse. */
export const deepAncestors: Array<Pick<Item, "id" | "name">> = [
  { id: "fld_a", name: "Interviews" },
  { id: "fld_b", name: "2026" },
  { id: "fld_c", name: "Q3" },
  { id: "fld_d", name: "Enterprise segment" },
  { id: "fld_e", name: "Transcripts" },
];

/** Many rows, for checking a list does not slow down or lose its rhythm. */
export const manyFiles: Array<Extract<Item, { kind: "FILE" }>> = Array.from({ length: 60 }, (_, i) =>
  file(
    `fil_bulk_${i}`,
    `transcript-${String(i + 1).padStart(3, "0")}.md`,
    "text/markdown",
    12_000 + i * 3_137,
    "2026-08-10T09:00:00Z",
  ),
);

/**
 * Share fixtures.
 *
 * A share is a token plus a subject, and the awkward cases are the ones that
 * decide layout: a link long enough to overflow its field, a subject whose
 * name has no natural break, and files chosen so every viewer stage has
 * something real to render.
 */
export const shareToken = "K3nQ8vR2mT7yX1aB4cD6eF";

export const shareLink = `https://agentdrive.app/share/${shareToken}`;

export const share = {
  id: "shr_1",
  token: shareToken,
  subject: { kind: "ITEM" as const, itemId: "fil_2" },
  role: "VIEWER" as const,
  allowDownload: true,
  createdAt: T("2026-08-18T09:12:00Z"),
  updatedAt: T("2026-08-18T09:12:00Z"),
};

/** One file per viewer stage, so each one is a story rather than a guess. */
export const shareableFiles = {
  image: file("fil_img", "onboarding-flow.png", "image/png", 812_004, "2026-08-17T19:02:00Z"),
  video: file("fil_vid", "walkthrough.mp4", "video/mp4", 48_221_004, "2026-08-16T11:00:00Z"),
  audio: file("fil_aud", "interview-014.mp3", "audio/mpeg", 18_402_112, "2026-08-15T09:30:00Z"),
  pdf: file("fil_pdf", "Board memo.pdf", "application/pdf", 220_881, "2026-08-15T12:00:00Z"),
  text: file("fil_txt", "ingest-notes.md", "text/markdown", 3_204, "2026-08-14T09:41:00Z"),
  archive: file("fil_zip", "2026-archive.zip", "application/zip", 1_288_490_188, "2026-07-30T08:00:00Z"),
  // No preview, and a name that has to truncate in the viewer header too.
  spreadsheet: file(
    "fil_xls",
    "Q3-2026-consolidated-financial-reporting-workstream.xlsx",
    "application/vnd.ms-excel",
    4_284_112,
    "2026-08-18T05:20:00Z",
  ),
  pending: file("fil_wait", "recording.mp4", "video/mp4", null, "2026-08-18T07:29:00Z", "PENDING"),
  failed: file("fil_dead", "dataset.csv", "text/csv", 88_120_004, "2026-08-18T07:10:00Z", "FAILED"),
};

/** One level of a shared folder, in the shape the share API returns. */
export const sharedFolderPage = {
  drive,
  currentFolder: null,
  ancestors: [],
  items: [...folders, ...files],
  nextCursor: null,
};
