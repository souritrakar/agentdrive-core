import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { config as loadEnv } from "dotenv";

/**
 * Publishes AgentDrive's Clerk email templates from files in this repo.
 *
 * The point of this script is that the emails a customer receives are *product
 * surface*, and product surface belongs in version control. Clerk's dashboard
 * is a perfectly good editor, but a template that exists only there has no
 * history, no review, and no way to tell which change broke the rendering —
 * and it silently differs between a development and a production instance.
 * Here the markup is a file, this pushes it, and `--restore` puts back what was
 * there before.
 *
 * The files are raw table-based email HTML, not Clerk's `<re-*>` shorthand,
 * because Clerk does not compile the shorthand on write — see emails/clerk/
 * _layout.md for the evidence and the rules every template follows.
 *
 * Only the variables Clerk lists per template exist. This script checks the
 * required ones are present before sending, because a template that drops
 * `{{otp_code}}` still saves happily and then sends an email with no code in
 * it, and the first report of that is a user who cannot sign in.
 *
 * Usage:
 *   node scripts/clerk-emails.mts            # show what would change
 *   node scripts/clerk-emails.mts --push     # publish to the Clerk instance
 *   node scripts/clerk-emails.mts --restore  # put the saved originals back
 *
 * Reads CLERK_SECRET_KEY from .env.local, so it targets whichever instance that
 * key belongs to. Check which one before pushing.
 */

loadEnv({ path: ".env.local", quiet: true });

const SECRET = process.env.CLERK_SECRET_KEY;
if (!SECRET) {
  console.error("CLERK_SECRET_KEY is not set in .env.local");
  process.exit(1);
}

const API = "https://api.clerk.com/v1";
const DIR = "emails/clerk";
const BACKUP = `${DIR}/.original`;

/** Slug → the file that owns it, and the subject line Clerk should send. */
const TEMPLATES = [
  {
    slug: "verification_code",
    file: "verification-code.html",
    subject: "{{otp_code}} is your {{app.name}} verification code",
  },
  {
    slug: "reset_password_code",
    file: "reset-password-code.html",
    subject: "{{otp_code}} is your {{app.name}} password reset code",
  },
  {
    slug: "password_changed",
    file: "password-changed.html",
    subject: "Your {{app.name}} password was changed",
  },
] as const;

type Template = {
  slug: string;
  name: string;
  subject: string;
  markup: string;
  available_variables?: string[];
  required_variables?: string[];
};

async function clerk(path: string, init?: RequestInit) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${SECRET}`,
      "content-type": "application/json",
      ...init?.headers,
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path} → ${response.status}\n${text}`);
  }
  return text ? JSON.parse(text) : null;
}

const mode = process.argv.includes("--push")
  ? "push"
  : process.argv.includes("--restore")
    ? "restore"
    : "check";

const live: Template[] = await clerk("/templates/email");
const bySlug = new Map(live.map((t) => [t.slug, t]));

if (mode === "restore") {
  for (const { slug } of TEMPLATES) {
    const path = `${BACKUP}/${slug}.json`;
    if (!existsSync(path)) {
      console.log(`· ${slug}: no backup saved, skipping`);
      continue;
    }
    const saved = JSON.parse(await readFile(path, "utf8"));
    await clerk(`/templates/email/${slug}`, {
      method: "PUT",
      body: JSON.stringify({
        name: saved.name,
        subject: saved.subject,
        markup: saved.markup,
        body: saved.markup,
      }),
    });
    console.log(`↺ ${slug}: restored`);
  }
  process.exit(0);
}

await mkdir(BACKUP, { recursive: true });

for (const { slug, file, subject } of TEMPLATES) {
  const current = bySlug.get(slug);
  if (!current) {
    console.error(`✗ ${slug}: not present on this Clerk instance`);
    continue;
  }

  // Save what is there now, once, so --restore always has somewhere to go
  // back to. Written before the first push and never overwritten, otherwise
  // the second push would "back up" our own template over Clerk's original.
  const backupPath = `${BACKUP}/${slug}.json`;
  if (!existsSync(backupPath)) {
    await writeFile(
      backupPath,
      `${JSON.stringify({ slug, name: current.name, subject: current.subject, markup: current.markup }, null, 2)}\n`,
    );
    console.log(`  saved original → ${backupPath}`);
  }

  const markup = await readFile(`${DIR}/${file}`, "utf8");

  // A template missing a required variable still saves, and then sends an
  // email with no code in it. Refuse rather than publish that.
  const missing = (current.required_variables ?? []).filter(
    (variable) => !markup.includes(`{{${variable}}}`),
  );
  if (missing.length > 0) {
    console.error(`✗ ${slug}: markup is missing required ${missing.join(", ")}`);
    process.exitCode = 1;
    continue;
  }

  if (mode === "check") {
    const same = current.markup.trim() === markup.trim();
    console.log(`${same ? "=" : "≠"} ${slug}: ${same ? "up to date" : "would be updated"}`);
    continue;
  }

  /*
    Both fields get the same document, and that is deliberate.

    Clerk stores `markup` (its <re-*> shorthand, what the dashboard's visual
    editor edits) separately from `body` (what is actually delivered), and it
    does NOT compile one into the other on write — verified by pushing <re-*>
    markup once and reading the template back to find it stored verbatim, with
    no <table> anywhere. An email sent from that would have arrived with no
    layout at all.

    So these files are real table-based email HTML, and sending the same
    document as both keeps one source of truth here and one document on Clerk's
    side, rather than a shorthand that silently disagrees with what ships.
  */
  await clerk(`/templates/email/${slug}`, {
    method: "PUT",
    body: JSON.stringify({ name: current.name, subject, markup, body: markup }),
  });
  console.log(`✓ ${slug}: published`);
}
