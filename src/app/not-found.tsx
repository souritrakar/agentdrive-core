import { ErrorState } from "@/components/shared";

/**
 * A URL that matches no route.
 *
 * Deliberately the same component the pane uses when the API returns a 404,
 * rather than a second page that says the same thing in different words. A dead
 * link is a dead link whether the router or the backend is the one that noticed,
 * and the user has no way to tell the difference — so neither should the screen.
 *
 * No sidebar: this renders in the root layout, outside the app shell, because a
 * URL this far off the map may not belong to a drive at all and a rail listing
 * drives would imply it did.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center py-16">
      <ErrorState
        /*
          A plain object, not `new ApiError(...)`. This is a Server Component, and
          a class instance crossing into a Client Component arrives as a bare
          Error with its fields stripped — which made this page render the
          generic "Something went wrong" instead of a 404. The classifier reads
          the shape, so a serialisable literal is both correct and honest: no
          request was made here, the router simply has no match.
        */
        error={{ status: 404, code: "no_route", message: "No route matches this URL." }}
        noun="page"
        action={{ label: "Go to your drives", href: "/drives" }}
      />
    </main>
  );
}
