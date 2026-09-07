"use client";

import { Eye, EyeSlash, WarningCircle } from "@phosphor-icons/react/ssr";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * The form controls the auth screens are built from.
 *
 * They exist as a set rather than as ad-hoc markup on each page because the
 * three flows share every field between them — an email box that behaves one
 * way on sign-in and another on sign-up is a bug, not a feature — and because
 * the wiring that makes a field accessible (label association, `aria-invalid`,
 * `aria-describedby` pointing at the live error) is the part that gets quietly
 * dropped when it is retyped four times.
 *
 * Fields are taller here than elsewhere in the product: `h-10` against the
 * `h-8` of a toolbar input. A drive listing is dense on purpose because it is a
 * dense screen; an auth form has four elements on it, is the first thing a new
 * user touches, and is frequently filled on a phone.
 */

/**
 * What the form's inputs actually contain, read from the DOM at submit time.
 *
 * This exists because a fully controlled React input silently discards any
 * value that React did not observe being typed. Chrome's own autofill normally
 * dispatches an `input` event and is fine, but several password managers write
 * `input.value` directly and dispatch nothing, or dispatch only `change` —
 * which React does not listen for on text fields. The result is the worst kind
 * of bug: the field visibly contains the password, React's state holds an empty
 * string, and submitting sends nothing. The user is told their own password is
 * wrong while looking straight at it.
 *
 * Reading `FormData` off the submitted form is the fix because the browser
 * reports what the inputs *are*, not what React believes. It must be the first
 * thing a submit handler does — the DOM keeps the manager's value only until
 * the next render, and any `setState` would wipe it.
 *
 * Verified by reproduction: filling the password natively without an `input`
 * event produced a visibly filled field that submitted empty.
 */
export function readFieldValues(form: HTMLFormElement): {
  email: string;
  password: string;
} {
  const data = new FormData(form);
  const read = (name: string) => {
    const value = data.get(name);
    return typeof value === "string" ? value : "";
  };
  return { email: read("email"), password: read("password") };
}

