"use client";

import { useSignIn } from "@clerk/nextjs";
import { ArrowLeft } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { describeAuthError, type AuthFailure } from "@/lib/auth-errors";

import { navigateAfterAuth, safeRedirectTo } from "./activate-session";
import { AuthLink, AuthShell } from "./auth-shell";
import {
  CODE_LENGTH,
  CodeField,
  EmailField,
  FormError,
  PasswordField,
  readFieldValues,
  SubmitButton,
} from "./auth-fields";
import { ResendCode } from "./resend-code";

/**
 * Sign-in: email and password, one step.
 *
 * The interesting decisions here are all about what the form is *not* allowed
 * to say. A wrong password and an email that was never registered produce the
 * same sentence in the same place, because the alternative is an endpoint that
 * answers "is this person a customer?" for anyone who asks. The mapping that
 * enforces that lives in src/lib/auth-errors.ts, with the reasoning; this
 * component's part of the bargain is simply never to render an identity error
 * against the email field.
 *
 * "One step" is the common case, not the only one. Device Trust is enabled on
 * this Clerk instance, so signing in from a browser Clerk has not seen before
 * returns `needs_client_trust` and an emailed code has to be confirmed before
 * the session is real. That is a second step this form must own — without it,
 * every genuine first sign-in on a new machine dead-ends on a correct password.
 */
