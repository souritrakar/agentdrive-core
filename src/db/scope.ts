import type { Db } from "./client";

/**
 * The tenant scope every data-access function requires.
 *
 * Passing this explicitly is the point: a repository function cannot be called
 * without saying whose data it is operating on, so "forgot to filter by tenant"
 * becomes a type error rather than a data leak
 * (docs/architecture/backend-principles.md §5).
 */
export type Scope = {
  accountId: string;
  podId: string;
};

/**
 * Who is calling, as far as the identity provider is concerned.
 *
 * `externalAuthId` is Clerk's user id (`user_2abc…`) and is the only durable
 * link between the two systems — it is immutable, whereas an email is not.
 *
 * `profile` is a *thunk* rather than a value, and that is the whole design of
 * this type. Reading a user's email means a round trip to Clerk's Backend API,
 * and the overwhelmingly common case is an Account row that already exists, for
 * which the email is already known. Making it lazy means that call happens on
 * the one request that provisions the account and never again — instead of on
 * every listing, every upload, every navigation.
 */
export type Identity = {
  externalAuthId: string;
  profile?: () => Promise<Profile>;
};

export type Profile = {
  email?: string | null;
  name?: string | null;
};

/**
 * Raised when a token authenticates against an Account that has been deleted.
 *
 * This is not a theoretical state. Clerk's `user.deleted` webhook soft-deletes
 * the row, but any session token minted before that stays cryptographically
 * valid until it expires — up to a minute later. Without this check those
 * requests would sail through and, worse, `findOrCreate` would happily create a
 * *second* account for a user we were told to erase.
 */
export class AccountDeletedError extends Error {
  constructor() {
    super("This account has been deleted.");
    this.name = "AccountDeletedError";
  }
}

/**
 * Email we store when the identity provider has one and we do not.
 *
 * The column is NOT NULL and unique, so provisioning cannot simply leave it
 * blank, and two accounts cannot share a blank. Keying the placeholder on the
 * immutable Clerk id satisfies both, and makes the row self-describing: anyone
 * reading the table can see at a glance which accounts are still waiting on a
 * profile sync.
 */
function placeholderEmail(externalAuthId: string): string {
  return `${externalAuthId}@clerk.local`;
}

/** True for an email this file invented rather than one Clerk told us. */
function isPlaceholderEmail(email: string): boolean {
  return email.endsWith("@clerk.local");
}

/** Prisma's unique-constraint violation. Same check as db/repository.ts. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}

/**
 * Resolves the caller to an Account and its default Pod, provisioning both on
 * first use.
 *
 * This is the single seam between authentication and data. Everything above it
 * deals in `Scope`; everything below it never asks who the user is. Swapping the
 * identity provider means changing what gets passed in here, not touching a
 * single query.
 *
 * "Provisioning on first use" — just-in-time — is deliberately the primary path
 * rather than the fallback. The Clerk webhook (src/app/api/webhooks/clerk) also
 * creates accounts and gets there first most of the time, but a webhook is an
 * at-least-once delivery from another company's queue: it can be late, it can be
 * retried, and in local development it cannot reach localhost at all. Whereas if
 * this function is running, the caller is holding a verified token *right now*.
 * Making the guaranteed path primary and the informative path supplementary is
 * what keeps a signed-in user from ever seeing "your account is still being
 * created".
 */
export async function resolveScope(
  db: Db,
  identity: Identity,
): Promise<Scope> {
  const account = await findOrProvisionAccount(db, identity);
  const pod = await defaultPodFor(db, account.id);
  return { accountId: account.id, podId: pod.id };
}

