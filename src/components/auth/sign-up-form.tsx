"use client";

import { useSignUp } from "@clerk/nextjs";
import { ArrowLeft } from "@phosphor-icons/react/ssr";
import { useRouter, useSearchParams } from "next/navigation";
import { useId, useState } from "react";

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
 * Sign-up: credentials, then an emailed code.
 *
 * Two steps in one component rather than two routes, deliberately. The
 * verification step is not a page — it is the second half of one action, it
 * needs the sign-up attempt the first half created, and putting it behind its
 * own URL invites someone to land there directly with no attempt in progress.
 * The back button is handled explicitly below instead.
 *
 * The whole flow runs on `useSignUp()`, which in Clerk 7 returns a *signal*:
 * `signUp` is the live attempt, `fetchStatus` is whether a request is in
 * flight, and the methods resolve to `{ error }` rather than throwing. That
 * last part is why there is not a `try`/`catch` in this file — an error here is
 * a value, not an exception, and treating it as one removes the entire class of
 * "the catch block swallowed it" bug.
 */
export function SignUpForm() {
  const { signUp, fetchStatus } = useSignUp();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = safeRedirectTo(searchParams.get("redirect_url"));

  const [step, setStep] = useState<"credentials" | "verify">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [failure, setFailure] = useState<AuthFailure | null>(null);

  const passwordHintId = useId();
  const pending = fetchStatus === "fetching";

  /*
    Resume an attempt that is already past the first step.

    This is what makes a refresh on the verification screen survivable. Clerk
    keeps the in-progress sign-up on the client, so after a reload `signUp`
    still knows the email address and that it is unverified — but this
    component's `step` has reset to "credentials". Without this the user would
    be asked to choose a password they have already set, and the attempt would
    fail with "that email is taken" against their own half-made account.

    Adjusted during render rather than in an effect. React documents this as the
    way to derive state from something that changed underneath you: the correct
    step is a *function* of the attempt, and an effect would render the wrong
    screen first and then correct it, which the user sees as a flash of the
    password form. `signUp` arrives asynchronously — Clerk has to load before it
    is populated — so this cannot be a `useState` initialiser either.

    `resumedFor` makes it idempotent: it fires once per attempt, so pressing
    "use a different email" is not immediately undone by the next render.
  */
  const resumableEmail =
    signUp.status === "missing_requirements" &&
    signUp.emailAddress &&
    signUp.verifications.emailAddress.status !== "verified"
      ? signUp.emailAddress
      : null;

  const [resumedFor, setResumedFor] = useState<string | null>(null);

  if (resumableEmail && resumedFor !== resumableEmail && step === "credentials") {
    setResumedFor(resumableEmail);
    setEmail(resumableEmail);
    setStep("verify");
  }

  async function handleCredentials(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    // Read the DOM before any setState — see readFieldValues(). A generated
    // password from a manager is exactly the value most likely to arrive
    // without React seeing it, and losing it here would create an account whose
    // password is not the one the manager saved.
    const submitted = readFieldValues(event.currentTarget);
    const trimmedEmail = (submitted.email || email).trim();
    const submittedPassword = submitted.password || password;

    if (submitted.email !== email) setEmail(submitted.email);
    if (submitted.password !== password) setPassword(submitted.password);

    // Checked here rather than left to the server so the common typo costs a
    // keystroke instead of a round trip. Anything subtler than "there is no @"
    // is the server's call — client-side email regexes reject valid addresses.
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setFailure({ field: "email", message: "Enter a valid email address." });
      return;
    }
    if (submittedPassword.length < 8) {
      setFailure({ field: "password", message: "Use at least 8 characters." });
      return;
    }

    setFailure(null);

    const { error } = await signUp.password({
      emailAddress: trimmedEmail,
      password: submittedPassword,
    });

    if (error) {
      setFailure(describeAuthError(error, "sign-up"));
      return;
    }

    // Password sign-up leaves the address unverified; this is what puts the
    // code in their inbox.
    const sent = await signUp.verifications.sendEmailCode();
    if (sent.error) {
      setFailure(describeAuthError(sent.error, "sign-up"));
      return;
    }

    setEmail(trimmedEmail);
    setStep("verify");
  }

  async function handleVerify(submitted: string) {
    if (pending) return;
    if (submitted.length !== CODE_LENGTH) {
      setFailure({ field: "code", message: "Enter all six digits." });
      return;
    }

    setFailure(null);

    const { error } = await signUp.verifications.verifyEmailCode({
      code: submitted,
    });

    if (error) {
      const described = describeAuthError(error, "verify");
      setFailure(described);
      if (described.clearCode) setCode("");
      return;
    }

    await finish();
  }

  async function finish() {
    if (signUp.status !== "complete") {
      /*
        Verified, but Clerk still wants something — a username, a phone number,
        a legal acceptance — because someone enabled a required field in the
        dashboard that this form does not collect. Saying so plainly beats
        leaving the user on a spinner, and names the fields so whoever gets the
        bug report knows immediately what changed.
      */
      setFailure({
        field: null,
        message: `This account needs more information before it can be created (${signUp.missingFields.join(", ")}). Contact support.`,
      });
      return;
    }

    const { error } = await signUp.finalize({
      navigate: navigateAfterAuth(router, redirectTo),
    });

    if (error) setFailure(describeAuthError(error, "sign-up"));
  }

  async function handleResend() {
    setFailure(null);
    const { error } = await signUp.verifications.sendEmailCode();
    if (error) {
      setFailure(describeAuthError(error, "verify"));
      // Rethrown so <ResendCode> knows not to start its cooldown for a send
      // that never happened.
      throw error;
    }
    setCode("");
  }

  /** Back to step one, discarding the attempt so a new email can be used. */
  async function handleChangeEmail() {
    await signUp.reset();
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
        title="Check your email"
        description={
          <>
            We sent a six-digit code to{" "}
            <span className="font-medium text-foreground">{email}</span>. It
            expires in 10 minutes.
          </>
        }
        footer={
          <button
            type="button"
            onClick={() => void handleChangeEmail()}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-sm outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
          >
            <ArrowLeft className="size-3.5" />
            Use a different email
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
              // Clear as they correct it. Leaving a stale "that code isn't
              // right" under a field they are actively fixing is noise.
              if (failure?.field === "code") setFailure(null);
            }}
            onComplete={(next) => void handleVerify(next)}
            error={fieldError("code")}
            disabled={pending}
          />

          <SubmitButton pending={pending} disabled={code.length !== CODE_LENGTH}>
            Verify email
          </SubmitButton>

          <ResendCode onResend={handleResend} disabled={pending} />
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      description="A drive for your files and your agents."
      footer={
        <>
          Already have an account? <AuthLink href="/sign-in">Sign in</AuthLink>
        </>
      }
    >
      <form onSubmit={handleCredentials} className="flex flex-col gap-5">
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

          <div className="flex flex-col gap-1.5">
            <PasswordField
              value={password}
              onChange={(next) => {
                setPassword(next);
                if (failure?.field === "password") setFailure(null);
              }}
              error={fieldError("password")}
              disabled={pending}
              autoComplete="new-password"
              describedBy={passwordHintId}
            />
            {/*
              Stated up front rather than after a rejected submit. The rule is
              short, and a requirement the user learns by failing is a
              requirement we chose not to tell them.
            */}
            {!fieldError("password") && (
              <p id={passwordHintId} className="type-body text-muted-foreground">
                At least 8 characters.
              </p>
            )}
          </div>
        </div>

        {/*
          Clerk's bot defence mounts its widget here. Without this element it
          falls back to an interstitial modal that interrupts the flow, and on
          some configurations sign-up fails outright with a captcha error.
          Clerk's own components render exactly this div for the same reason.
        */}
        <div id="clerk-captcha" />

        <SubmitButton pending={pending}>Create account</SubmitButton>

        <p className="type-body text-center text-muted-foreground">
          By creating an account you agree to our{" "}
          <AuthLink href="/terms">Terms</AuthLink> and{" "}
          <AuthLink href="/privacy">Privacy Policy</AuthLink>.
        </p>
      </form>
    </AuthShell>
  );
}
