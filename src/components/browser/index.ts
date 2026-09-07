/**
 * Browser — the file and folder browsing surface.
 *
 * `BrowserView` is the whole feature for the owner's own drive: it fetches,
 * arranges, and owns the actions.
 *
 * `EntryGrid` and `EntryList` are public alongside it because a second feature
 * renders the same listing over data that is not the owner's — the public
 * share view. They take their routing and their action slot as props
 * (`EntryBehaviour`), so publishing them exports an arrangement, not a data
 * source. Everything else here stays internal: the tiles, the breadcrumb, the
 * empty state, the item actions.
 */
export { BrowserView } from "./browser-view";
export { EntryGrid } from "./entry-grid";
export { EntryList } from "./entry-list";
export type { EntryBehaviour } from "./entry-behaviour";
