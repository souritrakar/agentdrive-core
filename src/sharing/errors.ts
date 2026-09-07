/**
 * Sharing failures as a closed set — deliberately a very small one.
 *
 * Transfer's errors split finely because each code tells a client to do
 * something different. Sharing's go the other way: the public face has exactly
 * one denial, because the visitor holding a link is not a client to be guided,
 * they are a stranger who must not be taught anything by the shape of a
 * refusal.
 */

export type SharingErrorCode =
  | "invalid_input"
  | "share_not_found"
  | "download_not_allowed";

/** Stable domain failure; transport layers decide its HTTP representation. */
export class SharingError extends Error {
  constructor(
    readonly code: SharingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SharingError";
  }
}

export class InvalidShareInputError extends SharingError {
  constructor(message: string) {
    super("invalid_input", message);
    this.name = "InvalidShareInputError";
  }
}

/**
 * One error for five situations, on purpose.
 *
 * An unknown token, a revoked token, a token whose subject was trashed, a token
 * whose subject was purged, and a valid token pointed at an item outside its
 * subtree all mean the same thing to the person holding the link: *this link
 * does not show that*. Giving them distinct responses would build an oracle — a
 * separate "revoked" answer confirms the token was once real, which tells
 * someone sorting a corpus of leaked links which ones are worth attacking.
 *
 * The module may log which branch it took; the wire never says. See
 * docs/architecture/sharing/02-public-access-security.md §2.
 */
export class ShareNotFoundError extends SharingError {
  constructor() {
    super("share_not_found", "This link is no longer available.");
    this.name = "ShareNotFoundError";
  }
}

/**
 * The bytes exist and the link covers them, but this delivery is refused.
 *
 * Distinct from `ShareNotFoundError` because it reveals nothing a visitor who
 * can already list the folder does not know: they can see the file's name and
 * size. What they are being told is that *this share* does not hand out the
 * file — which is the setting's entire user-visible meaning, and which the UI
 * has to be able to explain.
 */
export class DownloadNotAllowedError extends SharingError {
  constructor(message = "This file cannot be downloaded through this link.") {
    super("download_not_allowed", message);
    this.name = "DownloadNotAllowedError";
  }
}

/** HTTP status per code. Routes never decide this themselves. */
const STATUS_BY_CODE: Record<SharingErrorCode, 400 | 403 | 404> = {
  invalid_input: 400,
  share_not_found: 404,
  download_not_allowed: 403,
};

export function isSharingError(error: unknown): error is SharingError {
  return error instanceof SharingError;
}

export function sharingErrorStatus(error: SharingError): 400 | 403 | 404 {
  return STATUS_BY_CODE[error.code];
}
