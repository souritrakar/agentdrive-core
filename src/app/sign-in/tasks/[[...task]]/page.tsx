import { TaskChooseOrganization } from "@clerk/nextjs";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { isAuthConfigured } from "@/lib/auth";

export const metadata = { title: "One more step · AgentDrive" };

/**
 * Session tasks — the step Clerk can insert between "authenticated" and
 * "signed in".
 *
 * A task is a requirement configured in the Clerk dashboard that a session must
 * satisfy before it counts as active: choosing an organisation, resetting an
 * expired password, setting up MFA. Until it is satisfied the session is
 * *pending*, `auth()` reports no user, and `requireUserId()` in the drives
 * layout redirects — so without this route a user who has just successfully
 * verified their email bounces between the sign-in page and a URL that renders
 * nothing. That is not hypothetical: it is exactly what this instance did
 * before this file existed, because Organizations are enabled on it with
 * organisation selection required.
 *
 * WORTH KNOWING, IF YOU ARE DECIDING WHETHER TO KEEP THIS:
 *
 * AgentDrive does not use Clerk Organizations. Tenancy lives in Postgres as
 * an account namespace, deliberately
 * invisible until someone needs a second workspace. Asking a brand-new user to
 * name an organisation before they have seen a single file is the opposite of
 * that, and it is a Clerk dashboard setting rather than anything this code
 * chose. The fix is to turn the requirement off:
 *
 *   Clerk Dashboard -> Configure -> Organizations
 *   (disable Organizations, or clear the "require an organization" task)
 *
 * This route stays regardless. It costs almost nothing, and it is the
 * difference between a dashboard toggle changing a screen and a dashboard
 * toggle locking every new signup out of the product.
 */
export default async function SignInTasksPage() {
  if (!isAuthConfigured()) {
    redirect("/drives");
  }

  return (
    <AuthShell
      title="One more step"
      description="Your account is ready — we just need this before you can continue."
    >
      {/*
        Clerk's own component, not a custom form. Every other screen in this
        flow is custom because we own the copy and the error handling; this one
        is not, because the set of tasks is defined by Clerk, changes with a
        dashboard toggle, and would silently render nothing for any task we had
        not hand-written. A prebuilt component that always matches the
        configuration beats a bespoke one that matches it until someone ticks a
        box.
      */}
      <TaskChooseOrganization
        appearance={clerkAppearance}
        // Where the now-complete session lands. The drive list, i.e. the same
        // place every other successful auth path ends — the task is a detour,
        // not a different destination.
        redirectUrlComplete="/drives"
      />
    </AuthShell>
  );
}
