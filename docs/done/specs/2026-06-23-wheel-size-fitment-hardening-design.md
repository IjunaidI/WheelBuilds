# Wheel-size fitment hardening — Design (WB-007/008/019/020/043)

> Status: design · Branch: `feat/wheel-size-fitment-hardening` · Date: 2026-06-23
> Backlog: [WB-007](../../future/BACKLOG.md), WB-008, WB-019, WB-020, WB-043

## Problem

Five related gaps in the `wheel-size` fitment module (the wheel-size.com cache + lookup that powers
the `?fit=` filter, the PDP "confirmed models" list, and the YMM dropdowns):

- **WB-007 [HIGH]** — `hub_bore_mm` is an INTEGER column ([Migration20260601111311.ts:13](../../../backend/src/modules/wheel-size/migrations/Migration20260601111311.ts)); fractional bores (67.1) truncate to 67 on insert. The reverse-fitment bore gate then compares wheel bore against a wrong integer (the permissiveness flagged during WB-009).
- **WB-008 [HIGH]** — fitment cache entries never expire ([service.ts:52-83](../../../backend/src/modules/wheel-size/service.ts)); no TTL, no staleness check, no refresh job. Bad/empty early fetches persist forever.
- **WB-019 [MEDIUM]** — on a cache miss the live API call blocks the request ([service.ts:64](../../../backend/src/modules/wheel-size/service.ts)); a slow or down wheel-size API stalls fitment-dependent requests indefinitely.
- **WB-020 [MEDIUM]** — the daily quota counter is a read-then-write ([service.ts:38-46](../../../backend/src/modules/wheel-size/service.ts)); concurrent requests race and can exceed the ceiling.
- **WB-043 [LOW]** — no test proves the storefront YMM dropdown slugs actually resolve against the live `by_model` endpoint.

## Decisions (locked in brainstorming, 2026-06-23)

1. **Read/refresh → bounded-block + stale-while-revalidate.** True miss blocks but with a hard client
   timeout; stale entries serve instantly and refresh in the background; a warm cron keeps the cache
   fresh. No queue/worker infra.
2. **Bore storage → scaled integer ×100.** Keep `model.number()` (→ integer, so **zero** module-
   snapshot drift — the repo tracks snapshots to gate `db:generate`); store hundredths of a mm; mirror
   the existing dollars/cents convention. Rejected: a `numeric` raw-ALTER (model stays integer →
   permanent snapshot drift) and a text column (number-as-text smell, no SQL-numeric semantics).

## Approach

Everything is contained to `backend/src/modules/wheel-size/` + one cron + config. The fitment cache
becomes **time-aware**, the read path **never hangs** and **never blocks on refresh**, the quota
counter is **atomic**, bore values stop **truncating**, and the **warm cron** keeps the cache fresh —
which also self-heals the old truncated bore values over time. A new pure `staleness.ts` isolates the
TTL logic so it is unit-testable without a DB. The `VehicleFitment` read contract (`hubBoreMm` in mm,
`{ fitment }` envelope) is unchanged, so the storefront needs no changes.

## Changes

### 1. WB-007 — fractional bore via scaled integer (`×100`)

- [wheel-size-fitment.ts](../../../backend/src/modules/wheel-size/models/wheel-size-fitment.ts): rename
  field `hub_bore_mm` → `hub_bore_mm_x100` (`model.number()`, integer, nullable).
- New hand-authored migration (data-preserving — the repo hand-authors wheel-size migrations because
  `db:generate` emits a drop-everything diff): `ALTER TABLE "wheel_size_fitment" RENAME COLUMN
  "hub_bore_mm" TO "hub_bore_mm_x100"; UPDATE "wheel_size_fitment" SET "hub_bore_mm_x100" =
  "hub_bore_mm_x100" * 100 WHERE "hub_bore_mm_x100" IS NOT NULL;`. Old truncated `67` → `6700` (=67.0mm
  approximate carryover); the warm cron later corrects it to the exact value on refresh. The module
  snapshot (`.snapshot-wheel-size-module.json`) is updated to the renamed field.
- [service.ts](../../../backend/src/modules/wheel-size/service.ts) `getFitment`:
  - write: `hub_bore_mm_x100: fitment.hubBoreMm == null ? null : Math.round(fitment.hubBoreMm * 100)`.
  - read (cache hit): `hubBoreMm: c.hub_bore_mm_x100 == null ? null : c.hub_bore_mm_x100 / 100`.
- [reverse-fitment.ts](../../../backend/src/modules/wheel-size/reverse-fitment.ts): read the renamed
  column and divide by 100 for the bore-clearance gate.
- `normalize.ts` is unchanged — it already produces a fractional `hubBoreMm`.

### 2. WB-008 + WB-019 — TTL, stale-while-revalidate, timeout, warm cron

- New pure `staleness.ts`: `isStale(fetchedAt: Date | string, ttlDays: number, now: Date): boolean`.
  Pure (now injected) so it is unit-testable. Default `ttlDays = 90` (a Y/M/M's fitment is near-static;
  TTL mainly re-corrects bad/empty earlier fetches), configurable via `WHEEL_SIZE_TTL_DAYS`.
- `getFitment` read path:
  - **fresh hit** (`!isStale`) → serve from cache, no API call (unchanged behavior).
  - **stale hit** → serve the cached value **immediately**, then fire a background refresh that is NOT
    awaited: `void this.refreshFitment(p).catch((e) => this.logger_.warn(...))`.
  - **true miss** → fetch and block (covered by the YMM spinner), bounded by the client timeout below.
