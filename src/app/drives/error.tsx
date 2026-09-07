"use client";

import { useEffect } from "react";

import { ErrorState, PageContainer } from "@/components/shared";

/**
 * The error boundary for everything inside the app shell.
 *
 * Catches what the pane's own error handling cannot: a component that throws
 * while rendering, a server component that failed, a bug in our own code. Data
 * failures never get here — `useResource` returns those as state so the listing
 * can keep its chrome — so if this file is on screen, something broke rather
 * than something didn't load.
 *
 * Placed in this segment rather than at the root on purpose: `error.tsx` does not
 * wrap the layout beside it, so the sidebar and its drive list survive the crash
 * and the user is never stranded on a page with no navigation.
 *
 * `unstable_retry` rather than `reset` — Next 16.2 added it and it is the right
 * one here: it re-fetches *and* re-renders, where `reset` only clears the
 * boundary and would re-crash instantly on anything that isn't a transient
 * render fault.
 */
export default function DrivesError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Nowhere to report this yet. Until there is, the console is the only place
    // the stack survives — and swallowing it entirely would make an unexplained
    // error state genuinely undebuggable.
    console.error(error);
  }, [error]);

  return (
    <PageContainer className="flex flex-1 flex-col justify-center py-10">
      <ErrorState
        error={error}
        onRetry={unstable_retry}
        action={{ label: "Back to drives", href: "/drives" }}
      />
    </PageContainer>
  );
}
