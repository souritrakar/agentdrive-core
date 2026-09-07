import { Onest } from "next/font/google";

/*
  One family, for everything.

  Onest, because this product has to be two things at once. It is a geometric
  humanist — warm, round, obviously consumer-facing — but it stays even and
  tight at the 13–14px the file listing actually runs at, where softer faces go
  mushy. That combination is the whole brief.

  It is also outside the Poppins / Figtree / Plus Jakarta cluster that reads as
  a generated template, which is a real cost a typeface can impose on a product
  that is otherwise trying not to look generated.

  Variable, so the whole 100–900 range costs one file — which is what makes
  hierarchy-through-weight affordable rather than a download per step. There is
  deliberately no mono family: numeric columns are aligned by the two type roles
  that render figures (`type-meta`, `type-metric`), so sizes and counts line up
  without a second typeface earning its place.

  The variable name must match what `src/styles/theme.css` reads (--font-sans).
  Swapping the family is this import plus the call below, and nothing else —
  every size and weight decision in the app is expressed in tokens and
  utilities, not in font-specific values.
*/
export const sans = Onest({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

/**
 * What `<html>` carries, in one place.
 *
 * The app's root layout and Storybook's preview both apply this. They have to
 * agree exactly: a story rendered without `dark` resolves shadcn's internal
 * `dark:` variants against a palette that does not exist, and everyone who
 * opens it concludes the design system is broken when it is merely absent.
 * Deriving both from one constant is what stops that from being possible.
 *
 * `dark` is static rather than provider-driven so those variants resolve
 * without waiting for hydration; `scheme-only-dark` puts native scrollbars,
 * form controls, and the caret in dark mode too.
 */
export const themeRootClassName = `${sans.variable} dark scheme-only-dark antialiased`;
