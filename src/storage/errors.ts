/**
 * Storage failures as a closed set of cases.
 *
 * The point is that callers never inspect AWS SDK error names. The Worker maps
 * `StorageError.status` to an HTTP code; the UI maps `code` to a message. Any
 * failure this module cannot classify surfaces as `storage_failed` rather than
 * being swallowed.
 */

export type StorageErrorCode =
  | "bucket_name_invalid"
  | "bucket_already_exists"
  | "bucket_not_found"
  | "bucket_not_empty"
  | "object_not_found"
  | "storage_unauthorized"
  | "storage_failed";

/** Narrow so Hono's `c.json(body, status)` accepts it without a cast. */
export type StorageErrorStatus = 400 | 404 | 409 | 502;

const STATUS_BY_CODE: Record<StorageErrorCode, StorageErrorStatus> = {
  bucket_name_invalid: 400,
  bucket_already_exists: 409,
  bucket_not_found: 404,
  bucket_not_empty: 409,
  object_not_found: 404,
  storage_unauthorized: 502, // the server's credentials failed, not the caller's
  storage_failed: 502,
};

export class StorageError extends Error {
  readonly code: StorageErrorCode;
  readonly status: StorageErrorStatus;

  constructor(code: StorageErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "StorageError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
  }
}

export function isStorageError(error: unknown): error is StorageError {
  return error instanceof StorageError;
}

/** S3 error names that map cleanly onto our cases. */
const CODE_BY_S3_NAME: Record<string, StorageErrorCode> = {
  NoSuchKey: "object_not_found",
  NotFound: "object_not_found",
  NoSuchBucket: "bucket_not_found",
  BucketAlreadyExists: "bucket_already_exists",
  BucketAlreadyOwnedByYou: "bucket_already_exists",
  BucketNotEmpty: "bucket_not_empty",
  InvalidBucketName: "bucket_name_invalid",
  AccessDenied: "storage_unauthorized",
  InvalidAccessKeyId: "storage_unauthorized",
  SignatureDoesNotMatch: "storage_unauthorized",
};

/**
 * Normalize anything thrown by the SDK into a StorageError.
 *
 * `context` describes the attempted operation ("create bucket \"invoices\"") and
 * is prefixed onto the message, so a caught error says what was being done.
 */
export function toStorageError(error: unknown, context: string): StorageError {
  if (isStorageError(error)) return error;

  const name =
    error instanceof Error ? error.name : String((error as { name?: string })?.name ?? "");
  const detail = error instanceof Error ? error.message : String(error);
  const code = CODE_BY_S3_NAME[name] ?? "storage_failed";

  return new StorageError(code, `${context}: ${detail}`, { cause: error });
}
