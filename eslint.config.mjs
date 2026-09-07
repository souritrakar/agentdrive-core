import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/*
  The UI tiers, and the direction dependencies are allowed to point.

    src/app                 composition only — may compose anything below
          ▼
    src/components/<feature>   browser · drives · layout · upload · auth
          ▼                    a vertical slice; reaches other features only
          ▼                    through their barrel, never their files
    src/components/shared      generic, no domain knowledge
          ▼                    may NOT import a feature. Ever.
    src/components/ui          design system primitives
                               may NOT import anything above

  The one rule that carries most of the value is `shared` ⊁ feature. A shared
  component welded to a feature drags that feature's data layer into every
  other feature that touches it — and into every Storybook story, which is how
  you find out. The fix is always the same: take the feature-specific part as a
  prop and let the caller wire it up.

  Rationale and the classification rule: docs/design-system/architecture.md
*/
const FEATURES = ["browser", "drives", "layout", "share", "upload", "auth"];

/*
  Fixtures are story data. Product code importing them is how placeholder copy
  ends up in front of a user.

  Folded into every tier's pattern list rather than declared in a block of its
  own. ESLint flat config *replaces* a rule when a later object matches the same
  file — it does not merge — so a second `no-restricted-imports` block scoped to
  `src/**` silently switches every tier rule off. It lints clean, which is the
  worst way for an enforcement rule to fail.
*/
const noFixtures = {
  group: ["@/fixtures", "@/fixtures/*"],
  message:
    "Fixtures are story-only data. Product code must not import them — a story " +
    "or a test may.",
};

const featureBarrels = FEATURES.flatMap((f) => [
  `@/components/${f}`,
  `@/components/${f}/*`,
]);

/** Files inside a feature address their own internals relatively, so a rule
 *  scoped to that feature never has to make an exception for itself. */
const featureInternalsRule = (self) => ({
  files: [`src/components/${self}/**/*.{ts,tsx}`],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: FEATURES.filter((f) => f !== self).map(
              (f) => `@/components/${f}/*`,
            ),
            message:
              "Reach another feature through its public API — `@/components/<feature>` — " +
              "not one of its files. If the symbol you need is not exported, add it to " +
              "that feature's index.ts and decide deliberately that it is public.",
          },
          {
            group: [`@/components/${self}`, `@/components/${self}/*`],
            message:
              "Import your own feature's modules relatively (`./sibling`), not through " +
              "the alias. Going out to the barrel and back creates a cycle the bundler " +
              "has to unpick, and hides which files are actually internal.",
          },
          noFixtures,
        ],
      },
    ],
  },
});

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // ── Tier: ui ── primitives may not import anything above them.
  {
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                ...featureBarrels,
                "@/components/shared",
                "@/components/shared/*",
                "@/app/*",
                "@/hooks/*",
                "@/db/*",
                "@/storage/*",
              ],
              message:
                "A primitive that knows about a feature is no longer a primitive. Keep " +
                "src/components/ui dependency-free — take what it needs as props.",
            },
            noFixtures,
          ],
        },
      ],
    },
  },

  // ── Tier: shared ── generic code may not import a feature.
  {
    files: ["src/components/shared/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [...featureBarrels, "@/app/*"],
              message:
                "src/components/shared must not import a feature. Take the " +
                "feature-specific part as a prop and let the caller — which is allowed " +
                "to know about both — wire it up.",
            },
            noFixtures,
          ],
        },
      ],
    },
  },

  // ── Tier: features ── one rule each, so "self" can be excluded precisely.
  ...FEATURES.map(featureInternalsRule),

  // ── Tier: app ── routes compose features through their public API.
  {
    files: ["src/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: FEATURES.map((f) => `@/components/${f}/*`).concat(
                "@/components/shared/*",
              ),
              message:
                "Import through the public API — `@/components/<feature>`. A route " +
                "coupled to a feature's internal file is what stops that feature from " +
                "being rearranged.",
            },
            noFixtures,
          ],
        },
      ],
    },
  },

  /*
    Stories, last so this is the rule that applies to them. They keep the
    cross-feature ban — a story is not a licence to reach into another feature —
    but may import fixtures, which is what they are for. A story addresses its
    own feature's internals relatively, like every other file in that feature.
  */
  {
    files: ["src/**/*.stories.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: FEATURES.map((f) => `@/components/${f}/*`),
              message:
                "Reach another feature through its public API — `@/components/<feature>`. " +
                "Your own feature's internals are `./sibling`.",
            },
          ],
        },
      ],
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Wrangler dev/build artifacts.
    "**/.wrangler/**",
    // Prisma's generated client — not ours to lint.
    "src/generated/**",
  ]),
]);

export default eslintConfig;
