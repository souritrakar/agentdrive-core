/**
 * A token, as the link an owner hands to someone else.
 *
 * Absolute, because the whole point of the string is that it leaves this
 * application — into a chat message, an email, a document. A relative path
 * would copy cleanly and then fail everywhere it was pasted.
 *
 * The origin is read from the browser rather than configured. This runs only in
 * the share dialog, which is a Client Component, so `window.location.origin` is
 * always the origin the owner is actually looking at — which is the one they
 * expect the link to name, and the one that stays correct across localhost,
 * previews, and production without a second environment variable to keep in
 * step. The fallback is defensive only: it exists so that importing this module
 * during a server render cannot throw.
 */
export function shareUrl(token: string): string {
  const origin =
    typeof window === "undefined" ? "" : window.location.origin;

  return `${origin}/share/${encodeURIComponent(token)}`;
}
