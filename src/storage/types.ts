/**
 * Shapes crossing the storage boundary.
 *
 * These are the vocabulary of the whole feature: the Worker serializes them to
 * JSON verbatim, and the UI consumes that JSON. Keep them free of SDK types so
 * a change of storage provider stays confined to this directory.
 */

export type BucketSummary = {
  name: string;
  /** ISO-8601. R2 always returns one; the type stays optional to match S3. */
  createdAt?: string;
};

export type ObjectSummary = {
  key: string;
  size: number;
  /** ISO-8601. */
  lastModified?: string;
};

export type ObjectPage = {
  objects: ObjectSummary[];
  /** Pass back as `cursor` to fetch the next page. Absent when the list ends. */
  nextCursor?: string;
};

export type PresignedUrl = {
  url: string;
  /** ISO-8601 moment the URL stops working. */
  expiresAt: string;
};

/** What a HEAD tells us about a stored object. */
export type ObjectHead = {
  sizeBytes: number;
  contentType?: string;
  /**
   * Provider-assigned entity tag. Not a content hash for multipart objects —
   * R2 and S3 both compose it from the part digests — so never compare it to
   * a checksum the caller supplied.
   */
  etag?: string;
};

/** One part the provider is holding for an in-flight multipart upload. */
export type UploadedPart = {
  /** 1-based, as the S3 API numbers them. */
  partNumber: number;
  sizeBytes: number;
  /** Opaque provider tag, echoed back verbatim when completing the upload. */
  etag: string;
};
