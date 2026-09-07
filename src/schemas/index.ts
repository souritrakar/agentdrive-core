import { z } from "zod";

/**
 * Shared validation primitives for the AgentDrive data model.
 *
 * These live in `src/` rather than under `workers/` because they describe the
 * domain, not the transport: the Worker validates requests with them and the
 * Next.js app can validate forms and server actions with the same rules. One
 * definition per constraint, so the API and the UI cannot disagree about what a
 * valid folder name is.
 *
 * The Hono binding lives in `workers/api/src/lib/validation.ts`.
 * The model itself is documented in docs/architecture/data-model.md.
 */

/** Primary keys are UUIDv7 — see docs/architecture/backend-principles.md §5. */
export const id = z.uuid();

/** True for C0 control characters and DEL. */
function hasControlCharacter(value: string) {
  return [...value].some((char) => {
    const code = char.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  });
}

/**
 * A user-facing name for a Pod, Drive, Folder, or File.
 *
 * Rejects path separators and control characters: names are rendered into
 * breadcrumbs and virtual paths, and a name containing "/" or a NUL byte would
 * be ambiguous at best. `.` and `..` are rejected outright for the same reason.
 *
 * Spaces, hyphens, and unicode are all fine — this is a display name, not a
 * slug.
 */
export const entityName = z
  .string()
  .trim()
  .min(1, "must not be empty")
  .max(255, "must be at most 255 characters")
  .refine((v) => !/[/\\]/.test(v), "must not contain path separators")
  .refine((v) => !hasControlCharacter(v), "must not contain control characters")
  .refine((v) => v !== "." && v !== "..", 'must not be "." or ".."');

/**
 * URL-safe stable identifier, unique per parent (Pod within Account, Drive
 * within Pod). Deliberately narrow: these appear in URLs, so anything needing
 * escaping is rejected rather than silently encoded.
 */
export const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "must not be empty")
  .max(63, "must be at most 63 characters")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be lowercase alphanumeric with single hyphens");

/**
 * Object-storage bucket name, per the S3 API's rules (which R2 also enforces).
 *
 * Validated locally so a bad name fails fast with a useful message instead of
 * as a remote 400 from the storage provider. Dots are excluded deliberately —
 * they are legal in S3 but break virtual-host-style addressing and TLS.
 */
export const bucketName = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "must be at least 3 characters")
  .max(63, "must be at most 63 characters")
  .regex(
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
    "must be lowercase alphanumeric or hyphens, starting and ending alphanumeric",
  );

/** An object key within a bucket. */
export const objectKey = z.string().min(1).max(1024);

/** RFC 6838-ish media type. Permissive on parameters, strict on shape. */
export const contentType = z
  .string()
  .trim()
  .max(255)
  .regex(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*/i, "must be a valid media type");

/**
 * Media type where absence is acceptable.
 *
 * Browsers set `File.type` to an empty string when they cannot determine a
 * file's type, and the uploader forwards that verbatim. Rejecting "" would fail
 * uploads of any unrecognised extension, so it is normalised away instead.
 */
export const optionalContentType = z
  .union([contentType, z.literal("")])
  .optional()
  .transform((v) => v || undefined);

/** Byte count. BigInt in the database; a JS number is safe up to 8 PiB. */
export const sizeBytes = z.number().int().nonnegative();

/** Lowercase hex SHA-256. */
export const checksumSha256 = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "must be a 64-character lowercase hex digest");

/**
 * Cursor pagination, matching the convention the object routes already use.
 * Keyset rather than offset, so a page cannot shift under a client mid-scan.
 */
