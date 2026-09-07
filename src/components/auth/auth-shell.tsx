import Link from "next/link";

import { Logo } from "@/components/ui/logo";

/**
 * The frame every auth screen renders inside.
 *
 * One column, centred, on the page background — no card. That is a deliberate
 * departure from the rest of the product, where surfaces step *up* from the page
 * to say "this is a thing you can act on". Here the form is the only thing on
 * screen, so there is nothing for a raised surface to distinguish it from, and a
 * bordered box floating in an empty viewport reads as a dialog that has lost its
 * page. Vercel, Cursor and Better Stack all land in the same place for the same
 * reason.
 *
 * The mark sits above the heading so the first screen of the product is
 * recognisably the product, rather than an unbranded form on a black page.
 *
 * 22.5rem (360px) is the column width. Wide enough that an email address does
 * not wrap, narrow enough that the eye does not have to travel between a label
 * and its input.
 */
export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  /**
   * One line under the heading. Takes a node rather than a string because every
   * verification screen needs the user's own email address emphasised inside
   * it — that is the detail that turns "check your email" from an instruction
   * into a confirmation that we sent it to the right place.
   */
  description?: React.ReactNode;
  children: React.ReactNode;
  /** The one link out — "Already have an account?" and its siblings. */
  footer?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-[22.5rem] flex-col">
        <Link
          href="/"
          className="mx-auto rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Logo />
          <span className="sr-only">AgentDrive home</span>
        </Link>

        <div className="mt-8 flex flex-col gap-2 text-center">
          <h1 className="type-display">{title}</h1>
          {description && (
            <p className="text-pretty text-muted-foreground">{description}</p>
          )}
        </div>

        <div className="mt-7">{children}</div>

        {footer && (
          <p className="type-body mt-6 text-center text-muted-foreground">
            {footer}
          </p>
        )}
      </div>
    </main>
  );
}

/**
 * The inline link style shared by every auth footer.
 *
 * Underlined rather than coloured. Lime is the primary action and the submit
 * button already holds it; a second lime thing on a screen with one job would
 * make the user choose between two equally loud options
 * (design/principles.md — each accent has exactly one job).
 */
export function AuthLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="rounded-sm font-medium text-foreground underline underline-offset-4 outline-none hover:text-foreground/80 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {children}
    </Link>
  );
}
