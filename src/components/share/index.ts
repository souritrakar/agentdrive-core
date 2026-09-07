/**
 * Share — the public face of an item, and the owner's control over it.
 *
 * Two audiences in one feature, which is why it is one feature: the pages a
 * stranger lands on (`PublicFrame`, `ShareBrowserView`, `ShareFileViewer`,
 * `ShareGone`) and the dialog an owner mints the link from (`ShareDialog`)
 * describe the same object from either side, and they must agree about what a
 * share *is*. Splitting them would put that agreement across a boundary.
 *
 * Everything here is presentational: props in, callbacks out. No component
 * below fetches, and none of them knows a URL — the route supplies the data
 * and the actions. That is what makes every state, including the ones that
 * need a revoked token or an expired presigned URL to reach, reachable in a
 * story.
 *
 * The internals — the breadcrumbs, the empty state, the per-kind viewer
 * stages — stay private. They are meaningful only inside the views that
 * arrange them.
 */
export { PublicFrame } from "./public-frame";
export { ShareBrowserView } from "./share-browser-view";
export { ShareDialog } from "./share-dialog";
export { ShareFileViewer } from "./share-file-viewer";
export { ShareGone } from "./share-gone";

export type {
  Share,
  ShareDisposition,
  SharedFolderPage,
  SharedView,
  SharePermissions,
  ShareRole,
  ShareSubject,
  ShareTargetKind,
} from "./types";
