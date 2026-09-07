/**
 * Specimen primitives for the Foundations pages.
 *
 * These read the *live* computed value of each token out of the document, so a
 * Foundations page cannot drift from `src/styles/tokens.css` the way a
 * hand-written table of values always eventually does. If a swatch here is
 * wrong, the token is wrong.
 *
 * Story-only. Nothing in `src/app` or `src/components` may import this.
 */
"use client";

import { useSyncExternalStore } from "react";

/** Nothing to subscribe to — a token's value only changes on a rebuild. */
const noSubscribe = () => () => {};

/**
 * Reads a custom property off `:root`, live.
 *
 * `useSyncExternalStore` rather than state-in-an-effect: the value is external
 * to React and reading it during render is exactly what this hook is for. The
 * snapshot returns a fresh string each call, which is safe — React compares
 * with `Object.is`, and equal strings compare equal, so it settles immediately.
 * The server snapshot is empty because there is no document to measure.
 */
export function useTokenValue(name: string): string {
  return useSyncExternalStore(
    noSubscribe,
    () =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
    () => "",
  );
}

export function Sheet({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <div className="page-gutter mx-auto flex w-full max-w-measure flex-col gap-10 py-10">
      <header className="flex flex-col gap-3">
        <h1 className="type-display">{title}</h1>
        <p className="type-body max-w-[70ch] text-pretty text-muted-foreground">
          {intro}
        </p>
      </header>
      {children}
    </div>
  );
}

export function Group({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 className="type-title">{title}</h2>
        {note && (
          <p className="type-detail max-w-[70ch] text-pretty text-muted-foreground">
            {note}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * One colour token.
 *
 * The swatch is painted with `var()` rather than with the value read back, so
 * what you see is what a component would get — including the alpha-based
 * tokens, which resolve differently against different surfaces.
 */
export function Swatch({
  token,
  utility,
  use,
}: {
  token: string;
  utility: string;
  use: string;
}) {
  const value = useTokenValue(token);
  return (
    <div className="flex flex-col gap-2.5">
      <div
        className="h-16 w-full rounded-lg border border-border"
        style={{ background: `var(${token})` }}
      />
      <div className="flex flex-col gap-0.5">
        <code className="type-caption text-foreground">{utility}</code>
        <span className="type-caption text-muted-foreground">{use}</span>
        <span className="type-caption text-muted-foreground/60">
          {value || " "}
        </span>
      </div>
    </div>
  );
}

export function SwatchGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-5">
      {children}
    </div>
  );
}
