"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/shared";

/**
 * Last stop before the built-in 500 page.
 *
 * Only reached for throws that happen outside the app shell — the sign-in
 * routes, the root redirect, or a failure in a page that has no closer boundary.
 * Anything under `/drives` is caught one level down, where the sidebar survives.
 *
 * This is not `global-error.tsx`. That one replaces the root layout, which means
 * it loses the stylesheet, the font and the `dark` class and renders in whatever
 * the OS theme is — a light flash of unstyled text in a dark-only product. It is
 * only needed for a throw *in the root layout itself*, which is a case worth
 * handling deliberately rather than pre-emptively.
 */
export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-full flex-1 items-center justify-center py-16">
      <ErrorState error={error} onRetry={unstable_retry} />
    </main>
  );
}
