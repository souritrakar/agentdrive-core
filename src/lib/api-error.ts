/**
 * The error the data layer throws, and the one place that decides what a
 * failure *means to a person*.
 *
 * Two things live here on purpose. A thrown `ApiError` carries only facts — a
 * status, a code, whatever the API said — because that is all the data layer
 * knows. Turning those facts into a heading, an explanation and a decision about
 * whether trying again could possibly help is a separate judgement, and one that
 * has to be identical everywhere or the product tells the same user two
 * different stories about the same outage.
 *
 * Copy rules followed below:
 *   - Say what happened, not what threw. "Can't reach the API", never
 *     "TypeError: Failed to fetch".
 *   - Say whether it is likely to be their fault, our fault, or nobody's.
 *   - Never end on a dead end (design/principles.md — "Motion and state").
 *   - Never print the fix-it command in production. It is true only on a
 *     developer's machine and reads as a leak anywhere else.
 */

/** Where the Worker lives. Read once so the hint below can name it. */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8787";

/** Mirrors the Worker's `{ error: { code, message } }` envelope. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

/**
 * The families of failure the UI actually draws differently.
 *
 * Deliberately coarser than HTTP. A 502 and a 503 want the same picture and the
 * same sentence; a 404 and a 502 do not. Anything that would produce identical
 * output has been collapsed, because a kind that never changes what is on screen
 * is a branch nobody can see.
 */
export type FailureKind =
  /** No network at all — the browser told us. */
  | "offline"
  /** The request got no response. Backend not running, wrong URL, DNS, CORS. */
  | "unreachable"
  /** Reached it; it is unhealthy or a dependency of it is. 502/503/504. */
  | "backend"
  /** It answered, and the answer was "that isn't here". */
  | "missing"
  /** It answered, and the answer was "I don't know who you are". 401/403. */
  | "unauthenticated"
  /** It answered, and the answer was "who are you". 401. */
  | "signedOut"
  /** It answered, and the answer was "no" — our request was wrong. 4xx. */
  | "rejected"
  /** It answered, and the answer was "I broke". 500. */
  | "fault";

export type Failure = {
  kind: FailureKind;
  /** Heading. Sentence case, no terminal period, no exclamation marks. */
  title: string;
  /**
   * The same news in one short sentence, for places with no room for a picture:
   * a field error under an input, a line in the sidebar. Ends with a period,
   * because unlike the title it sits in running text.
   */
  short: string;
  /** One or two sentences. What happened, and what happens next. */
  message: string;
  /**
   * A command the developer should run, and nothing else — no prose, no URL.
   * The address it applies to is already in `detail`, and duplicating it made
   * the chip wide enough to need its own scrollbar on a phone. Rendered only
   * when `NODE_ENV !== "production"`.
   */
  hint?: string;
  /**
   * The technical fact, for whoever has to fix it. Small, dim, last — present
   * for the developer and the bug report, not for the person who just wanted
   * their files.
   */
  detail?: string;
  /**
   * Whether the same request, unchanged, could succeed. A 409 cannot; a 502
   * very likely can. This is what decides whether a retry button appears at
   * all — offering one that provably cannot work is worse than offering none.
   */
  canRetry: boolean;
  /**
   * Somewhere to go when this failure has a specific way out that the caller
   * could not have known about.
   *
   * Exists for exactly one case today: an expired session, where the only
   * useful move is signing in again and no component reading a drive listing
   * has any reason to know that. A caller-supplied action still wins — it has
   * more context than this file does.
   */
  action?: { href: string; label: string };
  /**
   * Whether to keep quietly re-attempting on a timer while the state is on
   * screen. True only for the failures that heal without the user doing
   * anything: a backend coming up, a connection returning.
   */
  selfHealing: boolean;
};

/**
 * The browser's own answer, when it has one.
 *
 * `navigator.onLine` is only trustworthy in the negative: `false` genuinely
 * means there is no route out, while `true` merely means a network interface
 * exists and says nothing about whether anything is reachable over it. So it is
 * used to *upgrade* a failed request into "you are offline" and never as
 * evidence that things are fine.
 */
function isDefinitelyOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * What to call the thing that could not be found.
 *
 * Passed by the caller because only the caller knows. A 404 from the contents
 * endpoint means the folder is gone; the same status from the drive list would
 * mean something else entirely, and "Not found" on its own tells the user
 * nothing they did not already suspect.
 */
type Context = {
  /** Singular, lowercase: "folder", "drive", "file". */
  noun?: string;
};

/**
 * The API-shaped facts, from an `ApiError` or from anything wearing its shape.
 *
 * The plain-object branch is not defensive programming — it is load-bearing. An
 * `ApiError` constructed in a Server Component and handed to a Client Component
 * arrives with its message intact and its class gone: React serialises errors as
 * message and digest, so `instanceof` is false and `status` is undefined on the
 * other side. The route-level 404 page hit exactly that and rendered "Something
 * went wrong" for a missing page. Accepting the shape rather than the class means
 * a caller with no request to make can still state a status truthfully.
 */
function apiFacts(
  cause: unknown,
): { status: number; code: string; message: string } | null {
  if (cause instanceof ApiError) {
    return { status: cause.status, code: cause.code, message: cause.message };
  }

  if (typeof cause === "object" && cause !== null && "status" in cause) {
    const shape = cause as { status: unknown; code?: unknown; message?: unknown };
    if (typeof shape.status === "number") {
      return {
        status: shape.status,
        code: typeof shape.code === "string" ? shape.code : "unknown",
        message: typeof shape.message === "string" ? shape.message : "",
      };
    }
  }

  return null;
}

