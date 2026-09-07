"use client";

import { ArrowClockwise, CircleNotch } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  describeFailure,
  SHOW_DEV_HINTS,
  type FailureKind,
} from "@/lib/api-error";
import { cn } from "@/lib/utils";

/** How often a self-healing failure quietly re-attempts, in milliseconds. */
const RECHECK_INTERVAL = 6_000;

/**
 * What the pane shows when the data did not arrive.
 *
 * Built to the same brief as the empty state, because it is the same kind of
 * moment: the user is looking at a screen with nothing on it and needs to
 * understand why in one glance. Four elements in descending size — picture,
 * heading, one line, one button — and never a dead end
 * (design/principles.md, "Motion and state").
 *
 * The three things it does that a red line of text cannot:
 *
 *   1. **Draws the difference.** A missing folder and a dead backend are not the
 *      same event and should not look identical. The picture carries that before
 *      any word is read.
 *   2. **Retries in place.** The one thing a person wants to do here is try
 *      again, and it should not cost them a page reload.
 *   3. **Heals itself.** For the failures that pass on their own — a Worker
 *      still booting, a connection that dropped — it keeps checking on a timer
 *      and simply disappears when the data lands. Locally this means starting
 *      the backend fixes the screen you are already looking at, with no click.
 *
 * Retry is deliberately *not* wired to a skeleton. Clearing the error to a
 * loading state and back again flashes twice on a fast localhost failure, so the
 * error stays put and the button carries the pending state instead.
 */
