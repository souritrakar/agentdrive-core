"use client";

import { Check, CircleNotch, Copy } from "@phosphor-icons/react/ssr";
import { useEffect, useRef, useState } from "react";

import type { Share, ShareTargetKind } from "./types";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { failureSentence } from "@/lib/api-error";

/** How long the copy button stays in its confirmed state. */
const COPIED_FOR_MS = 2_000;

type DialogState =
  | { status: "loading" }
  | { status: "notShared"; justRevoked: boolean }
  | { status: "shared"; share: Share };

type ShareDialogProps = {
  name: string;
  targetKind: ShareTargetKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current share, or null when the subject has none. */
  loadShare: () => Promise<Share | null>;
  createShare: () => Promise<Share>;
  setAllowDownload: (allow: boolean) => Promise<Share>;
  revokeShare: () => Promise<void>;
  /** Token → the link an owner copies. Supplied so the origin lives in one place. */
  shareUrl: (token: string) => string;
};

/**
 * The owner's whole sharing interface: one dialog, two states.
 *
 * Not a permission matrix, not tabs, and not a row of role dropdowns — a
 * single state machine, because v1 sharing is a single fact. Either a link
 * exists or it does not, and the two things an owner does with one that exists
 * are copy it and turn it off.
 *
 * Built in the `NameDialog` mould: inline errors under the control that
 * failed, the dialog stays open, `failureSentence` supplies the copy so an
 * outage reads the same here as it does in a listing.
 *
 * All four actions arrive as props. The dialog owns pending state, copy
 * feedback and the revoke confirmation; it owns no data layer, which is what
 * lets every state below be a story rather than a backend condition someone
 * has to reproduce.
 */
export function ShareDialog({
  name,
  targetKind,
  open,
  onOpenChange,
  loadShare,
  createShare,
  setAllowDownload,
  revokeShare,
  shareUrl,
}: ShareDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        The body is a child, and that is load-bearing rather than tidy. Radix
        unmounts dialog content when it closes, so every piece of state below —
        which state the machine is in, the copy confirmation, a half-answered
        revoke — is scoped to one opening and starts fresh on the next. The
        alternative, resetting it all in an effect when `open` flips, is both
        more code and a synchronous setState inside an effect.
      */}
      <DialogContent className="sm:max-w-lg">
        <ShareDialogBody
          name={name}
          targetKind={targetKind}
          loadShare={loadShare}
          createShare={createShare}
          setAllowDownload={setAllowDownload}
          revokeShare={revokeShare}
          shareUrl={shareUrl}
        />
      </DialogContent>
    </Dialog>
  );
}

