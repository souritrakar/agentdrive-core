/**
 * Shared Clerk `appearance` config, used by ClerkProvider and every Clerk
 * component (SignIn, SignUp, UserButton) so they render in AgentDrive's dark
 * palette instead of Clerk's light default.
 *
 * `@clerk/nextjs` 7.x ships a new theming API (`theme`/`variables`/`elements`,
 * not the old `baseTheme` from `@clerk/themes`), and it doesn't export a
 * dedicated `Appearance`/`Theme` type from its public entrypoints — so this
 * is a plain object, structurally checked against each component's own
 * `appearance` prop type at the call site.
 *
 * Variables reference this app's CSS custom properties (src/app/globals.css)
 * directly, so this stays in sync with the rest of the design system instead
 * of hardcoding a second palette.
 */
export const clerkAppearance = {
  variables: {
    colorBackground: "var(--card)",
    colorForeground: "var(--foreground)",
    colorPrimary: "var(--primary)",
    colorPrimaryForeground: "var(--primary-foreground)",
    colorDanger: "var(--destructive)",
    colorNeutral: "var(--foreground)",
    colorMuted: "var(--muted)",
    colorMutedForeground: "var(--muted-foreground)",
    colorInput: "var(--input)",
    colorInputForeground: "var(--foreground)",
    colorBorder: "var(--border)",
    colorRing: "var(--ring)",
    borderRadius: "var(--radius-md)",
  },
};
