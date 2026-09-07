export type FilesystemErrorCode =
  | "invalid_input"
  | "drive_not_found"
  | "item_not_found"
  | "item_name_conflict"
  | "idempotency_conflict"
  | "invalid_parent_kind"
  | "folder_cycle"
  | "hierarchy_too_deep"
  | "item_not_restorable"
  | "item_not_downloadable"
  | "item_not_a_file"
  | "file_not_ready"
  | "invalid_upload_transition";

/** Stable domain failure; transport layers decide its HTTP representation. */
export class FilesystemError extends Error {
  constructor(
    readonly code: FilesystemErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "FilesystemError";
  }
}

export class InvalidFilesystemInputError extends FilesystemError {
  constructor(message: string) {
    super("invalid_input", message);
    this.name = "InvalidFilesystemInputError";
  }
}

export class DriveNotFoundError extends FilesystemError {
  constructor() {
    super("drive_not_found", "Drive not found.");
    this.name = "DriveNotFoundError";
  }
}

export class ItemNotFoundError extends FilesystemError {
  constructor() {
    super("item_not_found", "Item not found.");
    this.name = "ItemNotFoundError";
  }
}

export class FolderCycleError extends FilesystemError {
  constructor() {
    super("folder_cycle", "The folder hierarchy contains a cycle.");
    this.name = "FolderCycleError";
  }
}

export class HierarchyTooDeepError extends FilesystemError {
  constructor() {
    super("hierarchy_too_deep", "The folder hierarchy exceeds 64 levels.");
    this.name = "HierarchyTooDeepError";
  }
}

export class ItemNameConflictError extends FilesystemError {
  constructor(name: string) {
    super(
      "item_name_conflict",
      `An item named "${name}" already exists here.`,
    );
    this.name = "ItemNameConflictError";
  }
}

export class IdempotencyConflictError extends FilesystemError {
  constructor() {
    super(
      "idempotency_conflict",
      "That idempotency key was already used with different input.",
    );
    this.name = "IdempotencyConflictError";
  }
}

export class InvalidParentKindError extends FilesystemError {
  constructor() {
    super("invalid_parent_kind", "The destination must be a folder.");
    this.name = "InvalidParentKindError";
  }
}

export class ItemNotRestorableError extends FilesystemError {
  constructor() {
    super(
      "item_not_restorable",
      "Only a directly trashed item can be restored.",
    );
    this.name = "ItemNotRestorableError";
  }
}

export class ItemNotDownloadableError extends FilesystemError {
  constructor() {
    super("item_not_downloadable", "Folders cannot be downloaded.");
    this.name = "ItemNotDownloadableError";
  }
}

export class ItemNotAFileError extends FilesystemError {
  constructor() {
    super("item_not_a_file", "That item is a folder, not a file.");
    this.name = "ItemNotAFileError";
  }
}

export class FileNotReadyError extends FilesystemError {
  constructor(status: "PENDING" | "FAILED") {
    super(
      "file_not_ready",
      status === "PENDING"
        ? "The file is still uploading."
        : "The file upload failed.",
    );
    this.name = "FileNotReadyError";
  }
}

export class InvalidUploadTransitionError extends FilesystemError {
  constructor() {
    super(
      "invalid_upload_transition",
      "The file upload is already in a terminal state.",
    );
    this.name = "InvalidUploadTransitionError";
  }
}
