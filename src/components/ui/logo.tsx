import { cn } from "@/lib/utils";

/**
 * The AgentDrive mark.
 *
 * Two shapes: a folder plane in the foreground, and a second plane behind it
 * offset to the bottom-right. The rear plane is the only place in the product
 * where lime appears without being an action — it is the brand, not an
 * affordance, and it is the reason the mark still reads at 16px in the
 * collapsed rail where the wordmark is gone.
 *
 * The foreground shape is filled with the page background rather than left
 * transparent, so the overlap resolves as genuine occlusion. A transparent
 * fill would let the rear plane show through the folder and collapse the
 * depth that makes the mark legible small.
 *
 * Deliberately not an `<svg>` with hardcoded colours: `stroke-current` means a
 * caller can tint the whole mark by setting text colour, which is what the
 * mobile drawer and the sign-in header both do.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("size-6 shrink-0", className)}
    >
      {/*
        Rear plane. Drawn first so the folder occludes its top-left corner.

        Same size as the folder and offset by exactly 7 units, which is the
        whole trick: the two planes together fill the box symmetrically, and
        the exposed L-band is wide enough to read as the edge of a square. An
        earlier version used a smaller rear plane with a larger corner radius
        and the visible sliver came out circular — at 24px it read as a
        notification dot stuck to a folder rather than as depth.
      */}
      <rect x="9" y="9" width="13" height="13" rx="3.6" className="fill-lime" />

      {/*
        Folder plane. The step in the top edge is the tab — enough to read as
        "folder" without the literal filing-cabinet silhouette, which stops
        working below about 20px.
      */}
      <path
        d="M4.5 2H8.4a2 2 0 0 1 1.5.68L11.6 5.5H12.5A2.5 2.5 0 0 1 15 8V12.5A2.5 2.5 0 0 1 12.5 15H4.5A2.5 2.5 0 0 1 2 12.5V4.5A2.5 2.5 0 0 1 4.5 2Z"
        strokeWidth="1.6"
        strokeLinejoin="round"
        className="fill-background stroke-current"
      />
    </svg>
  );
}

/**
 * Mark plus wordmark, for the sidebar header and auth pages.
 *
 * `tracking-tight` because a wordmark set at body size reads loose without it —
 * the same optical correction the display type token carries.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex items-center gap-2.5 text-[0.9375rem] font-semibold tracking-tight",
        className,
      )}
    >
      <LogoMark />
      AgentDrive
    </span>
  );
}
