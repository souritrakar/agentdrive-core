# UI architecture

> **Status:** standing rule for where UI code lives.
> Vocabulary and styling: [tokens.md](./tokens.md). The bar the UI is held to:
> [../design/principles.md](../design/principles.md).

---

## The tiers

Dependencies only ever point **down**.

```
  src/app                      routes — composition only
        │                      may compose anything below
        ▼
  src/components/<feature>     browser · drives · layout · upload · auth
        │                      a vertical slice: UI, state and actions for one
        │                      part of the product. Reaches another feature only
        │                      through its barrel, never its files.
        ▼
  src/components/shared        generic, no domain knowledge
        │                      may NOT import a feature. Ever.
        ▼
  src/components/ui            design system primitives (vendored shadcn)
                               may NOT import anything above
```

Enforced in `eslint.config.mjs`, not by good intentions. Each rule names what to
do instead, because a failure that does not say that gets suppressed.

## Where does this component go?

Ask in order, and stop at the first yes:

1. **Does it know a domain concept?** (a drive, a folder, an upload, a session)
   → `src/components/<feature>/`
2. **Is it used by two or more features, or obviously generic?**
   → `src/components/shared/`
3. **Is it a styled primitive with no logic?** (button, input, dialog)
   → `src/components/ui/`
4. **Is it only ever on one route, and only composition?**
   → leave it in the route

Ambiguous cases go to a **feature** first. Promotion to `shared/` on the second
caller is cheap; demotion is not — a shared component with one caller is
premature generalisation and it will have the wrong API.

## The rule that carries most of the value

**`shared/` must never import a feature.**

A shared component welded to a feature drags that feature's data layer into
every other feature that touches it, and into every story — which is usually how
you find out it happened. The fix is always the same: take the feature-specific
part as a **prop**, and let the caller, which is allowed to know about both,
wire it up.

## Public APIs

Every feature has an `index.ts` exporting only what outsiders may use. This is
what makes a refactor *inside* a feature safe: nobody can be coupled to a file
you did not publish.

| Feature | Public | Everything else is internal |
| --- | --- | --- |
| `browser` | `BrowserView`, `EntryGrid`, `EntryList` | tiles, breadcrumb, empty state, item actions |
| `drives` | `CreateDriveDialog`, `CreateFolderDialog` | — |
| `layout` | `AppShell`, `TopBar` | the sidebar parts, `useSidebar` |
| `share` | `PublicFrame`, `ShareBrowserView`, `ShareFileViewer`, `ShareGone`, `ShareDialog` | breadcrumbs, empty state, viewer stages |
| `upload` | `UploadProvider`, `useUpload`, `UploadPicker`, `UploadTray`, `DropOverlay` | the transfer internals |
| `auth` | the three forms, `AuthShell` | fields, resend timer, session activation |
| `shared` | `PageContainer`, `ErrorState`, `InlineError`, `ListingSkeleton`, `NameDialog`, `ThemeProvider`, `ViewToggle` | — |

`browser` publishes its two listing arrangements because `share` renders the
same listing over data that is not the owner's. They take routing and their
action slot as props (`EntryBehaviour`), so what is exported is an
arrangement, not a data source — which is the test for whether a component
should cross a feature boundary at all.

`src/components/ui` deliberately has **no barrel**. Those files are re-pulled
from the shadcn registry one at a time, and a barrel would have to be
hand-maintained against every update. Import them by path.

**A feature addresses its own modules relatively** — `./entry-list`, not
`@/components/browser/entry-list`. Going out to the barrel and back creates a
cycle the bundler has to unpick, and it hides which files are actually internal.

## Fixtures

`src/fixtures` is story data. Product code importing it is an ESLint error —
that is how placeholder copy ends up in front of a user.

## A trap worth knowing

ESLint flat config **replaces** a rule when a later config object matches the
same file; it does not merge. A second `no-restricted-imports` block scoped to
`src/**` silently switches every tier rule above off — and it lints clean, which
is the worst way for an enforcement rule to fail.

So: **one `no-restricted-imports` block per file group.** Shared restrictions
are folded into each tier's pattern list rather than added as another block.
This was caught by deliberately re-testing each rule after adding one; without
that step the whole layer would have been decorative.

## Verifying

```bash
pnpm typecheck && pnpm lint && pnpm check:tokens && pnpm build
npx madge --circular --extensions ts,tsx src/components src/app
```

`pnpm build` is not optional. Type checking passes on plenty of arrangements
that fail to bundle — particularly an `import type` hiding a cycle, or server
code pulled through a barrel into a client component.
