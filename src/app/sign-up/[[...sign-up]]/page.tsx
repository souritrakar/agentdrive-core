import { redirect } from "next/navigation";
import { Suspense } from "react";

import { SignUpForm } from "@/components/auth";
import { currentUserId, isAuthConfigured } from "@/lib/auth";

export const metadata = { title: "Create your account · AgentDrive" };

/** Optional catch-all for the same reason as /sign-in — see the note there. */
export default async function SignUpPage() {
  if (!isAuthConfigured()) {
    redirect("/drives");
  }

  if (await currentUserId()) {
    redirect("/drives");
  }

  return (
    <Suspense>
      <SignUpForm />
    </Suspense>
  );
}
