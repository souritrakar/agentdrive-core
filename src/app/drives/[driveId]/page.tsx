import { cookies } from "next/headers";

import { BrowserView } from "@/components/browser";
import { parseViewMode, VIEW_MODE_COOKIE } from "@/lib/ui-preferences";

export default async function DriveRootPage({
  params,
}: {
  params: Promise<{ driveId: string }>;
}) {
  const [{ driveId }, cookieStore] = await Promise.all([params, cookies()]);

  return (
    <BrowserView
      driveId={driveId}
      parentId={null}
      defaultViewMode={parseViewMode(cookieStore.get(VIEW_MODE_COOKIE)?.value)}
    />
  );
}