export function ErrorState({
  error,
  noun,
  onRetry,
  action: callerAction,
  actionVariant,
  title,
  message,
  className,
}: {
  error: unknown;
  /**
   * What the thing being loaded is called, singular and lowercase. Only used
   * when the backend says it does not exist, which is the one case where the
   * heading has to name it: "That folder isn't here".
   */
  noun?: string;
  /**
   * Re-runs the failed load. Awaited, so the button can show progress honestly
   * rather than for a fixed guess at how long it takes.
   */
  onRetry?: () => Promise<unknown> | unknown;
  /**
   * Somewhere else to go — offered alongside retry, and the only thing on offer
   * when retrying provably cannot help (a 404 does not change its mind).
   *
   * A descriptor rather than a rendered button because its *weight* depends on
   * something the caller cannot know: whether a retry button will be there to
   * be the primary action. Handing it over as a label and a href lets this
   * component keep the "one primary action per screen" rule
   * (design/principles.md) instead of hoping every caller remembers it.
   */
  action?: { label: string; href: string };
  /**
   * How much weight the way-out button carries.
   *
   * Filled by default when it is the only thing left to click, because a ghost
   * button reads as body text on an otherwise empty screen. A caller overrides
   * it where a filled accent would read as a *pitch* rather than a way out —
   * the public share pages do exactly that: a visitor with no account looking
   * at a dead link should be offered an exit, not marketed to.
   */
  actionVariant?: "default" | "outline";
  /**
   * Copy overrides, for a failure whose meaning the caller knows better than
   * the classifier can.
   *
   * One case today: a revoked share link. The API deliberately answers 404 for
   * unknown, revoked, and trashed alike (no enumeration oracle), so
   * `describeFailure` can only say "that link isn't here" — true, and less
   * than the page knows. Overriding the sentence is honest; re-deriving a
   * distinction the API refused to make would not be.
   */
  title?: string;
  message?: string;
  className?: string;
}) {
  const failure = describeFailure(error, { noun });

  /*
    The caller's action wins when there is one — it knows the surrounding
    screen, which this component does not. `failure.action` is the fallback for
    failures that carry their own only sensible next step regardless of where
    they happened: an expired session is the same "sign in again" whether it
    surfaced in a drive listing or a folder.
  */
  const action = callerAction ?? failure.action;

  const [isRetrying, setIsRetrying] = useState(false);

  // Held in a ref so the recheck timer below can read the latest callback
  // without being torn down and restarted every render.
  const retryRef = useRef(onRetry);
  useEffect(() => {
    retryRef.current = onRetry;
  });

  const inFlight = useRef(false);

  const attempt = useCallback(async (visible: boolean) => {
    // One attempt at a time. Without this, a manual press during a background
    // recheck fires two identical requests and the loser's result wins.
    if (inFlight.current || !retryRef.current) return;
    inFlight.current = true;
    if (visible) setIsRetrying(true);
    try {
      await retryRef.current();
    } finally {
      inFlight.current = false;
      if (visible) setIsRetrying(false);
    }
  }, []);

  const canRecover = failure.canRetry && Boolean(onRetry);

  /*
    An expired session has exactly one useful action and the caller cannot be
    expected to remember it, so this kind carries its own. `/sign-in` is a fixed
    app-level route rather than a routing decision a caller might vary, and Clerk
    returns the user to where they were, so nothing is lost by leaving the page.
  */
  const wayOut =
    action ??
    (failure.kind === "signedOut"
      ? { label: "Sign in", href: "/sign-in" }
      : undefined);

  useEffect(() => {
    if (!canRecover || !failure.selfHealing) return;

    const recheck = () => void attempt(false);
    const timer = window.setInterval(recheck, RECHECK_INTERVAL);
    // The browser knows about a returning connection long before a timer would,
    // so take that signal too and recover on the same tick it arrives.
    window.addEventListener("online", recheck);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", recheck);
    };
  }, [attempt, canRecover, failure.selfHealing]);

  return (
    <div
      className={cn(
        "flex flex-col items-center px-6 py-14 text-center",
        className,
      )}
    >
      <FailureIllustration kind={failure.kind} />

      {/*
        One alert region covering heading and explanation. Two separate alerts
        announce as two unrelated interruptions, and the heading alone does not
        say enough to act on.
      */}
      <div role="alert" className="mt-8 flex flex-col gap-2">
        <h2 className="type-title">
          {title ?? failure.title}
        </h2>
        <p className="type-body mx-auto max-w-[48ch] text-pretty text-muted-foreground">
          {message ?? failure.message}
        </p>
      </div>

      {/*
        The actual fix, on a developer's machine. Never rendered in production —
        it is only true locally, and a build command shown to a user is noise at
        best and a leak at worst.
      */}
      {SHOW_DEV_HINTS && failure.hint && (
        <p className="type-detail mt-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-muted-foreground">
          Start it with
          <code className="type-caption rounded-md bg-secondary px-2 py-1 font-mono text-foreground">
            {failure.hint}
          </code>
        </p>
      )}

      {(canRecover || wayOut) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {canRecover && (
            <Button
              size="lg"
              onClick={() => void attempt(true)}
              disabled={isRetrying}
            >
              {isRetrying ? (
                <CircleNotch data-icon="inline-start" className="animate-spin" />
              ) : (
                <ArrowClockwise data-icon="inline-start" />
              )}
              {isRetrying ? "Trying…" : "Try again"}
            </Button>
          )}
          {wayOut && (
            /*
              Outlined next to a retry button, filled when it is the only way
              out. A ghost button reads as body text until it is hovered, which
              is fine in a toolbar and wrong when it is the single thing left to
              click on an otherwise empty screen.
            */
            <Button
              size="lg"
              variant={actionVariant ?? (canRecover ? "outline" : "default")}
              asChild
            >
              <Link href={wayOut.href}>{wayOut.label}</Link>
            </Button>
          )}
        </div>
      )}

      {/*
        Said out loud, because a screen that fixes itself with no explanation
        looks like a screen that was broken for no reason. It also tells the user
        they are allowed to stop pressing the button.
      */}
      {canRecover && failure.selfHealing && (
        <p className="type-detail mt-4 text-muted-foreground/70">
          Checking again every few seconds.
        </p>
      )}

      {/* For whoever has to fix it. Last, smallest, dimmest. */}
      {failure.detail && (
        <p className="type-caption mt-5 font-mono text-muted-foreground/60">
          {failure.detail}
        </p>
      )}
    </div>
  );
}

/**
 * The quiet variant, for a failure that is not the point of the screen.
 *
 * The sidebar's drive list is the case this exists for: when the backend is
 * down it used to render "No drives yet", which is a confident lie — the state
 * where a list is empty and the state where we could not ask are different
 * facts and the rail has to be able to say which one it is. Two lines, no
 * picture, because the pane beside it is already carrying the full explanation.
 */
