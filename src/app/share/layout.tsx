import type { Metadata } from "next";
import { cookies } from "next/headers";

import { AppShell } from "@/components/layout";
import { PublicFrame } from "@/components/share";
import { currentUserId } from "@/lib/auth";
import { parseSidebarCollapsed, SIDEBAR_COOKIE } from "@/lib/ui-preferences";

/**
 * A share link is unlisted, not published.
 *
 * `noindex` keeps a leaked link out of a search index, and `no-referrer` is the
 * load-bearing one: the token is *in the URL*, so a referrer header sent to any
 * third-party resource would be handing out the credential itself. Nothing on
 * these pages loads cross-origin today, and this is what keeps that true when
 * something eventually does. The same two policies sit on the Worker's
 * `/v1/shares/*` responses, and `next.config.ts` sets them as real headers —
 * these tags are the in-document half of the same decision.
 *
 * docs/architecture/sharing/02-public-access-security.md §6
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * The shell around a shared item, chosen by who is looking.
 *
 * Deliberately **outside** `src/app/drives/`. That layout is the product's
 * authentication boundary and redirects a stranger to sign-in; a share page has
 * to render for strangers, so it lives in its own segment rather than punching
 * a hole through a boundary. The mirror of the reasoning that put the gate in a
 * layout instead of a middleware matcher: a public page should not sit inside a
 * gate and ask for an exception.
 *
 * `currentUserId()` here, never `requireUserId()`: a presence check and nothing
 * more — no redirect, no onboarding gate. Sending someone who clicked a link to
 * sign-in or `/welcome` first would be a wall in front of content that needs no
 * account at all. It also answers null when Clerk is unconfigured, which is the
 * right shell for that case too.
 *
 * A signed-in visitor keeps their own chrome: their sidebar, their drives,
 * their profile. They are still themselves while looking at someone else's
 * file, and stripping the app down around them would read as having been logged
 * out. Both shells pass through the same content pane.
 */
export default async function ShareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userId = await currentUserId();

  if (!userId) return <PublicFrame>{children}</PublicFrame>;

  // Same cookie read as the drives layout, and for the same reason: the value
  // arrives with the request, so the rail renders at its real width in the
  // first HTML response instead of snapping shut after hydration.
  const cookieStore = await cookies();
  const isCollapsed = parseSidebarCollapsed(
    cookieStore.get(SIDEBAR_COOKIE)?.value,
  );

  /*
    `disableUpload` even though the visitor is signed in.

    In v1 nobody can upload into a drive they do not own, so a drop-anywhere
    target here would end in a permissions error — worse than no target at all.
    It is a prop rather than a reliance on `/share/*` carrying no `driveId`
    param, because that accident would end the first time a route param was
    renamed.
  */
  return (
    <AppShell defaultCollapsed={isCollapsed} disableUpload>
      {children}
    </AppShell>
  );
}
