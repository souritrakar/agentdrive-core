import { ShareGone } from "@/components/share";

import { ShareFile } from "../../../share-file";
import { getSharedFileOrNull, resolveShareOrNull } from "../../../resolve";

/**
 * A file opened from inside a shared folder or drive.
 *
 * The same viewer as the subject-file case, parameterised by item id — one page
 * component would have been possible, but two routes keep the URLs honest: a
 * file inside a share has its own address, so it can be linked, refreshed, and
 * navigated back to.
 *
 * `itemId` is visitor-supplied and gets the same treatment as `folderId` in the
 * listing route: the module walks it back to the share's subject before it will
 * say anything about it, so an id belonging to another drive is the same denial
 * as a bad token.
 */
export default async function SharedFilePage({
  params,
}: {
  params: Promise<{ token: string; itemId: string }>;
}) {
  const { token, itemId } = await params;

  const view = await resolveShareOrNull(token);
  if (!view) return <ShareGone />;

  const file = await getSharedFileOrNull(token, itemId);
  if (!file) return <ShareGone />;

  return (
    <ShareFile
      token={token}
      file={file}
      allowDownload={view.share.allowDownload}
    />
  );
}
