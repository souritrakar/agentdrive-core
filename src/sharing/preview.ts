/**
 * Which content types a share may serve *inline*, and what type to declare.
 *
 * This is an authorization decision, not a rendering preference, which is why
 * it lives in the module rather than in the viewer: whether bytes may be handed
 * to a browser in a context that could execute them is exactly the kind of rule
 * that must not be re-decided by each caller. The transport asks, presigns
 * accordingly, and pins `ResponseContentType` to what this returns.
 *
 * Full reasoning, including why the blast radius is contained even if this
 * filter is wrong: docs/architecture/sharing/02-public-access-security.md §3.
 */

/**
 * Types a browser renders passively, with no script execution context.
 *
 * Every addition to this list is a security decision. `text/html`,
 * `application/xhtml+xml`, and `image/svg+xml` are the ones to never add: all
 * three can carry a `<script>` that runs when a visitor opens a preview.
 */
const INLINE_ALLOWLIST = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "application/pdf",
  "text/plain",
]);

/**
 * Text types that are safe to render, but only after being *re-typed*.
 *
 * A `.md` or `.ts` file is plain text as far as a browser is concerned; naming
 * it `text/markdown` in the response tells the browser nothing useful and
 * declares a type we did not verify. Serving it as `text/plain` is both honest
 * and inert.
 */
const RETYPED_AS_PLAIN = new Set([
  "text/markdown",
  "text/x-markdown",
  "text/csv",
  "text/tab-separated-values",
  "application/json",
  "text/javascript",
  "application/javascript",
  "text/css",
  "text/x-python",
  "application/x-yaml",
  "text/yaml",
  "text/x-log",
]);

/** The type served when a row has none, or one we will not repeat back. */
export const FALLBACK_CONTENT_TYPE = "application/octet-stream";

/** Strips parameters and casing: `Text/Plain; charset=UTF-8` -> `text/plain`. */
function normalize(contentType: string | null): string | null {
  if (!contentType) return null;
  const base = contentType.split(";")[0]?.trim().toLowerCase();
  return base ? base : null;
}

/**
 * The content type to declare for an inline preview, or null if this row may
 * not be previewed inline at all.
 *
 * Returning the type rather than a boolean is what lets the transport pin
 * `ResponseContentType` from one source: the caller cannot accidentally allow
 * `text/markdown` inline and then serve it under its original type.
 */
export function inlineContentType(contentType: string | null): string | null {
  const base = normalize(contentType);
  if (!base) return null;
  if (RETYPED_AS_PLAIN.has(base)) return "text/plain";
  return INLINE_ALLOWLIST.has(base) ? base : null;
}

/** True when a preview may be served inline for this content type. */
export function isInlinePreviewable(contentType: string | null): boolean {
  return inlineContentType(contentType) !== null;
}

/**
 * The content type to declare for an attachment download.
 *
 * Never echoes an unknown type back: a type we do not recognise is served as
 * `application/octet-stream`, which no browser renders. Recognised-but-active
 * types (HTML, SVG) get the same treatment — attachment disposition already
 * stops them rendering, and declaring them anyway would leave the safety of the
 * response resting on one header instead of two.
 */
export function attachmentContentType(contentType: string | null): string {
  const base = normalize(contentType);
  if (!base) return FALLBACK_CONTENT_TYPE;
  if (RETYPED_AS_PLAIN.has(base) || INLINE_ALLOWLIST.has(base)) return base;
  return FALLBACK_CONTENT_TYPE;
}
