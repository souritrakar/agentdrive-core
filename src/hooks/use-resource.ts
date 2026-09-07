"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { revalidate, subscribe } from "@/lib/drive-api";

type Loaded<T> = {
  /** Which resource the held data belongs to. */
  key: string;
  data?: T;
  error?: Error;
};

/**
 * Reads an async resource and re-reads it whenever the data layer changes.
 *
 * Deliberately small rather than reaching for a data-fetching library: the only
 * behaviours the UI needs are "load once", "refresh after a mutation", and
 * "don't flash a skeleton on refresh".
 *
 * `isLoading` is derived by comparing the held key against the requested one
 * rather than being toggled in an effect. That keeps the effect free of
 * synchronous `setState`, which would cause a cascading re-render, and it means
 * changing `key` shows the skeleton immediately instead of one render late.
 */
export function useResource<T>(
  key: string,
  load: () => Promise<T>,
): {
  data: T | undefined;
  error: Error | undefined;
  isLoading: boolean;
  /**
   * Re-runs the load. Returns the promise so a caller can show honest progress
   * while it is in flight — the error UI's retry button awaits this rather than
   * guessing at a duration or flashing the skeleton back on.
   */
  refresh: () => Promise<void>;
} {
  const [loaded, setLoaded] = useState<Loaded<T>>({ key: "" });

  // Held in a ref so an inline `load` closure changing identity every render
  // doesn't re-trigger the fetch. Assigned in an effect rather than during
  // render; this effect is declared first, so it runs before the fetch below.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  // Whether the last attempt for this instance failed. Held in a ref rather than
  // read off state so the check below sees the value from *this* run's start and
  // not whatever a concurrent render settled on.
  const wasFailing = useRef(false);

  const run = useCallback(
    async (forKey: string, cancelled: () => boolean) => {
      try {
        const data = await loadRef.current();
        if (cancelled()) return;
        const recovered = wasFailing.current;
        wasFailing.current = false;
        setLoaded({ key: forKey, data });

        // Recovering is a data-layer event, not a local one. Without this, an
        // outage that healed in the content pane left the sidebar still saying
        // the API was unreachable — two readers of the same resource, one of
        // them lying. The recovered instance re-reads once more as a result,
        // which is a cheap price for every other reader being correct.
        if (recovered) revalidate();
      } catch (cause) {
        if (cancelled()) return;
        wasFailing.current = true;
        setLoaded({
          key: forKey,
          error: cause instanceof Error ? cause : new Error(String(cause)),
        });
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;

    void run(key, isCancelled);
    const unsubscribe = subscribe(() => void run(key, isCancelled));

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [key, run]);

  const refresh = useCallback(() => run(key, () => false), [key, run]);

  const isCurrent = loaded.key === key;

  return {
    data: isCurrent ? loaded.data : undefined,
    error: isCurrent ? loaded.error : undefined,
    isLoading: !isCurrent,
    refresh,
  };
}