async function findOrProvisionAccount(db: Db, identity: Identity) {
  const { externalAuthId } = identity;

  const existing = await db.account.findUnique({ where: { externalAuthId } });

  if (existing) {
    if (existing.deletedAt) throw new AccountDeletedError();

    // The row exists but was created before we knew who this was — either by
    // an earlier request on this same path, or by the Worker, which has no
    // cheap way to learn an email. Fill it in now that a caller can.
    if (isPlaceholderEmail(existing.email) && identity.profile) {
      return backfillProfile(db, existing.id, await identity.profile());
    }

    return existing;
  }

  const profile = identity.profile ? await identity.profile() : {};

  try {
    return await createAccountWithPod(db, externalAuthId, profile);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;

    /*
      Someone else won the race.

      This is the ordinary case, not an exotic one: signing up in two tabs, a
      page that fires three data requests on mount, or a webhook landing in the
      same millisecond as the user's first navigation all produce two concurrent
      creates for one brand-new user. The unique index on `external_auth_id` is
      what makes that safe — the loser is told, and the correct resolution is
      simply to read what the winner wrote.

      A unique violation on `email` reaches here too, and must not be treated as
      success: it means a *different* Clerk user claims an email another Account
      already holds. Re-reading by auth id returns nothing in that case, and we
      surface it rather than silently handing over someone else's account.
    */
    const raced = await db.account.findUnique({ where: { externalAuthId } });
    if (!raced) {
      throw new Error(
        `Could not provision an account for ${externalAuthId}: its email is already registered to a different account.`,
      );
    }
    if (raced.deletedAt) throw new AccountDeletedError();
    return raced;
  }
}

/**
 * Creates an Account and its default Pod as one unit.
 *
 * Transactional because an Account with no Pod has nowhere to put a drive: the
 * user would be signed in, past every check, and unable to do the first thing
 * the product does. A half-finished signup is worse than a failed one
 * (backend-principles.md §3) — a failure is retried on the next request by the
 * very same code path, whereas a half-finished one persists and needs a human.
 */
async function createAccountWithPod(
  db: Db,
  externalAuthId: string,
  profile: Profile,
) {
  return db.$transaction(async (tx) => {
    const account = await tx.account.create({
      data: {
        externalAuthId,
        email: profile.email?.trim() || placeholderEmail(externalAuthId),
        name: profile.name?.trim() || null,
      },
    });

    await tx.pod.create({
      data: {
        accountId: account.id,
        name: "Personal",
        slug: "personal",
        isDefault: true,
      },
    });

    return account;
  });
}

/**
 * Writes a real email/name over a placeholder.
 *
 * Guarded on the placeholder by the caller rather than run unconditionally, so
 * this is not a write on every request — and so Clerk cannot silently overwrite
 * an email that some future admin tool set deliberately.
 */
async function backfillProfile(db: Db, accountId: string, profile: Profile) {
  const email = profile.email?.trim();
  if (!email) {
    return db.account.findUniqueOrThrow({ where: { id: accountId } });
  }

  try {
    return await db.account.update({
      where: { id: accountId },
      data: { email, name: profile.name?.trim() || undefined },
    });
  } catch (error) {
    // The email is spoken for. Keep the placeholder rather than failing the
    // request — the user can still use the product, and a duplicate email is
    // an operational problem, not a reason to lock someone out of their files.
    if (isUniqueViolation(error)) {
      return db.account.findUniqueOrThrow({ where: { id: accountId } });
    }
    throw error;
  }
}

async function defaultPodFor(db: Db, accountId: string) {
  const existing = await db.pod.findFirst({
    where: { accountId, isDefault: true, deletedAt: null },
  });
  if (existing) return existing;

  // A partial unique index enforces one default pod per account, so a race here
  // surfaces as a unique violation rather than two defaults. Re-reading on
  // conflict is the correct resolution: the other writer already made ours.
  //
  // Reachable even though `createAccountWithPod` makes a pod, because an
  // account provisioned by an older build — or one whose only pod was soft
  // deleted — still has to end up with somewhere to put a drive.
  try {
    return await db.pod.create({
      data: {
        accountId,
        name: "Personal",
        slug: "personal",
        isDefault: true,
      },
    });
  } catch {
    const raced = await db.pod.findFirst({
      where: { accountId, isDefault: true, deletedAt: null },
    });
    if (raced) return raced;
    throw new Error("Could not resolve a default pod for this account.");
  }
}

