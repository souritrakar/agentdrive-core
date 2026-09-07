import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/*
  Next.js 16 renamed the "middleware" file convention to "proxy" (same
  mechanism, new name/file). See node_modules/next/dist/docs/01-app/
  03-api-reference/03-file-conventions/proxy.md.

  Clerk's `clerkMiddleware()` returns a plain `(request, event) => response`
  handler — the same shape Proxy expects — so it works unchanged here.

  WHAT THIS FILE DOES NOT DO: it does not decide who may see what.

  That is deliberate and it is a change from how Clerk was used before v7.
  `createRouteMatcher` is deprecated in @clerk/nextjs 7.x, and its own
  deprecation notice gives the reason (see
  node_modules/@clerk/nextjs/dist/types/server/routeMatcher.d.ts):

    "Middleware-based auth checks rely on path matching, which can diverge
     from how Next.js routes requests and leave protected resources
     reachable."

  A matcher is a guess about which URLs reach which code. Route groups,
  rewrites, parallel routes, and interception can all make that guess wrong,
  and when it is wrong it fails *open* — the page renders for a stranger. So
  every check lives next to the data it protects instead:

    - src/app/drives/layout.tsx  gates the whole signed-in application
    - src/lib/auth.ts            is the only way to learn who is calling
    - workers/api                verifies the caller's JWT itself and trusts
                                 nothing this file did

  What running `clerkMiddleware()` here *is* for: it reads the session cookie,
  performs Clerk's handshake when a token needs refreshing, and makes `auth()`
  available to Server Components. Without it, `auth()` throws.

  Clerk is optional until the user sets NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, so
  this file must not run Clerk's handler unless it is actually configured,
  otherwise every request would crash without keys.
*/
const isClerkConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
);

export default isClerkConfigured
  ? clerkMiddleware()
  : function proxy() {
      return NextResponse.next();
    };

export const config = {
  matcher: [
    // Skip Next.js internals and static assets. Without this, auth work would
    // run on every CSS file and image.
    "/((?!_next/static|_next/image|favicon.ico).*)",
    // Always run for API routes — our Clerk webhook lives under /api.
    "/(api|trpc)(.*)",
    /*
      Clerk's auto-proxy path. The browser SDK routes its Frontend API calls
      through this same-origin prefix rather than to clerk.accounts.dev
      directly, which is what keeps the session cookie first-party and
      survives tracking-prevention in Safari and Firefox. It has to be in the
      matcher or those requests never reach the handler above and sign-in
      silently fails to establish a session.
    */
    "/__clerk/:path*",
  ],
};
