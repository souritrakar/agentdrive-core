"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Spinner } from "./auth-fields";

/**
 * Seconds before a new code may be requested.
 *
 * Clerk rate-limits this server-side regardless, and hitting that limit costs
 * the user a lockout message instead of a code. The cooldown exists so the
 * common case — "nothing arrived yet, press it again" — never reaches the
 * limit, and so the button tells the truth about when pressing it will work.
 */
const COOLDOWN_SECONDS = 30;

/**
 * A cooldown that survives a backgrounded tab.
 *
 * Deliberately stores a *deadline* rather than counting a number down. Browsers
 * throttle timers in background tabs to once a minute or stop them entirely, so
 * a decrementing counter drifts: switch to your email client for twenty seconds
 * to fetch the code — which is exactly what this screen asks you to do — come
 * back, and a naive counter still claims twenty-eight seconds remain. Reading
 * the clock on every tick means the answer is right no matter how few ticks
 * happened.
 */
function useCooldown() {
  const [deadline, setDeadline] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (deadline === null) return;

    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) setDeadline(null);
    };

    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [deadline]);

  const start = useCallback(() => {
    setDeadline(Date.now() + COOLDOWN_SECONDS * 1000);
  }, []);

  return { remaining, isCooling: remaining > 0, start };
}

/**
 * "Didn't get it? Resend" — with the wait made visible.
 *
 * Rendering the remaining seconds rather than just disabling the control is the
 * difference between a button that looks broken and one that has told you when
 * to come back. ClassDojo and Hulu both do it; it costs one number and removes
 * the entire class of "I clicked it and nothing happened".
 *
 * Starts on cooldown on mount, because a code was necessarily just sent to get
 * the user to this screen.
 */
export function ResendCode({
  onResend,
  disabled,
}: {
  /** Re-sends the code. Rejects on failure; the caller shows the error. */
  onResend: () => Promise<void>;
  /** True while another request on the form is in flight. */
  disabled?: boolean;
}) {
  const { remaining, isCooling, start } = useCooldown();
  const [pending, setPending] = useState(false);
  const [sentOnce, setSentOnce] = useState(false);

  // Arriving here means a code was just sent. Ref-guarded so React's double
  // invocation of effects in development does not start it twice.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    start();
  }, [start]);

  async function handleResend() {
    if (pending || isCooling) return;

    setPending(true);
    try {
      await onResend();
      setSentOnce(true);
      // Only after it succeeded. Starting the cooldown on a failed send would
      // make the user wait thirty seconds to retry something that never
      // happened.
      start();
    } catch {
      // The caller renders the message; this only owns the button's own state.
    } finally {
      setPending(false);
    }
  }

  return (
    <p className="type-body text-center text-muted-foreground">
      {sentOnce && !isCooling ? "Still nothing? " : "Didn't get the email? "}
      <button
        type="button"
        onClick={() => void handleResend()}
        disabled={pending || isCooling || disabled}
        className="inline-flex items-center gap-1.5 rounded-sm font-medium text-foreground underline underline-offset-4 outline-none transition-colors hover:text-foreground/80 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
      >
        {pending && <Spinner />}
        {isCooling ? `Resend in ${remaining}s` : "Resend code"}
      </button>
    </p>
  );
}