// ---------------------------------------------------------------------------
// Webhook entry points
//
// The Clerk webhook calls these instead of `resolveScope`, because it is not
// serving a request for anyone — there is no scope to return, and nothing
// should be provisioned lazily on its behalf.
// ---------------------------------------------------------------------------

/**
 * Creates or updates the Account for a Clerk user, from webhook data.
 *
 * Handles `user.created` and `user.updated` with the same code on purpose.
 * Webhooks are delivered at least once and in no guaranteed order: a retried
 * `user.created` after a `user.updated` must not resurrect the stale email, and
 * an `user.updated` for a user whose `user.created` never arrived must still
 * produce a row. Treating both as "make the database agree with this payload"
 * is the only handling that is correct under both.
 */
export async function syncAccountFromClerk(
  db: Db,
  externalAuthId: string,
  profile: Profile,
): Promise<{ created: boolean }> {
  const existing = await db.account.findUnique({ where: { externalAuthId } });

  if (existing) {
    const email = profile.email?.trim();
    const name = profile.name?.trim();
    /*
      Only write when something actually differs. Webhook retries are common
      and an unconditional update would bump `updated_at` on every one of them.

      Each clause requires the payload to *have* the field before comparing it,
      which has to match `backfillOrReplaceProfile`'s refusal to overwrite with
      nothing. Comparing an absent name against a stored one — as this did —
      reported "changed" on every delivery for any user whose Clerk profile has
      no name, producing exactly the churn this check exists to prevent, and
      then an update that now correctly writes nothing.
    */
    const changed =
      (!!email && email !== existing.email) ||
      (!!name && name !== existing.name);

    if (changed) {
      await backfillOrReplaceProfile(db, existing.id, profile);
    }
    return { created: false };
  }

  try {
    await createAccountWithPod(db, externalAuthId, profile);
    return { created: true };
  } catch (error) {
    // Lost the race with a just-in-time provision on the user's own first
    // request. That is a success, not a failure — the row we wanted exists.
    if (isUniqueViolation(error)) {
      const raced = await db.account.findUnique({ where: { externalAuthId } });
      if (raced) return { created: false };
    }
    throw error;
  }
}

/** Like `backfillProfile`, but authorised to replace a real email too. */
async function backfillOrReplaceProfile(
  db: Db,
  accountId: string,
  profile: Profile,
) {
  const email = profile.email?.trim();
  const name = profile.name?.trim();
  try {
    await db.account.update({
      where: { id: accountId },
      data: {
        ...(email ? { email } : {}),
        /*
          Omitted when the payload carries no name, rather than written as
          null.

          This column is a *mirror* of Clerk's `firstName`/`lastName`, kept for
          querying and support — nothing in the UI reads it, because every
          surface that shows a name reads Clerk directly. An unconditional
          `|| null` therefore let any `user.updated` event that happened not to
          include a name erase it: changing an email address, adding a second
          factor, or a webhook retry replaying an older payload would all blank
          a name the user had definitely set.

          A webhook should only write the fields it actually has something to
          say about. Silence is not an instruction to delete.
        */
        ...(name ? { name } : {}),
      },
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    throw new Error(
      `Cannot apply Clerk profile to account ${accountId}: the email is already registered to another account.`,
    );
  }
}

/**
 * Marks an Account deleted in response to Clerk's `user.deleted`.
 *
 * Soft, not hard, and that is a considered trade rather than timidity. A
 * cascading hard delete would remove every File *row* while leaving the bytes
 * those rows point at sitting in R2 — unreferenced, unbilled to anyone, and now
 * impossible to find. Erasure has to be a job that deletes objects first and
 * rows second; this marks the account so nothing can be read through it in the
 * meantime, and `findOrProvisionAccount` refuses any token that still points
 * here.
 *
 * Idempotent: Clerk retries deletions, and a second one must not fail the
 * endpoint into an infinite retry loop.
 */
export async function softDeleteAccountFromClerk(
  db: Db,
  externalAuthId: string,
): Promise<{ found: boolean }> {
  const result = await db.account.updateMany({
    where: { externalAuthId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return { found: result.count > 0 };
}
