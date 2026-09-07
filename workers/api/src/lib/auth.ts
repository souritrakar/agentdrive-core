import { createClerkClient, verifyToken } from "@clerk/backend";
import { HTTPException } from "hono/http-exception";

import type { Identity, Profile } from "@/db/scope";

import { allowedOrigins, type Bindings } from "./env";

/**
 * Who is calling this Worker.
 *
 * This is the security boundary of the whole backend. The Next.js app has its
 * own check in src/app/drives/layout.tsx, but that one only governs what a
 * browser is shown — it does nothing about `curl`, an agent, or any other
 * client that talks to this Worker directly, which is most of what this Worker
 * exists to serve. So nothing here trusts the app: the token is verified from
 * scratch on every request.
 *
 * Before this existed, `requireScope` resolved every caller to one shared
 * development account. That was fine on localhost and catastrophic anywhere
 * else, and it is the reason the routes carried a "do not deploy publicly"
 * warning.
 */

/**
 * Pulls the bearer token out of the request.
 *
 * Header only — deliberately not a cookie. This Worker is on a different origin
 * from the app, so a cookie-based session would have to be `SameSite=None` to
 * reach it, and a cookie that the browser attaches automatically to
 * cross-origin requests is exactly the ingredient CSRF needs. A token the
 * client has to fetch and attach by hand cannot be sent by a page the user did
 * not open, which removes that class of attack rather than defending against
 * it.
 */
function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;

  const [scheme, token] = header.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) return null;

  return token.trim() || null;
}

/**
 * Verifies the caller's Clerk session token and returns their identity.
 *
 * Throws 401 for anything that is not a valid, unexpired, correctly-issued
 * token — with one message for every cause. A response that distinguishes
 * "expired" from "malformed" from "signed by the wrong key" is a free oracle
 * for anyone probing the endpoint, and the client cannot act on the difference
 * anyway: all three mean "get a fresh token and try again".
 */
export async function requireIdentity(
  env: Bindings,
  request: Request,
): Promise<Identity> {
  if (!env.CLERK_SECRET_KEY) {
    // Fails closed. An unconfigured deployment serves nobody rather than
    // serving everybody, which is the opposite of how this Worker behaved
    // before auth landed.
    throw new HTTPException(503, {
      message:
        "CLERK_SECRET_KEY is not set. Add it to workers/api/.dev.vars locally, or `wrangler secret put CLERK_SECRET_KEY` in production.",
    });
  }

  const token = bearerToken(request);
  if (!token) {
    throw new HTTPException(401, {
      message: "This endpoint requires an Authorization: Bearer <token> header.",
    });
  }

  let payload;
  try {
    payload = await verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY,
      /*
        Which apps' tokens this Worker will accept.

        Clerk stamps the requesting origin into the token's `azp` claim. One
        Clerk instance can serve several front ends, and without this list a
        token minted for any of them — including a staging or preview
        deployment with weaker access — would be accepted here as though it
        came from production. Pinning it to the same origins CORS already
        allows keeps the two answers from drifting apart.
      */
      authorizedParties: allowedOrigins(env),
    });
  } catch {
    throw new HTTPException(401, {
      message: "Your session is not valid. Sign in again.",
    });
  }

  if (!payload.sub) {
    throw new HTTPException(401, {
      message: "Your session is not valid. Sign in again.",
    });
  }

  /*
    Pending sessions are not signed-in sessions.

    Clerk mints a real, correctly-signed token the moment a user authenticates,
    even when the session still owes an outstanding *task* — choosing an
    organisation, or resetting an expired password. Such a token carries
    `sts: "pending"`, and `verifyToken` accepts it, because the signature is
    genuine.

    The Next.js app already refuses it: `auth()` reports no user for a pending
    session, which is why the drives layout redirects. Accepting it here would
    put the two halves of the product into open disagreement — the app telling
    someone to finish signing in while this Worker hands their files to the same
    token. For the `reset-password` task that is not merely inconsistent, it is
    the bypass: the point of that task is that the current credentials are no
    longer good enough.

    The claim is read defensively because `sts` is a v2 session-token claim and
    is absent on older tokens; absent means "not pending", which is the safe
    reading — an old token that never had tasks cannot be waiting on one.
  */
  if ((payload as { sts?: string }).sts === "pending") {
    throw new HTTPException(401, {
      message: "Finish signing in before using the API.",
    });
  }

  return {
    externalAuthId: payload.sub,
    /*
      Lazy on purpose — see `Identity` in src/db/scope.ts.

      A Clerk session token does not carry the user's email by default, so
      learning it costs a call to Clerk's Backend API. That call is worth
      making exactly once, on the request that provisions the Account row, and
      never again. Passing a thunk rather than a value is what makes "once"
      expressible: `resolveScope` only invokes it when it is actually about to
      write a row.
    */
    profile: () => fetchProfile(env.CLERK_SECRET_KEY!, payload.sub),
  };
}

async function fetchProfile(
  secretKey: string,
  externalAuthId: string,
): Promise<Profile> {
  try {
    const clerk = createClerkClient({ secretKey });
    const user = await clerk.users.getUser(externalAuthId);

    const primary =
      user.emailAddresses.find(
        (address) => address.id === user.primaryEmailAddressId,
      ) ?? user.emailAddresses[0];

    const name = [user.firstName, user.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();

    return { email: primary?.emailAddress ?? null, name: name || null };
  } catch (cause) {
    /*
      A profile lookup failing must not fail the request.

      The token is already verified at this point, so we know who the caller
      is; all this call adds is a nicer email on a brand-new row. Clerk's API
      being slow or down is not a reason to refuse someone access to their own
      files — `resolveScope` falls back to a placeholder email, and the
      webhook or a later request fills it in.
    */
    console.error(`Could not load Clerk profile for ${externalAuthId}`, cause);
    return {};
  }
}
