/**
 * What a share's presigned GET actually signs.
 *
 * Presigning is local computation — no network, no credentials that have to be
 * real — so the exact query string a visitor would receive can be asserted
 * here. These are the storage half of the sharing security checklist
 * (docs/architecture/sharing/02-public-access-security.md §3, §9): the expiry
 * window, the pinned response content type, and the disposition. Each of them
 * is one query parameter away from being wrong in a way no type would catch.
 */

import { describe, expect, it } from "vitest";

import { createStorageClient } from "./client";
import {
  presignGet,
  PRESIGN_EXPIRES_IN,
  SHARE_PRESIGN_EXPIRES_IN,
} from "./objects";

const client = createStorageClient({
  endpoint: "https://example.r2.cloudflarestorage.com",
  region: "auto",
  accessKeyId: "test-access-key",
  secretAccessKey: "test-secret-key",
});

async function signed(
  filename: string | undefined,
  options?: Parameters<typeof presignGet>[4],
) {
  const { url, expiresAt } = await presignGet(
    client,
    "bucket",
    "pods/pod-1/objects/abc",
    filename,
    options,
  );
  return { params: new URL(url).searchParams, url, expiresAt };
}

describe("presignGet", () => {
  it("defaults to the authenticated path's fifteen minutes", async () => {
    const { params } = await signed("report.pdf");
    expect(params.get("X-Amz-Expires")).toBe(String(PRESIGN_EXPIRES_IN));
    expect(PRESIGN_EXPIRES_IN).toBe(900);
  });

  it("signs share URLs for five minutes", async () => {
    const { params, expiresAt } = await signed("report.pdf", {
      expiresIn: SHARE_PRESIGN_EXPIRES_IN,
    });
    expect(params.get("X-Amz-Expires")).toBe("300");
    expect(SHARE_PRESIGN_EXPIRES_IN).toBe(300);

    // The advertised moment has to match what was signed, or a client caches a
    // URL past the point R2 stops honouring it.
    const window = Date.parse(expiresAt) - Date.now();
    expect(window).toBeGreaterThan(280_000);
    expect(window).toBeLessThanOrEqual(300_000);
  });

  it("defaults to attachment, and never declares a content type unasked", async () => {
    const { params } = await signed("report.pdf");
    expect(params.get("response-content-disposition")).toMatch(/^attachment;/);
    // The authenticated path is unchanged by the share work: no pinned type,
    // so R2 replays what the object carries, exactly as it always has.
    expect(params.get("response-content-type")).toBeNull();
  });

  it("pins the response content type it is given", async () => {
    const { params } = await signed("notes.md", {
      disposition: "inline",
      contentType: "text/plain",
    });
    expect(params.get("response-content-type")).toBe("text/plain");
    expect(params.get("response-content-disposition")).toMatch(/^inline;/);
  });

  it("serves an unpreviewable type as an attachment", async () => {
    // What the module decides for a `.svg`: octet-stream, attachment. Neither
    // header alone would stop it rendering; both together do.
    const { params } = await signed("logo.svg", {
      disposition: "attachment",
      contentType: "application/octet-stream",
    });
    expect(params.get("response-content-type")).toBe("application/octet-stream");
    expect(params.get("response-content-disposition")).toMatch(/^attachment;/);
  });

  it("cannot be made to smuggle a header through a filename", async () => {
    const { params } = await signed('e"vil\r\nX-Injected: 1.txt', {
      disposition: "inline",
      contentType: "text/plain",
    });
    const disposition = params.get("response-content-disposition") ?? "";
    expect(disposition).not.toMatch(/[\r\n]/);
    // The quote that would have terminated the quoted string is gone.
    expect(disposition).toMatch(/^inline; filename="e_vil__X-Injected: 1\.txt"/);
  });

  it("signs only the one key it was asked for", async () => {
    const { url } = await signed("report.pdf", {
      expiresIn: SHARE_PRESIGN_EXPIRES_IN,
    });
    // Virtual-hosted addressing: the bucket is the host, the key is the path.
    const parsed = new URL(url);
    expect(parsed.host).toBe("bucket.example.r2.cloudflarestorage.com");
    expect(parsed.pathname).toBe("/pods/pod-1/objects/abc");
    expect(parsed.searchParams.get("X-Amz-Signature")).toBeTruthy();
  });
});
