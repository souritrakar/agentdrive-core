import { isClerkAPIResponseError } from "@clerk/nextjs/errors";

/**
 * What a Clerk failure means to a person, and where on the form to say it.
 *
 * The sibling of `describeFailure` in src/lib/api-error.ts, and written to the
 * same rules: say what happened rather than what threw, never end on a dead
 * end, and keep the decision in one place so the product cannot tell the same
 * user two different stories about the same event.
 *
 * There is one rule specific to authentication, and it overrides ordinary
 * helpfulness: **the sign-in form must not reveal whether an account exists.**
 * Clerk's own `form_identifier_not_found` message names the problem precisely,
 * which is exactly what an attacker enumerating a customer list wants — type an
 * email, learn whether it is a user. So on the sign-in path that case is
 * deliberately collapsed into the same sentence as a wrong password.
 *
 * Sign-*up* is different and the asymmetry is not an oversight: "that email is
 * already registered" is unavoidable there, because the server cannot create
 * the account and has to say why. Password reset is the same — refusing to send
 * a code without explanation is worse than the enumeration it prevents, and
 * Clerk sends the code regardless. Hiding it on sign-in is still worth doing:
 * it removes the cheap, unauthenticated, unlimited oracle, which is the one
 * that actually gets scraped.
 */

/** Which input to attach the message to. `null` means the form as a whole. */
export type AuthField = "email" | "password" | "code" | null;

export type AuthFailure = {
  field: AuthField;
  /** One sentence. Sentence case, ends with a period. */
  message: string;
  /**
   * Where this failure's way out leads, when it has one that is not "try
   * again" — an existing account belongs on the sign-in page, not on a
   * repeated sign-up attempt.
   */
  action?: { href: string; label: string };
  /**
   * Whether the code field should be emptied and refocused. True when the code
   * the user holds can never work — expired, or consumed — and false when they
   * simply mistyped it, where clearing the field would throw away five correct
   * digits.
   */
  clearCode?: boolean;
};

/** Which form the error came from. Changes what we are allowed to disclose. */
export type AuthContext = "sign-in" | "sign-up" | "verify" | "reset";

type ClerkErrorFacts = {
  code: string;
  message: string;
  longMessage?: string;
  paramName?: string;
};

/**
 * The facts, out of whichever error shape Clerk handed us.
 *
 * There are two, and both reach this file. The custom-flow methods
 * (`signUp.password()`, `signIn.resetPasswordEmailCode.verifyCode()`, …) do not
 * throw — they resolve to `{ error: ClerkError | null }`, where `ClerkError`
 * carries `code` and `longMessage` directly. Anything that *does* throw, or
 * that comes from an older call path, arrives as a `ClerkAPIResponseError`
 * wrapping an array. Accepting both means callers never have to know which they
 * are holding.
 *
 * Anything else — a dropped connection, a bug in this file — returns null and
 * is handled as an unknown failure below.
 */
function clerkFacts(cause: unknown): ClerkErrorFacts | null {
  // The custom-flow shape. Checked first because it is the common one, and
  // because a ClerkError is a plain Error subclass that the guard below would
  // not recognise.
  if (
    typeof cause === "object" &&
    cause !== null &&
    "clerkError" in cause &&
    "code" in cause
  ) {
    const error = cause as {
      code: string;
      message?: string;
      longMessage?: string;
    };
    return {
      code: error.code,
      message: error.message ?? "",
      longMessage: error.longMessage,
    };
  }

  if (isClerkAPIResponseError(cause)) {
    // An array; the form shows one thing at a time, and the first entry is the
    // one Clerk's own components display.
    const first = cause.errors?.[0];
    if (!first) return null;

    return {
      code: first.code,
      message: first.message,
      longMessage: first.longMessage,
      paramName: first.meta?.paramName,
    };
  }

  return null;
}

/**
 * Which input a failure belongs under.
 *
 * Derived from the error *code* first and only then from `meta.param_name`,
 * because the custom-flow `ClerkError` shape carries no param name at all —
 * relying on it alone would drop every field error to the form level, which is
 * precisely the regression that makes a form feel unresponsive: you press
 * submit, a banner appears at the top, and nothing tells you which box to fix.
 */
function fieldFor(code: string, paramName?: string): AuthField {
  if (code.startsWith("form_identifier") || code.includes("email_address")) {
    return "email";
  }
  if (code.startsWith("form_password")) return "password";
  if (code.startsWith("form_code") || code.startsWith("verification")) {
    return "code";
  }

  switch (paramName) {
    case "email_address":
    case "identifier":
      return "email";
    case "password":
      return "password";
    case "code":
      return "code";
    default:
      return null;
  }
}

