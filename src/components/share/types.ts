/**
 * The share view models, mirroring the module's wire shapes.
 *
 * These are the same objects `src/sharing` returns
 * (docs/architecture/sharing/01-sharing-module.md §3) with one difference: the
 * page and the components only ever hold what a *visitor* is allowed to see.
 * A `SharedView` carries no owner, no pod, no drive id when the subject is a
 * file — the token is the whole of the visitor's world.
 *
 * `Item`, `Drive` and `FolderPage` are reused verbatim from `@/lib/types`
 * because a shared listing is the same listing: one wire contract, one set of
 * components, one place where a field's meaning is decided.
 */
import type { Drive, FolderPage, Item } from "@/lib/types";

export type ShareRole = "VIEWER";

/** What the visitor may do, independent of what they are looking at. */
export type SharePermissions = {
  role: ShareRole;
  /**
   * Whether the Download affordance is offered. Deliberately *not* a claim
   * that bytes are withheld — a rendered preview is the file. See
   * docs/architecture/sharing/03-share-views-ui.md §3.3.
   */
  allowDownload: boolean;
};

/** What a link points at. A drive and a folder both list; a file is viewed. */
export type ShareSubject =
  | { kind: "DRIVE"; drive: Pick<Drive, "id" | "name"> }
  | { kind: "ITEM"; item: Item };

/** `resolveShare(token)` — the entry point every share page starts from. */
export type SharedView = {
  share: SharePermissions;
  subject: ShareSubject;
};

/**
 * One level inside a share.
 *
 * The same `FolderPage` the owner's browser renders, with `ancestors` already
 * truncated at the shared subject by the module — so a visitor's breadcrumbs
 * cannot climb above the grant no matter what this component does with them.
 */
export type SharedFolderPage = FolderPage;

/** Which disposition a URL is being minted for. */
export type ShareDisposition = "inline" | "attachment";

/**
 * The owner's side of the same row.
 *
 * `token` is present because the dialog's whole job is to hand it over; it is
 * the only place in the product that renders one.
 */
export type Share = {
  id: string;
  token: string;
  subject:
    | { kind: "DRIVE"; driveId: string }
    | { kind: "ITEM"; itemId: string };
  role: ShareRole;
  allowDownload: boolean;
  createdAt: string;
  updatedAt: string;
};

/** What the dialog is sharing, in the words its copy needs. */
export type ShareTargetKind = "file" | "folder" | "drive";
