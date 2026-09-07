import { PageContainer } from "@/components/shared";

/**
 * The middle of the three regions: sidebar, top bar, content pane.
 *
 * Deliberately thin — it carries where you are and nothing else. Actions moved
 * to the sidebar, where they keep the same position on every page, and the view
 * toggle moved into the content pane next to the listing it controls. What is
 * left is orientation, which is the one thing worth pinning to the top of the
 * screen while a long folder scrolls past.
 *
 * Not rendered at all on pages with nothing above them — the drive index has no
 * trail, and an empty bar is worse than no bar.
 *
 * Sticky on desktop only. On a phone the shell already pins a header with the
 * drawer trigger, and a second sticky bar beneath it spends a seventh of the
 * viewport on chrome before a single file is visible.
 */
export function TopBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-border bg-background/80 backdrop-blur-sm lg:sticky lg:top-0 lg:z-10">
      <PageContainer className="flex h-14 items-center">{children}</PageContainer>
    </div>
  );
}
