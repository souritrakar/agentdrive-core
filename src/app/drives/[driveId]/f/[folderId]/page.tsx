import { cookies } from "next/headers";

import { BrowserView } from "@/components/browser";
import { parseViewMode, VIEW_MODE_COOKIE } from "@/lib/ui-preferences";

/**
 * A folder inside a drive.
 *
 * Only the folder's own id is in the URL, not the whole ancestor chain — the API
 * returns the breadcrumb trail, so deep links stay short and a folder that moves
 * doesn't invalidate its own link.
 */
export default async function FolderPage({
  params,
}: {
  params: Promise<{ driveId: string; folderId: string }>;
}) {
  const [{ driveId, folderId }, cookieStore] = await Promise.all([
    params,
    cookies(),
  ]);

  return (
    <BrowserView
      driveId={driveId}
      parentId={folderId}
      defaultViewMode={parseViewMode(cookieStore.get(VIEW_MODE_COOKIE)?.value)}
    />
  );
}
