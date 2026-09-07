import { redirect } from "next/navigation";
import { Suspense } from "react";

import { SignInForm } from "@/components/auth";
import { currentUserId, isAuthConfigured } from "@/lib/auth";

export const metadata = { title: "Sign in · AgentDrive" };

/**
 * Optional catch-all (`[[...sign-in]]`) rather than a plain route.
 *
 * The form itself needs no sub-paths, but Clerk builds redirect URLs beneath
 * the configured sign-in URL for flows this app does not use yet — SSO
 * callbacks, session tasks. A plain `/sign-in` route would 404 on those; this
 * renders the form instead, which is a recoverable place to land.
 */
export default async function SignInPage() {
  // Nothing to sign in to until Clerk is configured — send visitors to the app.
  if (!isAuthConfigured()) {
    redirect("/drives");
  }

  /*
    Already signed in.

    Not a nicety: without it, submitting this form raises Clerk's
    `session_exists` error, which is a confusing thing to show someone who is
    simply looking at a stale tab or came back through browser history.
    Redirecting is also what makes the "sign in" link in another tab behave
    after signing in here.
  */
  if (await currentUserId()) {
    redirect("/drives");
  }

  return (
    // `useSearchParams` (for ?redirect_url=) opts the tree into client-side
    // rendering, and Next requires a Suspense boundary above it or the whole
    // route is forced dynamic with a build-time warning.
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
