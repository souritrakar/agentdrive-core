/**
 * Transfer failures as a closed set.
 *
 * Each one exists because a caller does something different in response, which
 * is the test for whether a case deserves its own code: `upload_incomplete`
 * means "send the missing bytes and call complete again", `upload_expired`
 * means "start over", `upload_size_mismatch` means "the file you sent is not
 * the file you described". Collapsing them would leave a client guessing.
 */

export type TransferErrorCode =
  | "invalid_input"
  | "upload_not_found"
  | "upload_not_active"
  | "upload_incomplete"
  | "upload_size_mismatch"
  | "upload_expired"
  | "part_plan_invalid"
  | "file_too_large";

export class TransferError extends Error {
  constructor(
    readonly code: TransferErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "TransferError";
  }
}

export class InvalidTransferInputError extends TransferError {
  constructor(message: string) {
    super("invalid_input", message);
    this.name = "InvalidTransferInputError";
  }
}

export class UploadNotFoundError extends TransferError {
  constructor() {
    super("upload_not_found", "Upload not found.");
    this.name = "UploadNotFoundError";
  }
}

export class UploadNotActiveError extends TransferError {
  constructor(status: string) {
    super(
      "upload_not_active",
      `This upload is already ${status.toLowerCase()}.`,
    );
    this.name = "UploadNotActiveError";
  }
}

/**
 * Bytes are missing or the wrong size. Retryable: the caller uploads what
 * `details` names and calls complete again, without starting a new session.
 */
export class UploadIncompleteError extends TransferError {
  constructor(details: { missing?: number[]; malformed?: number[] }) {
    super(
      "upload_incomplete",
      "The upload is missing bytes. Send the remaining parts, then complete it again.",
      details,
    );
    this.name = "UploadIncompleteError";
  }
}

export class UploadSizeMismatchError extends TransferError {
  constructor(expected: number, actual: number) {
    super(
      "upload_size_mismatch",
      `The uploaded object is ${actual} bytes but ${expected} were declared.`,
      { expected, actual },
    );
    this.name = "UploadSizeMismatchError";
  }
}

export class FileTooLargeError extends TransferError {
  constructor(message: string) {
    super("file_too_large", message);
    this.name = "FileTooLargeError";
  }
}

export class PartPlanInvalidError extends TransferError {
  constructor(message: string) {
    super("part_plan_invalid", message);
    this.name = "PartPlanInvalidError";
  }
}

export class UploadExpiredError extends TransferError {
  constructor() {
    super(
      "upload_expired",
      "This upload expired. Start a new one to upload the file.",
    );
    this.name = "UploadExpiredError";
  }
}

/** HTTP status per code. Routes never decide this themselves. */
const STATUS_BY_CODE: Record<TransferErrorCode, 400 | 404 | 409 | 410 | 413> = {
  invalid_input: 400,
  part_plan_invalid: 400,
  upload_not_found: 404,
  upload_not_active: 409,
  upload_incomplete: 409,
  upload_size_mismatch: 409,
  upload_expired: 410,
  file_too_large: 413,
};

export function isTransferError(error: unknown): error is TransferError {
  return error instanceof TransferError;
}

export function transferErrorStatus(
  error: TransferError,
): 400 | 404 | 409 | 410 | 413 {
  return STATUS_BY_CODE[error.code];
}
