/**
 * Small, non-secret UI preferences that must be correct on the very first
 * paint: whether the sidebar is collapsed, and grid vs list.
 *
 * Cookies rather than `localStorage`, and this is the whole reason for the
 * choice: `localStorage` cannot be read on the server, so the markup would ship
 * with the default and then correct itself after hydration — a sidebar snapping
 * shut and a grid flipping to a list on every navigation. Cookies arrive with
 * the request, so the server renders what the user actually chose.
 *
 * Written from the client with `document.cookie` rather than through a Server
 * Action: nothing here is trusted, nothing here is validated server-side beyond
 * the parse below, and a round trip to persist a toggle would make the toggle
 * feel slow.
 *
 * Deliberately free of `next/headers` so client components can import the names
 * and the writer. The reads live in the Server Components that need them.
 */

export const SIDEBAR_COOKIE = "ad_sidebar";
export const VIEW_MODE_COOKIE = "ad_view";

export type ViewMode = "grid" | "list";

/** A year. These are preferences, not sessions — expiring them just annoys. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function parseSidebarCollapsed(value: string | undefined): boolean {
  return value === "collapsed";
}

/** Anything unrecognised falls back to the grid, which is the default view. */
export function parseViewMode(value: string | undefined): ViewMode {
  return value === "list" ? "list" : "grid";
}

/** Client-side write. `lax` because these never travel cross-site. */
export function persistPreference(name: string, value: string) {
  document.cookie = `${name}=${value};path=/;max-age=${MAX_AGE_SECONDS};samesite=lax`;
}
