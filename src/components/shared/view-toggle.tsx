"use client";

import { ListBullets, SquaresFour } from "@phosphor-icons/react/ssr";

import type { ViewMode } from "@/lib/ui-preferences";
import { cn } from "@/lib/utils";

/**
 * Grid / list segmented control.
 *
 * Lives in `shared/` rather than in `browser/` because it knows nothing about
 * a drive, a folder or an item — it swaps two values and says which one is on.
 * It moved down here on its second caller (the share listing), which is the
 * promotion trigger docs/design-system/architecture.md names.
 *
 * Built from plain buttons rather than the shared `Button`, because a
 * segmented control is one control with two segments, not two buttons sitting
 * next to each other — and adding a third height to the app's button scale to
 * express that would break the two-size rule for the sake of one widget.
 *
 * `aria-pressed` rather than a radio group: nothing is being submitted, and the
 * pressed/unpressed reading is what a screen reader user needs here.
 */
export function ViewToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (next: ViewMode) => void;
}) {
  return (
    <div
      role="group"
      aria-label="View"
      className="inline-flex shrink-0 items-center gap-0.5 rounded-lg bg-secondary p-1 sm:p-0.5"
    >
      <Segment
        icon={SquaresFour}
        label="Grid view"
        isActive={value === "grid"}
        onClick={() => onChange("grid")}
      />
      <Segment
        icon={ListBullets}
        label="List view"
        isActive={value === "list"}
        onClick={() => onChange("list")}
      />
    </div>
  );
}

function Segment({
  icon: Icon,
  label,
  isActive,
  onClick,
}: {
  icon: typeof SquaresFour;
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      aria-label={label}
      className={cn(
        // Larger on touch, where the segments sit side by side and a 28px
        // target is a coin toss. The usual absolutely-positioned touch-target
        // overlay is wrong here — two of them in a row would overlap and steal
        // each other's taps — so the segment itself grows instead. 40px is
        // still under the 48px ideal, but it is what fits two segments in a
        // header row beside two other controls on a 390px screen.
        "grid size-10 place-items-center rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:size-7",
        isActive
          ? "bg-background text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon weight={isActive ? "fill" : "regular"} className="size-4" />
    </button>
  );
}
