"use client";

import { useCallback } from "react";

import { ShareFileViewer } from "@/components/share";
import { useDownload } from "@/hooks/use-download";
import { getSharedFileUrl } from "@/lib/share-api";
import type { Item } from "@/lib/types";

/**
 * The interactive half of the file viewer: where its bytes come from.
 *
 * Both URLs are minted at the moment of use and never earlier. They expire in
 * five minutes (02 §3), so one rendered into the page at load time would be
 * dead before most people clicked it — and would have sat in every cache
 * between here and the visitor in the meantime. The page holds the *route*; the
 * route holds the credential.
 *
 * The two dispositions are different requests on purpose. `inline` is the
 * preview stage and is granted only for content types a browser renders
 * passively; `attachment` is the Download button. Which of the two a given file
 * may have is the server's decision — an uploaded HTML page or SVG is never
 * served inline, because it would execute in whoever opened the preview.
 */
export function ShareFile({
  token,
  file,
  allowDownload,
}: {
  token: string;
  file: Extract<Item, { kind: "FILE" }>;
  allowDownload: boolean;
}) {
  const getPreviewUrl = useCallback(
    () => getSharedFileUrl(token, file.id, "inline"),
    [token, file.id],
  );

  /*
    The same hook the owner's listing uses, pointed at a different door.

    Only where the URL comes from differs — the synthesised anchor, the
    popup-blocker avoidance, and the failure toast are all mechanics that are
    easy to get subtly wrong and should exist once.
  */
  const mintUrl = useCallback(
    (itemId: string) => getSharedFileUrl(token, itemId, "attachment"),
    [token],
  );
  const { download } = useDownload(mintUrl);

  return (
    <ShareFileViewer
      file={file}
      allowDownload={allowDownload}
      getPreviewUrl={getPreviewUrl}
      onDownload={allowDownload ? () => download(file.id, file.name) : undefined}
    />
  );
}
