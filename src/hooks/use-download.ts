"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

import { getDownloadUrl } from "@/lib/drive-api";

/**
 * Fetches a file's short-lived download URL and hands it to the browser.
 *
 * The URL cannot be put on an `<a href>` ahead of time — it is presigned and
 * expires in minutes, so a link rendered with the listing would be dead by the
 * time anyone clicked it. It has to be fetched at click time, which is why this
 * is a hook and not markup.
 *
 * The synthesised anchor rather than `window.open`: popup blockers treat a
 * programmatic `open()` after an `await` as unsolicited, while an anchor click
 * survives. `download` is set but browsers ignore it cross-origin, so the
 * filename ultimately comes from storage's `content-disposition`.
 *
 * `mintUrl` is a parameter because a share page downloads the same way through
 * a different door: its URL comes from `/v1/shares/:token/...` rather than from
 * the authenticated file route. Only where the URL comes from differs, so only
 * that is injected — forking the hook would leave two copies of the anchor
 * mechanics above, and they are the part that is easy to get subtly wrong.
 */
export function useDownload(
  mintUrl: (fileId: string) => Promise<string> = getDownloadUrl,
) {
  const [pendingId, setPendingId] = useState<string | null>(null);

  const download = useCallback(async (fileId: string, name: string) => {
    setPendingId(fileId);
    try {
      const url = await mintUrl(fileId);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      anchor.rel = "noopener";
      anchor.target = "_blank";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
    } catch (cause) {
      // Never a dead end: say what went wrong rather than doing nothing.
      toast.error(
        cause instanceof Error ? cause.message : "Could not download the file.",
      );
    } finally {
      setPendingId(null);
    }
  }, [mintUrl]);

  return { download, pendingId };
}
