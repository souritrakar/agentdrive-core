import { Skeleton } from "@/components/ui/skeleton";

/**
 * The shape a listing holds while its contents are on the way.
 *
 * Tile-shaped, not a spinner — the shape of the result is known, so the page
 * can hold it instead of blinking. Fixed at eight because the real count is
 * unknown, and a skeleton that guesses low and then jumps is worse than one
 * that settles.
 *
 * Lives in `shared/` because it describes a *shape*, not a drive: the owner's
 * browser and the public share listing render the same eight tiles while they
 * wait, and two copies of that would drift the moment a tile's padding
 * changed. `title` is optional because the share viewer's stage reuses the
 * tiles without a heading above them.
 */
export function ListingSkeleton({ withTitle = true }: { withTitle?: boolean }) {
  return (
    <div className="flex flex-col gap-8">
      {withTitle && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-56 rounded-md" />
          <Skeleton className="h-4 w-20 rounded-sm" />
        </div>
      )}
      <ul
        role="list"
        className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3 sm:gap-4"
      >
        {["a", "b", "c", "d", "e", "f", "g", "h"].map((key) => (
          // Same surface as the real tile, ring included — otherwise every
          // tile gains an edge at the moment the data lands.
          <li
            key={key}
            className="flex flex-col gap-3 rounded-xl bg-card p-3 inset-ring inset-ring-white/5"
          >
            <Skeleton className="aspect-4/3 rounded-lg" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-3.5 w-full rounded-sm" />
              <Skeleton className="h-3 w-2/3 rounded-sm" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
