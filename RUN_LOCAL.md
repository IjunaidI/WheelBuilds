# Run Local — quick start

How to bring the whole stack up on this machine. Two apps, two terminals.

| App | Dir | Port | URL |
|---|---|---|---|
| Backend (Medusa + Admin) | `backend/` | 9000 | http://localhost:9000 · admin at http://localhost:9000/app |
| Storefront (Next.js) | `storefront/` | 8000 | http://localhost:8000 |

> The local apps run against **remote Railway services** — Postgres, MinIO, and
> Meilisearch all live in the cloud (see hosts in `backend/.env` /
> `storefront/.env.local`). So local data == production-ish data; the DB is
> already migrated and seeded. You normally do **not** need `pnpm ib`.

## Prereqs (already satisfied on this box)

- Node **22.x** (`node -v` → v22.11.0) and **pnpm 9.10** on PATH.
- `backend/.env` and `storefront/.env.local` both present. If either is missing,
  copy from its template (`backend/.env.template`, `storefront/.env.local.template`)
  and refill the remote credentials.
- Dependencies installed in **both** apps (`backend/node_modules`,
  `storefront/node_modules`). There is no root workspace — if you ever wipe
  these, run `pnpm install` separately in each app.

## Start it (order matters)

Start the backend first — the storefront's `dev` script blocks on port 9000 via
an `await-backend` shim until the backend answers.

**Terminal 1 — backend**
```powershell
cd backend
pnpm dev          # medusa develop → :9000, watches & restarts on file change
```
Wait until it logs that the server is ready (first boot builds the admin bundle,
~30–90s). Sanity check from another shell:
```powershell
curl http://localhost:9000/health   # → OK
```

**Terminal 2 — storefront**
```powershell
cd storefront
pnpm dev          # await-backend (polls :9000) → next dev on :8000
```
Then open http://localhost:8000.

## Admin login

Go to http://localhost:9000/app. Credentials are in `backend/.env`
(`MEDUSA_ADMIN_EMAIL` / `MEDUSA_ADMIN_PASSWORD`).

## Handy variations

- **Storefront-only iteration (backend not running):** `cd storefront; pnpm build:next`
  or `pnpm dev` will hang on `await-backend` — use `build:next` to skip the wait.
- **Fresh / empty database** (rare — only if you point `DATABASE_URL` at a new DB):
  `cd backend; pnpm ib` once (migrations + seed), then `pnpm dev`.
- **Re-seed only:** `cd backend; pnpm seed`.
- **Lint / typecheck** (builds don't fail on these): `cd storefront; pnpm lint`
  then `npx tsc --noEmit`.

## Gotchas

- **Stale built config.** After editing `medusa-config.js` or any backend env
  var, delete the cache before restarting or prod-style behavior diverges:
  ```powershell
  Remove-Item -Recurse -Force backend/.medusa/server
  ```
- **pnpm not on PATH (some shells).** It's available here, but if `pnpm` ever
  isn't found, use `npx -y pnpm@9.10.0 <cmd>` or call the CLI directly via
  `backend/node_modules/.bin/medusa.CMD`.
- **Redis is unset locally**, so Medusa uses an in-memory event bus + workflow
  engine. Fine for dev; you'll see a "Local Event Bus … not recommended for
  production" warning — that's expected.
- **Vendor-sync writes to the real (remote) catalog.** `VENDOR_WHEELPROS_*_ENABLED`
  is on, so the 12-hour cron and any `pnpm vendor-sync:apply` mutate the live DB.
  Don't run apply casually while developing.
- **Stop the servers:** `Ctrl+C` in each terminal.

See `CLAUDE.md` (root) and `storefront/CLAUDE.md` for the deeper architecture notes.
