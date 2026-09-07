"use client";

import { ErrorState } from "@/components/shared";

/**
 * The page a dead link lands on.
 *
 * **One page for four different facts**, and that is the design rather than a
 * shortcut: the token is unknown, the link was revoked, the file was trashed,
 * or a folder above it was. The API answers all four with the same 404 so that
 * a stranger cannot use the difference to learn whether a token was ever real
 * (docs/architecture/sharing/02-public-access-security.md), and a UI that
 * re-derived the distinction would give back exactly what the API withheld.
 *
 * No retry button. Retrying a revocation provably cannot work, and offering an
 * action that cannot succeed is worse than offering none — `canRetry` is a
 * property of the failure, and a 404 already carries `false`.
 *
 * The one action is outline, not lime. A visitor here has no account and no
 * relationship with the product; the filled accent that reads as "the obvious
 * next move" inside the app reads as a pitch on a page that just told someone
 * they cannot have what they came for.
 *
 * Rendered inside whichever shell the visitor already has — the public frame,
 * or the full app shell for someone signed in — so nobody is stranded.
 */
export function ShareGone() {
  return (
    <ErrorState
      /*
        A plain object rather than an `ApiError` instance: this state is
        reachable from a Server Component, and a class handed across that
        boundary arrives with its fields stripped. `describeFailure` reads the
        shape for exactly this reason.
      */
      error={{ status: 404, code: "share_not_found", message: "Share not found" }}
      noun="link"
      title="This link is no longer available"
      message="It may have been turned off by its owner."
      action={{ label: "Go to AgentDrive", href: "/" }}
      actionVariant="outline"
      className="my-auto"
    />
  );
}