export function describeFailure(cause: unknown, context: Context = {}): Failure {
  const noun = context.noun ?? "page";
  const api = apiFacts(cause);

  // Status 0 is our own marker for "fetch rejected", which is every failure
  // that produced no HTTP response at all.
  if (api && api.status === 0) {
    if (isDefinitelyOffline()) {
      return {
        kind: "offline",
        title: "You're offline",
        short: "You're offline.",
        message:
          "Nothing can load until the connection comes back. This page will pick up on its own the moment it does.",
        canRetry: true,
        selfHealing: true,
      };
    }

    return {
      kind: "unreachable",
      title: "Can't reach the API",
      short: "Can't reach the API.",
      message:
        "The request never got an answer. The backend may still be starting up, or it may not be running at all.",
      hint: "pnpm worker:dev",
      detail: `no response from ${API_BASE_URL}`,
      canRetry: true,
      selfHealing: true,
    };
  }

  const status = api?.status ?? 0;
  const detail = api ? `HTTP ${api.status} · ${api.code}` : undefined;

  if (status === 502 || status === 503 || status === 504) {
    return {
      kind: "backend",
      title: "The backend isn't responding",
      short: "The backend isn't responding.",
      message:
        "It's reachable but not answering right now. This is usually brief — a deploy finishing, or the database refusing a connection.",
      detail,
      canRetry: true,
      selfHealing: true,
    };
  }

  if (status === 404) {
    return {
      kind: "missing",
      title: `That ${noun} isn't here`,
      short: `That ${noun} isn't here any more.`,
      message:
        "It may have been renamed, moved, or deleted. Either way, the link you followed points at something that no longer exists.",
      detail,
      // A 404 is stable. A retry button here would just re-confirm the bad news,
      // and the useful move is going somewhere that does exist.
      canRetry: false,
      selfHealing: false,
    };
  }

  if (status === 408 || status === 429) {
    return {
      kind: "backend",
      title: status === 408 ? "That took too long" : "Too many requests",
      short:
        status === 408
          ? "That request timed out."
          : "Too many requests — wait a moment.",
      message:
        status === 408
          ? "The request timed out before the backend finished. Trying again often works."
          : "We're being asked to slow down. Give it a few seconds, then try again.",
      detail,
      canRetry: true,
      // Retrying a rate limit on a timer is how a rate limit becomes a ban.
      selfHealing: status === 408,
    };
  }

  if (status === 401 || status === 403) {
    /*
      Both statuses, one message, because the difference does not survive
      contact with a user. A 401 is "we don't know who you are" and a 403 is
      "we do, and no" — but this product has no shared resources yet, so in
      practice both mean the session is gone: expired, signed out in another
      tab, or revoked because the account was deleted.

      Not retryable. The same request with the same dead token fails the same
      way forever, and a "Try again" button that provably cannot work is worse
      than no button (design/principles.md — a failure must offer a way out,
      and this one's way out is the sign-in page).
    */
    return {
      kind: "unauthenticated",
      title: "You're signed out",
      short: "Your session has expired — sign in again.",
      message:
        "Your session expired or was ended somewhere else. Signing in again picks up exactly where you left off.",
      detail,
      action: { href: "/sign-in", label: "Sign in" },
      canRetry: false,
      selfHealing: false,
    };
  }

  if (status === 401) {
    return {
      kind: "signedOut",
      title: "Your session has expired",
      short: "Your session has expired.",
      message:
        "Sign in again and you will come straight back to this page. Nothing has been lost.",
      detail,
      // A retry with the same absent-or-stale token returns the same 401. The
      // only move that changes the outcome is signing in.
      canRetry: false,
      selfHealing: false,
    };
  }

  if (status >= 500) {
    return {
      kind: "fault",
      title: "Something went wrong on our side",
      short: "The backend failed on that request.",
      message:
        "The request reached the backend and it failed there. Trying again is worth one attempt; if it keeps happening, this one is ours to fix.",
      detail,
      canRetry: true,
      selfHealing: false,
    };
  }

  if (status >= 400) {
    return {
      kind: "rejected",
      title: "That request was refused",
      // The server's own sentence, which is the specific one.
      short: api?.message || "The backend rejected the request.",
      // Our own API writes these for humans — a name collision, a bad id, a
      // field that failed validation. Repeating it in our own words would lose
      // the only specific detail on screen.
      message: api?.message || "The backend rejected the request.",
      detail,
      canRetry: false,
      selfHealing: false,
    };
  }

  // Not an ApiError at all: a bug in our own client code, a rendering throw, a
  // rejected promise from somewhere unexpected. Say so plainly rather than
  // blaming the network for something that never left the browser.
  return {
    kind: "fault",
    title: "Something went wrong",
    short: "Something went wrong.",
    message:
      "This one didn't come from the API — it broke here, in the app. Reloading usually clears it.",
    detail: cause instanceof Error ? cause.message : undefined,
    canRetry: true,
    selfHealing: false,
  };
}

/** Whether to surface a `hint`. Kept next to the copy rule it enforces. */
export const SHOW_DEV_HINTS = process.env.NODE_ENV !== "production";

/**
 * One short sentence for an inline surface.
 *
 * Exists so a dialog does not have to know about failure kinds to say something
 * true. A field error and a full-page error state should agree about what
 * happened; they only differ in how much room they have to say it.
 */
export function failureSentence(cause: unknown, context: Context = {}): string {
  return describeFailure(cause, context).short;
}
