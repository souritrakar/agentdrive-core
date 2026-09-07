import { ApiError, API_BASE_URL } from "./api-error";
import type { FolderPage, Item } from "./types";

/**
 * The visitor's side of a share: everything a stranger holding a token can do.
 *
 * Separate from `drive-api.ts` because the trust boundary is different, not
 * because the feature is. Every function there attaches the caller's Clerk
 * bearer token and retries once on a 401; every function here deliberately
 * sends **no credentials at all**. The token in the path *is* the
 * authorization, and a signed-in visitor's session grants nothing extra — a
 * share link shows the same thing to everyone who holds it, which is the
 * property that makes it a capability rather than an ACL.
 *
 * That is also why this does not reuse `request()`: sharing it would mean
 * either attaching credentials that mean nothing here, or threading a flag
 * through the one function whose whole job is attaching them. The duplicated
 * part is the error envelope, and it is duplicated on purpose.
 *
 * First paint does not come through here at all — the share pages are Server
 * Components that call `src/sharing` directly (01 §5). This module is what the
 * *browser* uses afterwards: paging deeper into a shared folder, and minting
 * the short-lived URLs that presigned bytes require at the moment of use.
 */

type ErrorEnvelope = { error?: { code?: string; message?: string } };

async function publicRequest<T>(path: string): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`);
  } catch {
    // `fetch` rejects only when no HTTP response happened — Worker down, DNS,
    // CORS preflight refused. Status 0 is the marker for that whole family, and
    // `describeFailure` decides what to tell the user about it.
    throw new ApiError("network", "The API did not respond.", 0);
  }

  const payload = (await response.json().catch(() => ({}))) as T & ErrorEnvelope;

  if (!response.ok) {
    /*
      Every terminal denial arrives here as one indistinguishable 404 —
      unknown token, revoked link, trashed file, trashed ancestor. That is the
      API's no-enumeration rule (02 §2), and this client must not try to
      recover the distinction: it renders the gone page for all of them.
    */
    throw new ApiError(
      payload.error?.code ?? "unknown",
      payload.error?.message ?? "The request failed.",
      response.status,
    );
  }

  return payload;
}

/** One level inside a shared Drive or Folder. `folderId` is the subject root when null. */
export async function getSharedContents(
  token: string,
  folderId: string | null,
  cursor?: string,
): Promise<FolderPage> {
  const query = new URLSearchParams({ limit: "50" });
  if (folderId) query.set("folderId", folderId);
  if (cursor) query.set("cursor", cursor);

  return publicRequest<FolderPage>(
    `/v1/shares/${encodeURIComponent(token)}/contents?${query.toString()}`,
  );
}

/** Metadata for the file viewer. Never a byte pointer. */
export async function getSharedItem(
  token: string,
  itemId: string,
): Promise<Item> {
  const { item } = await publicRequest<{ item: Item }>(
    `/v1/shares/${encodeURIComponent(token)}/items/${encodeURIComponent(itemId)}`,
  );
  return item;
}

/**
 * A short-lived URL for one file's bytes.
 *
 * Minted at the moment of use and never earlier: these expire in five minutes
 * (02 §3), so a URL rendered into the page at load time would already be dead
 * by the time anyone clicked it — and would have sat in every intermediate
 * cache in the meantime. `inline` is for a preview stage, `attachment` for the
 * Download button; which of the two a file is allowed is the server's decision,
 * not this caller's.
 */
export async function getSharedFileUrl(
  token: string,
  itemId: string,
  disposition: "inline" | "attachment",
): Promise<string> {
  const { download } = await publicRequest<{ download: { url: string } }>(
    `/v1/shares/${encodeURIComponent(token)}/items/${encodeURIComponent(itemId)}` +
      `/download?disposition=${disposition}`,
  );
  return download.url;
}