/** Shared shell: label, control, and the error that belongs to it. */
function Field({
  label,
  htmlFor,
  error,
  errorId,
  trailing,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string | null;
  errorId: string;
  /** Optional control aligned with the label — "Forgot password?". */
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={htmlFor}>{label}</Label>
        {trailing}
      </div>
      {children}
      {/*
        `role="alert"` so the message is announced when it appears, and rendered
        only when there is one — an empty live region that is always mounted
        gets announced on every keystroke in some screen readers.
      */}
      {error && (
        <p id={errorId} role="alert" className="type-body text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function EmailField({
  value,
  onChange,
  error,
  disabled,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const id = useId();
  const errorId = useId();

  return (
    <Field label="Email" htmlFor={id} error={error} errorId={errorId}>
      <Input
        id={id}
        // `name` is what makes this readable via FormData at submit — see
        // readFieldValues() above. Without it the field is invisible there.
        name="email"
        type="email"
        // `email` rather than `username`: password managers and iOS both use it
        // to offer the right autofill, and getting it wrong is the difference
        // between one tap and typing an address on a phone keyboard.
        autoComplete="email"
        // Off, because an email address is not a sentence and both corrections
        // actively damage one.
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        inputMode="email"
        placeholder="you@company.com"
        className="h-10"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
    </Field>
  );
}

export function PasswordField({
  value,
  onChange,
  error,
  disabled,
  label = "Password",
  /**
   * `new-password` on sign-up and reset so managers offer to generate and then
   * to save; `current-password` on sign-in so they offer to fill. Using one
   * value for both is why some apps never prompt to save a new password.
   */
  autoComplete,
  trailing,
  autoFocus,
  describedBy,
  name = "password",
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  disabled?: boolean;
  label?: string;
  autoComplete: "current-password" | "new-password";
  trailing?: React.ReactNode;
  autoFocus?: boolean;
  /** Id of a hint rendered outside the field, e.g. the minimum length. */
  describedBy?: string;
  /** Form field name, so readFieldValues() can find it at submit. */
  name?: string;
}) {
  const id = useId();
  const errorId = useId();
  const capsId = useId();
  const [revealed, setRevealed] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  /*
    Caps Lock is one of the two everyday reasons a person is certain they typed
    their password correctly and is told otherwise (the other is a password
    manager filling a field React never sees — see readFieldValues above).
    Neither is the user's mistake in any useful sense, and both are invisible in
    a field that renders dots.

    Read from the keyboard event rather than tracked as a key press, so it is
    also correct when Caps Lock was already on before the field was focused —
    the case a keydown-toggle implementation gets backwards.
  */
  const checkCapsLock = (event: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsLock(event.getModifierState?.("CapsLock") ?? false);
  };

  return (
    <Field
      label={label}
      htmlFor={id}
      error={error}
      errorId={errorId}
      trailing={trailing}
    >
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={revealed ? "text" : "password"}
          autoComplete={autoComplete}
          // Room for the reveal button, so a long password never runs under it.
          className="h-10 pr-10"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={checkCapsLock}
          onKeyUp={checkCapsLock}
          // A focus event carries no modifier state, so the warning can only
          // appear once a key is pressed. Clearing on blur keeps it from
          // lingering over a field the user has left.
          onBlur={() => setCapsLock(false)}
          disabled={disabled}
          autoFocus={autoFocus}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            [error ? errorId : null, capsLock ? capsId : null, describedBy]
              .filter(Boolean)
              .join(" ") || undefined
          }
        />
        {/*
          Reveal, because the alternative is a "confirm password" field, and
          between the two this is the one that costs the user less: one glance
          instead of typing it twice. `tabIndex={-1}` keeps it out of the tab
          order — tabbing from the password box should reach the submit button,
          not a toggle.
        */}
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setRevealed((current) => !current)}
          disabled={disabled}
          aria-label={revealed ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-lg text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none"
        >
          {revealed ? (
            <EyeSlash weight="duotone" className="size-4" />
          ) : (
            <Eye weight="duotone" className="size-4" />
          )}
        </button>
      </div>

      {/*
        A warning, not an error: nothing has gone wrong yet, and colouring it
        destructive would put a red field in front of someone who has typed
        nothing incorrect. It sits below the input where the error would go, so
        the layout does not jump when one replaces the other.
      */}
      {capsLock && !error && (
        <p
          id={capsId}
          role="status"
          className="type-body flex items-center gap-1.5 text-muted-foreground"
        >
          <WarningCircle weight="duotone" className="size-4 shrink-0" />
          Caps Lock is on.
        </p>
      )}
    </Field>
  );
}

/** How many digits Clerk's email codes have. */
export const CODE_LENGTH = 6;

export function CodeField({
  value,
  onChange,
  onComplete,
  error,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  /**
   * Fired when the sixth digit lands. Submitting on completion is the whole
   * point of a segmented code input: the user has already told us the code, and
   * making them then find a button is a step that exists only because the form
   * was built out of generic parts.
   */
  onComplete: (value: string) => void;
  error?: string | null;
  disabled?: boolean;
}) {
  const errorId = useId();

  return (
    <div className="flex flex-col items-center gap-2">
      <InputOTP
        maxLength={CODE_LENGTH}
        value={value}
        onChange={onChange}
        onComplete={onComplete}
        disabled={disabled}
        // Lets the browser and iOS offer the code straight from the SMS/email
        // autofill heuristic instead of making the user switch apps to read it.
        autoComplete="one-time-code"
        // The code is digits; a text keyboard on a phone is a wasted tap.
        inputMode="numeric"
        pattern="[0-9]*"
        autoFocus
        aria-label="Verification code"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        containerClassName="justify-center"
      >
        <InputOTPGroup className="gap-2">
          {Array.from({ length: CODE_LENGTH }, (_, index) => (
            <InputOTPSlot
              key={index}
              index={index}
              aria-invalid={error ? true : undefined}
              /*
                Overrides the shadcn default, which is a 32px connected strip.
                A verification code is the only thing on this screen and the
                single most error-prone thing we ask anyone to type, so it gets
                drawn at the size of a heading: separated boxes, 48px, tabular
                so the digits sit on a common grid.
              */
              className={cn(
                "type-metric size-12 rounded-lg border",
                "first:rounded-lg last:rounded-lg",
              )}
            />
          ))}
        </InputOTPGroup>
      </InputOTP>

      {error && (
        <p id={errorId} role="alert" className="type-body text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * A failure that belongs to the form rather than to any one field.
 *
 * Wrong credentials are the case this exists for: the message must not sit
 * under the password box, because that would confirm the email was correct and
 * hand an attacker the account-enumeration answer the copy is written to avoid
 * (src/lib/auth-errors.ts).
 */
export function FormError({
  message,
  action,
}: {
  message: string | null;
  action?: { href: string; label: string };
}) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className="type-body flex flex-col items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-destructive"
    >
      <p className="text-pretty">{message}</p>
      {action && (
        <a
          href={action.href}
          className="rounded-sm font-medium underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-destructive/40"
        >
          {action.label}
        </a>
      )}
    </div>
  );
}

/**
 * The submit button, sized to the form.
 *
 * Full width and `h-10` to match the fields above it, so the column reads as
 * one object rather than a stack of differently-shaped parts. Keeps its label
 * while pending and adds a spinner, rather than swapping to "Loading…" —
 * a button whose text changes on click makes the click feel like it went
 * somewhere unexpected.
 */
export function SubmitButton({
  pending,
  disabled,
  children,
}: {
  pending: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="submit"
      className="h-10 w-full"
      disabled={pending || disabled}
      // Announced by screen readers while the request is in flight, which the
      // spinner alone does not do.
      aria-busy={pending || undefined}
    >
      {pending && <Spinner />}
      {children}
    </Button>
  );
}

export function Spinner() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="size-4 animate-spin motion-reduce:animate-none"
    >
      <circle
        cx="8"
        cy="8"
        r="6.5"
        fill="none"
        strokeWidth="2"
        className="stroke-current opacity-25"
      />
      <path
        d="M8 1.5a6.5 6.5 0 0 1 6.5 6.5"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        className="stroke-current"
      />
    </svg>
  );
}
