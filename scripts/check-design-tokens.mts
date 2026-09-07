/**
 * Design-token guard.
 *
 * A design system decays at exactly the rate it is unenforced. This is the
 * difference between a system and a suggestion.
 *
 * ── The ratchet ──────────────────────────────────────────────────────────────
 * `ENFORCED` below is a list of directories that are *already clean*, not a
 * list of known violations. Same data, opposite psychology: one shrinks over
 * time, the other grows. Cleaning a directory means adding it here, which is a
 * promise it stays clean — after that, only a deliberate act can undo it.
 *
 * Run: `pnpm check:tokens`
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

type Scope = "all" | "product";
type Violation = { file: string; line: number; rule: string; message: string };

const ROOT = process.cwd();

/**
 * Vendored shadcn/ui components. They are generated against Tailwind's own
 * scale (`text-sm`, `rounded-lg`) and are re-pulled from the registry on
 * update, so re-expressing their type in `type-*` roles would be overwritten
 * the next time one is regenerated. They are still held to the colour rules —
 * those they inherit from our tokens, and a hex in there is a real bug.
 */
const VENDOR = ["src/components/ui"];

/** Already-clean paths. Only ever grows. */
const ENFORCED = [
  "src/app",
  "src/components/auth",
  "src/components/browser",
  "src/components/drives",
  "src/components/layout",
  "src/components/share",
  "src/components/shared",
  "src/components/ui",
  "src/components/upload",
];

/** Files that legitimately contain raw values — the token definitions. */
const TOKEN_SOURCES = new Set([
  "src/styles/tokens.css",
  "src/styles/theme.css",
  "src/styles/typography.css",
  "src/styles/base.css",
  "src/styles/utilities.css",
  "src/app/globals.css",
]);

const RULES: {
  id: string;
  scope: Scope;
  pattern: RegExp;
  message: string;
}[] = [
  {
    id: "no-hex",
    scope: "all",
    pattern: /#[0-9a-fA-F]{3,8}\b/g,
    message:
      "Raw hex colour. Use a semantic token: bg-card, text-muted-foreground, border-border.",
  },
  {
    id: "no-default-palette",
    scope: "all",
    pattern:
      /\b(?:bg|text|border|ring|fill|stroke|from|to|via|outline|decoration|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g,
    message:
      "Tailwind's default palette. Use a semantic colour token — the product's palette is in src/styles/tokens.css.",
  },
  {
    id: "no-raw-type-scale",
    scope: "product",
    pattern: /\btext-(?:xs|sm|base|lg|xl|[2-9]xl)\b/g,
    message:
      "Raw type size. Use a role: type-display / type-title / type-heading / type-metric / type-body / type-label / type-meta / type-detail / type-caption / type-eyebrow.",
  },
  {
    id: "no-arbitrary-type-size",
    scope: "product",
    pattern: /\btext-\[[^\]]+\]/g,
    message:
      "Arbitrary type size. Use a role from src/styles/typography.css, or add one there if none fits.",
  },
  {
    id: "no-arbitrary-length",
    scope: "product",
    // `ch` is allowed: a measure is a reading-width decision, not a spacing one.
    pattern: /(?<![\w-])\[\d+(?:\.\d+)?(?:px|rem)\]/g,
    message:
      "Arbitrary length. Use the spacing scale, or a layout token from src/styles/tokens.css.",
  },
];

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    if (entry === "node_modules" || entry.startsWith(".")) return [];
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

/** A rule cited in a comment is documentation, not a violation. */
const isCommentOnly = (line: string) => /^\s*(?:\/\/|\/\*|\*|<!--)/.test(line);

const violations: Violation[] = [];

for (const file of walk(path.join(ROOT, "src"))) {
  if (!/\.(tsx|jsx)$/.test(file)) continue;

  const rel = path.relative(ROOT, file);
  if (!ENFORCED.some((d) => rel === d || rel.startsWith(`${d}/`))) continue;
  if (TOKEN_SOURCES.has(rel)) continue;

  const isVendor = VENDOR.some((d) => rel.startsWith(`${d}/`));
  const lines = readFileSync(file, "utf8").split("\n");

  for (const rule of RULES) {
    if (isVendor && rule.scope === "product") continue;

    lines.forEach((line, i) => {
      if (isCommentOnly(line)) return;
      // An escape hatch that requires a visible reason. Without one, people
      // work around the check in ways you cannot see — a computed class name,
      // a constant in a helper. A recorded exception beats an invisible one.
      if (line.includes("design-system-ignore")) return;

      const hits = line.match(rule.pattern);
      if (!hits) return;
      for (let n = 0; n < hits.length; n++) {
        violations.push({ file: rel, line: i + 1, rule: rule.id, message: rule.message });
      }
    });
  }
}

if (violations.length > 0) {
  console.error(`\n${violations.length} design-token violation(s):\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    [${v.rule}] ${v.message}\n`);
  }
  console.error(
    "Fix, or — if genuinely intended — add `design-system-ignore` on the line\n" +
      "with a comment saying why.\n",
  );
  process.exit(1);
}

console.log(
  `Design tokens clean: ${ENFORCED.length} enforced path(s), ${RULES.length} rule(s).`,
);
