# Linear writing style

Rules for every issue title, description, and comment written into the AgentDrive
Linear workspace. The `style-check` skill enforces these mechanically; this file
is the source they refer to.

## Structure

Use natural section headings, only the ones an issue actually needs:

- **Background** — what this is and why it matters. Fold completion criteria in
  here rather than giving them their own section.
- **Key facts** — verified statements. Each one traceable to something read.
- **Current posture** — where the work stands today, if that isn't obvious.
- **Deliverables** — what closing this issue produces.
- **Open questions** — unresolved decisions. Kept strictly apart from facts.
- **Known gaps** — what is deliberately not covered.

Rules that apply across sections:

- Facts and open questions never mix. A question sitting in Key facts reads as
  settled; a fact parked in Open questions reads as undecided.
- Absolute dates ("2026-08-08"), never relative ones ("last week", "recently").
- No owner, assignee, or reviewer names in the body text. Assignment lives in
  Linear's fields.
- Each issue is self-contained. A reader who opens it cold, without the thread
  that produced it, can act on it.
- State unverified claims as unverified, or cut them. A precise-sounding detail
  with no stated verification method is indistinguishable from a fabricated one.

## Voice

Plain and declarative. Write the way an engineer writes to another engineer who
will pick this up in three months.

The full list of patterns to strip lives in the `style-check` skill. The short
version: no hype adjectives, no AI-vocabulary verbs, no filler framing, no
rhetorical triads, no restating a fact in two sections.

## Editing an existing issue

Rewrite affected sections fresh from the current fact set. Do not append a
delta. The description states the current state only — chronology lives in
comments and the activity log. See the accretion check in `style-check`.
