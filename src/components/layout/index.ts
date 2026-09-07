/**
 * Layout — the persistent chrome around every signed-in screen.
 *
 * `AppShell` is the composition root: it owns the sidebar, mounts the upload
 * provider, and is the one place allowed to know about several features at
 * once. That is the app tier's job description, and this is where it lives.
 *
 * `TopBar` is public separately because a screen supplies its own title and
 * actions into it, so it is rendered by the screen rather than by the shell.
 *
 * The sidebar parts are internals of `AppShell`. `useSidebar` is not exported:
 * nothing outside this directory needs the rail's collapsed state, and
 * publishing it would invite screens to start reacting to it.
 */
export { AppShell } from "./app-shell";
export { TopBar } from "./top-bar";
