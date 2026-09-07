"use client";

import { useUser } from "@clerk/nextjs";
import { Plus } from "@phosphor-icons/react/ssr";
import Link from "next/link";

import { CreateDriveDialog } from "@/components/drives";
import { ErrorState, PageContainer } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useResource } from "@/hooks/use-resource";
import { listDrives } from "@/lib/drive-api";
import { formatItemCount, formatRelativeTime } from "@/lib/format";
import type { Drive } from "@/lib/types";

/**
 * The drive index.
 *
 * No top bar: there is nothing above this page to point at, and a bar holding
 * only an empty breadcrumb is worse than no bar. The action sits on the title
 * row instead, which is where the view toggle sits one level down — same
 * position, same relationship to the heading it belongs to.
 */
export default function DrivesPage() {
  const {
    data: drives,
    isLoading,
    error,
    refresh,
  } = useResource("drives", listDrives);

  // On first run the empty state is the invitation, and it carries the button.
  // Rendering the header's copy of it as well would put two primary buttons on
  // screen competing to be the one obvious thing to do.
  const isFirstRun = !isLoading && !error && (drives?.length ?? 0) === 0;

  // Nothing to create *into* while the backend is unreachable. Offering the
  // action anyway means the user's first move after seeing an outage is a
  // dialog that fails the moment they submit it.
  const canCreate = !isFirstRun && !error;

  return (
    <PageContainer className="flex flex-col gap-8 py-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Greeting />
          <p className="type-body max-w-[60ch] text-pretty text-muted-foreground">
            A drive is a workspace for files. Create one per agent, project, or
            customer.
          </p>
        </div>

        {canCreate && (
          <CreateDriveDialog
            trigger={
              <Button size="lg" className="py-2 pr-3 pl-2">
                <Plus data-icon="inline-start" />
                New drive
              </Button>
            }
          />
        )}
      </div>

      {isLoading ? (
        <ul
          role="list"
          className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3 sm:gap-4"
        >
          {["a", "b", "c"].map((key) => (
            <li
              key={key}
              className="flex flex-col gap-4 rounded-xl bg-card p-4 inset-ring inset-ring-white/5"
            >
              <Skeleton className="size-10 rounded-lg" />
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-32 rounded-sm" />
                <Skeleton className="h-3 w-24 rounded-sm" />
              </div>
            </li>
          ))}
        </ul>
      ) : error ? (
        // `noun` is "drive list", not "drive": a 404 here is not one missing
        // drive, it is the endpoint that lists them all coming back empty-handed.
        <ErrorState error={error} noun="drive list" onRetry={refresh} />
      ) : drives && drives.length > 0 ? (
        <ul
          role="list"
          className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3 sm:gap-4"
        >
          {drives.map((drive) => (
            <DriveCard key={drive.id} drive={drive} />
          ))}
        </ul>
      ) : (
        <EmptyDrives />
      )}
    </PageContainer>
  );
}

/**
 * The page heading, addressed to the person when we know who they are.
 *
 * Reads the name from Clerk rather than from Postgres, which is what makes
 * this free: `useUser()` serves it from the session Clerk has already loaded,
 * with no request of our own. `accounts.name` holds the same value, but
 * reaching it from a Client Component would mean an endpoint, a fetch, and a
 * loading state for a string that is already in memory.
 *
 * Falls back to "Drives" rather than to "Welcome back, there". Until Clerk
 * finishes loading, `user` is undefined for a frame or two, and a greeting that
 * flickers between a generic form and a personal one on every navigation is
 * worse than a heading that never claims to know you. The same fallback covers
 * an unconfigured instance, where there is genuinely nobody to greet.
 */
function Greeting() {
  const { user } = useUser();

  // Whatever they gave us at onboarding, cut back to the part people are
  // called by. "Good evening, Souritra Kar" reads like a letter from a bank.
  const firstName = user?.firstName?.trim();

  if (!firstName) {
    return <h1 className="type-display">Drives</h1>;
  }

  return (
    <h1 className="type-display">
      {timeOfDayGreeting()}, {firstName}
    </h1>
  );
}

/**
 * "Good morning" / "Good afternoon" / "Good evening", from the *browser's*
 * clock.
 *
 * Deliberately computed on the client. The server sits in whatever region it
 * was deployed to, so rendering this on the server would wish a user in Kolkata
 * good morning at ten at night. This component is already a Client Component
 * for `useUser()`, so the correct clock is the one that costs nothing.
 */
function timeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * A drive in the index.
 *
 * Identified by its initial, the same mark the collapsed sidebar rail uses. One
 * identity per drive across the app means the thing you clicked here is
 * recognisably the thing highlighted in the rail afterwards — which a generic
 * drive glyph, repeated identically on every card, cannot do.
 */
function DriveCard({ drive }: { drive: Drive }) {
  return (
    <li className="relative">
      <div className="flex h-full flex-col gap-4 rounded-xl bg-card p-4 inset-ring inset-ring-white/5 has-[a:hover]:bg-accent has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50">
        <span className="type-monogram grid size-10 shrink-0 place-items-center rounded-lg bg-secondary">
          {drive.name.slice(0, 1)}
        </span>

        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="type-label truncate">
            <Link
              href={`/drives/${drive.id}`}
              className="outline-none after:absolute after:inset-0 after:rounded-xl"
            >
              {drive.name}
            </Link>
          </h2>
          <p className="type-meta truncate text-muted-foreground">
            {formatItemCount(drive.childCount ?? 0)} &middot; updated{" "}
            {formatRelativeTime(drive.updatedAt)}
          </p>
        </div>
      </div>
    </li>
  );
}

/**
 * First-run state. Deliberately a real invitation rather than "No drives" —
 * this is the first thing a new user sees, and it should tell them what a drive
 * is for and give them the one action worth taking.
 */
function EmptyDrives() {
  return (
    <div className="flex flex-col items-center gap-5 rounded-xl border border-dashed border-border px-6 py-16 text-center">
      <div className="flex flex-col gap-1.5">
        <h2 className="type-label">Create your first drive</h2>
        <p className="type-body mx-auto max-w-[46ch] text-pretty text-muted-foreground">
          Drives hold your folders and files. Make one to start uploading.
        </p>
      </div>
      <CreateDriveDialog
        trigger={
          <Button size="lg" className="py-2 pr-3 pl-2">
            <Plus data-icon="inline-start" />
            New drive
          </Button>
        }
      />
    </div>
  );
}