- `refreshFitment(p)`: re-runs `resolveByModel` + **upserts** the existing cache row (update
  raw/windows/bore/status/`fetched_at` by `cache_key`, insert if absent). The current `getFitment`
  create-only write is refactored into this upsert so both the miss and stale paths share it.
- **WB-019 timeout:** [client.ts](../../../backend/src/modules/wheel-size/client.ts) — every fetch
  (`byModel`, `makes`, `models`, `years`, `modifications`) gets an `AbortController` with a timeout
  (default 5000ms, `WHEEL_SIZE_TIMEOUT_MS`). On abort the call resolves to a non-2xx / throws, which
  `resolveByModel` already maps to `QuotaOutageError` → the route's existing 503 "fitment unavailable".
- **Warm cron** `src/jobs/wheel-size-warm.ts` (schedule `0 3 * * *`): resolve the module via
  `resolveOptional` (no-op if not loaded); list fitments whose `fetched_at` `isStale`, oldest first, up
  to `warmBatchSize` (default 200, `WHEEL_SIZE_WARM_BATCH`); call `refreshFitment` for each, stopping
  early when the atomic quota check fails. 200 entries × ≤3 calls ≪ the 5000 ceiling. Mirrors the
  [vendor-sync-tick.ts](../../../backend/src/jobs/vendor-sync-tick.ts) cron shape (`default export` +
  `export const config = { name, schedule }`).

### 3. WB-020 — atomic quota counter

Replace the read-then-write in `incrementAndCheckQuota` with a single atomic upsert-increment against
`wheel_size_quota`, executed through the module's MikroORM manager (raw `execute`):

```sql
INSERT INTO wheel_size_quota (id, day, count, created_at, updated_at)
VALUES (:id, :day, 1, now(), now())
ON CONFLICT (day) WHERE deleted_at IS NULL
DO UPDATE SET count = wheel_size_quota.count + 1, updated_at = now()
RETURNING count
```

`:id` is a generated Medusa-style id (e.g. `'wsq_' || replace(gen_random_uuid()::text,'-','')`). The
returned `count` is compared to `this.ceiling_` — no concurrent over-count. The `ON CONFLICT (day)
WHERE deleted_at IS NULL` targets the existing partial unique index
`IDX_wheel_size_quota_day_unique`. (The exact manager accessor — `@InjectManager()` + `@MedusaContext()`
`ctx.manager.execute` vs the module connection — is pinned in the plan via a short spike; the SQL and
behavior are fixed here.)

### 4. WB-043 — gated live-slug verification test

`__tests__/live-slug.test.ts`, gated `describe.skip` unless `RUN_WHEEL_SIZE_LIVE === "true"` (mirrors
the vendor-sync `RUN_INTEGRATION` pattern). It constructs a `WheelSizeClient` with the real
`WHEEL_SIZE_API_KEY` from env, calls `byModel` for a known make/model/year, and asserts a 200 with a
usable bolt pattern (`technical.stud_holes` + `technical.pcd` numeric). Default `pnpm test:fitment`
stays fully offline; the run command is documented in the test header.

## Config / rollout

- New options threaded [constants.ts](../../../backend/src/lib/constants.ts) → [medusa-config.js](../../../backend/medusa-config.js)
  → the wheel-size module `options`: `ttlDays` (`WHEEL_SIZE_TTL_DAYS`, default 90), `requestTimeoutMs`
  (`WHEEL_SIZE_TIMEOUT_MS`, default 5000), `warmBatchSize` (`WHEEL_SIZE_WARM_BATCH`, default 200). Added
  to `.env.template`. All have safe defaults, so no env change is required to deploy.
- One migration (the bore rename + ×100 scale). Non-destructive; the existing cache keeps working and
  self-corrects over time via TTL/warm. No catalog or storefront migration.

## Testing

- `staleness.test.ts` (pure): fresh / stale / exactly-at-TTL boundary; string and Date `fetched_at`.
- `service.test.ts` additions: a stale cache row returns the cached value synchronously AND triggers a
  (mock-observed) background refresh; a fresh row makes no API call; bore round-trips fractional
  (`67.1` → stored `6710` → read `67.1`).
- `client.test.ts` addition: a fetch exceeding the timeout aborts and is surfaced as a non-2xx/outage.
- Quota: assert the atomic upsert SQL is issued with the right day/ceiling comparison (atomicity itself
  is a DB guarantee; an optional concurrency smoke is noted, not automated).
- `live-slug.test.ts` (gated, offline by default).
- Run: `pnpm test:fitment` (offline, green) and `RUN_WHEEL_SIZE_LIVE=true WHEEL_SIZE_API_KEY=… pnpm test:fitment` (live slug check).

## Verification (acceptance)

A vehicle with a fractional hub bore round-trips the exact decimal from cache; a cache entry older than
the TTL serves instantly and is refreshed in the background (and by the warm cron); a slow/unreachable
wheel-size API returns 503 within the timeout instead of hanging; the quota counter never exceeds the
ceiling under concurrency; and the gated live-slug test confirms a real YMM slug resolves to fitment.

## Out of scope

- A queue/worker for fully-async miss handling (WB-011/012/013 queue epic) — we chose bounded-block.
- Storefront changes — the `{ fitment }` envelope and `hubBoreMm`-in-mm contract are unchanged.
- Backfilling/re-warming the entire cache eagerly — the warm cron converges it over its normal cadence.
