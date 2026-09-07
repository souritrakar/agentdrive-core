"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import { persistPreference, SIDEBAR_COOKIE } from "@/lib/ui-preferences";

type SidebarContextValue = {
  isCollapsed: boolean;
  toggle: () => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used inside SidebarProvider");
  }
  return context;
}

/**
 * Holds the desktop rail's collapsed state.
 *
 * Context rather than props because two widely separated things need to agree
 * on it and on each other: the rail itself, and the toggle mirrored into the
 * content header so a collapsed rail can still be reopened. Threading the
 * state between them through the page tree would mean every page in the app
 * forwarding a prop it has no interest in.
 *
 * `defaultCollapsed` comes from the cookie, read on the server — see
 * `lib/ui-preferences.ts` for why it is not `localStorage`.
 *
 * Deliberately not responsible for the mobile drawer. That is a modal with
 * focus trapping and scroll locking, it is never open at the same time as this
 * is relevant, and merging the two produces a state machine where "open" means
 * two different things depending on viewport.
 */
export function SidebarProvider({
  defaultCollapsed,
  children,
}: {
  defaultCollapsed: boolean;
  children: React.ReactNode;
}) {
  const [isCollapsed, setCollapsed] = useState(defaultCollapsed);

  const toggle = useCallback(() => {
    const next = !isCollapsed;
    setCollapsed(next);
    persistPreference(SIDEBAR_COOKIE, next ? "collapsed" : "expanded");
  }, [isCollapsed]);

  const value = useMemo(
    () => ({ isCollapsed, toggle }),
    [isCollapsed, toggle],
  );

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  );
}
