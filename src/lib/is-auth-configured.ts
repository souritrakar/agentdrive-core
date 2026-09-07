/**
 * Split out from src/lib/auth.ts on purpose: this file must have zero
 * dependency on "@clerk/nextjs/server" (even a dynamic one), because it's
 * imported from the sidebar's account area, a Client Component. Bundlers
 * trace `import()` calls textually regardless of whether the branch that
 * reaches them can ever run on the client, so keeping this check in its own
 * tiny module is what keeps Clerk's Node-only server code out of the
 * browser bundle.
 */
export function isAuthConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}
