# Vendor-sync productionization (async + scale) — Design

> Status: **in-progress** (spec). Session = Cluster C / epic **G1**.
> Covers **WB-011, WB-012, WB-013, WB-014, WB-015, WB-017, WB-018, WB-037**.
> Governing dashboard: [docs/STATUS.md](../../STATUS.md) · Backlog: [docs/future/BACKLOG.md](../../future/BACKLOG.md)
> Living ref: [reference/vendor-sync-implementation.md](../../reference/vendor-sync-implementation.md)

## 1. Context

The vendor-sync pipeline is **live** (prod cutover 2026-07-03, tires; 2026-06-27, wheels — both clean).
It is a Medusa business module with a thin imperative service (`fetch → stage → diff → apply`),
already **idempotent and restart-tolerant** by design: content-hash / RunDate short-circuits, an
in-progress guard per vendor, re-diff/re-apply of failed groups (WB-016), and a `vendor-sync-cleanup.ts`
recovery script for a run left stuck by a process death.

The eight open G1 items are **robustness / scale** hardening — none is customer-visible. They fall into
three themes, all sharing one migration.

### Current-state facts (grounded)

| Fact | Evidence |
|---|---|
| One Railway service, `WORKER_MODE` unset → `shared` (HTTP + jobs in one process). No worker split today. | [backend/railway.json](../../../backend/railway.json), [medusa-config.js:93](../../../backend/medusa-config.js#L93) |
| Redis **is** provisioned in prod → Medusa Workflow Engine is Redis-backed. | [medusa-config.js:137-152](../../../backend/medusa-config.js#L137) |
| `POST /runs`, `/approve`, `/replay`, `/skus/:pn/replay` all `await` the **entire** pipeline in-request, holding `req.scope`. | [runs/route.ts:64](../../../backend/src/api/admin/vendor-sync/runs/route.ts#L64), approve:28, replay:26 |
| `applyConcurrency: 8` is parsed + passed as a module option but **never read** — apply runs three fully-sequential `for` loops. | [medusa-config.js:199](../../../backend/medusa-config.js#L199), [apply.ts:162-217](../../../backend/src/modules/vendor-sync/pipeline/apply.ts#L162) |
| CSV parse does `fs.readFileSync` + synchronous `papa.parse`, then yields. | [parse.ts:18-24](../../../backend/src/modules/vendor-sync/adapters/wheelpros-wheels/parse.ts#L18) |
| Feed archive writes to local `static/vendor-feeds/` (ephemeral on Railway); `archiveBucket` option unused. | [utils/archive.ts:12-39](../../../backend/src/modules/vendor-sync/utils/archive.ts#L12) |
| Cancel is an in-memory `Set<string>` (per-process); cancel route also force-flips status to `cancelled`. | [service.ts:62](../../../backend/src/modules/vendor-sync/service.ts#L62), [cancel/route.ts:37-43](../../../backend/src/api/admin/vendor-sync/runs/[id]/cancel/route.ts#L37) |
| Stock only refreshes inside the full 12h diff-apply; `applyStockLevels` is already an independent inventory-only pass. | [vendor-sync-tick.ts:33](../../../backend/src/jobs/vendor-sync-tick.ts#L33), [apply-stock.ts:119](../../../backend/src/modules/vendor-sync/pipeline/apply-stock.ts#L119) |

## 2. Goals / non-goals

**Goals**
- Admin trigger endpoints (`/runs`, `/approve`, `/replay`, `/skus/:pn/replay`) return a run id in **< 1s**; the heavy work proceeds off-request.
- Cancel works **across processes and survives a restart** (DB-backed), and no longer races the pipeline into overwriting a cancelled status.
- The apply loop honors `applyConcurrency` (parallel group application) without data races.
- CSV ingest is **streaming** — no full-file-in-memory, first record available before EOF.
- Feed archives are **durable** (survive redeploy) — opt-in on a private bucket, never leaking cost data to a public one.
- A **stock-only fast path** refreshes inventory more frequently than the 12h full sync.

**Non-goals (explicitly out of scope)**
- No rewrite to the Medusa Workflow Engine (durable step-decomposed workflow). Chosen: *lightweight async* — see §3.
- No separate Railway worker service. Design must be correct under `shared` mode, and *also* correct if a worker split is added later (that is what DB-backed cancel buys us).
- No change to *what* the pipeline writes to Medusa (products / variants / prices / inventory). Behavior-neutral except execution timing.
- Pricing (WB-024) and de-hardcode (WB-025/026) are deferred — separate session.

## 3. Chosen approach — lightweight async + DB-backed control

Keep the existing imperative pipeline. Make three surgical changes:
1. **Endpoints return immediately** by creating the run row synchronously and scheduling the heavy body off-tick on the **app container** (not the request scope).
2. **Cancel becomes a DB column** the pipeline polls at phase/group boundaries.
3. **Concurrency + streaming + durability** are localized, additive changes to the apply loop, the CSV parser, and the archiver.

**Why not the Workflow Engine:** the pipeline is live and already idempotent/restart-tolerant; a durable-workflow rewrite is a large blast radius against a just-cutover system for correctness we can otherwise obtain from a DB flag + the existing recovery script. (User decision, 2026-07-05.)

**The central gotcha this approach must respect — container lifetime.** `req.scope` is a request-scoped
container disposed once the response is sent. A fire-and-forget that keeps `req.scope` would break
mid-run. The cron already avoids this by passing the **app** `MedusaContainer`. Therefore all
off-request execution resolves the app container (`service.container_`, injected at construction),
never `req.scope`.

## 4. Shared migration

One hand-authored, reversible migration adds two columns to `vendor_feed_run` (+ regenerate the tracked
`.snapshot-vendor-sync-module.json`):

| Column | Type | Purpose | Item |
|---|---|---|---|
| `cancel_requested_at` | `timestamptz` nullable | DB-backed cancel signal the pipeline polls. | WB-037 |
| `mode` | `text` default `'full'` | `'full'` vs `'stock'` — stock-only runs show distinctly in the admin console + list filter. | WB-018 |

Model edit: [models/vendor-feed-run.ts](../../../backend/src/modules/vendor-sync/models/vendor-feed-run.ts) (`model.dateTime().nullable()`, `model.text().default("full")`).

## 5. SP-C1 · Off-request execution + worker-safe cancel (WB-011/012/013/037)

### 5.1 Enqueue split (WB-011/012/013)

Refactor `VendorSyncService.run()` into a start/execute pair so an id can be returned before the heavy work:

- **`startRun(vendorCode) → { runId } | { inProgress: run }`** — the in-progress guard + create the run row (`status:'fetching'`, `mode:'full'`). Synchronous, fast.
- **`executeRun(runId, vendorCode, opts)`** — the existing steps 3–10 body (feed resolve → fetch → RunDate short-circuit → stage → diff → threshold → apply → finalize), assuming the row already exists. Resolves the app container.
- **`enqueueRun(vendorCode, opts) → { runId }`** — `startRun`, then `setImmediate(() => this.executeRun(runId, …).catch(logTerminalFailure))`, return `{ runId }`.
- **`run(vendorCode, opts)`** (existing signature, **blocking**) — `startRun` then `await executeRun(...)`. The cron keeps calling this (unchanged serial-completion behavior).

Endpoint changes (all resolve the app container for the background call, keep a fast pre-check for the 4xx):
- `POST /runs` → `enqueueRun` → **201 `{ run_id }`** (< 1s). Keep the existing 409 in-progress pre-check.
- `POST /runs/:id/approve` → validate `awaiting_approval`, set `status:'applying'`, schedule `approveAndApply(id, actor, appContainer)` off-tick → **202 `{ run }`**.
- `POST /runs/:id/replay` → validate `completed|failed`, schedule `replayRun(id, appContainer)` → **202 `{ run }`**.
- `POST /skus/:partNumber/replay` → schedule `replaySku(...)` off-tick → **202**.

`approveAndApply` / `replayRun` / `replaySku` already contain their own try/catch + `finalizeApply`; they only need to (a) accept the app container and (b) be invoked without `await` from the route. Their internals are unchanged.

### 5.2 DB-backed, race-free cancel (WB-037)

- `markCancelled(runId)` → **persist** `cancel_requested_at = now()` (drop the in-memory `Set`; a same-process Set is redundant once the flag is in the DB).
- `isCancelled(runId)` → read the run row's `cancel_requested_at != null`. The apply loop's `checkCancelled()` calls this between groups (a ~1ms SELECT; negligible vs ~seconds/group). Under concurrency (§6.1) it gates **scheduling** of each group task; in-flight tasks finish.
- **Earlier observation:** `executeRun` also checks the flag at each phase boundary (after fetch, stage, diff) so a cancel during a pre-apply phase is honored promptly instead of only once apply starts.
- **Status ownership (fixes the existing race).** The cancel route no longer force-flips a *running* run:
  - If `status === 'awaiting_approval'` (paused, nothing executing) → set `cancel_requested_at` **and** `status:'cancelled'`, `finished_at` immediately.
  - If `status ∈ {fetching, staging, diffing, applying}` (executing) → set only `cancel_requested_at`; the running `executeRun` observes it at the next boundary and finalizes to `cancelled` itself. This removes the "pipeline overwrites cancelled" race that today only works during `applying`.
- Terminal cleanup: no need to clear the column (a new run is a new row).

## 6. SP-C2 · Throughput + streaming ingest (WB-014/015)

### 6.1 Real apply concurrency (WB-014)

- Add a tiny internal `mapWithConcurrency<T,R>(items, limit, fn) → Promise<R[]>` (pure, unit-tested) — **not** a new `p-limit` dependency (`p-limit` v4+ is ESM-only; a ~15-line internal limiter avoids the pnpm/Windows ESM friction called out in CLAUDE.md).
- `applyChanges` reads the limit from `service` options (`applyConcurrency`, default 8) and runs **each phase's** groups (new, then changed, then discontinued) through the limiter, preserving per-group try/catch and the cancel gate (checked before scheduling each task). Phases stay ordered; only *within* a phase do groups run in parallel.
- **Brand-collection race — the one real hazard.** `getBrandCollectionId` ([apply.ts:802](../../../backend/src/modules/vendor-sync/pipeline/apply.ts#L802)) is a read-through cache: two parallel groups for the same brand both miss and both call `ensureBrandCollection` → double-create. **Fix: promise-memoize the cache** — change `brandCollectionCache` from `Map<string,string>` to `Map<string,Promise<string>>` and have `getBrandCollectionId` store/return the in-flight promise, so concurrent same-brand callers share one `ensureBrandCollection`. (Cleaner than pre-warming — needs no up-front staging read; the cache type change ripples only through `ApplyContext` at apply.ts:91,147.)
- The final stock pass (`applyStockLevels` over accumulated `stockPartNumbers`) is unchanged; array `push` from concurrent async tasks is safe (single-threaded event loop).

### 6.2 Streaming CSV parse (WB-015)

- Replace `readFileSync` + sync `papa.parse` with a streaming parser, **keeping the `async function*` signature identical** so `stage.ts` and everything downstream are untouched.
- **Backend: `csv-parse`** (mature, CJS, native async-iterable: `createReadStream(path).pipe(parse({ columns: true }))`) — chosen over bridging papaparse's `step` callback to an async iterator (awkward backpressure). Adds one well-known dependency.
- Preserve **warehouse-column detection** (`detectWarehouseColumns` — headers that are purely numeric) by reading the header record and computing the numeric-column set once, then attaching it to each yielded `ParsedRow` (same shape as today). Preserve the empty-`PartNumber` skip and the critical-vs-`FieldMismatch` error handling.
- Applies to **both** parse paths: `wheelpros-wheels/parse.ts` and the tire parse (`parse-helpers` / `tire-parse-helpers`). Shared parse machinery gets the streaming backend once.

## 7. SP-C3 · Durability + stock fast-path (WB-017/018)

### 7.1 Durable feed archive (WB-017)

- **Correctness constraint:** `descriptor.archiveKey` is currently reused as the **parse input path** (`parseWheelCsv(descriptor.archiveKey)` — [wheelpros-wheels/index.ts:46](../../../backend/src/modules/vendor-sync/adapters/wheelpros-wheels/index.ts#L46)), so it MUST stay a readable local path. The durable upload is therefore a **separate step in `executeRun`** (which holds the container) that runs after `fetchFeed`, uploads the local archive file via the File module, and writes the returned object-storage key to the `source_archive_key` **DB column** — overriding the local path there (the DB column is the durable pointer; the in-memory `descriptor.archiveKey` stays local for parsing).
- Upload the archived CSV via the Medusa **File module** (`Modules.FILE`, already registered — MinIO when configured, local otherwise).
- **Decision C — never leak cost data.** The default MinIO provider sets a **public-read** policy on its media bucket; vendor CSVs carry cost/pricing. So durable upload is **opt-in and explicit**: object-storage upload happens only when a dedicated `VENDOR_SYNC_FEED_ARCHIVE_BUCKET` is set **and** points at storage the operator has designated private — we treat that env as authoritative and do **not** programmatically verify the ACL (operator responsibility, documented in `.env.template`). When it is unset, keep the current local-disk archive (unchanged) rather than writing cost data to the public media bucket. Lowest-value of the 8 items — keep it minimal; the seam is [utils/archive.ts](../../../backend/src/modules/vendor-sync/utils/archive.ts) (called from the adapter `fetch()`), and archiving stays best-effort (never blocks the pipeline).

### 7.2 Stock-only fast path (WB-018)

Mostly **reuse** — `applyStockLevels` already refreshes inventory independent of the product diff.

- **`service.runStockOnly(vendorCode) → { runId }`** — `startRun` with `mode:'stock'`; resolve feed → fetch → `stageFeed` (writes `vendor_stock_staging` as today) → **skip diff + `applyChanges`** → `applyStockLevels(container, service, runId, vendorCode, partNumbers, salesChannelId, logger)` over the part numbers staged this run that have a `vendor_product_current` row. `computeStockChanges` already zeroes warehouses that dropped out. Finalize to `completed`.
- **Guard:** reuse the in-progress guard so a stock-only run is skipped while a `full` run is `applying` for that vendor (avoids concurrent inventory writes).
- **Cron `vendor-sync-stock-tick`** — schedule `0 */3 * * *` (env-overridable via `VENDOR_SYNC_STOCK_CRON`), iterates enabled vendors, calls `runStockOnly` in series with per-vendor try/catch. Mirrors [vendor-sync-tick.ts](../../../backend/src/jobs/vendor-sync-tick.ts).
- Stock-only runs are `mode:'stock'` rows → visible + filterable in the admin console (WB-006) with no console change required beyond the existing status rendering.

## 8. New / changed files

| Path | Change |
|---|---|
| `models/vendor-feed-run.ts` | +`cancel_requested_at`, +`mode` |
| `migrations/Migration20260705______.ts` | new columns (reversible) |
| `service.ts` | `startRun`/`executeRun`/`enqueueRun` split; DB-backed `markCancelled`/`isCancelled`; `runStockOnly`; app-container for background exec |
| `api/admin/vendor-sync/runs/route.ts` | POST → `enqueueRun`, 201 fast |
| `api/admin/vendor-sync/runs/[id]/approve/route.ts` | schedule off-tick, 202 |
| `api/admin/vendor-sync/runs/[id]/replay/route.ts` | schedule off-tick, 202 |
| `api/admin/vendor-sync/skus/[partNumber]/replay/route.ts` | schedule off-tick, 202 |
| `api/admin/vendor-sync/runs/[id]/cancel/route.ts` | set `cancel_requested_at`; only force-`cancelled` when `awaiting_approval` |
| `pipeline/apply.ts` | `mapWithConcurrency` per phase; `prewarmBrandCollections`; cancel via DB flag |
| `pipeline/concurrency.ts` (new) | pure `mapWithConcurrency` |
| `adapters/.../parse.ts` + shared parse helpers | streaming `csv-parse` backend, same generator signature |
| `utils/archive.ts` | durable upload via File module when a private `archiveBucket` is configured |
| `jobs/vendor-sync-stock-tick.ts` (new) | stock-only cron |
| `__tests__/` | unit tests for the pure seams (below) |

## 9. Testing

- **Unit (pure seams):** `mapWithConcurrency` (respects limit, preserves order, one task's throw doesn't sink the batch); streaming parser yields the first record before EOF + preserves warehouse-column detection + skips empty `PartNumber`; `runStockOnly` part-number selection; cancel-gate logic (given `cancel_requested_at`, no further groups scheduled).
- **Existing suites stay green:** `pnpm test:sync` (+ `test:admin`, `test:fitment`).
- **Live / manual (the inherently-integration bits):** trigger `POST /runs` on a large feed → run id returned < 1s, status transitions asynchronously; cancel mid-apply → stops between groups, ends `cancelled`, no status overwrite; `vendor-sync-stock-tick` updates inventory levels without creating/modifying products; durable archive appears in the private bucket and survives a redeploy.

## 10. Deploy / rollout

- Migration runs on `db:migrate` (init-backend). Backend-only — no storefront rebuild.
- `vendor-sync-stock-tick` auto-registers on deploy.
- No new **required** env. Optional: `VENDOR_SYNC_STOCK_CRON`, a private `VENDOR_SYNC_FEED_ARCHIVE_BUCKET`. `applyConcurrency` (`VENDOR_SYNC_APPLY_CONCURRENCY`, default 8) becomes load-bearing — validate a sane default before first prod apply.
- Rollout order suggestion: ship + migrate → verify a manual `POST /runs` returns fast and a normal full run still applies identically → enable the stock cron.

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Background exec holds a disposed `req.scope`. | Resolve the **app container** for all off-request execution (§3). |
| Parallel apply double-creates a brand collection. | Serial **pre-warm** of distinct brands before the parallel phase (§6.1). |
| Fire-and-forget dies mid-run → row stuck `applying`. | Pre-existing; covered by `vendor-sync-cleanup.ts` + the WB-016 re-diff/retry. Unchanged. |
| Durable archive leaks cost data to a public bucket. | Opt-in on a **private** bucket only; local fallback otherwise (§7.1). |
| Concurrency overwhelms the Meili indexing subscriber. | Default `applyConcurrency=8`; it's a tunable env; validate under a real feed before raising. |
| `csv-parse` behavioral diff vs papaparse (quoting/edge rows). | Keep the same generator contract; assert against the existing `__fixtures__` CSVs in unit tests. |

## 12. Decisions resolved

- **Execution model:** lightweight async + DB flags (not Workflow Engine). — user, 2026-07-05.
- **Scope:** all of Cluster C (C1+C2+C3) in one session. — user, 2026-07-05.
- **A:** pre-warm brand collections before parallel apply. — recommended, approved.
- **B:** `csv-parse` as the streaming backend. — recommended, approved.
- **C:** durable archive opt-in on a private bucket, local fallback otherwise. — recommended, approved.
