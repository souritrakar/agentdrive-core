/**
 * Shared — generic, reusable, no domain knowledge.
 *
 * Nothing here may import from a feature (`browser`, `drives`, `layout`,
 * `upload`, `auth`). A shared component welded to a feature drags that
 * feature's data layer into every other feature that touches it, and it is the
 * fastest-appearing form of rot. When a shared component seems to need
 * something feature-specific, take it as a prop and let the caller — which is
 * allowed to know about both — wire it up.
 */
export { PageContainer } from "./page-container";
export { ErrorState, InlineError } from "./error-state";
export { ListingSkeleton } from "./listing-skeleton";
export { NameDialog } from "./name-dialog";
export { ThemeProvider } from "./theme-provider";
export { ViewToggle } from "./view-toggle";
