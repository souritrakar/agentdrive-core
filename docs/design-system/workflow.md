# Workflow

> How to change anything visual, and where it lands.
> The vocabulary: [tokens.md](./tokens.md). Where code lives:
> [architecture.md](./architecture.md).

---

## See it first

```bash
pnpm storybook          # http://localhost:6006
```

Every component and every state it can be in. Start at **Foundations** — those
pages read the live CSS variables out of the running document, so they are the
one description of the design system that cannot go stale.

## Change a colour, a radius, a shadow

1. Edit the value in **`src/styles/tokens.css`**. It is the only place a literal
   colour or size may appear.
2. That is the whole change. Every component and every story moves with it,
   because none of them contain the value — they contain its name.

If you find yourself editing more than that one file, something is consuming a
raw value instead of a token. `pnpm check:tokens` will point at it.

## Add a colour token

1. Declare it in `src/styles/tokens.css`, named for its **role** — `--tint-code`,
   not `--purple-400`. If you cannot name it by role, you have not yet decided
   what it is for, and it will be misused within a week.
2. Expose it in `src/styles/theme.css` as `--color-<name>: var(--<name>)`. That
   is what makes `bg-<name>` / `text-<name>` exist.
3. Add a `<Swatch>` to the right group in `src/foundations/colour.stories.tsx`.
4. Check it against the surfaces it will sit on — 4.5:1 for body text, 3:1 for
   large text and borders.

Before adding one, check the existing set. Ten greys nobody can tell apart is a
worse outcome than eight that are slightly wrong.

## Change or add a type role

Everything type-related is in **`src/styles/typography.css`**.

A role carries size, line height, weight, tracking and numeric alignment
**together** — a size alone is not a decision. Most roles also step down on
desktop; copy the `@media (width >= theme(--breakpoint-sm))` block from a
neighbouring role rather than inventing a breakpoint.

Then add it to the `ROLES` list in `src/foundations/typography.stories.tsx`, with
sample copy of the kind it will really hold. Lorem ipsum hides the only two
things worth checking: whether a filename fits, and whether the metadata still
loses to the name above it.

## Add a component

1. Decide its tier — the four-question test in
   [architecture.md](./architecture.md#where-does-this-component-go).
2. Build it out of tokens. No hex, no `text-sm`, no arbitrary `[13px]`.
3. **Write its stories.** A component without one is not done. Cover the states
   it can actually be in, not just the happy one:

   | State | Why |
   | --- | --- |
   | Empty | the first-run experience — designed last, seen first |
   | Loading | the layout must not jump when data arrives |
   | Error | otherwise only reachable by breaking the backend |
   | Partial | some fields null; very common, almost never designed |
   | Extremes | a long name, a huge number, sixty rows, one row |

4. If it is public, export it from the feature's `index.ts` — a deliberate
   decision, not a reflex.

Fixtures live in `src/fixtures`, and they are deliberately **awkward**: names
with no natural break, zero-byte files, missing content types. Tidy fixtures
make every layout look correct, which is the opposite of what the workbench is
for.

## Experiment with the look

This is what the layering is for. In rough order of blast radius:

- **One component** — edit it, watch its stories.
- **A whole family** — change a type role, or a semantic colour. Every story
  using it moves at once, which is how you find out what else it was holding up.
- **The entire product's feel** — `--radius` alone moves everything between
  sharp and soft. The neutrals' chroma moves it between warm and clinical.

Because all three are single-file edits, the expensive part of a visual
experiment is deciding whether you like it, not carrying it out.

## Before you commit

```bash
pnpm typecheck && pnpm worker:typecheck && pnpm lint && pnpm check:tokens && pnpm build
pnpm test:stories
```

`pnpm build` is not optional: it is the only gate that catches Clerk's server
code being traced into a client bundle, which typecheck and lint both pass.

`pnpm test:stories` renders every story in a real browser and runs accessibility
checks against it. A component that throws on an edge case fails here rather
than in front of a user — that is how the `EmptyFolder` / `UploadProvider`
coupling was found.

## Known gaps

Recorded rather than hidden, because the useful half of a coverage claim is
what it does **not** cover.

- **No page-level stories.** `BrowserView`, `SidebarContent` and `UploadTray`
  fetch or own their own data, so they cannot be put into a state by passing
  props. They need a container/view split — the presentational parts they render
  are storied instead (`Sections/Entry grid`, `Sections/Entry list`).
- **Accessibility checks run as `todo`**, so violations are reported but do not
  fail the run. Move `a11y.test` to `'error'` in `.storybook/preview.tsx` once
  the catalogue is complete.
- **Storybook is not deployed and not in CI.** There is no CI config in this
  repo yet; when there is, `check:tokens` and `test:stories` belong in it.
- **`src/components/ui` has no stories** beyond `Button`. Those are vendored and
  documented upstream; the product's own components were the priority.
