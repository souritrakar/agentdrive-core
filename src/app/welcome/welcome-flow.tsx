"use client";

import { useUser } from "@clerk/nextjs";
import { ArrowRight, FolderSimple } from "@phosphor-icons/react/ssr";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { AuthShell, FormError, SubmitButton } from "@/components/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { describeFailure } from "@/lib/api-error";
import { createDrive } from "@/lib/drive-api";

import { saveProfile } from "./actions";

/** What the first drive is called if the user does not rename it. */
const DEFAULT_DRIVE_NAME = "My Drive";

/**
 * Onboarding — two screens, one component.
 *
 * Two steps rather than one because they are not the same kind of question.
 * The first is about the person and is answered in a second; the second is
 * about their workspace and is really a confirmation, since a sensible default
 * is already filled in. Collapsing them into a single form would present a
 * stranger with two unrelated text boxes and no sense of progress.
 *
 * They share one component for the same reason sign-up's two steps do: the
 * second half needs state the first half produced, and giving it its own URL
 * invites someone to land there with no name recorded.
 *
 * The shape is deliberate beyond politeness. This screen sits at the single
 * highest-drop-off moment in the funnel — after the user has committed, before
 * they have seen anything of value — so it repays the one thing it asks for
 * immediately, by handing back a drive that already exists. Arriving at a
 * populated product beats arriving at an empty state that asks for another
 * decision.
 */
export function WelcomeFlow() {
  const router = useRouter();
  const { user } = useUser();

  const [step, setStep] = useState<"name" | "drive">("name");
  const [name, setName] = useState("");
  const [driveName, setDriveName] = useState(DEFAULT_DRIVE_NAME);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
    A stable key for the drive create, generated once per mount.

    The Worker treats `clientId` as an idempotency key, so a double-submit, a
    retried request, or a refresh that replays the action cannot mint a second
    drive — the second attempt returns the first one's row. Generated with
    `useState`'s lazy initialiser so it survives re-renders without a ref, and
    is not regenerated on the retry that most needs it to stay the same.
  */
  const [driveKey] = useState(() => crypto.randomUUID());

  const nameFieldId = useId();
  const driveFieldId = useId();

  async function handleName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    /*
      Read the DOM before any setState.

      The same hazard the auth forms document: a value written straight onto
      the input by a browser autofill — which will happily offer a saved full
      name here — arrives without the `input` event React listens for, and is
      discarded on the next render. The field would look filled and submit an
      empty string.
    */
    const submitted =
      new FormData(event.currentTarget).get("name")?.toString() ?? "";
    const trimmed = (submitted || name).trim();

    if (submitted !== name) setName(submitted);

    if (!trimmed) {
      setError("Enter your name so we know what to call you.");
      return;
    }

    setPending(true);
    setError(null);

    const result = await saveProfile(trimmed);

    if (!result.ok) {
      setError(result.message);
      setPending(false);
      return;
    }

    /*
      Refresh the session token before anything navigates.

      This is the load-bearing line of the whole flow. `saveProfile` wrote to
      Clerk, but the token in this browser was minted before that write and
      still carries no `onboardedAt` claim. The gate in the drives layout reads
      that claim, so navigating now would bounce the user straight back here —
      a loop that looks exactly like the write having failed, even though it
      succeeded.

      `reload()` pulls a fresh token carrying the new claim. Structurally the
      same hazard as navigating outside `finalize()` in the auth flows, and
      avoided the same way: refresh first, move second.

      Awaited inside the try so a failure here does not strand the user on a
      spinner. If it throws, the write still landed — the layout's Backend API
      fallback will find the metadata and let them through regardless.
    */
    try {
      await user?.reload();
    } catch {
      // Non-fatal by construction; see above.
    }

    setPending(false);
    setStep("drive");
  }

  async function handleDrive(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const submitted =
      new FormData(event.currentTarget).get("driveName")?.toString() ?? "";
    const trimmed = (submitted || driveName).trim() || DEFAULT_DRIVE_NAME;

    setPending(true);
    setError(null);

    try {
      // The same client call the New Drive dialog uses — browser to Worker,
      // with a bearer token. No second writer to domain data.
      const drive = await createDrive(trimmed, driveKey);
      router.push(`/drives/${drive.id}`);
    } catch (cause) {
      setError(describeFailure(cause, { noun: "drive" }).message);
      setPending(false);
    }
  }

  /** Skip the drive and go to the (empty) index. Onboarding is already done. */
  function handleSkipDrive() {
    router.push("/drives");
  }

  const firstName = name.split(" ")[0];

  if (step === "drive") {
    return (
      <AuthShell
        title={`Nice to meet you, ${firstName}.`}
        description="One last thing — every file lives in a drive. Here's your first."
      >
        <form onSubmit={handleDrive} className="flex flex-col gap-5">
          <FormError message={error} />

          <div className="flex flex-col gap-2">
            <Label htmlFor={driveFieldId}>Drive name</Label>
            <div className="relative">
              <FolderSimple
                weight="duotone"
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 size-4.5 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id={driveFieldId}
                name="driveName"
                value={driveName}
                onChange={(event) => setDriveName(event.target.value)}
                disabled={pending}
                autoFocus
                // Selects the default on focus so replacing it is one keystroke
                // rather than a select-all. Keeping it is still just Enter.
                onFocus={(event) => event.currentTarget.select()}
                className="h-10 pl-9.5"
                maxLength={64}
              />
            </div>
            <p className="type-body text-muted-foreground">
              You can rename it or add more later.
            </p>
          </div>

          <SubmitButton pending={pending}>
            Create drive and continue
          </SubmitButton>

          <button
            type="button"
            onClick={handleSkipDrive}
            disabled={pending}
            className="type-body mx-auto rounded-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
          >
            I&rsquo;ll do this later
          </button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Welcome to AgentDrive"
      description="Before we get started — what should we call you?"
    >
      <form onSubmit={handleName} className="flex flex-col gap-5">
        <FormError message={error} />

        <div className="flex flex-col gap-2">
          <Label htmlFor={nameFieldId}>Your name</Label>
          <Input
            id={nameFieldId}
            name="name"
            type="text"
            // Prompts the browser and password managers to offer the saved
            // full name rather than treating this as a novel field.
            autoComplete="name"
            autoCapitalize="words"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Ada Lovelace"
            className="h-10"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (error) setError(null);
            }}
            disabled={pending}
            autoFocus
            maxLength={64}
            aria-invalid={error ? true : undefined}
          />
          <p className="type-body text-muted-foreground">
            This is how you&rsquo;ll appear across AgentDrive.
          </p>
        </div>

        <SubmitButton pending={pending} disabled={!name.trim()}>
          Continue
          <ArrowRight data-icon="inline-end" />
        </SubmitButton>
      </form>
    </AuthShell>
  );
}
