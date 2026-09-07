import { redirect } from "next/navigation";

import { isAuthConfigured, isOnboarded, requireUserId } from "@/lib/auth";

import { WelcomeFlow } from "./welcome-flow";

export const metadata = { title: "Welcome · AgentDrive" };

/**
 * Onboarding, once per account.
 *
 * Three guards, and each one closes a door the others leave open.
 *
 * **Unconfigured Clerk** has no profile to collect and nowhere to store one —
 * the whole product resolves to a single local account. Sending someone to a
 * form that cannot save is worse than not asking.
 *
 * **Signed out** is `requireUserId()`, the same check the drives layout makes,
 * for the same reason it lives next to the data rather than in a path matcher:
 * a route this page does not control cannot quietly unprotect it.
 *
 * **Already onboarded** is what keeps this from being reachable forever. The
 * drives layout redirects *here* when onboarding is incomplete, so without the
 * mirror-image check a user who typed the URL by hand — or who kept a stale tab
 * open — could re-run the flow and reset their own name. It also means the two
 * routes can never point at each other: exactly one of them redirects for any
 * given user, and which one is decided by the same function on both sides.
 */
export default async function WelcomePage() {
  if (!isAuthConfigured()) {
    redirect("/drives");
  }

  await requireUserId();

  if (await isOnboarded()) {
    redirect("/drives");
  }

  return <WelcomeFlow />;
}
