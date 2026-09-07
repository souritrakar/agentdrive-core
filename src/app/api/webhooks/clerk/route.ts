import type { UserJSON } from "@clerk/backend";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";

import { db, isDatabaseConfigured } from "@/db";
import {
  softDeleteAccountFromClerk,
  syncAccountFromClerk,
  type Profile,
} from "@/db/scope";

/**
 * Clerk -> Postgres synchronisation.
 *
 * This endpoint is the *supplementary* half of account provisioning, not the
 * primary one. `resolveScope` in src/db/scope.ts already creates an Account the
 * first time a signed-in user asks for anything, which is what guarantees the
 * row exists. What only Clerk can tell us is the things that are not in a
 * session token and not implied by a request:
 *
 *   user.created  the real email address, at signup rather than on first use
 *   user.updated  the user changed their email or name somewhere else
 *   user.deleted  the account is gone and its data must stop being reachable
 *
 * Both halves are idempotent and both key on the immutable Clerk user id, so
 * whichever arrives first wins and the other is a no-op. Neither depends on the
 * other having run.
 *
 * SECURITY: this route is deliberately unauthenticated in the session sense —
 * Clerk's servers have no cookie. Its authentication is the Standard Webhooks
 * signature over the raw body, checked by `verifyWebhook` before a single field
 * of the payload is read. Without that check this would be an open endpoint for
 * deleting any account by guessing an id, so there is no branch below in which
 * an unverified payload reaches the database.
 *
 * Setup: Clerk Dashboard -> Webhooks -> add endpoint
 *   https://<your-domain>/api/webhooks/clerk
 * subscribed to user.created, user.updated, user.deleted, then copy the signing
 * secret into CLERK_WEBHOOK_SIGNING_SECRET. Locally, Clerk cannot reach
 * localhost — use `ngrok http 3000` and register the tunnel URL, or simply skip
 * it and let just-in-time provisioning do the work.
 */
export async function POST(request: NextRequest) {
  if (!process.env.CLERK_WEBHOOK_SIGNING_SECRET) {
    // 503, not 500: nothing is broken, this deployment has not been configured
    // to receive webhooks. Clerk retries a 5xx, which is right — the moment the
    // secret is set, the backlog drains on its own.
    return Response.json(
      { ok: false, error: "CLERK_WEBHOOK_SIGNING_SECRET is not set." },
      { status: 503 },
    );
  }

  if (!isDatabaseConfigured()) {
    return Response.json(
      { ok: false, error: "DATABASE_URL is not set." },
      { status: 503 },
    );
  }

  let event;
  try {
    // Reads the raw body and the svix-id / svix-timestamp / svix-signature
    // headers itself. The timestamp is part of the signed payload, which is
    // what makes a captured request unusable later — a replay of yesterday's
    // "user.deleted" is rejected on age, not just on signature.
    event = await verifyWebhook(request);
  } catch (cause) {
    // 400, and never 5xx: a bad signature will not verify on the tenth attempt
    // either, so retrying is pure noise. This is also the branch a genuine
    // forgery lands in, and it must not be distinguishable from a
    // misconfiguration in what it returns.
    console.error("Clerk webhook signature verification failed", cause);
    return Response.json(
      { ok: false, error: "Invalid signature." },
      { status: 400 },
    );
  }

  try {
    switch (event.type) {
      case "user.created":
      case "user.updated": {
        const user = event.data;
        const { created } = await syncAccountFromClerk(
          db,
          user.id,
          profileFrom(user),
        );
        return Response.json({ ok: true, event: event.type, created });
      }

      case "user.deleted": {
        // `id` is optional on the deleted payload — Clerk sends deletion
        // events for objects it may no longer have full records of. Nothing
        // can be done without one, and asking for a retry would not produce it.
        if (!event.data.id) {
          return Response.json({ ok: true, event: event.type, skipped: true });
        }

        const { found } = await softDeleteAccountFromClerk(db, event.data.id);
        return Response.json({ ok: true, event: event.type, found });
      }

      default:
        // Clerk sends whatever the endpoint is subscribed to, and subscriptions
        // are edited in a dashboard by people who are not deploying this code.
        // Acknowledging the unknown ones keeps a newly-ticked checkbox from
        // filling the retry queue with failures.
        return Response.json({ ok: true, event: event.type, handled: false });
    }
  } catch (cause) {
    // 500 so Clerk retries with backoff. Everything the handlers do is
    // idempotent, which is what makes inviting a retry safe rather than
    // reckless — a duplicate delivery re-runs an upsert, not a second insert.
    console.error(`Clerk webhook "${event.type}" failed`, cause);
    return Response.json(
      { ok: false, error: "Webhook handler failed." },
      { status: 500 },
    );
  }
}

/**
 * The email we store, out of the several Clerk may hold.
 *
 * A Clerk user can carry many addresses; `primary_email_address_id` names the
 * one they sign in with, and that is the one that has to match our unique
 * column. Falling back to the first entry covers the ordering where an address
 * exists but has not been promoted to primary yet.
 *
 * Unverified addresses are deliberately still accepted here. Our sign-up flow
 * cannot complete without a verified email, so anything arriving unverified
 * came from another path (an admin creating a user, an invitation) — and
 * refusing it would leave that account on a placeholder email forever.
 */
function profileFrom(user: UserJSON): Profile {
  const primary =
    user.email_addresses.find(
      (address) => address.id === user.primary_email_address_id,
    ) ?? user.email_addresses[0];

  const name = [user.first_name, user.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    email: primary?.email_address ?? null,
    name: name || null,
  };
}
