/**
 * Upload — the product's most important interaction, and the one with the
 * widest surface, because uploading can be started from almost anywhere.
 *
 * The provider owns queue state; the other three are the affordances that read
 * it. All four are public because the app shell composes them at the root
 * (so a drop lands anywhere on the page) while individual screens place their
 * own buttons.
 *
 * `upload-provider` is the only internal module that other files here import
 * directly, and they do so relatively — see docs/design-system/architecture.md.
 */
export { UploadProvider, useUpload } from "./upload-provider";
export type { UploadTask } from "./upload-provider";
export { UploadPicker } from "./upload-button";
export { UploadTray } from "./upload-tray";
export { DropOverlay } from "./drop-overlay";