export function InlineError({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => Promise<unknown> | unknown;
  className?: string;
}) {
  const failure = describeFailure(error);

  return (
    <div className={cn("flex flex-col items-start gap-1 px-3 py-1", className)}>
      <p role="alert" className="type-body text-muted-foreground">
        {failure.short}
      </p>
      {failure.canRetry && onRetry && (
        <Button
          variant="link"
          size="xs"
          // Not lime. Lime means "the one primary action" and on a drive page
          // that is the Upload button eight pixels above this — two lime things
          // in one rail is two things claiming to be the obvious next move.
          className="type-detail h-auto p-0 text-muted-foreground hover:text-foreground"
          onClick={() => void onRetry()}
        >
          Try again
        </Button>
      )}
    </div>
  );
}

/**
 * One drawing per family of failure.
 *
 * Same vocabulary as the empty-folder illustration — rounded rectangles, the
 * card surface, hairline strokes, one accent and no more — so a failure looks
 * like part of this product rather than like an error page bolted onto it. The
 * accent here is `destructive`, used on exactly one mark in each drawing: the
 * break, the gap, the layer that is wrong.
 *
 * `aria-hidden` throughout, because the heading beneath already says what this
 * is and a described illustration would make a screen reader say it twice.
 */
function FailureIllustration({ kind }: { kind: FailureKind }) {
  if (kind === "offline" || kind === "unreachable") return <SeveredLink />;
  if (kind === "missing") return <VacantFolder />;
  if (kind === "signedOut") return <LockedOut />;
  return <SkewedStack />;
}

/**
 * Two halves of the system and a snapped cable between them.
 *
 * The break is drawn as two ends that no longer meet and have sprung apart, not
 * as a cross or a warning triangle — the shape reads as "disconnected" without
 * borrowing an icon that means "danger".
 */
function SeveredLink() {
  return (
    <svg
      viewBox="0 0 220 120"
      aria-hidden="true"
      strokeWidth="2.5"
      strokeLinejoin="round"
      className="h-32 w-auto shrink-0"
    >
      {/* This app. A window: header rule, then content. */}
      <rect
        x="20"
        y="25"
        width="64"
        height="70"
        rx="12"
        className="fill-card stroke-white/20"
      />
      <line x1="20" y1="44" x2="84" y2="44" className="stroke-white/12" />
      <rect x="32" y="56" width="34" height="4.5" rx="2.25" className="fill-white/20" />
      <rect x="32" y="68" width="46" height="4.5" rx="2.25" className="fill-white/15" />

      {/* The backend. Shelves, the way a server is drawn everywhere. */}
      <rect
        x="136"
        y="25"
        width="64"
        height="70"
        rx="12"
        className="fill-card stroke-white/20"
      />
      {[40, 57, 74].map((y) => (
        <rect
          key={y}
          x="148"
          y={y}
          width="40"
          height="11"
          rx="3.5"
          className="fill-background stroke-white/15"
        />
      ))}

      {/*
        The cable. Round caps so the loose ends read as cut rather than
        rectangular, and the only saturated colour in the drawing.
      */}
      <g
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        className="stroke-destructive/80"
      >
        <path d="M84 60 H102 L106 54" />
        <path d="M136 60 H118 L114 66" />
      </g>
    </svg>
  );
}

/**
 * An empty folder outline with the thing that used to be in it drifting away.
 *
 * Dashed rather than solid, and hollow rather than filled: the same folder the
 * empty state draws, minus its substance. The lone document outside is what
 * separates this from "nothing here yet" — something *was* here.
 */