function ShareDialogBody({
  name,
  targetKind,
  loadShare,
  createShare,
  setAllowDownload,
  revokeShare,
  shareUrl,
}: Omit<ShareDialogProps, "open" | "onOpenChange">) {
  const [state, setState] = useState<DialogState>({ status: "loading" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [copied, setCopied] = useState(false);

  const linkRef = useRef<HTMLInputElement>(null);
  const createRef = useRef<HTMLButtonElement>(null);

  // Loaded on every open rather than cached: someone may have revoked this
  // link in another tab, and a dialog that opens on stale state invites an
  // owner to copy a link that no longer works.
  useEffect(() => {
    let live = true;

    void (async () => {
      try {
        const share = await loadShare();
        if (!live) return;
        setState(
          share
            ? { status: "shared", share }
            : { status: "notShared", justRevoked: false },
        );
      } catch (cause) {
        if (!live) return;
        setState({ status: "notShared", justRevoked: false });
        setError(failureSentence(cause));
      }
    })();

    return () => {
      live = false;
    };
  }, [loadShare]);

  /*
    Focus lands on whatever the owner opened the dialog to do.

    In state B that is copying, so the field is focused and pre-selected. In
    state A it is minting, so it is the Create link button — and that has to be
    said explicitly, because Radix focuses the first tabbable child on open,
    which is the ghost Cancel beside it. Leaving the default put a keyboard
    owner on the dismiss action and made them tab past it to reach the only
    thing the dialog exists for.

    Both branches run *after* `loadShare` resolves rather than on open, because
    until then neither control is mounted: the body is a skeleton.
  */
  useEffect(() => {
    if (state.status === "shared") {
      const field = linkRef.current;
      if (!field) return;
      field.focus();
      field.select();
      return;
    }

    if (state.status === "notShared") createRef.current?.focus();
  }, [state.status]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), COPIED_FOR_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
    if (pending) return undefined;
    setPending(true);
    setError(null);
    try {
      return await action();
    } catch (cause) {
      setError(failureSentence(cause));
      return undefined;
    } finally {
      setPending(false);
    }
  }

  async function create() {
    const share = await run(createShare);
    if (share) setState({ status: "shared", share });
  }

  async function toggleDownload(next: boolean) {
    if (state.status !== "shared") return;

    // Optimistic: a switch that waits for a round trip before moving feels
    // broken. The failure branch puts it back and says why.
    const previous = state.share;
    setState({ status: "shared", share: { ...previous, allowDownload: next } });

    const updated = await run(() => setAllowDownload(next));
    setState({ status: "shared", share: updated ?? previous });
  }

  async function revoke() {
    const result = await run(async () => {
      await revokeShare();
      return true as const;
    });
    if (result) {
      setConfirmingRevoke(false);
      setState({ status: "notShared", justRevoked: true });
    }
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard access can be refused outright. Selecting the text is the
      // fallback every browser still honours, and ⌘C then works.
      linkRef.current?.select();
      setError("Couldn't copy automatically — the link is selected, press ⌘C.");
    }
  }

  const noun = targetKind;
  // A file has no inside; a folder and a drive do, and the subtree consequence
  // is the one thing an owner must understand before minting a link.
  const subtreeClause = noun === "file" ? "" : " and everything inside it";

  return (
    <>
      <DialogHeader>
        <DialogTitle className="type-title truncate">Share {name}</DialogTitle>
        <DialogDescription className="type-body">
          {state.status === "shared"
            ? `Anyone with the link can view this ${noun}${subtreeClause}.`
            : `Anyone with the link will be able to view this ${noun}${subtreeClause}.`}
        </DialogDescription>
      </DialogHeader>

      {state.status === "loading" ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-full rounded-lg" />
          <Skeleton className="h-5 w-2/3 rounded-sm" />
        </div>
      ) : state.status === "shared" ? (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="share-link">Link</Label>
            <div className="flex items-center gap-2">
              <Input
                id="share-link"
                ref={linkRef}
                readOnly
                value={shareUrl(state.share.token)}
                onFocus={(event) => event.currentTarget.select()}
                className="font-mono"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                /* The accessible name changes with the state, so the swap is
                     announced rather than only drawn. */
                aria-label={copied ? "Copied" : "Copy link"}
                onClick={() => void copyLink(shareUrl(state.share.token))}
              >
                {copied ? <Check /> : <Copy />}
              </Button>
            </div>
            <p className="type-detail text-muted-foreground">
              {copied ? "Copied." : "Anyone with the link can view."}
            </p>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-1">
              <Label htmlFor="share-allow-download">Allow download</Label>
              {!state.share.allowDownload && (
                /*
                    The honest claim. Turning this off removes the button, not
                    the bytes — a previewed image is the file. Copy that
                    promised more than that would be a lie the product cannot
                    keep.
                  */
                <p className="type-caption text-muted-foreground">
                  Viewers won&apos;t see a download button.
                </p>
              )}
            </div>
            <Switch
              id="share-allow-download"
              checked={state.share.allowDownload}
              disabled={pending}
              onCheckedChange={(next) => void toggleDownload(next)}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {state.justRevoked && (
            <p className="type-caption text-muted-foreground">
              Sharing again will create a new link.
            </p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="type-body text-destructive">
          {error}
        </p>
      )}

      <DialogFooter className="sm:justify-between">
        {state.status === "shared" ? (
          confirmingRevoke ? (
            /*
                Inline confirm rather than a nested AlertDialog. A dialog
                opening on top of a dialog moves focus twice and leaves the
                owner two Escape presses from where they started; the row
                simply becomes the question.
              */
            <div className="flex flex-wrap items-center gap-2 max-sm:w-full">
              <p className="type-detail flex-1 text-muted-foreground">
                Revoke this link? Anyone using it will lose access.
              </p>
              <Button
                type="button"
                variant="destructive"
                disabled={pending}
                onClick={() => void revoke()}
              >
                {pending && <CircleNotch className="animate-spin" />}
                Revoke
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmingRevoke(false)}
              >
                Keep
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="destructive"
              onClick={() => setConfirmingRevoke(true)}
            >
              Revoke link
            </Button>
          )
        ) : (
          <span />
        )}

        <div className="flex items-center gap-2">
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              {state.status === "shared" ? "Done" : "Cancel"}
            </Button>
          </DialogClose>
          {state.status === "notShared" && (
            <Button
              type="button"
              ref={createRef}
              disabled={pending}
              onClick={() => void create()}
            >
              {pending && <CircleNotch className="animate-spin" />}
              Create link
            </Button>
          )}
        </div>
      </DialogFooter>
    </>
  );
}