export function SignInForm() {
  const { signIn, fetchStatus } = useSignIn();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = safeRedirectTo(searchParams.get("redirect_url"));

  const [step, setStep] = useState<"credentials" | "verify">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [failure, setFailure] = useState<AuthFailure | null>(null);

  const pending = fetchStatus === "fetching";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    /*
      Read the inputs before touching state — see readFieldValues(). A password
      manager may have filled this field without React noticing, and the DOM
      keeps that value only until the next render. Everything below works from
      `submitted`, never from the state variables directly.
    */
    const submitted = readFieldValues(event.currentTarget);
    const trimmedEmail = (submitted.email || email).trim();
    const submittedPassword = submitted.password || password;

    // Put React back in step, so the fields keep showing what the user can see
    // and the rest of the component (error clearing, the retry path) is sane.
    if (submitted.email !== email) setEmail(submitted.email);
    if (submitted.password !== password) setPassword(submitted.password);

    // Empty fields are caught here so the user is not billed a round trip and a
    // rate-limit slot for a form they have not filled in. Anything about
    // whether the *values* are right is the server's business.
    if (!trimmedEmail) {
      setFailure({ field: "email", message: "Enter your email address." });
      return;
    }
    if (!submittedPassword) {
      setFailure({ field: "password", message: "Enter your password." });
      return;
    }

    setFailure(null);

    const { error } = await signIn.password({
      identifier: trimmedEmail,
      password: submittedPassword,
    });

    if (error) {
      setFailure(describeAuthError(error, "sign-in"));
      // Clear the password but keep the email. Retyping an address you already
      // typed correctly is the small insult that makes a failed sign-in feel
      // worse than it is — and leaving a wrong password in place invites
      // submitting it again unchanged.
      setPassword("");
      return;
    }

    setEmail(trimmedEmail);
    await advance();
  }

  /**
   * Acts on whatever the sign-in attempt now needs.
   *
   * Shared by the password step and the code step because both can land on any
   * of these states, and duplicating the branch is how the two get to disagree.
   */
  async function advance() {
    /*
      A new device, or a second factor. Both are resolved the same way — an
      emailed code — so both take this branch and land on the same screen.

      `needs_client_trust` is Device Trust: the password was right, and Clerk
      wants proof this browser belongs to the same person before it trusts it.
    */
    if (
      signIn.status === "needs_client_trust" ||
      signIn.status === "needs_second_factor"
    ) {
      const sent = await signIn.mfa.sendEmailCode();
      if (sent.error) {
        setFailure(describeAuthError(sent.error, "sign-in"));
        return;
      }
      setCode("");
      setStep("verify");
      return;
    }

    if (signIn.status === "needs_new_password") {
      // Clerk was told this password must be changed before use. The reset flow
      // already knows how to do that, and it is a different screen.
      setFailure({
        field: null,
        message: "Your password needs to be reset before you can sign in.",
        action: { href: "/forgot-password", label: "Reset password" },
      });
      return;
    }

    if (signIn.status !== "complete") {
      // Something enabled in the Clerk dashboard that this form has not learned
      // yet. Naming the status turns a mystery into a five-minute fix.
      setFailure({
        field: null,
        message: `This account needs an extra verification step (${signIn.status}) that isn't supported here yet. Contact support.`,
      });
      return;
    }

    const finalized = await signIn.finalize({
      navigate: navigateAfterAuth(router, redirectTo),
    });

    if (finalized.error) {
      setFailure(describeAuthError(finalized.error, "sign-in"));
    }
  }

  async function handleVerify(submitted: string) {
    if (pending) return;
    if (submitted.length !== CODE_LENGTH) {
      setFailure({ field: "code", message: "Enter all six digits." });
      return;
    }

    setFailure(null);

    const { error } = await signIn.mfa.verifyEmailCode({ code: submitted });
    if (error) {
      const described = describeAuthError(error, "verify");
      setFailure(described);
      if (described.clearCode) setCode("");
      return;
    }

    await advance();
  }

  async function handleResend() {
    setFailure(null);
    const { error } = await signIn.mfa.sendEmailCode();
    if (error) {
      setFailure(describeAuthError(error, "verify"));
      throw error;
    }
    setCode("");
  }

  /** Back to the password step, discarding the attempt. */
  async function handleStartOver() {
    await signIn.reset();
    setStep("credentials");
    setCode("");
    setPassword("");
    setFailure(null);
  }

  const fieldError = (field: AuthFailure["field"]) =>
    failure?.field === field ? failure.message : null;

  if (step === "verify") {
    return (
      <AuthShell
        title="Verify it's you"
        description={
          <>
            You&rsquo;re signing in from a new device, so we sent a six-digit
            code to{" "}
            <span className="font-medium text-foreground">{email}</span>.
          </>
        }
        footer={
          <button
            type="button"
            onClick={() => void handleStartOver()}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-sm outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
          >
            <ArrowLeft className="size-3.5" />
            Back to sign in
          </button>
        }
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleVerify(code);
          }}
          className="flex flex-col gap-5"
        >
          {failure?.field === null && (
            <FormError message={failure.message} action={failure.action} />
          )}

          <CodeField
            value={code}
            onChange={(next) => {
              setCode(next);
              if (failure?.field === "code") setFailure(null);
            }}
            onComplete={(next) => void handleVerify(next)}
            error={fieldError("code")}
            disabled={pending}
          />

          <SubmitButton pending={pending} disabled={code.length !== CODE_LENGTH}>
            Verify device
          </SubmitButton>

          <ResendCode onResend={handleResend} disabled={pending} />
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Welcome back"
      description="Sign in to your drives."
      footer={
        <>
          New to AgentDrive?{" "}
          <AuthLink href="/sign-up">Create an account</AuthLink>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {failure?.field === null && (
          <FormError message={failure.message} action={failure.action} />
        )}

        <div className="flex flex-col gap-4">
          <EmailField
            value={email}
            onChange={(next) => {
              setEmail(next);
              if (failure?.field === "email") setFailure(null);
            }}
            error={fieldError("email")}
            disabled={pending}
            autoFocus
          />

          <PasswordField
            value={password}
            onChange={(next) => {
              setPassword(next);
              if (failure?.field === "password") setFailure(null);
            }}
            error={fieldError("password")}
            disabled={pending}
            autoComplete="current-password"
            trailing={
              /*
                Beside the label rather than under the button: this is where a
                person looks the moment the password does not come to mind, and
                a reset link below the submit button is one they find only after
                failing.
              */
              <Link
                href="/forgot-password"
                className="type-body rounded-sm text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                Forgot password?
              </Link>
            }
          />
        </div>

        <SubmitButton pending={pending}>Sign in</SubmitButton>
      </form>
    </AuthShell>
  );
}
