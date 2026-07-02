# Tire store — prod cutover runbook (WB-005)

> Date: 2026-07-02. The tire store is CODE-COMPLETE (SP1 backend + SP2 discovery + SP3 PDP, all merged to
> `main`, unpushed). This is the single remaining step to make it LIVE. It is a deploy operation against the
> Railway prod stack — run it on Railway, not locally. After it succeeds, flip WB-005 → `done`.

## What this activates

Pushing + deploying `main` (34 commits ahead of `origin/main`) carries the **whole tire store** and any other
accumulated unpushed work. Specifically for tires:
- **Backend (SP1):** the tire grouping + `buildTireDocument` + the Meili `products` index tire facets
  (`medusa-config.js`) — the facet settings are pushed by the Meilisearch plugin **on backend boot**, so a
  restart is required (a redeploy restarts).
- **Storefront (SP2+SP3):** the `/tires` route, the `Tires` nav links, and the tire PDP branch are **build-time**
  — a storefront rebuild (redeploy) is required. No new `NEXT_PUBLIC_*` env vars (tire discovery reuses the
  existing `NEXT_PUBLIC_SEARCH_*` / `NEXT_PUBLIC_INDEX_NAME`).
- **Pending DB migrations** in the unpushed range run automatically on deploy via `init-backend` (`pnpm start`
  = `init-backend && medusa start`). No tire migration exists (tires reuse existing tables), but other queued
  migrations (e.g. the newsletter table, wheel-size bore rename) apply here if they haven't already.

## Pre-requisite — the ONE thing to confirm on Railway (backend service env)

The tire vendor adapter only fetches a real feed when these are set on the **backend** Railway service:
- `VENDOR_WHEELPROS_TIRES_ENABLED=true`
- The tire feed source — either the SFTP creds
  `VENDOR_WHEELPROS_TIRE_SFTP_HOST` / `_PORT` / `_USER` / `_PASSWORD` (or `_PRIVATE_KEY`) / `_SFTP_DIR` /
  `_SFTP_PATTERN` (mirrors the wheel SFTP config, pointed at the vendor's TIRE feed path), OR a
  `VENDOR_WHEELPROS_TIRE_FEED_PATH` to a real tire CSV.

> If the tire SFTP creds are NOT set, the fail-loud feed guard (WB-041) will refuse to sync the bundled sample
> as the live catalog — which is correct. Set the tire SFTP config before running the apply.
> (`VENDOR_WHEELPROS_TIRES_ENABLED=true` in `storefront/.env` is a no-op — the storefront doesn't read it; only
> the backend env matters.)

## Step 1 — Deploy the code (push → Railway redeploys both services)

```bash
# from repo root, on main
git push origin main
```

Railway auto-deploys the **backend** and **storefront** services from `main`. Wait for BOTH to go green:
- Backend: `init-backend` runs pending migrations, then boots → the Meili plugin pushes the new `products` index
  settings (tire facets) on startup.
- Storefront: `next build` produces the `/tires` route + tire PDP + nav links.

(If Railway is set to deploy only on push, this one push does it. If a service needs a manual redeploy/restart,
trigger it from the Railway dashboard so the backend re-pushes Meili settings and the storefront rebuilds.)

## Step 2 — Apply the tire feed (on Railway backend — creates the tire products + indexes them)

No purge is needed: tires have never been applied to prod, so there are no existing tire products; the diff
classifies every tire group as **new** and creates it. Wheels are untouched (tires land in the Tires category).

**Option A — one call via the admin console / API (recommended, runs the full pipeline incl. apply):**
- In the Medusa admin (`/app`) → **Vendor Sync** → trigger a run for `wheelpros-tires`, then approve if it
  parks at `awaiting_approval` (a fresh import with nothing to discontinue should apply directly).
- Or the API equivalent (admin-authed): `POST /admin/vendor-sync/runs` with body
  `{ "vendor_code": "wheelpros-tires", "dry_run": false }`.

**Option B — the CLI two-step, in the Railway backend service shell:**
```bash
# 1. dry-run: fetch + stage + diff, no mutations. Note the run id + grouped counts in the summary.
pnpm vendor-sync:dry-run wheelpros-tires

# 2. apply that run: creates grouped tire products + per-warehouse inventory + Meili tire docs.
pnpm vendor-sync:apply <run-id-from-step-1>
```

> Run this on Railway, NOT locally. Local `backend/.env` has `VENDOR_SYNC_DEV_MAX_ROWS=1000` (truncates the feed)
> and points at the prod DB — a local run would import a truncated catalog. The dry-run summary doubles as SP1's
> deferred integration proof: confirm it reports grouped tire products (multiple sizes collapsing into one
> Brand+model product) and `0 errors`.

## Step 3 — Verify live

- **Discovery:** `/<countryCode>/tires` renders a faceted tire catalog (Brand / Rim / Size / Tire type / Speed /
  Load / Price), and the `Tires` nav link appears.
- **PDP:** a tire card → `/products/<handle>` shows the tire detail — rim-diameter chips gate a size list, the
  price/stock are live, and Add to cart works.
- **Index:** Meilisearch has `product_type = "tire"` documents with the tire facet fields populated.
- **Wheels unaffected:** `/store` + wheel PDPs unchanged.

## Step 4 — Close out

- Flip **WB-005 → `done`** in `docs/future/BACKLOG.md`; update `docs/STATUS.md` (Vendor import / Discovery / PDP
  pillars → tires LIVE) + "Last verified".
- Move the three tire specs/plans from `docs/in-progress/` → `docs/done/`.
- Optional cutover-polish (both deferred, non-blocking): the tire PDP add-to-cart toast names the size not the
  model; a tire construction code→label map (`R`→Radial).

## Rollback / safety

- The apply is additive (new tire products in the Tires category); it does not touch wheel products. If a tire
  run misbehaves, the ops tooling handles it: `medusa exec ./src/scripts/vendor-sync-cleanup.ts` releases a stuck
  in-progress run; the `purge-products` admin route (scoped) + `vendor-sync-truncate-state.ts` can reset tire
  state to re-import (the WB-059/WB-051 reset dance) — but this should not be needed for a clean first import.