function VacantFolder() {
  return (
    <svg
      viewBox="0 0 220 120"
      aria-hidden="true"
      strokeWidth="2.5"
      strokeLinejoin="round"
      className="h-32 w-auto shrink-0"
    >
      {/*
        The folder itself, solid and filled — the same drawing as the empty
        state, scaled down. An earlier version dashed the whole folder and it
        stopped reading as a folder at all: two dashed rounded rectangles and no
        recognisable tab. Only the *slot* is dashed now, which is the part that
        is actually absent.

        `strokeWidth` is scaled up to cancel the group scale, so the hairlines
        match every other line in the drawing rather than thinning out.
      */}
      <g transform="translate(-7.4 0.6) scale(0.72)" strokeWidth="3.4">
        {/* Where a document should be. Behind the folder, so the lip cuts it off. */}
        <rect
          x="100"
          y="10"
          width="50"
          height="74"
          rx="7"
          fill="none"
          strokeDasharray="9 8"
          className="stroke-white/25"
        />
        <path
          d="M38 92V60A8 8 0 0 1 46 52H72A6 6 0 0 1 76.6 54.2L82 60H174A8 8 0 0 1 182 68V92Z"
          className="fill-background stroke-white/20"
        />
        <rect
          x="38"
          y="80"
          width="144"
          height="52"
          rx="10"
          className="fill-card stroke-white/25"
        />
      </g>

      {/*
        The document that is no longer in it, adrift and dimmer. This is the
        whole difference between "nothing here yet" and "the thing you asked for
        is gone" — without it the drawing is just a second empty state.
      */}
      <g transform="rotate(16 176 52)">
        <rect
          x="158"
          y="28"
          width="36"
          height="48"
          rx="6"
          className="fill-card stroke-white/15"
        />
        <rect x="166" y="42" width="20" height="3.5" rx="1.75" className="fill-white/12" />
        <rect x="166" y="51" width="13" height="3.5" rx="1.75" className="fill-white/12" />
      </g>
    </svg>
  );
}

/**
 * The app, with a padlock over it.
 *
 * For an expired session, where the other three drawings would all lie: a
 * severed cable says the network broke, a vacant folder says the thing is gone,
 * a skewed stack says we broke. Nothing is broken and nothing is missing — the
 * door is simply shut, and the user has the key.
 *
 * A door was drawn first and did not read as one: at this size a tall rectangle
 * with a handle is just a rectangle, and the key beside it looked like a
 * magnifier. A padlock over the same window card the connection drawing uses is
 * legible at a glance and stays inside the existing vocabulary.
 */
function LockedOut() {
  return (
    <svg
      viewBox="0 0 220 120"
      aria-hidden="true"
      strokeWidth="2.5"
      strokeLinejoin="round"
      className="h-32 w-auto shrink-0"
    >
      {/* The app, same window as the connection drawing — header rule, content. */}
      <rect
        x="60"
        y="18"
        width="100"
        height="84"
        rx="12"
        className="fill-card stroke-white/20"
      />
      <line x1="60" y1="38" x2="160" y2="38" className="stroke-white/12" />
      {/* Content bars dimmer than usual: it is there, it is just not available. */}
      <rect x="74" y="50" width="34" height="4.5" rx="2.25" className="fill-white/12" />
      <rect x="74" y="62" width="22" height="4.5" rx="2.25" className="fill-white/10" />

      {/*
        Padlock, centred on the card and painted over it so it occludes the
        content rather than sitting beside it. Filled with the page background,
        which is what makes it read as in front.
      */}
      <path
        d="M100 62V54a10 10 0 0 1 20 0v8"
        fill="none"
        className="stroke-destructive/70"
      />
      <rect
        x="92"
        y="62"
        width="36"
        height="30"
        rx="7"
        className="fill-background stroke-destructive/70"
      />
      <circle cx="110" cy="75" r="3.5" className="fill-destructive/70" />
      <path d="M110 78 V 83" strokeLinecap="round" className="stroke-destructive/70" />
    </svg>
  );
}

/**
 * A stack with one layer out of true.
 *
 * For failures the backend reported about itself. The offset layer carries the
 * one accent mark; everything else is intact, which is the accurate picture —
 * the system is there, one part of it is wrong.
 */
function SkewedStack() {
  return (
    <svg
      viewBox="0 0 220 120"
      aria-hidden="true"
      strokeWidth="2.5"
      strokeLinejoin="round"
      className="h-32 w-auto shrink-0"
    >
      {[
        { y: 10, skewed: false },
        { y: 45, skewed: true },
        { y: 80, skewed: false },
      ].map(({ y, skewed }) => (
        <g
          key={y}
          transform={skewed ? `rotate(-5 110 ${y + 15})` : undefined}
        >
          <rect
            x="52"
            y={y}
            width="116"
            height="30"
            rx="9"
            className="fill-card stroke-white/20"
          />
          <rect
            x="66"
            y={y + 12}
            width="30"
            height="6"
            rx="3"
            className="fill-white/18"
          />
          <rect
            x="146"
            y={y + 11}
            width="8"
            height="8"
            rx="2.5"
            className={skewed ? "fill-destructive" : "fill-white/18"}
          />
        </g>
      ))}
    </svg>
  );
}
