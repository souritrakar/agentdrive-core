"use client";

import { CircleNotch, DownloadSimple } from "@phosphor-icons/react/ssr";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  AudioStage,
  ImageStage,
  LoadingStage,
  NoPreviewStage,
  NotReadyStage,
  PdfStage,
  previewStage,
  TextStage,
  VideoStage,
} from "./viewer-stages";
import { ErrorState } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { fileKind } from "@/lib/file-kind";
import { formatBytes } from "@/lib/format";
import type { Item } from "@/lib/types";

type FileItem = Extract<Item, { kind: "FILE" }>;

/**
 * A shared file, as the whole page.
 *
 * Two regions below the frame: a one-row header carrying the name, the facts,
 * and the single primary action, and a stage that takes everything left. No
 * card around the stage — the content *is* the page, and a framed box would
 * make it a preview of a preview.
 *
 * **The owner is deliberately not named.** "Shared by …" would print a person
 * on an unauthenticated page they never agreed to be published on. Until
 * sharing has profiles and consent, the page attributes nothing; this is a
 * privacy default, not an omission waiting to be filled.
 *
 * URLs are minted on demand and never rendered ahead of need
 * (docs/architecture/sharing/02-public-access-security.md §3): the stage asks
 * for a short-lived inline URL when it mounts, the Download button asks for an
 * attachment one at click time. A URL baked into server-rendered HTML starts
 * its expiry clock at render and sits in every cache between here and the
 * reader.
 */
export function ShareFileViewer({
  file,
  allowDownload,
  getPreviewUrl,
  onDownload,
}: {
  file: FileItem;
  /**
   * Whether to offer the Download affordance. Honest about its limits: a
   * rendered preview is the file, and save-as always works. This removes the
   * invitation, not the possibility.
   */
  allowDownload: boolean;
  /** Mints a fresh, short-lived **inline** URL for the stage. */
  getPreviewUrl: () => Promise<string>;
  /** Mints a fresh **attachment** URL and hands it to the browser. */
  onDownload?: () => Promise<unknown> | unknown;
}) {
  const kind = fileKind(file.name, file.contentType);
  const isReady = file.uploadStatus === "READY";
  const stage = previewStage(file);

  const [isDownloading, setIsDownloading] = useState(false);
  const canDownload = allowDownload && isReady && Boolean(onDownload);

  async function download() {
    if (!onDownload || isDownloading) return;
    setIsDownloading(true);
    try {
      await onDownload();
    } finally {
      setIsDownloading(false);
    }
  }

  const handleDownload = canDownload ? () => void download() : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border px-4 py-3 sm:px-6">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {/* The file name is the page's heading — the stage announces
              through it, so no stage repeats the name as a title. */}
          <h1 className="type-title truncate">{file.name}</h1>
          <p className="type-meta text-muted-foreground">
            {kind.label} · {formatBytes(file.sizeBytes)}
          </p>
        </div>

        {canDownload && (
          <Button
            type="button"
            size="lg"
            // Full width on a phone, where the header wraps to two rows and a
            // right-aligned button would sit alone on a line anyway.
            className="max-sm:w-full"
            disabled={isDownloading}
            onClick={handleDownload}
          >
            {isDownloading ? (
              <CircleNotch data-icon="inline-start" className="animate-spin" />
            ) : (
              <DownloadSimple data-icon="inline-start" />
            )}
            Download
          </Button>
        )}
      </header>

      {/*
        The stage. Full-bleed on a phone — edge-to-edge content is the point of
        a phone viewer — and guttered from `sm:` up.
      */}
      <div className="flex min-h-0 flex-1 items-center justify-center p-0 sm:p-6">
        {!isReady ? (
          <NotReadyStage file={file} />
        ) : stage === "none" ? (
          <NoPreviewStage
            file={file}
            onDownload={handleDownload}
            isDownloading={isDownloading}
          />
        ) : (
          <PreviewStage
            // One stage per file: a new file remounts it at its loading state
            // rather than clearing state from inside an effect.
            key={file.id}
            file={file}
            stage={stage}
            getPreviewUrl={getPreviewUrl}
            onDownload={handleDownload}
            isDownloading={isDownloading}
          />
        )}
      </div>
    </div>
  );
}

