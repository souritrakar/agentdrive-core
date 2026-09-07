"use client";

import { useSignIn } from "@clerk/nextjs";
import { ArrowLeft, CheckCircle } from "@phosphor-icons/react/ssr";
import Link from "next/link";
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
 * Forgot password: identify, verify by emailed code, set a new one.
 *
 * Three steps, one component, one sign-in attempt threaded through all of them
 * — `signIn.create({ identifier })` opens it, `resetPasswordEmailCode` drives
 * it, and `finalize()` closes it. Splitting the steps across routes would mean
 * a URL that can be reached with no attempt in progress, and a "verify" screen
 * that has no idea whose password is being reset.
 *
 * Note what the last step does: a successful reset *signs the user in*. That is
 * Clerk's behaviour and it is the right one — someone who has just proved
 * control of the email address and set a new password should not then be asked
 * to type it. It does mean this component ends in the same place the sign-in
 * form does, so it shares the same navigation helper.
 */
export function ForgotPasswordForm() {
  const { signIn, fetchStatus } = useSignIn();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = safeRedirectTo(searchParams.get("redirect_url"));

  const [step, setStep] = useState<"identify" | "verify" | "reset">("identify");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [failure, setFailure] = useState<AuthFailure | null>(null);

  const passwordHintId = useId();
  const signOutId = useId();
  const pending = fetchStatus === "fetching";

  async function handleIdentify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    // DOM before state — see readFieldValues().
    const submitted = readFieldValues(event.currentTarget);
    if (submitted.email !== email) setEmail(submitted.email);
    const trimmedEmail = (submitted.email || email).trim();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setFailure({ field: "email", message: "Enter a valid email address." });
      return;
    }

    setFailure(null);

    // Opens the attempt and tells Clerk whose password this is about.
    // `sendCode()` below takes no identifier of its own — it uses this one.
    const created = await signIn.create({ identifier: trimmedEmail });
    if (created.error) {
      setFailure(describeAuthError(created.error, "reset"));
      return;
    }

    const sent = await signIn.resetPasswordEmailCode.sendCode();
    if (sent.error) {
      setFailure(describeAuthError(sent.error, "reset"));
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

    const { error } = await signIn.resetPasswordEmailCode.verifyCode({
      code: submitted,
    });

    if (error) {
      const described = describeAuthError(error, "verify");
      setFailure(described);
      if (described.clearCode) setCode("");
      return;
    }

    // Clerk moves the attempt to 'needs_new_password' on a good code. Checking
    // rather than assuming means a future second factor lands as a clear
    // message instead of an empty password form that cannot submit.
    if (signIn.status !== "needs_new_password") {
      setFailure({
        field: null,
        message: `This account needs an extra verification step (${signIn.status}) that isn't supported here yet. Contact support.`,
      });
      return;
    }

    setStep("reset");
  }

  async function handleReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    // DOM before state — see readFieldValues(). This is the field a manager is
    // most likely to fill with a generated password, and setting an account's
    // password to something other than what the manager saved would lock the
    // user out on their next sign-in.
    const submitted = readFieldValues(event.currentTarget);
    const submittedPassword = submitted.password || password;
    if (submitted.password !== password) setPassword(submitted.password);

    if (submittedPassword.length < 8) {
      setFailure({ field: "password", message: "Use at least 8 characters." });
      return;
    }

    setFailure(null);

    const { error } = await signIn.resetPasswordEmailCode.submitPassword({
      password: submittedPassword,
      /*
        The security-relevant checkbox on this screen.

        Someone resetting a password may be doing it because somebody else
        knows the old one. Leaving that person's other sessions alive would make
        the reset cosmetic — they would keep their access until their token
        happened to expire. Default on for that reason; offered as a choice
        because a user who simply forgot their password has no reason to be
        signed out of their phone.
      */
      signOutOfOtherSessions: signOutOthers,
    });

    if (error) {
      setFailure(describeAuthError(error, "reset"));
      return;
    }

    if (signIn.status !== "complete") {
      setFailure({
        field: null,
        message:
          "Your password was changed, but we couldn't sign you in automatically. Try signing in.",
        action: { href: "/sign-in", label: "Go to sign in" },
      });
      return;
    }

    const finalized = await signIn.finalize({
      navigate: navigateAfterAuth(router, redirectTo),
    });

    if (finalized.error) {
      setFailure(describeAuthError(finalized.error, "reset"));
    }
  }

  async function handleResend() {
    setFailure(null);
    const { error } = await signIn.resetPasswordEmailCode.sendCode();
    if (error) {
      setFailure(describeAuthError(error, "verify"));
      throw error;
    }
    setCode("");
  }

  async function handleStartOver() {
    await signIn.reset();
    setStep("identify");
    setCode("");
    setPassword("");
    setFailure(null);
  }

  const fieldError = (field: AuthFailure["field"]) =>
    failure?.field === field ? failure.message : null;

  const formError = failure?.field === null && (
    <FormError message={failure.message} action={failure.action} />
  );

  if (step === "reset") {
    return (
      <AuthShell
        title="Set a new password"
        description={
          <>
            <CheckCircle
              weight="fill"
              className="mr-1 inline size-4 align-[-0.15em] text-lime"
            />
            Email verified. Choose a password you haven&rsquo;t used before.
          </>
        }
      >
        <form onSubmit={handleReset} className="flex flex-col gap-5">
          {formError}

          <div className="flex flex-col gap-1.5">
            <PasswordField
              label="New password"
              value={password}
              onChange={(next) => {
                setPassword(next);
                if (failure?.field === "password") setFailure(null);
              }}
              error={fieldError("password")}
              disabled={pending}
              autoComplete="new-password"
              describedBy={passwordHintId}
              autoFocus
            />
            {!fieldError("password") && (
              <p id={passwordHintId} className="type-body text-muted-foreground">
                At least 8 characters.
              </p>
            )}
          </div>

          <div className="flex items-start gap-2.5">
            <input
              id={signOutId}
              type="checkbox"
              checked={signOutOthers}
              onChange={(event) => setSignOutOthers(event.target.checked)}
              disabled={pending}
              className="mt-0.5 size-4 shrink-0 rounded-sm accent-lime outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <label
              htmlFor={signOutId}
              className="type-body text-muted-foreground"
            >
              Sign out of all other devices
            </label>
          </div>

          <SubmitButton pending={pending}>Change password</SubmitButton>
        </form>
      </AuthShell>
    );
  }

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
            onClick={() => void handleStartOver()}
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
          {formError}

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
            Continue
          </SubmitButton>

          <ResendCode onResend={handleResend} disabled={pending} />
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      description="We'll email you a six-digit code to confirm it's you."
      footer={
        <Link
          href="/sign-in"
          className="inline-flex items-center gap-1.5 rounded-sm outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeft className="size-3.5" />
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={handleIdentify} className="flex flex-col gap-5">
        {formError}

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

        <SubmitButton pending={pending}>Send reset code</SubmitButton>

        <p className="type-body text-center text-muted-foreground">
          Remembered it? <AuthLink href="/sign-in">Sign in</AuthLink>
        </p>
      </form>
    </AuthShell>
  );
}
