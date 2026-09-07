#!/usr/bin/env bash
# Full graphify refresh: code (AST, free) + docs/images (semantic via claude-cli, free).
# Code-only refresh happens automatically via .git/hooks/post-commit; this adds the doc half.
#   ./scripts/graph-refresh.sh          # incremental - only changed files
#   ./scripts/graph-refresh.sh --force  # full re-extraction
set -euo pipefail
cd "$(dirname "$0")/.."

GRAPHIFY="${GRAPHIFY:-$HOME/.local/bin/graphify}"
FORCE=""
[ "${1:-}" = "--force" ] && FORCE="--force"

echo "[1/2] extract (AST + semantic, incremental)"
"$GRAPHIFY" extract . --backend=claude-cli $FORCE

echo "[2/2] cluster + label + regenerate outputs"
"$GRAPHIFY" label . --backend=claude-cli

echo "done: graphify-out/{graph.json,GRAPH_REPORT.md,graph.html}"