type UrlState =
  | { status: "loading" }
  | { status: "ready"; url: string }
  | { status: "failed"; error: unknown };

/**
 * Owns the preview URL and its one silent retry.
 *
 * Presigned URLs expire in minutes, so a tab left open past the window has a
 * dead `src` and no way to know it except by failing. The media element's
 * `onError` re-mints **once** and swaps the source; a second failure is a
 * genuinely broken object rather than an expired credential, and gets the
 * failure state with a retry button instead of an invisible loop.
 *
 * `key={url}` on the media elements matters: a `<video>` whose `src` attribute
 * changes does not reload on its own, and without remounting it the retry
 * would appear to do nothing.
 */
function PreviewStage({
  file,
  stage,
  getPreviewUrl,
  onDownload,
  isDownloading,
}: {
  file: FileItem;
  stage: Exclude<ReturnType<typeof previewStage>, "none">;
  getPreviewUrl: () => Promise<string>;
  onDownload?: () => void;
  isDownloading?: boolean;
}) {
  const [state, setState] = useState<UrlState>({ status: "loading" });

  // Whether the free retry has been spent. A ref, not state: changing it must
  // not re-render, and it has to survive the render that swaps the URL.
  const hasRetried = useRef(false);
  // Guards against a resolved mint landing after the component moved on.
  const generation = useRef(0);

  /*
    Returns the next state rather than setting it.

    That split is what keeps the mount path honest: the component already
    mounts in `loading`, so the effect below only has to *land* a result, and a
    helper that sets no state can be called from an effect body without the
    cascading-render problem `react-hooks/set-state-in-effect` exists to catch.
    The two callers that genuinely need the skeleton back are both event
    handlers, and they ask for it themselves.
  */
  const fetchUrl = useCallback(async (): Promise<UrlState> => {
    try {
      return { status: "ready", url: await getPreviewUrl() };
    } catch (error) {
      return { status: "failed", error };
    }
  }, [getPreviewUrl]);

  useEffect(() => {
    const attempt = ++generation.current;
    void (async () => {
      const next = await fetchUrl();
      // A result from a superseded attempt must not land on the current one.
      if (attempt === generation.current) setState(next);
    })();
    return () => {
      generation.current += 1;
    };
  }, [fetchUrl]);

  /** Re-mints from an event handler, showing the skeleton while it is out. */
  const remint = useCallback(() => {
    const attempt = ++generation.current;
    setState({ status: "loading" });
    return fetchUrl().then((next) => {
      if (attempt === generation.current) setState(next);
    });
  }, [fetchUrl]);

  const handleMediaError = useCallback(() => {
    if (hasRetried.current) {
      setState({
        status: "failed",
        error: new Error("The preview could not be loaded."),
      });
      return;
    }
    hasRetried.current = true;
    void remint();
  }, [remint]);

  const retry = useCallback(() => {
    hasRetried.current = false;
    return remint();
  }, [remint]);

  if (state.status === "loading") return <LoadingStage />;

  if (state.status === "failed") {
    return (
      <ErrorState
        error={state.error}
        noun="file"
        onRetry={retry}
        title="This preview didn't load"
        message="The file is still shared — only the preview failed. Trying again usually clears it."
        action={
          onDownload
            ? undefined
            : { label: "Go to AgentDrive", href: "/" }
        }
        actionVariant="outline"
      />
    );
  }

  switch (stage) {
    case "image":
      return (
        <ImageStage
          url={state.url}
          name={file.name}
          onMediaError={handleMediaError}
        />
      );
    case "video":
      return (
        <VideoStage
          url={state.url}
          name={file.name}
          onMediaError={handleMediaError}
        />
      );
    case "audio":
      return (
        <AudioStage url={state.url} file={file} onMediaError={handleMediaError} />
      );
    case "pdf":
      return (
        <PdfStage
          url={state.url}
          file={file}
          onDownload={onDownload}
          isDownloading={isDownloading}
        />
      );
    case "text":
      return (
        <TextStage
          key={state.url}
          url={state.url}
          onMediaError={handleMediaError}
        />
      );
    default: {
      // Exhaustive: a new stage kind must be handled here, not fall through to
      // a blank viewport.
      return (
        <NoPreviewStage
          file={file}
          onDownload={onDownload}
          isDownloading={isDownloading}
        />
      );
    }
  }
}
