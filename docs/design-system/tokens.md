# Tokens

> **Status:** the vocabulary. Values live in code and are deliberately not
> listed here — a document that repeats them becomes wrong the first time
> someone changes one.
>
> See them rendered: `pnpm storybook` → **Foundations**.
> Change one: [workflow.md](./workflow.md). Why they look the way they do:
> [../design/principles.md](../design/principles.md).

---

## The rule

**A component never contains a value. It contains a name for a value.**

`bg-card`, not `#1e1e24`. `type-meta`, not `text-sm`. A role name survives a
restyle; an appearance name becomes a lie the moment someone adjusts it.

## Where things live

| File | Holds | Contains literals? |
| --- | --- | --- |
| `src/styles/tokens.css` | Every colour, radius, shadow, layout value | **Yes — the only place** |
| `src/styles/theme.css` | Exposes those tokens to Tailwind as utilities | No, only `var()` |
| `src/styles/typography.css` | The type scale, as `type-*` roles | Yes, type values only |
| `src/styles/base.css` | Element defaults | No |
| `src/styles/utilities.css` | Cross-cutting treatments (`drop-active`, `page-gutter`) | No |
| `src/app/globals.css` | Imports the above, in that order | No |

The chain, and nothing in it is a component:

```
declare   tokens.css      --brand-lime: oklch(0.87 0.19 124)
expose    theme.css       --color-lime: var(--brand-lime)
consume   a component     class="bg-lime"
```

Repointing one variable in `tokens.css` re-themes the product without touching
a component file. That is the entire payoff, and it is why the layers are kept
apart.

## Colour

Three families, and the boundary between them is the rule that keeps the
product from looking noisy.

**Semantic roles** — `background`, `foreground`, `card`, `popover`, `muted`,
`accent`, `secondary`, `border`, `input`, `ring`, `destructive`. Reach for these
first. Most UI never needs anything else.

**Brand accents** — `lime`, `teal`, `peacock`. Each has exactly one job:

| Token | Means | Used for |
| --- | --- | --- |
| `lime` | the primary action | one button per screen, upload and progress |
| `teal` | focus | focus rings, "you are here" |
| `peacock` | selection | selected rows, text selection, informational emphasis |

Three accents read as considered when each means one thing and as noise the
moment one of them is used decoratively.

**File-type tints** — `tint-document`, `tint-media`, `tint-code`,
`tint-archive`. These say what a thing *is*, never what state it is in: type
glyphs only, never a border, a control, or a status. The boundary is chroma
0.09 — accents sit at or above it, tints at or below. The full reasoning,
including why an earlier version at 0.04 chroma rendered as four identical
greys, is in the comments in `tokens.css`.

**The sidebar has its own ramp** (`sidebar-*`). Any region that can invert
needs one. `--muted-foreground` happening to look right on the rail today is
not a guarantee it will after a restyle.

## Type

Ten roles, in `src/styles/typography.css`. Each carries size, line height,
weight, tracking and numeric alignment **together** — a size on its own is not
a decision.

| Role | For |
| --- | --- |
| `type-display` | the page title, one per page |
| `type-title` | dialog titles, major section headings |
| `type-heading` | card and panel headings |
| `type-metric` | a single figure that is the point of its container |
| `type-body` | running text: descriptions, empty states, dialog bodies |
| `type-label` | the name of a thing in a list; a control's label |
| `type-meta` | row metadata with figures — size, date, count |
| `type-detail` | small secondary prose; same level as `type-meta`, no figures |
| `type-caption` | helper text, fine print |
| `type-eyebrow` | a label above a group of items |
| `type-monogram`, `-sm` | the letter standing in for a drive |

Two things to know before using them.

**`type-*` is typography; `text-*` is colour.** In product code `text-*` now
only ever sets a colour (`text-muted-foreground`). Reading a class list, you
can tell the two apart. Raw `text-sm` / `text-base` are blocked by
`pnpm check:tokens`.

**Most roles step down on desktop.** 16px on phones, 14px on desktop (13px for
`type-meta` and `type-detail`) — comfortable at arm's length, dense at a desk,
and large enough that iOS does not zoom a focused field. That pair appeared
verbatim as `text-base sm:text-sm` across ten files before it had a name. It is
a design decision, so it lives in one place.

## Elevation

**Two shadows: `shadow-soft` and `shadow-modal`.** That is the complete set. If
something needs a third to read as separate, the spacing around it is wrong —
fix the spacing.

On a near-black page a shadow cannot darken its way to separation; both tokens
carry a hairline of light on the top edge, which is what actually reads as
"nearer to you".

## Spacing and radius

Ordinary gaps and padding use **Tailwind's 4px scale as-is**. Re-tokenising it
buys nothing. Only composite spacings that carry a design decision are tokens:

- `--page-measure` and the `page-gutter` utility — the page's horizontal rhythm
- `--sidebar-width` / `--sidebar-width-icon` — read directly as
  `w-(--sidebar-width)`, because three separate things (the rail, the content
  offset, the sticky header origin) must agree on them or a collapse animation
  goes out of sync

Radius is one base value, `--radius`, with every step derived from it. Changing
it alone moves the whole product between sharp and soft.

## The vendored exception

`src/components/ui` is shadcn/ui, generated against Tailwind's own scale and
re-pulled from the registry on update. Re-expressing its type in `type-*` roles
would be overwritten the next time a component is regenerated, so **the type
rules do not apply there**. The colour rules do — those it inherits from our
tokens, and a hex in there is a real bug.

This is the only exception, and `scripts/check-design-tokens.mts` encodes it
explicitly rather than leaving it to habit.

## Enforcement

`pnpm check:tokens` fails on a hardcoded value in any path listed as clean.

The list in that script is **"already clean, must stay clean"**, not "known
violations" — same data, opposite psychology: one shrinks, the other grows.
Cleaning a directory means adding it, which is a promise.

Escape hatch: `design-system-ignore` on the line, with a comment saying why. A
recorded exception beats an invisible one — without a hatch, people work around
the check in ways you cannot see.
