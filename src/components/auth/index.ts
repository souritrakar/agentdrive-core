/**
 * Auth — the three credential flows.
 *
 * Only the forms and the shell they sit in are public. The field components,
 * the resend timer, and the session-activation helper are internals: they
 * encode Clerk v7's specific contract (methods return `{ error }` rather than
 * throwing; a flow ends in `finalize({ navigate })`), and a caller that reached
 * for them directly would be reimplementing a flow rather than using one.
 *
 * See AGENTS.md § "Neither is this the Clerk you know".
 */
export { SignInForm } from "./sign-in-form";
export { SignUpForm } from "./sign-up-form";
export { ForgotPasswordForm } from "./forgot-password-form";
export { AuthShell } from "./auth-shell";

/**
 * Two exceptions to the paragraph above, and the line between them and the
 * fields is worth stating rather than leaving to be rediscovered.
 *
 * `EmailField`, `PasswordField`, `CodeField` and `readFieldValues` stay
 * internal because each encodes something specific to a credential flow — an
 * autofill contract, a Caps Lock warning, a six-slot OTP, the password-manager
 * defect. Reaching for one of those from outside really would mean rebuilding a
 * flow.
 *
 * These two encode nothing. `FormError` is a message in a red box; `SubmitButton`
 * is a full-width button that grows a spinner. Onboarding is a form on the same
 * shell that needs to fail and submit like the screens on either side of it, and
 * the alternative to sharing them is a second red box that drifts from the first.
 */
export { FormError, SubmitButton } from "./auth-fields";
