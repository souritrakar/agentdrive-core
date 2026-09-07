import { redirect } from "next/navigation";
import { Suspense } from "react";

import { ForgotPasswordForm } from "@/components/auth";
import { currentUserId, isAuthConfigured } from "@/lib/auth";

export const metadata = { title: "Reset your password · AgentDrive" };

export default async function ForgotPasswordPage() {
  if (!isAuthConfigured()) {
    redirect("/drives");
  }

  // Someone signed in who wants a new password wants the account settings, not
  // an identity-proving flow they have already completed.
  if (await currentUserId()) {
    redirect("/drives");
  }

  return (
    <Suspense>
      <ForgotPasswordForm />
    </Suspense>
  );
}
