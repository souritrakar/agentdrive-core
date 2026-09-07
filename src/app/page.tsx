import { redirect } from "next/navigation";

/**
 * There is no separate landing surface inside the app — the drive list is home.
 * A marketing page, if there ever is one, will live outside this route group.
 */
export default function RootPage() {
  redirect("/drives");
}
