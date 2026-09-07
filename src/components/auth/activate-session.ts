import type { useRouter } from "next/navigation";

/*
  Derived from the hook rather than imported by name. `AppRouterInstance` lives
  behind a `next/dist/...` path — a real module, but a transitive internal we
  have no business depending on. Reading the type off the public API we already
  call means this follows along on an upgrade instead of breaking the build.
*/
type Router = ReturnType<typeof useRouter>;

/**
 * The navigation callback handed to `signUp.finalize()` / `signIn.finalize()`.
 *
 * Every successful auth flow ends by turning the attempt into a live session,
 * and this is the step most likely to be got subtly wrong. Getting it wrong
 * produces the worst possible bug: a user who authenticated successfully and is
 * bounced straight back to the sign-in page.
 *
 * Two things here are load-bearing.
 *
 * **Navigating from inside `finalize` rather than after it.** Clerk runs this
 * callback *between* writing the session and resolving, so the destination page
 * is requested with the cookie already in place. Finalising and then navigating
 * separately is a race: on a slow machine the new route is requested before the
 * cookie lands, the server sees no session, and `requireUserId()` in the drives
 * layout sends the user back to sign-in — from which they will appear to be
 * signed in, because by then the cookie exists. That bug is maddening to
 * reproduce and trivial to avoid.
 *
 * **`decorateUrl`, and the `https://` test after it.** On a Clerk development
 * instance the Frontend API lives on `*.accounts.dev`, a different site from
 * the app. Safari's tracking prevention — and Firefox's, and Chrome's
 * third-party cookie phase-out — will not let that origin set a cookie that
 * survives, so Clerk returns an absolute URL that performs a one-time handshake
 * to re-establish the session first-party. Being cross-origin, it has to go
 * through `window.location.href`; `router.push` would treat it as an internal
 * route and the handshake would never run. This is exactly the "works
 * everywhere except Safari" class of bug, avoided by construction rather than
 * discovered in support.
 */
export function navigateAfterAuth(router: Router, redirectTo: string) {
  return async ({
    session,
    decorateUrl,
  }: {
    session: { currentTask?: { key: string } | null } | null;
    decorateUrl: (url: string) => string;
  }) => {
    /*
      A "task" is Clerk asking for one more thing before the session counts as
      active — choosing an organisation, resetting an expired password. Until it
      is done the session is *pending*: `auth()` reports no user, so sending
      someone to the drive list here would bounce them straight back to
      sign-in.

      Not hypothetical. This Clerk instance has Organizations enabled with
      selection required, so every new signup arrives here with a
      `choose-organization` task. See src/app/sign-in/tasks for the screen that
      resolves it, and for why the better fix is a dashboard setting.
    */
    // `/sign-in/tasks` is Clerk's own convention for this — it is the path
    // `redirectToSignIn()` builds for a pending session, and the route there
    // resolves which task to render. Appending the task key would work too but
    // would put two spellings of the same destination in the codebase.
    const destination = session?.currentTask ? "/sign-in/tasks" : redirectTo;

    const url = decorateUrl(destination);

    if (url.startsWith("https://")) {
      window.location.href = url;
      return;
    }

    router.push(url);
  };
}

/**
 * Where to send someone once they are signed in.
 *
 * Honours `?redirect_url=` so a user who was deep-linked into a folder, bounced
 * to sign-in, and came back lands where they were going rather than on the
 * drive list.
 *
 * Only same-origin paths are accepted, and that check is the entire point of
 * this function. A redirect parameter copied straight into a navigation is an
 * open redirect: an attacker sends `/sign-in?redirect_url=https://evil.example`,
 * the victim sees a genuine AgentDrive sign-in page on the real domain, signs
 * in, and is handed to a replica that asks them to "confirm" their password.
 * The link is phishing-proof precisely because it is *ours*.
 *
 * An absolute URL is accepted only when its origin is ours, and only its path
 * survives. That branch is not a loophole, it is a requirement: Clerk's own
 * `redirectToSignIn()` writes an absolute URL
 * (`?redirect_url=http://localhost:3000/drives/…`), so rejecting every absolute
 * form outright — which an earlier version of this function did — silently
 * downgraded every deep link to the drive list. The user signed in and lost the
 * folder they had clicked on, with nothing on screen to say why.
 */
export function safeRedirectTo(raw: string | null | undefined): string {
  const fallback = "/drives";
  if (!raw) return fallback;

  if (/^https?:\/\//i.test(raw)) {
    // Only http(s) reaches here, so `javascript:` and `data:` never get near
    // the parser below.
    try {
      const url = new URL(raw);
      if (
        typeof window !== "undefined" &&
        url.origin === window.location.origin
      ) {
        // The path only. Re-emitting the origin would hand back an absolute URL
        // that `navigateAfterAuth` would then treat as a Clerk handshake link.
        return `${url.pathname}${url.search}${url.hash}`;
      }
    } catch {
      // Unparseable is not ours.
    }
    return fallback;
  }

  // Relative form. A protocol-relative `//evil.example` is an absolute URL
  // wearing a path's clothing, so it is rejected with everything else that
  // does not start with exactly one slash.
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;

  // Some browsers normalise `\` to `/` when resolving, so `/\evil.example`
  // can escape the origin despite passing the test above.
  if (raw.includes("\\")) return fallback;

  return raw;
}