export const pagination = z.object({
  cursor: z.string().min(1).max(1024).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type Pagination = z.infer<typeof pagination>;

/**
 * Caller-supplied idempotency key.
 *
 * An agent that retries a create must get the same row back rather than a
 * duplicate. Optional — interactive creates from the UI don't need it.
 */
export const clientId = z.string().trim().min(1).max(128);

// ---------------------------------------------------------------------------
// Request bodies
// ---------------------------------------------------------------------------

export const createDriveInput = z.object({
  name: entityName,
  clientId: clientId.optional(),
});

export const createFolderInput = z.object({
  name: entityName,
  /** Omitted or null means the drive root. */
  parentId: id.nullish(),
  /** @deprecated One-release compatibility alias for `parentId`. */
  parentFolderId: id.nullish(),
  clientId: clientId.optional(),
}).refine(
  (value) => !(value.parentId && value.parentFolderId),
  { message: "use parentId, not both hierarchy fields" },
);

export const createFileInput = z.object({
  name: entityName,
  /** Omitted or null means the drive root. */
  parentId: id.nullish(),
  /** @deprecated One-release compatibility alias for `parentId`. */
  folderId: id.nullish(),
  contentType: optionalContentType,
  sizeBytes: sizeBytes.optional(),
  clientId: clientId.optional(),
}).refine(
  (value) => !(value.parentId && value.folderId),
  { message: "use parentId, not both hierarchy fields" },
);

/**
 * Confirming an upload. `READY` and `FAILED` only — `PENDING` is the initial
 * state and is never something a client transitions back to.
 *
 * @deprecated Superseded by the session routes, which verify the bytes rather
 * than taking the client's word for them.
 */
export const fileStatusInput = z.object({
  status: z.enum(["READY", "FAILED"]),
});

/**
 * Reserving an upload.
 *
 * `sizeBytes` is optional because an agent streaming generated output may not
 * know the length yet — that case is carried by multipart. When it *is* given
 * it is checked against the finished object, so declaring it is what buys the
 * caller a real integrity guarantee.
 *
 * `mode` exists for callers that know better than the default: an SDK
 * uploading from a stream can force `multipart`. Omitting it is right for
 * almost everyone.
 */
export const reserveUploadInput = z.object({
  name: entityName,
  /** Omitted or null means the drive root. */
  parentId: id.nullish(),
  contentType: optionalContentType,
  sizeBytes: sizeBytes.optional(),
  clientId: clientId.optional(),
  mode: z.enum(["auto", "single", "multipart"]).optional(),
});

/**
 * Asking for part URLs.
 *
 * The client names the parts it still needs, which is what makes resume a
 * single round trip: read what storage already has, ask for the difference.
 */
export const partUrlsInput = z.object({
  partNumbers: z
    .array(z.number().int().min(1).max(10_000))
    .min(1)
    .max(100),
});

export const folderQuery = pagination.extend({
  parentId: id.optional(),
  /** @deprecated One-release compatibility alias for `parentId`. */
  folderId: id.optional(),
}).refine(
  (value) => !(value.parentId && value.folderId),
  { message: "use parentId, not both hierarchy fields" },
);

export const renameItemInput = z.object({ name: entityName });

export const moveItemInput = z.object({
  /** Null moves the Item to the Drive root. */
  newParentId: id.nullable(),
});

export const renameDriveInput = z.object({ name: entityName });

// ---------------------------------------------------------------------------
// Sharing
//
// docs/architecture/sharing/01-sharing-module.md §5 for the routes these bind
// to, §2 of the security spec for why the token has a shape at all.
// ---------------------------------------------------------------------------

/**
 * A share token, validated by shape before it reaches the database.
 *
 * 22 base62 characters, matching what the generator mints. Rejecting the wrong
 * shape here means a scanner spends our capacity on a regex rather than on an
 * indexed lookup, and it leaks nothing: the caller can see for itself that its
 * input was not 22 characters.
 */
export const shareToken = z
  .string()
  .length(22)
  .regex(/^[0-9A-Za-z]+$/, "must be a share token");

/** The one thing an owner can change about a live share. */
export const updateShareInput = z.object({
  allowDownload: z.boolean(),
});

/**
 * How a shared file's bytes are to be delivered.
 *
 * Defaults to `attachment`, so a caller that forgets the parameter gets the
 * delivery that cannot execute in a browser. Whether `inline` is *permitted*
 * is the module's decision, not this schema's — see `src/sharing/preview.ts`.
 */
export const shareDispositionQuery = z.object({
  disposition: z.enum(["inline", "attachment"]).default("attachment"),
});

/** Navigating inside a shared Drive or Folder. */
export const sharedContentsQuery = pagination.extend({
  /** Omitted means the share's own subject — the drive root, or the folder. */
  folderId: id.optional(),
});
