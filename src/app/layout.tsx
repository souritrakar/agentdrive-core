import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";

import { ThemeProvider } from "@/components/shared";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { isAuthConfigured } from "@/lib/is-auth-configured";
import { themeRootClassName } from "@/lib/theme-root";

import "./globals.css";

export const metadata: Metadata = {
  title: "AgentDrive",
  description: "Object storage and file primitives for agents.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const html = (
    <html
      lang="en"
      suppressHydrationWarning
      // Shared with Storybook's preview so a story cannot render against a
      // different root than the app does — see src/lib/theme-root.ts.
      className={`${themeRootClassName} h-full`}
    >
      <body className="flex min-h-full flex-col">
        {/*
          Dark mode only for now. `forcedTheme` pins it while leaving the
          provider in place, so offering a light theme later is a one-line
          change rather than re-wiring the tree.
        */}
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          forcedTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          {/* `isolate` keeps portalled dialogs/popovers out of z-index fights. */}
          <TooltipProvider delayDuration={300}>
            <div className="isolate flex min-h-full flex-col">{children}</div>
          </TooltipProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );

  // Clerk is optional until NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is set — without
  // it, ClerkProvider throws, so the app must render exactly as it does today.
  if (!isAuthConfigured()) {
    return html;
  }

  return <ClerkProvider appearance={clerkAppearance}>{html}</ClerkProvider>;
}
