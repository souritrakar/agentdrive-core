# Running AgentDrive locally

Two processes. Both must be up; neither starts the other.

```bash
# Terminal 1 — Cloudflare Worker (API) on :8788
export PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" && pnpm worker:dev

# Terminal 2 — Next.js frontend on :3001
pnpm dev
```

Then open **http://localhost:3001** (`/` redirects to `/drives`).

## Ports, and why they are what they are

| Process | Port | Notes |
| --- | --- | --- |
| Next.js frontend | **3001** | Pinned in `package.json` (`next dev --port 3001`). |
| Worker API | **8788** | Pinned in `package.json` (`wrangler dev --port 8788`). |
| Storybook | 6006 | `pnpm storybook`. Not needed to run the app. |

**:3000 is not ours.** An unrelated local app (gallopify, in
`~/Documents/gallopify`) owns :3000. AgentDrive must never bind it and must
never accept it as an origin — the two systems are separate and share nothing.
That is why the frontend port is pinned rather than left to Next's default.

Note `AGENTS.md` says the Worker is on 8787. It is not; `package.json` is right.

## The Node version trap

`/usr/bin/node` is v20 and shadows nvm's v24, which `wrangler` requires. Prefix
the Worker command with the `PATH` export above rather than debugging wrangler.

`next dev` starts fine on v20 with only a warning — **so the frontend coming up
is not evidence the Worker did.** Check the Worker directly:

```bash
curl -s http://localhost:8788/health      # service, database, storage, auth
curl -s http://localhost:8788/health/db   # live row counts, proves Neon is reachable
```

## Where the origin is configured

`http://localhost:3001` appears in three places, and all three must agree:

| File | Consumer | Purpose |
| --- | --- | --- |
| `workers/api/.dev.vars` → `APP_ORIGIN` | Worker (local dev) | Which origins the API sets CORS headers for. |
| `.env.local` → `APP_ORIGIN` | `scripts/set-bucket-cors.mts` | Written into the R2 bucket's CORS policy. |
| `.env.local` → `NEXT_PUBLIC_API_URL` | Browser | `http://127.0.0.1:8788` — where the frontend calls the API. |

The Worker's CORS headers are irrelevant to browser→R2 uploads: those go
straight to R2, so the **bucket** must allow the origin too. After changing the
port, re-run:

```bash
pnpm storage:cors
```

Verify the isolation actually holds — the second call must return no
`Access-Control-Allow-Origin` header:

```bash
curl -si -X OPTIONS http://127.0.0.1:8788/v1/drives \
  -H "Origin: http://localhost:3001" -H "Access-Control-Request-Method: GET" | grep -i allow-origin
curl -si -X OPTIONS http://127.0.0.1:8788/v1/drives \
  -H "Origin: http://localhost:3000" -H "Access-Control-Request-Method: GET" | grep -i allow-origin
```

## Stopping

`pkill -f "next dev"` would also kill gallopify. Kill by port instead:

```bash
kill $(ss -ltnp | grep ':3001' | grep -oP 'pid=\K[0-9]+')   # frontend
kill $(ss -ltnp | grep ':8788' | grep -oP 'pid=\K[0-9]+')   # worker
```

`pnpm worker:dev` under `nohup` reports `ELIFECYCLE Command failed` when the
pnpm wrapper detaches, while `workerd` keeps serving. Trust `/health`, not that
line.
