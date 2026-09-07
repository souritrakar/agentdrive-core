import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

/**
 * The chrome an anonymous visitor gets: one slim header, and the content.
 *
 * Matched to the app's own top bar — same height, same hairline, same
 * background — because a share link should read as the product, not as a
 * stripped microsite someone exported it to. A signed-in visitor gets the real
 * `AppShell` instead; this is the other half of that branch.
 *
 * Three things it deliberately does not do:
 *
 * - **No rail, no drawer, no navigation.** There is nowhere for a visitor to
 *   go. A sidebar of drives they cannot open would be a wall of dead ends.
 * - **No item name.** The pane below already leads with it as the page title;
 *   printing it here says the same thing twice at two sizes, which is the rule
 *   the breadcrumb trail follows too.
 * - **No signup wall.** The one affordance on the right is an outline button,
 *   never lime: the page's single primary action belongs to the content
 *   (Download), and a signup push dressed as the primary action is exactly the
 *   pattern the product framing rules out.
 *
 * It holds no state and fetches nothing, so it paints immediately while the
 * page beneath it is still resolving its token.
 */
export function PublicFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border bg-background px-4 sm:px-6">
        {/* The mark is the only brand moment on the page, and doubles as the
            way out — the one link a visitor with no account can usefully
            follow. */}
        <Link
          href="/"
          aria-label="AgentDrive"
          className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Logo />
        </Link>

        <div className="flex flex-1 items-center justify-end">
          <Button variant="outline" size="sm" asChild>
            <Link href="/sign-in">Open AgentDrive</Link>
          </Button>
        </div>
      </header>

      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
