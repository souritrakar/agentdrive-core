import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout";
import { isOnboarded, requireUserId } from "@/lib/auth";
import { parseSidebarCollapsed, SIDEBAR_COOKIE } from "@/lib/ui-preferences";

/**
 * The authentication boundary for the whole signed-in product.
 *
 * Every drive, folder, and file surface renders inside this layout, so the
 * single check below is what stands between a stranger and the application —
 * and it lives here, in the component tree, rather than in a middleware path
 * matcher. src/proxy.ts explains why at length; the short version is that a
 * matcher is a guess about routing that fails open when it is wrong, whereas a
 * layout cannot be rendered around a page without running.
 *
 * It is not the *only* boundary. The Worker verifies the caller's token
 * independently before it touches a row (workers/api/src/lib/scope.ts), because
 * anything the browser can request, a script can request without ever loading
 * this layout. This check is what makes the product coherent for a person; that
 * one is what makes the data safe.
 */
export default async function DrivesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Before the cookie read, and before anything renders: an unauthenticated
  // visitor is redirected to sign-in and this function does not return.
  await requireUserId();

  /*
    Signed in, but we still do not know their name.

    Placed here rather than in middleware for the same reason the check above
    is: this layout wraps every drive, folder, and file surface, so one check
    covers all of them and no routing change can slip past it.

    `isOnboarded()` answers from the session token when the custom claim is
    configured, and falls back to Clerk's Backend API when it is not — so this
    costs nothing on the common path and is still *correct* on an instance
    where nobody has ticked the dashboard box. See src/lib/auth.ts.

    The mirror-image check lives in src/app/welcome/page.tsx, which redirects
    here once onboarding is done. Both call this same function, so exactly one
    of the two ever redirects and the pair cannot oscillate.
  */
  if (!(await isOnboarded())) {
    redirect("/welcome");
  }

  /*
    The rail's collapsed state, read before rendering.

    This is why the preference is a cookie: the value is in the request, so the
    first HTML response already has the rail at the right width. Reading it on
    the client instead would ship an expanded rail and snap it shut after
    hydration, on every single navigation.
  */
  const cookieStore = await cookies();
  const isCollapsed = parseSidebarCollapsed(
    cookieStore.get(SIDEBAR_COOKIE)?.value,
  );

  return <AppShell defaultCollapsed={isCollapsed}>{children}</AppShell>;
}
