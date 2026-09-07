import "server-only";

// Type-only imports: erased at compile time, so importing this module never
// pulls Clerk's server/backend code (which needs `node:async_hooks`) into a
// client bundle by itself — that only happens through the dynamic `import()`
// calls below, which the "server-only" guard above ensures can only ever be
// reached from server code.
import type {
  auth as ClerkAuth,
  currentUser as ClerkCurrentUser,
} from "@clerk/nextjs/server";

import { isAuthConfigured } from "@/lib/is-auth-configured";

export { isAuthConfigured };

/**
 * Server-side answers to "who is asking".
 *
 * This is the only way server code learns the caller's identity, and it is
 * deliberately the *only* way — see the long note in src/proxy.ts about why the
 * check does not live in middleware. Every protected surface calls
 * `requireUserId()` itself, next to the data it is about to read, so a routing
 * change can never quietly unprotect a page.
 */

/**
 * The Clerk user id for this request, or null.
 *
 * Null covers three genuinely different situations that all mean "we do not
 * have a user": Clerk is not configured at all, Clerk is configured and nobody
 * is signed in, and the session has expired. Callers that need to *act* on the
 * difference check `isAuthConfigured()` first; callers that just need data do
 * not care, which is why they are collapsed here.
 */
export async function currentUserId(): Promise<string | null> {
  if (!isAuthConfigured()) return null;

  const { auth }: { auth: typeof ClerkAuth } = await import(
    "@clerk/nextjs/server"
  );
  const { userId } = await auth();
  return userId ?? null;
}

/**
 * The user id, or a redirect to sign-in that never returns.
 *
 * `redirectToSignIn()` is Clerk's own, so the URL it builds honours
 * NEXT_PUBLIC_CLERK_SIGN_IN_URL and carries the return path — the user lands
 * back where they were trying to go instead of on a generic home page, which is
 * the difference between a login wall and a dead end.
 *
 * When Clerk is not configured there is no sign-in page to send anyone to, and
 * throwing here would make an unconfigured checkout unusable. The caller
 * decides what that means; this returns null and says so in the type.
 */
export async function requireUserId(): Promise<string | null> {
  if (!isAuthConfigured()) return null;

  const { auth }: { auth: typeof ClerkAuth } = await import(
    "@clerk/nextjs/server"
  );
  const session = await auth();

  if (!session.userId) {
    // Throws a Next.js redirect. Nothing after this line runs, which is the
    // property that makes it safe to place above a data read.
    await session.redirectToSignIn();
  }

  return session.userId;
}

/**
 * The `publicMetadata` key, and the session-token claim built from it, that
 * record a finished onboarding.
 *
 * An ISO timestamp rather than a boolean. It costs the same to store and it
 * answers "when", which a boolean throws away — and signup cohort is exactly
 * the question nobody thinks to ask until the data would already have needed
 * to exist.
 */
export const ONBOARDED_KEY = "onboardedAt";

/**
 * Has this user finished onboarding?
 *
 * Two paths to the same answer, and the second one is the point.
 *
 * The **fast path** reads a custom session-token claim. Clerk mints it into the
 * JWT the caller already sent, so the answer is sitting in memory once the
 * signature has been checked — no database round trip, no Backend API call, on
 * every single page load of the signed-in product. That is configured in the
 * dashboard under Sessions → Customize session token.
 *
 * The **slow path** asks Clerk's Backend API directly, and exists because the
 * fast path depends on a dashboard setting that this repository cannot make,
 * cannot detect, and must not assume. Without it, a missing claim is
 * indistinguishable from "not onboarded" — so every user would finish
 * onboarding, be sent to the drive list, be bounced back to /welcome, and be
 * locked out of the product by a checkbox nobody ticked. Falling back to the
 * authoritative source turns that from a lockout into a latency cost.
 *
 * So the claim is an optimisation, never a requirement. That is deliberate:
 * a configuration step that degrades performance is a normal Tuesday, and one
 * that degrades correctness is an outage.
 */
export async function isOnboarded(): Promise<boolean> {
  // Nothing to onboard into when there is no identity provider — the whole
  // product resolves to a single local account, which has no profile to fill.
  if (!isAuthConfigured()) return true;

  const { auth }: { auth: typeof ClerkAuth } = await import(
    "@clerk/nextjs/server"
  );
  const { userId, sessionClaims } = await auth();
  if (!userId) return false;

  // `JwtPayload` carries an index signature, so a custom claim reads without
  // any global type augmentation. Checked for `string` rather than truthiness
  // because that is what distinguishes a real timestamp from the `true` an
  // older build might have written.
  if (typeof sessionClaims?.[ONBOARDED_KEY] === "string") return true;

  const { currentUser }: { currentUser: typeof ClerkCurrentUser } =
    await import("@clerk/nextjs/server");
  const user = await currentUser();

  return typeof user?.publicMetadata?.[ONBOARDED_KEY] === "string";
}

/**
 * Email and display name for the signed-in user.
 *
 * Separate from `currentUserId` because it costs a round trip to Clerk's
 * Backend API, whereas the id is already in the verified session token. Keeping
 * them apart means a page that only needs to know *whether* someone is signed
 * in does not pay for their profile.
 *
 * Used on the account-provisioning path (src/db/scope.ts `Identity.profile`),
 * which is why it is shaped as a thunk there rather than fetched eagerly.
 */
export async function currentProfile(): Promise<{
  email: string | null;
  name: string | null;
}> {
  if (!isAuthConfigured()) return { email: null, name: null };

  const { currentUser }: { currentUser: typeof ClerkCurrentUser } =
    await import("@clerk/nextjs/server");
  const user = await currentUser();
  if (!user) return { email: null, name: null };

  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();

  return {
    // `primaryEmailAddress` is the one they sign in with, and the one our
    // unique column has to agree with.
    email: user.primaryEmailAddress?.emailAddress ?? null,
    name: name || null,
  };
}
