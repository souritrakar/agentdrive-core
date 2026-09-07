/**
 * A shared folder with nothing in it.
 *
 * Built to the same skeleton as the owner's empty state — picture, heading,
 * one line — with the button and the upload invitation removed, because there
 * is nothing a visitor can do about an empty folder and the state must not
 * pretend otherwise.
 *
 * No way-out button either, and that is the deliberate difference from a
 * failure state. A failure has to offer somewhere to go; an empty folder in a
 * read-only world is complete information, and the trail above it is already
 * the route back. Adding a button here would be inventing an action to fill a
 * slot.
 *
 * The illustration is redrawn rather than imported from `browser/`: it lives
 * inside that feature's private `EmptyFolder`, and reaching into another
 * feature's file is what the tier rules exist to stop. It is the same
 * vocabulary — rounded rectangles, the card surface, one lime accent — minus
 * the documents going *in*, since nothing is arriving here.
 */
export function EmptySharedFolder() {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <EmptySharedFolderIllustration />

      <div className="mt-8 flex flex-col gap-2">
        <h2 className="type-title">This folder is empty</h2>
        <p className="type-body mx-auto max-w-[46ch] text-pretty text-muted-foreground">
          Nothing has been shared here yet.
        </p>
      </div>
    </div>
  );
}

/**
 * An open, empty folder.
 *
 * `aria-hidden` because the heading underneath already says what this is; a
 * described illustration would just make a screen reader say it twice.
 */
function EmptySharedFolderIllustration() {
  return (
    <svg
      viewBox="0 0 220 150"
      aria-hidden="true"
      // Set once here and inherited. At the SVG default of 1, scaled down to a
      // 160px drawing, every outline renders under a pixel and the whole thing
      // becomes a dark smudge.
      strokeWidth="2.5"
      strokeLinejoin="round"
      className="h-40 w-auto shrink-0"
    >
      {/*
        Folder back panel and its tab, filled with the page background so the
        inside of the folder reads as empty rather than as a solid card.
      */}
      <path
        d="M38 92V60A8 8 0 0 1 46 52H72A6 6 0 0 1 76.6 54.2L82 60H174A8 8 0 0 1 182 68V92Z"
        className="fill-background stroke-white/20"
      />

      {/*
        The one accent: a hairline resting where a document would sit if there
        were one. Lime, at the width of the folder's mouth, so the emptiness is
        drawn rather than merely absent.
      */}
      <rect x="94" y="74" width="32" height="4" rx="2" className="fill-lime/40" />

      {/* Front lip, painted last so the interior tucks in behind it. */}
      <rect
        x="38"
        y="80"
        width="144"
        height="52"
        rx="10"
        className="fill-card stroke-white/30"
      />
    </svg>
  );
}
