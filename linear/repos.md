# Repo registry

Which codebase a Linear issue maps to. The Linear skills consult this file to
attach repo links and to decide where to verify a claim.

Keep it current. If a skill run observes something that contradicts this file,
it trusts what it observed and flags the discrepancy here rather than editing
silently.

| Repo | Local path | GitHub | Purpose |
| --- | --- | --- | --- |
| agentdrive | `/home/s7kar/Desktop/agentdrive` | _not set — no remote yet_ | Everything: Next.js frontend, Drizzle schema, and the Cloudflare Worker API under `workers/api`. |

Single-repo project today. If the Worker or the storage layer is ever split out,
add a row rather than overloading the one above.

## Knowledge sources

Where to verify a product or technical claim before stating it in an issue:

- `PRODUCT.md` — product goals, scope, positioning, open questions.
- `README.md` — stack, setup, version holds, database and storage wiring.
- `AGENTS.md` / `CLAUDE.md` — codebase conventions.
- The code itself, for any implementation claim.
