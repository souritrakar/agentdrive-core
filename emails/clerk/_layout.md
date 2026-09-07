# AgentDrive transactional email

What these files are, and the two constraints that shape every one of them.

## Why they are raw table HTML

Clerk stores two fields per template: `markup` (its own `<re-*>` shorthand, what
the dashboard's visual editor edits) and `body` (the HTML actually delivered).
**Clerk does not compile one into the other on write.** Pushing `<re-*>` markup
through the API stores it verbatim as the body, and the resulting email arrives
with no layout at all — verified by pushing once and reading the template back:
no `<table>` in the stored body.

So these files are the real thing: table-based, inline-styled HTML of the sort
email clients have needed since 2003. `scripts/clerk-emails.mts` sends the same
document as both `markup` and `body`, which keeps one source of truth in the
repo and one document on Clerk's side.

## Rules every template follows

- **Tables for layout, inline styles for everything.** Gmail strips `<style>`
  blocks in some contexts and no client can be trusted with flexbox or grid.
- **600px maximum, one column.** The width every client renders without
  horizontal scroll, and the width mobile clients scale from.
- **System fonts only.** `Helvetica, Arial, sans-serif`. Onest is a webfont;
  webfonts do not load in Outlook and fall back unpredictably elsewhere, so the
  brand is carried by colour, layout and copy rather than by type.
- **Light body, dark brand bar.** The app is dark-only, but Gmail and Outlook
  invert dark backgrounds unpredictably and an email that renders differently
  per client is the opposite of professional. The dark surface is confined to
  the header, where a wrong inversion costs nothing.
- **No images.** The mark is a wordmark in text. An image logo needs hosting,
  survives image-blocking in no client by default, and shows a broken icon when
  it fails — worse than well-set type.
- **A preheader on every email.** The grey line the inbox shows next to the
  subject. Left unset, clients scrape the first text they find, which is
  usually the wordmark.

## Colours

The design tokens from `src/app/globals.css`, converted oklch → sRGB (no email
client supports oklch):

| Token | Hex | Use here |
| --- | --- | --- |
| `--background` | `#090A0C` | Brand bar |
| `--foreground` | `#F6F7F8` | Wordmark on the bar |
| `--brand-lime` | `#BBE845` | The 3px accent rule, and nothing else |

Body type is near-black `#0B0D0F` on white, secondary `#5B6167`, tertiary
`#7A8189` — chosen for contrast on white rather than lifted from the dark
palette, where the same tokens would be unreadable.

## Variables

Only the variables Clerk lists for a given template exist. Notably the code
templates have **no `ttl_minutes`** (only the magic-link ones do), so "expires
in 10 minutes" is copy and has to stay in step with the UI in
`src/components/auth/`.

| Template | Required | Also available |
| --- | --- | --- |
| `verification_code` | `otp_code` | `requested_from`, `requested_at`, `app.*` |
| `reset_password_code` | `otp_code` | `requested_from`, `requested_at`, `app.*` |
| `password_changed` | `primary_email_address` | `greeting_name`, `app.*` |

## Publishing

```
node scripts/clerk-emails.mts            # diff against the live instance
node scripts/clerk-emails.mts --push     # publish
node scripts/clerk-emails.mts --restore  # put Clerk's originals back
```

Clerk's originals are saved under `.original/` on the first push, because these
templates report `can_revert: false` — there is no "reset to default" button to
fall back on once they are customised.
