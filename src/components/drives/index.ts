/**
 * Drives — creating the containers that files live in.
 *
 * Both dialogs are public because both are launched from outside this feature:
 * the sidebar offers "new drive", the sidebar and the browser both offer "new
 * folder". They take a `trigger` so the caller supplies its own button rather
 * than this feature having to know what each launch point looks like.
 */
export { CreateDriveDialog } from "./create-drive-dialog";
export { CreateFolderDialog } from "./create-folder-dialog";
