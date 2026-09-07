"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";

import { ONBOARDED_KEY } from "@/lib/auth";

/**
 * The one write onboarding performs.
 *
 * A Server Action rather than a route on the Worker, and that split is
 * deliberate. `workers/api` is the product's public API — versioned from the
 * start, because an external client will eventually hold onto those URLs. A
 * display name is a consumer-app concern; putting it under `/v1` would place a
 * profile endpoint in a contract meant for agents manipulating files, more or
 * less permanently. Drives, folders and files go through the Worker. Identity
 * and session concerns go here.
 *
 * Both writes land in Clerk rather than in Postgres, which is the same
 * boundary drawn from the other side: Clerk owns facts about the *person*,
 * Postgres owns the things that person made. A display name is a fact about
 * the person.
 *
 * Storing it there rather than in `accounts.name` is not a stylistic
 * preference — it makes four things work that would otherwise be code:
 *
 *   - `<UserButton showName />` in the sidebar starts rendering the name,
 *     because it reads Clerk. Writing only to Postgres would leave it showing
 *     the raw email address until a bespoke replacement was built.
 *   - `<UserProfile />` becomes a working account-settings screen for free.
 *   - `currentProfile()` in src/lib/auth.ts already derives a name from
 *     `firstName`/`lastName`, and `syncAccountFromClerk` already writes it to
 *     `accounts.name` on `user.updated` — so the Postgres mirror fills itself
 *     through machinery that exists and has already been reasoned about.
 *   - Enabling a social provider later populates both fields from the OAuth
 *     profile with no migration.
 */

export type SaveProfileResult = { ok: true } | { ok: false; message: string };

/**
 * Records the user's name and marks onboarding complete.
 *
 * Returns a result rather than throwing. An unhandled throw in a Server Action
 * reaches the client as a redacted "an error occurred in the Server Components
 * render" with no usable detail, which on the first screen of the product is
 * the worst possible failure — the user cannot proceed and cannot say why.
 */
export async function saveProfile(
  rawName: string,
): Promise<SaveProfileResult> {
  const { userId } = await auth();

  // The id comes from the verified session, never from the caller. A Server
  // Action is an HTTP endpoint like any other — accepting a user id as an
  // argument here would let anyone rename anyone.
  if (!userId) {
    return { ok: false, message: "Your session has expired. Sign in again." };
  }

  const name = rawName.trim().replace(/\s+/g, " ");

  if (!name) {
    return { ok: false, message: "Enter your name." };
  }

  // Clerk rejects an over-long name with a 422 that would surface as a generic
  // failure. Cheaper and clearer to say so here.
  if (name.length > 64) {
    return { ok: false, message: "That name is too long — 64 characters max." };
  }

  /*
    Split on the last space, not the first.

    Clerk stores two fields and people do not arrive in two fields. "Souritra
    Kar" is unambiguous; "Ada Lovelace King" is not, and guessing wrong on the
    *first* space would file most multi-part given names under a surname. Last
    space is the convention that is right more often, and a single word simply
    has no last name — which Clerk allows, because `lastName` is nullable.

    Everything the product displays is the two joined back together, so this
    split is a storage detail rather than something the user is asked to care
    about.
  */
  const lastSpace = name.lastIndexOf(" ");
  const firstName = lastSpace === -1 ? name : name.slice(0, lastSpace);
  const lastName = lastSpace === -1 ? undefined : name.slice(lastSpace + 1);

  try {
    const clerk = await clerkClient();

    await clerk.users.updateUser(userId, { firstName, lastName });

    /*
      A separate call, and it has to be.

      Passing `publicMetadata` to `updateUser()` is deprecated in this version
      of @clerk/backend — the typings say so explicitly. `updateUserMetadata`
      deep-merges rather than replacing, so this cannot clobber any other key
      that a future feature puts alongside it.

      Ordered after the name on purpose. This key is what the gate in
      src/app/drives/layout.tsx reads, so writing it first would open the
      product to a user whose name write then failed — leaving them past
      onboarding with the thing onboarding exists to collect still missing.
    */
    await clerk.users.updateUserMetadata(userId, {
      publicMetadata: { [ONBOARDED_KEY]: new Date().toISOString() },
    });

    return { ok: true };
  } catch (cause) {
    console.error("Onboarding profile write failed", cause);
    return {
      ok: false,
      message: "We could not save that. Check your connection and try again.",
    };
  }
}