export function describeAuthError(
  cause: unknown,
  context: AuthContext,
): AuthFailure {
  const error = clerkFacts(cause);

  if (!error) {
    // Not a Clerk API response at all: the network dropped, Clerk is down, or
    // this code threw. Say so plainly rather than blaming the user's input,
    // which is what a generic "check your details" would do.
    return {
      field: null,
      message:
        cause instanceof Error && cause.message
          ? "Something went wrong on our side. Try again in a moment."
          : "Something went wrong. Try again in a moment.",
    };
  }

  switch (error.code) {
    // -- Identity ----------------------------------------------------------

    case "form_identifier_exists":
      return {
        field: "email",
        message: "An account already exists with this email.",
        action: { href: "/sign-in", label: "Sign in instead" },
      };

    case "form_identifier_not_found":
      /*
        The enumeration case. On sign-in it is folded into the credentials
        message; everywhere else the user already knows the address is theirs
        and being vague only wastes their time.
      */
      return context === "sign-in"
        ? { field: null, message: "Incorrect email or password." }
        : {
            field: "email",
            message: "No account found with this email.",
            action: { href: "/sign-up", label: "Create an account" },
          };

    case "form_password_incorrect":
      // Field-level would point at the password box and thereby confirm the
      // email was right. Form-level says one thing about the pair.
      return { field: null, message: "Incorrect email or password." };

    case "strategy_for_user_invalid":
      // The account exists but has no password — it was created through a
      // social provider or an invitation. Telling them to reset it is the
      // move that actually gets them in.
      return {
        field: null,
        message:
          "This account doesn't use a password. Reset it to set one, or sign in the way you signed up.",
        action: { href: "/forgot-password", label: "Reset password" },
      };

    // -- Password quality --------------------------------------------------

    case "form_password_pwned":
    case "form_password_compromised":
      return {
        field: "password",
        message:
          "This password has appeared in a public data breach. Choose a different one.",
      };

    case "form_password_length_too_short":
      return {
        field: "password",
        message: "Use at least 8 characters.",
      };

    case "form_password_not_strong_enough":
      return {
        field: "password",
        // Clerk's zxcvbn suggestion is more specific than anything written in
        // advance, so it is preferred when present.
        message:
          error.longMessage ??
          "This password is too easy to guess. Try a longer one.",
      };

    case "form_password_validation_failed":
      return {
        field: "password",
        message: error.longMessage ?? error.message,
      };

    // -- Verification codes ------------------------------------------------

    case "form_code_incorrect":
    case "verification_failed":
      return {
        field: "code",
        message: "That code isn't right. Check it and try again.",
        // Not cleared: the user probably mistyped one digit, and wiping the
        // field makes them re-enter five correct ones.
        clearCode: false,
      };

    case "verification_expired":
      return {
        field: "code",
        message: "That code has expired. Send a new one.",
        clearCode: true,
      };

    case "verification_already_verified":
      return {
        field: null,
        message: "This email is already verified. Try signing in.",
        action: { href: "/sign-in", label: "Go to sign in" },
      };

    // -- Rate limiting and bot defence -------------------------------------

    case "too_many_requests":
    case "rate_limit_exceeded":
      return {
        field: null,
        message: "Too many attempts. Wait a minute, then try again.",
      };

    case "captcha_invalid":
    case "captcha_unavailable":
      return {
        field: null,
        message:
          "We couldn't verify this browser. Disable any script blockers for this site and try again.",
      };

    // -- Session state -----------------------------------------------------

    case "session_exists":
      // Signed in already — usually a second tab finished first, or the back
      // button returned here after a successful sign-in.
      return {
        field: null,
        message: "You're already signed in.",
        action: { href: "/drives", label: "Go to your drives" },
      };

    case "client_state_invalid":
      return {
        field: null,
        message: "This sign-in attempt expired. Start again.",
      };

    // -- Input shape -------------------------------------------------------

    case "form_param_format_invalid":
      return {
        field: fieldFor(error.code, error.paramName),
        message:
          fieldFor(error.code, error.paramName) === "email"
            ? "Enter a valid email address."
            : (error.longMessage ?? error.message),
      };

    case "form_param_nil":
    case "form_param_missing":
      return {
        field: fieldFor(error.code, error.paramName),
        message: "This field is required.",
      };

    default:
      /*
        Clerk writes its own messages for humans, and there are a lot of codes.
        Falling through to `longMessage` means an unmapped case still produces
        something specific and actionable rather than "an error occurred" — the
        list above exists to do *better* than Clerk's wording where we can, not
        to be the only source of it.
      */
      return {
        field: fieldFor(error.code, error.paramName),
        message: error.longMessage || error.message || "Something went wrong.",
      };
  }
}
