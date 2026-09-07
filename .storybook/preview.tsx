import type { Preview } from "@storybook/nextjs-vite";

import { TooltipProvider } from "../src/components/ui/tooltip";
import { themeRootClassName } from "../src/lib/theme-root";

/*
  The real stylesheet, not a copy of it. Everything a story renders — colour,
  type roles, radius, elevation — resolves from src/styles/tokens.css through
  this import. Change a token and every story moves with it, which is the whole
  reason this workbench is worth having.
*/
import "../src/app/globals.css";

/*
  Storybook renders stories inside an iframe whose <html> it owns, so the root
  classes the app applies are not there unless we put them there. Without
  `dark`, shadcn's internal `dark:` variants resolve against a palette that
  does not exist and every story looks broken.

  Applied imperatively rather than through a wrapper <div> because several
  tokens and the font variable are declared on :root — a wrapper would leave
  anything portalled to document.body (dialogs, dropdowns, toasts) outside
  them, which is exactly the set of components hardest to check by hand.
*/
function applyThemeRoot() {
  const root = document.documentElement;
  for (const cls of themeRootClassName.split(" ").filter(Boolean)) {
    root.classList.add(cls);
  }
  // The app paints the page from a token; the story canvas must do the same,
  // or components get judged against a background the product cannot produce.
  document.body.classList.add("bg-background", "text-foreground");
}

const preview: Preview = {
  parameters: {
    /*
      Storybook's own background control is deliberately off. The canvas colour
      is `--background`, a token that moves with the theme; a second control
      offering arbitrary colours lets a story sit on a surface the product has
      no way to render, and it is then judged against it.
    */
    backgrounds: { disable: true },

    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },

    /*
      'todo' surfaces a11y violations in the test UI without failing the run —
      the honest setting while stories are still being written. Move to 'error'
      once the catalogue is complete, so a regression cannot merge.
    */
    a11y: { test: "todo" },

    options: {
      /*
        Explicit order rather than alphabetical. The sidebar should read as an
        argument — what the values are, then what is built from them, then what
        those compose into — which is also the order someone new should read it.
      */
      storySort: {
        order: [
          "Foundations",
          ["Introduction", "Colour", "Typography", "Shape & Elevation"],
          "Primitives",
          "Components",
          "Sections",
          "Pages",
        ],
      },
    },
  },

  decorators: [
    (Story) => {
      applyThemeRoot();
      // Matches the app's root layout: several components render a Tooltip and
      // throw outside a provider, which would otherwise look like a broken
      // component rather than a missing wrapper.
      return (
        <TooltipProvider delayDuration={300}>
          <Story />
        </TooltipProvider>
      );
    },
  ],
};

export default preview;
