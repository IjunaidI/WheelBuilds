# Vendor-sync productionization (async + scale) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the vendor-sync pipeline production-grade at scale — admin triggers return immediately, cancel is worker-safe, the apply loop is concurrent, CSV ingest streams, feed archives are durable, and inventory has a fast refresh path — without changing what gets written to Medusa.

**Architecture:** Lightweight async over the existing imperative pipeline. Endpoints create the run row synchronously and schedule the heavy body off-tick on the **app container** (never `req.scope`). Cancel becomes a DB column the pipeline polls at phase/group boundaries. Concurrency, streaming, and durability are localized additive changes. No Medusa Workflow Engine rewrite.

> **Corrected 2026-07-06 — Tasks 5 & 6 off-request mechanism superseded.** The `enqueueRun`/`enqueueApprove`/`enqueueReplay`/`enqueueReplaySku` + `setImmediate(this.container_)` design coded in Tasks 5–6 was replaced after the final whole-branch review: `this.container_` is the module cradle and **cannot resolve core modules**, so a `setImmediate` background apply fails at bootstrap. The shipped implementation (commit `c0acacd`) removes the `enqueue*` methods and instead has each route **emit a `vendor-sync.*` event** (via `req.scope.resolve(Modules.EVENT_BUS)`) that the subscriber `src/subscribers/vendor-sync-run.ts` runs off-request on its **global** container. `startRun`/`executeRun` and the blocking cron `run()` are unchanged. Read Tasks 5–6 for the intent (return 201/202 immediately, run off-request); the event→subscriber hand-off is the accurate mechanism.

**Tech Stack:** MedusaJS 2.13.6 (TypeScript, MikroORM models + migrations, core-flows), Jest + @swc/jest, `csv-parse` (new dep) for streaming, Redis-backed workflow engine already provisioned.

**Spec:** [docs/in-progress/specs/2026-07-05-vendor-sync-productionization-design.md](../specs/2026-07-05-vendor-sync-productionization-design.md)

## Global Constraints

- **Backend typechecks at build** (`medusa build` fails on TS errors — this is a real gate, unlike the storefront). Every task that touches non-test code must end green on `medusa build` OR at minimum `pnpm exec tsc --noEmit`.
- **pnpm may not be on PATH (Windows).** Use `npx -y pnpm@9.10.0 <cmd>` for one-offs, or the Medusa CLI directly at `backend/node_modules/.bin/medusa.CMD`. Run all commands from `backend/`.
- **`MedusaService` update/create takes a single object**, not `(selector, update)`: `service.updateVendorFeedRuns({ id, ...fields })`. The two-arg form silently fails to persist in 2.13.6.
- **`.medusa/server` is a stale-config trap** — after editing `medusa-config.js` or models, `rm -rf backend/.medusa/server` before restarting.
- **Behavior-neutral to Medusa writes.** Do not change product/variant/price/inventory outputs. Only execution timing, concurrency, ingest, archiving, and the new stock path.
- **No new `p-limit` dependency** (ESM-only friction) — use the internal `mapWithConcurrency` from Task 2.
- **Never write vendor cost CSVs to a public bucket** — durable archive is explicit opt-in (Task 8).
- **Tests:** pure helpers are TDD'd with Jest under `src/modules/vendor-sync/__tests__/`; run with `pnpm test:sync` (`jest --passWithNoTests src/modules/vendor-sync`). DB/route/cron tasks are gated by `medusa build` + the described manual smoke (there is no route/DB test harness in this repo).
- **Docs workflow:** flip touched `WB-NNN` in [docs/future/BACKLOG.md](../../future/BACKLOG.md), bump [docs/STATUS.md](../../STATUS.md) "Last verified", move spec+plan `in-progress → done` on merge, run `/doc-review` (Task 10).

---

## File Structure

| File | Responsibility |
|---|---|
| `models/vendor-feed-run.ts` (modify) | +`cancel_requested_at`, +`mode` columns |
| `migrations/Migration2026070*.ts` (create) | add the two columns (generated) |
| `pipeline/concurrency.ts` (create) | pure `mapWithConcurrency` |
| `adapters/csv-stream.ts` (create) | pure `detectWarehouseColumns` + streaming `streamCsvRows` |
| `adapters/wheelpros-wheels/parse.ts` + `adapters/wheelpros-tires/parse.ts` (modify) | delegate to `streamCsvRows`, keep exports |
| `service.ts` (modify) | `startRun`/`executeRun`/`enqueueRun`/`enqueueApprove`/`enqueueReplay`/`enqueueReplaySku`/`runStockOnly`; DB-backed cancel; app-container exec; `getApplyConcurrency` |
| `pipeline/apply.ts` (modify) | concurrent phases via `mapWithConcurrency`; promise-memoized brand cache; async cancel gate |
| `pipeline/finalize-apply.ts` (modify) | own the `cancelled` status transition |
| `pipeline/stock-select.ts` (create) | pure `selectStockPartNumbers` |
| `utils/archive.ts` (modify) + `utils/archive-policy.ts` (create) | durable upload (private-bucket opt-in) + pure `shouldUploadArchive` |
| `api/admin/vendor-sync/runs/route.ts` + `.../[id]/approve` + `.../[id]/replay` + `.../[id]/cancel` + `.../skus/[partNumber]/replay` (modify) | return fast (201/202); DB cancel |
| `jobs/vendor-sync-stock-tick.ts` (create) | stock-only cron |
| `medusa-config.js` (modify) | `durableArchive` option; (stock cron reads env in the job) |

---

## Task 1: Migration — `cancel_requested_at` + `mode` on `vendor_feed_run`

**Files:**
- Modify: `backend/src/modules/vendor-sync/models/vendor-feed-run.ts`
- Create: `backend/src/modules/vendor-sync/migrations/Migration2026070*.ts` (generated)
- Modify (generated): `backend/src/modules/vendor-sync/migrations/.snapshot-vendor-sync-module.json`

**Interfaces:**
- Produces: `vendor_feed_run.cancel_requested_at` (nullable timestamptz), `vendor_feed_run.mode` (text, default `'full'`).

- [ ] **Step 1: Add the two columns to the model**

In `models/vendor-feed-run.ts`, add inside `model.define(...)` (after `apply_attempt_count`):

```ts
  apply_attempt_count: model.number().default(0),
  cancel_requested_at: model.dateTime().nullable(),
  mode: model.text().default("full"),
  started_at: model.dateTime(),
```

- [ ] **Step 2: Generate the migration + snapshot**

Run (from `backend/`):
```bash
npx -y pnpm@9.10.0 exec medusa db:generate vendor-sync
```
Expected: a new `migrations/Migration2026070*.ts` is created and `.snapshot-vendor-sync-module.json` is updated to include the two columns. If `db:generate` requires a DB and none is reachable, hand-author the migration instead:

```ts
import { Migration } from "@mikro-orm/migrations"

export class Migration2026070XXXXXXX extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table if exists "vendor_feed_run" add column if not exists "cancel_requested_at" timestamptz null;')
    this.addSql('alter table if exists "vendor_feed_run" add column if not exists "mode" text not null default \'full\';')
  }
  async down(): Promise<void> {
    this.addSql('alter table if exists "vendor_feed_run" drop column if exists "cancel_requested_at";')
    this.addSql('alter table if exists "vendor_feed_run" drop column if exists "mode";')
  }
}
```
(If hand-authored, still re-run `db:generate` or hand-edit `.snapshot-vendor-sync-module.json` so drift detection stays clean.)

- [ ] **Step 3: Verify the module still builds**

Run: `npx -y pnpm@9.10.0 exec tsc --noEmit`
Expected: no new errors (baseline may include 1 pre-existing admin-route error — compare to `git stash` baseline if unsure).

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/vendor-sync/models/vendor-feed-run.ts backend/src/modules/vendor-sync/migrations/
git commit -m "feat(vendor-sync): add cancel_requested_at + mode columns (WB-037/018 foundation)"
```

---

## Task 2: `mapWithConcurrency` — pure bounded-concurrency helper (WB-014 core)

**Files:**
- Create: `backend/src/modules/vendor-sync/pipeline/concurrency.ts`
- Test: `backend/src/modules/vendor-sync/__tests__/concurrency.test.ts`

**Interfaces:**
- Produces:
```ts
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  shouldStop?: () => boolean | Promise<boolean>
): Promise<Array<R | undefined>>
```
Runs `fn` over `items` with at most `limit` concurrent; results are index-aligned; an item skipped because `shouldStop()` returned true is left `undefined`. Callers must catch their own errors inside `fn` (a throw rejects the batch).

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/concurrency.test.ts
import { mapWithConcurrency } from "../pipeline/concurrency"

const tick = () => new Promise((r) => setTimeout(r, 5))

describe("mapWithConcurrency", () => {
  it("processes every item and preserves index order", async () => {
    const out = await mapWithConcurrency([1, 2, 3, 4], 2, async (n) => n * 10)
    expect(out).toEqual([10, 20, 30, 40])
  })

  it("never exceeds the concurrency limit", async () => {
    let active = 0
    let peak = 0
    await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async () => {
      active++
      peak = Math.max(peak, active)
      await tick()
      active--
    })
    expect(peak).toBeLessThanOrEqual(2)
  })

  it("stops scheduling new items once shouldStop flips true", async () => {
    const seen: number[] = []
    let stop = false
    const out = await mapWithConcurrency(
      [1, 2, 3, 4, 5, 6],
      1,
      async (n) => {
        seen.push(n)
        if (n === 2) stop = true
        return n
      },
      () => stop
    )
    // items after the stop are never started
    expect(seen).toEqual([1, 2])
    expect(out[4]).toBeUndefined()
    expect(out[5]).toBeUndefined()
  })

  it("a caught-error fn keeps the batch going (caller catches)", async () => {
    const errors: number[] = []
    const out = await mapWithConcurrency([1, 2, 3], 2, async (n) => {
      try {
        if (n === 2) throw new Error("boom")
        return n
      } catch {
        errors.push(n)
        return undefined as any
      }
    })
    expect(errors).toEqual([2])
    expect(out[0]).toBe(1)
    expect(out[2]).toBe(3)
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx -y pnpm@9.10.0 exec jest src/modules/vendor-sync/__tests__/concurrency.test.ts`
Expected: FAIL — `Cannot find module '../pipeline/concurrency'`.

- [ ] **Step 3: Implement**

```ts
// pipeline/concurrency.ts
/**
 * Run `fn` over `items` with at most `limit` in flight. Results are
 * index-aligned; an item skipped because `shouldStop()` returned true is
 * left `undefined`. Callers must catch errors inside `fn` — an uncaught
 * throw rejects the returned promise.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  shouldStop?: () => boolean | Promise<boolean>
): Promise<Array<R | undefined>> {
  const n = items.length
  const results: Array<R | undefined> = new Array(n)
  const workers = Math.max(1, Math.min(Math.floor(limit) || 1, n || 1))
  let next = 0

  async function worker(): Promise<void> {
    while (true) {
      if (shouldStop && (await shouldStop())) return
      const i = next++
      if (i >= n) return
      results[i] = await fn(items[i], i)
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()))
  return results
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx -y pnpm@9.10.0 exec jest src/modules/vendor-sync/__tests__/concurrency.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/vendor-sync/pipeline/concurrency.ts backend/src/modules/vendor-sync/__tests__/concurrency.test.ts
git commit -m "feat(vendor-sync): add mapWithConcurrency pure helper (WB-014)"
```

---

## Task 3: Streaming CSV parse (WB-015)

**Files:**
- Create: `backend/src/modules/vendor-sync/adapters/csv-stream.ts`
- Modify: `backend/src/modules/vendor-sync/adapters/wheelpros-wheels/parse.ts`
- Modify: `backend/src/modules/vendor-sync/adapters/wheelpros-tires/parse.ts`
- Test: `backend/src/modules/vendor-sync/__tests__/csv-stream.test.ts`
- Modify: `backend/package.json` (add `csv-parse`)

**Interfaces:**
- Consumes: `ParsedRow` from `adapters/types.ts` (`{ partNumber: string; raw: Record<string,string>; warehouseColumns: string[] }`).
- Produces: `streamCsvRows(filePath: string): AsyncIterable<ParsedRow>` and `detectWarehouseColumns(headers: string[]): string[]`. `parseWheelCsv` / `parseTireCsv` keep their existing signatures (delegate).

- [ ] **Step 1: Add the dependency**

Run (from `backend/`): `npx -y pnpm@9.10.0 add csv-parse`
Expected: `csv-parse` appears in `package.json` dependencies; `pnpm-lock.yaml` updated.

- [ ] **Step 2: Write the failing test**

```ts
// __tests__/csv-stream.test.ts
import * as path from "path"
import { streamCsvRows, detectWarehouseColumns } from "../adapters/csv-stream"

const FIXTURE = path.resolve(__dirname, "../__fixtures__/wheels-small.csv")

describe("detectWarehouseColumns", () => {
  it("keeps purely-numeric headers only", () => {
    expect(detectWarehouseColumns(["Brand", "1014", "PartNumber", "37"])).toEqual(["1014", "37"])
  })
})

describe("streamCsvRows", () => {
  it("yields a row per non-empty PartNumber with detected warehouse columns", async () => {
    const rows: any[] = []
    for await (const r of streamCsvRows(FIXTURE)) rows.push(r)
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.partNumber).toBeTruthy()
      expect(Array.isArray(r.warehouseColumns)).toBe(true)
      expect(r.raw).toBeDefined()
    }
  })
})
```

(If the fixture's exact row count is known from the existing `wheel-parse.test.ts`, assert it for a stronger parity check.)

- [ ] **Step 3: Run it, verify it fails**

Run: `npx -y pnpm@9.10.0 exec jest src/modules/vendor-sync/__tests__/csv-stream.test.ts`
Expected: FAIL — `Cannot find module '../adapters/csv-stream'`.

- [ ] **Step 4: Implement the shared streamer**

```ts
// adapters/csv-stream.ts
import { createReadStream } from "fs"
import { parse } from "csv-parse"
import { ParsedRow } from "./types"

/** Any header whose name is purely numeric is a warehouse code. */
export function detectWarehouseColumns(headers: string[]): string[] {
  return headers.filter((h) => /^\d+$/.test(h))
}

/**
 * Stream a vendor CSV, yielding one ParsedRow per non-empty PartNumber.
 * True streaming: the file is read incrementally (csv-parse over a read
 * stream), never fully buffered. `relax_column_count` mirrors the prior
 * papaparse tolerance for FieldMismatch rows.
 */
export async function* streamCsvRows(filePath: string): AsyncIterable<ParsedRow> {
  const parser = createReadStream(filePath).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      bom: true,
    })
  )

  let warehouseColumns: string[] | null = null
  for await (const record of parser as AsyncIterable<Record<string, string>>) {
    if (warehouseColumns === null) {
      warehouseColumns = detectWarehouseColumns(Object.keys(record))
    }
    const partNumber = record["PartNumber"] || ""
    if (!partNumber) continue
    yield { partNumber, raw: record, warehouseColumns }
  }
}
```

- [ ] **Step 5: Delegate both adapter parsers**

`adapters/wheelpros-wheels/parse.ts` (replace whole file):
```ts
import { ParsedRow } from '../types'
import { streamCsvRows, detectWarehouseColumns } from '../csv-stream'

// Kept for existing tests importing it from here.
export { detectWarehouseColumns }

/** Stream a wheel CSV and yield ParsedRow objects (WB-015). */
export function parseWheelCsv(filePath: string): AsyncIterable<ParsedRow> {
  return streamCsvRows(filePath)
}
```

`adapters/wheelpros-tires/parse.ts` (replace whole file):
```ts
import { ParsedRow } from '../types'
import { streamCsvRows, detectWarehouseColumns } from '../csv-stream'

export { detectWarehouseColumns }

/** Stream a tire CSV and yield ParsedRow objects (WB-015). */
export function parseTireCsv(filePath: string): AsyncIterable<ParsedRow> {
  return streamCsvRows(filePath)
}
```

- [ ] **Step 6: Run the new + existing parse tests (parity gate)**

Run: `npx -y pnpm@9.10.0 exec jest src/modules/vendor-sync/__tests__/csv-stream.test.ts src/modules/vendor-sync/__tests__/wheel-parse.test.ts src/modules/vendor-sync/__tests__/tire-parse.test.ts`
Expected: PASS. The existing parse tests are the parity guard — if they fail, reconcile `relax_column_count`/`bom` options against the fixture before proceeding.

- [ ] **Step 7: Full module suite + build**

Run: `npx -y pnpm@9.10.0 run test:sync` then `npx -y pnpm@9.10.0 exec tsc --noEmit`
Expected: green.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/vendor-sync/adapters/csv-stream.ts backend/src/modules/vendor-sync/adapters/wheelpros-wheels/parse.ts backend/src/modules/vendor-sync/adapters/wheelpros-tires/parse.ts backend/src/modules/vendor-sync/__tests__/csv-stream.test.ts backend/package.json backend/pnpm-lock.yaml
git commit -m "feat(vendor-sync): stream CSV parse via csv-parse (WB-015)"
```

---

## Task 4: DB-backed, race-free cancel (WB-037)

**Files:**
- Modify: `backend/src/modules/vendor-sync/service.ts` (`markCancelled`, `isCancelled`, drop the Set + `clearCancelled_`)
- Modify: `backend/src/modules/vendor-sync/pipeline/finalize-apply.ts` (own the cancelled status transition)
- Modify: `backend/src/api/admin/vendor-sync/runs/[id]/cancel/route.ts`
- Modify: `backend/src/modules/vendor-sync/__tests__/finalize-apply.test.ts`

**Interfaces:**
- Produces: `markCancelled(runId: string): Promise<void>` (persists `cancel_requested_at`), `isCancelled(runId: string): Promise<boolean>` (reads the row). `finalizeApply` now sets `status:'cancelled'` + `finished_at` when `result.cancelled`.
- Consumes: `mapWithConcurrency`'s async `shouldStop` (Task 2) — `isCancelled` being async is compatible.

- [ ] **Step 1: Update the finalize-apply cancel test (expected new behavior)**

In `__tests__/finalize-apply.test.ts`, the cancel case must now expect a status write. Replace the cancel-branch assertions with:
```ts
it("on cancel, sets status=cancelled + finished_at and records failed parts", async () => {
  const updates: any[] = []
  const service = {
    listVendorFeedRuns: async () => [],
    updateVendorFeedRuns: async (d: any) => { updates.push(d); return d },
  }
  const res = await finalizeApply(service as any, {
    runId: "r1",
    vendorCode: "v",
    feedDate: null,
    result: { processedCount: 1, groupCount: 1, errorCount: 1, errors: [{ groupKey: "g", error: "x" }], cancelled: true },
    maxAttempts: 3,
  })
  expect(res.status).toBe("cancelled")
  const merged = Object.assign({}, ...updates)
  expect(merged.status).toBe("cancelled")
  expect(merged.finished_at).toBeInstanceOf(Date)
  expect(merged.failed_part_numbers).toHaveLength(1)
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx -y pnpm@9.10.0 exec jest src/modules/vendor-sync/__tests__/finalize-apply.test.ts`
Expected: FAIL — current cancel branch does not set `status`.

- [ ] **Step 3: Make finalizeApply own the cancelled transition**

In `finalize-apply.ts`, replace the `if (result.cancelled) { ... }` block:
```ts
  if (result.cancelled) {
    await service.updateVendorFeedRuns({
      id: runId,
      status: "cancelled",
      finished_at: new Date(),
      ...(result.errors.length > 0
        ? { failed_part_numbers: result.errors, failed_group_keys: uniqueGroupKeys(result.errors) }
        : {}),
    })
    return { status: "cancelled", attempt: 0 }
  }
```

- [ ] **Step 4: Rewire cancel to the DB in the service**

In `service.ts`: delete the `cancelledRuns_` field (line ~62), the `clearCancelled_` method, and every `this.clearCancelled_(runId)` call. Replace `markCancelled` / `isCancelled`:
```ts
  /** WB-037: persist the cancel signal so it survives across processes/restarts. */
  async markCancelled(runId: string): Promise<void> {
    await (this as any).updateVendorFeedRuns({ id: runId, cancel_requested_at: new Date() })
  }

  /** WB-037: the apply loop polls this at group boundaries. */
  async isCancelled(runId: string): Promise<boolean> {
    const [run] = await (this as any).listVendorFeedRuns({ id: runId }, { take: 1 })
    return !!run?.cancel_requested_at
  }
```

- [ ] **Step 5: Make the cancel route race-free**

Replace `api/admin/vendor-sync/runs/[id]/cancel/route.ts` body from the `markCancelled` line down:
```ts
  // WB-037: persist the cancel request (DB-backed, cross-process).
  await service.markCancelled(id)

  if (run.status === "awaiting_approval") {
    // Paused — nothing is executing, so finalize immediately.
    await service.updateVendorFeedRuns({ id, status: "cancelled", finished_at: new Date() })
    res.json({ run: { ...run, status: "cancelled", finished_at: new Date() } })
    return
  }

  // Executing (fetching/staging/diffing/applying): leave the status; the
  // running executeRun/apply loop observes cancel_requested_at at the next
  // boundary and finalizes to cancelled itself (no status-overwrite race).
  res.json({ run: { ...run, cancel_requested_at: new Date() } })
```

- [ ] **Step 6: Typecheck + finalize test + full suite**

Run: `npx -y pnpm@9.10.0 exec jest src/modules/vendor-sync/__tests__/finalize-apply.test.ts` then `npx -y pnpm@9.10.0 run test:sync` then `npx -y pnpm@9.10.0 exec tsc --noEmit`
Expected: green. (Note: `apply.ts`'s `checkCancelled` still references sync `isCancelled` — it now returns a Promise; Task 7 fixes the call site. If `tsc` flags `apply.ts` here, it's expected and closed in Task 7 — you may sequence Task 7 immediately after, or temporarily `await` in apply.ts's checkCancelled to keep the tree green.)

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/vendor-sync/service.ts backend/src/modules/vendor-sync/pipeline/finalize-apply.ts backend/src/api/admin/vendor-sync/runs/[id]/cancel/route.ts backend/src/modules/vendor-sync/__tests__/finalize-apply.test.ts
git commit -m "feat(vendor-sync): DB-backed race-free cancel (WB-037)"
```

---

## Task 5: Off-request enqueue split + run trigger (WB-011)

**Files:**
- Modify: `backend/src/modules/vendor-sync/service.ts` (`startRun`, `executeRun`, `enqueueRun`, `getApplyConcurrency`; phase-boundary cancel checks)
- Modify: `backend/src/api/admin/vendor-sync/runs/route.ts`

**Interfaces:**
- Produces: `startRun(vendorCode, mode?): Promise<{ runId: string; inProgress: boolean }>`, `executeRun(runId, vendorCode, options?): Promise<void>`, `enqueueRun(vendorCode, options?): Promise<{ runId: string }>`, `getApplyConcurrency(): number`. `run(vendorCode, options?)` keeps its signature (now = startRun + await executeRun) for the cron.

- [ ] **Step 1: Extract `startRun` + `executeRun`, add `enqueueRun`, keep `run` blocking**

In `service.ts`, refactor `run()`:
- **`startRun(vendorCode, mode = "full")`**: the in-progress guard (current step 1) + create-run-row (current step 2, add `mode`). Returns `{ runId, inProgress }` (`inProgress:true` with the existing run's id when the guard hits).
- **`executeRun(runId, vendorCode, options?)`**: the current `try { ...steps 3–10... } catch { ... }` block verbatim, but (a) `runId` is a parameter, (b) `const container = options?.container ?? this.container_` is used wherever `resolveApplyContainer(options?.container, this.container_)` is called, (c) drop the `clearCancelled_` calls (done in Task 4), (d) add the phase-boundary cancel checks below.
- **`run(vendorCode, options?)`**:
```ts
  async run(vendorCode, options?) {
    const started = await this.startRun(vendorCode, "full")
    if (started.inProgress) return { runId: started.runId }
    await this.executeRun(started.runId, vendorCode, options)
    return { runId: started.runId }
  }
```
- **`enqueueRun(vendorCode, options?)`**:
```ts
  async enqueueRun(vendorCode, options?) {
    const started = await this.startRun(vendorCode, "full")
    if (started.inProgress) return { runId: started.runId }
    setImmediate(() => {
      this.executeRun(started.runId, vendorCode, { ...options, container: this.container_ })
        .catch((err) => this.logger_.error(`[vendor-sync] [${started.runId}] background run failed: ${err.message}`))
    })
    return { runId: started.runId }
  }
```
- **`getApplyConcurrency()`**: `return this.options_.applyConcurrency ?? 8` (used by Task 7).

- [ ] **Step 2: Add phase-boundary cancel checks inside `executeRun`**

After the `stageFeed(...)` call and after the `computeGroupDiff(...)` call (before the threshold/apply), insert:
```ts
      if (await this.isCancelled(runId)) {
        await (this as any).updateVendorFeedRuns({ id: runId, status: "cancelled", finished_at: new Date() })
        return
      }
```
(So a cancel during staging/diffing is honored before apply starts.)

- [ ] **Step 3: Make `POST /runs` return immediately**

Replace the tail of `POST` in `runs/route.ts` (from the "Synchronous run" comment):
```ts
  // WB-011: enqueue off-request; return the run id immediately.
  const { runId } = await service.enqueueRun(vendor_code, { dryRun: dry_run })

  res.status(201).json({ run_id: runId })
```
(Keep the existing 409 in-progress pre-check above it.)

- [ ] **Step 4: Typecheck + full suite**

Run: `npx -y pnpm@9.10.0 exec tsc --noEmit` then `npx -y pnpm@9.10.0 run test:sync`
Expected: green (once Task 7's apply cancel-gate `await` is in; if sequencing Task 5 before 7, ensure `checkCancelled` in apply.ts awaits `isCancelled`).

- [ ] **Step 5: Manual smoke (documented; run against a dev backend before merge)**

With a dev backend + a vendor enabled: `POST /admin/vendor-sync/runs {vendor_code}` returns `201 {run_id}` in well under 1s; `GET /admin/vendor-sync/runs/:id` shows the status advancing `fetching→…→completed` asynchronously.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/vendor-sync/service.ts backend/src/api/admin/vendor-sync/runs/route.ts
git commit -m "feat(vendor-sync): off-request run enqueue on app container (WB-011)"
```

---

## Task 6: Off-request approve / replay / replay-SKU (WB-012/013)

**Files:**
- Modify: `backend/src/modules/vendor-sync/service.ts` (`enqueueApprove`, `enqueueReplay`, `enqueueReplaySku`; default their internal container to `this.container_`)
- Modify: `backend/src/api/admin/vendor-sync/runs/[id]/approve/route.ts`
- Modify: `backend/src/api/admin/vendor-sync/runs/[id]/replay/route.ts`
- Modify: `backend/src/api/admin/vendor-sync/skus/[partNumber]/replay/route.ts`

**Interfaces:**
- Produces: `enqueueApprove(runId, actorId): void`, `enqueueReplay(runId): void`, `enqueueReplaySku(vendorCode, partNumber): void` — each schedules the existing method on the app container and returns immediately.

- [ ] **Step 1: Add the three enqueue wrappers to the service**

```ts
  enqueueApprove(runId: string, actorId?: string): void {
    setImmediate(() => {
      this.approveAndApply(runId, actorId, this.container_)
        .catch((err) => this.logger_.error(`[vendor-sync] [${runId}] background approve failed: ${err.message}`))
    })
  }
  enqueueReplay(runId: string): void {
    setImmediate(() => {
      this.replayRun(runId, this.container_)
        .catch((err) => this.logger_.error(`[vendor-sync] [${runId}] background replay failed: ${err.message}`))
    })
  }
  enqueueReplaySku(vendorCode: string, partNumber: string): void {
    setImmediate(() => {
      this.replaySku(vendorCode, partNumber, this.container_)
        .catch((err) => this.logger_.error(`[vendor-sync] replay SKU ${partNumber} failed: ${err.message}`))
    })
  }
```

- [ ] **Step 2: Approve route → 202**

In `approve/route.ts`, replace `await service.approveAndApply(...)` + re-fetch with:
```ts
  // WB-012: run the apply off-request; return 202 immediately.
  service.enqueueApprove(id, actorId)
  res.status(202).json({ run: { ...run, status: "applying", approved_by: actorId } })
```

- [ ] **Step 3: Replay route → 202**

In `replay/route.ts`, replace `await service.replayRun(id, req.scope)` + re-fetch with:
```ts
  service.enqueueReplay(id)
  res.status(202).json({ run: { ...run, status: "applying" } })
```

- [ ] **Step 4: Replay-SKU route → 202**

In `skus/[partNumber]/replay/route.ts`, replace the `await service.replaySku(...)` call with:
```ts
  service.enqueueReplaySku(vendor_code, partNumber)
  res.status(202).json({ replaying: { vendor_code, part_number: partNumber } })
```
(Read the file first to match its exact param extraction — `vendor_code` likely comes from the query/body and `partNumber` from `req.params`.)

- [ ] **Step 5: Typecheck + suite + build**

Run: `npx -y pnpm@9.10.0 exec tsc --noEmit` then `npx -y pnpm@9.10.0 run test:sync` then `npx -y pnpm@9.10.0 exec medusa build`
Expected: `medusa build` exit 0.

- [ ] **Step 6: Manual smoke (documented)**

Approve an `awaiting_approval` run → 202 in <1s, status transitions to `completed` in the background; replay a completed run → 202, re-applies; cancel a mid-apply run → it stops between groups and ends `cancelled`.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/vendor-sync/service.ts backend/src/api/admin/vendor-sync/runs/[id]/approve/route.ts backend/src/api/admin/vendor-sync/runs/[id]/replay/route.ts backend/src/api/admin/vendor-sync/skus/[partNumber]/replay/route.ts
git commit -m "feat(vendor-sync): off-request approve/replay/replay-sku (WB-012/013)"
```

---

## Task 7: Concurrent apply + brand-cache race fix (WB-014 integration)

**Files:**
- Modify: `backend/src/modules/vendor-sync/pipeline/apply.ts`

**Interfaces:**
- Consumes: `mapWithConcurrency` (Task 2), `service.getApplyConcurrency()` (Task 5), async `service.isCancelled` (Task 4).

- [ ] **Step 1: Promise-memoize the brand-collection cache (kills the race)**

Change the cache type in `ApplyContext` (apply.ts:91) and its init (apply.ts:147):
```ts
  brandCollectionCache: Map<string, Promise<string>>
// ...
    brandCollectionCache: new Map<string, Promise<string>>(),
```
Rewrite `getBrandCollectionId` (apply.ts:802):
```ts
function getBrandCollectionId(ctx: ApplyContext, brand: string): Promise<string> {
  let p = ctx.brandCollectionCache.get(brand)
  if (!p) {
    p = ensureBrandCollection(ctx.container, brand)
    ctx.brandCollectionCache.set(brand, p)
  }
  return p
}
```
(Now `async` is unnecessary — it returns the shared in-flight promise, so two concurrent same-brand groups share one `ensureBrandCollection`.)

- [ ] **Step 2: Run the three phases concurrently through `mapWithConcurrency`**

In `applyChanges`, add near the top: `const concurrency = service.getApplyConcurrency()` and `const isCancelled = () => service.isCancelled(runId)`. Replace each of the three sequential `for (const group of diff.X)` loops with a `mapWithConcurrency` call whose task body is the existing per-group try/catch (mutating the shared `processedCount`/`groupCount`/`errors`/`stockPartNumbers`). Example for phase 1 (new groups):
```ts
  await mapWithConcurrency(diff.newGroups, concurrency, async (group) => {
    try {
      const result = await applyNewGroup(ctx, group)
      processedCount += result.variantCount
      groupCount++
      stockPartNumbers.push(...group.part_numbers)
    } catch (err: any) {
      logger.error(`[vendor-sync] [${runId}] new group ${group.group_key} failed: ${err.message}`)
      errors.push({ groupKey: group.group_key, error: err.message })
    }
  }, isCancelled)
  cancelled = cancelled || (await isCancelled())
```
Repeat for `diff.changedGroups` (accumulating `added_/changed_/removed_part_numbers` into `stockPartNumbers`) and `diff.discontinuedGroups`, each guarded by `if (!cancelled)` before the call — mirroring the existing phase guards. Delete the old `checkCancelled` closure (replaced by the `isCancelled` gate + `cancelled` recompute).

- [ ] **Step 3: Keep the final stock pass + return unchanged**

The `if (!cancelled && stockPartNumbers.length > 0) { applyStockLevels(...) }` block and the `return { processedCount, groupCount, errorCount: errors.length, errors, cancelled }` stay as-is.

- [ ] **Step 4: Typecheck + full suite**

Run: `npx -y pnpm@9.10.0 exec tsc --noEmit` then `npx -y pnpm@9.10.0 run test:sync`
Expected: green (the module suite must still show the same pass count as before this branch; `test:sync` currently ~ the STATUS.md figure).

- [ ] **Step 5: Manual smoke (documented)**

Run a real dry-run + apply on a dev DB with `VENDOR_SYNC_APPLY_CONCURRENCY=4`; confirm products/variants/inventory land identically to a sequential run (same group/variant/error counts) and no duplicate brand collections are created (query `product_collection` for the brand names).

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/vendor-sync/pipeline/apply.ts
git commit -m "feat(vendor-sync): concurrent apply + promise-memoized brand cache (WB-014)"
```

---

## Task 8: Durable feed archive (WB-017)

**Files:**
- Create: `backend/src/modules/vendor-sync/utils/archive-policy.ts` + test
- Modify: `backend/src/modules/vendor-sync/utils/archive.ts` (add `uploadArchive`)
- Modify: `backend/src/modules/vendor-sync/service.ts` (`executeRun`: upload after fetch, write key to `source_archive_key`)
- Modify: `backend/medusa-config.js` (add `durableArchive` option)
- Test: `backend/src/modules/vendor-sync/__tests__/archive-policy.test.ts`

**Interfaces:**
- Produces: `shouldUploadArchive(durableArchiveEnabled: boolean, minioConfigured: boolean): boolean`; `uploadArchive(container, localPath, opts): Promise<string | null>` (returns the object-storage key, or `null` on failure/skip — best-effort, never throws).
- **Constraint:** the parse path uses `descriptor.archiveKey` (a local path). Do NOT change it. Only the `source_archive_key` DB column becomes the durable key.

- [ ] **Step 1: Write the failing policy test**

```ts
// __tests__/archive-policy.test.ts
import { shouldUploadArchive } from "../utils/archive-policy"

describe("shouldUploadArchive", () => {
  it("uploads only when durable archiving is enabled AND MinIO is configured", () => {
    expect(shouldUploadArchive(true, true)).toBe(true)
    expect(shouldUploadArchive(true, false)).toBe(false)
    expect(shouldUploadArchive(false, true)).toBe(false)
    expect(shouldUploadArchive(false, false)).toBe(false)
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx -y pnpm@9.10.0 exec jest src/modules/vendor-sync/__tests__/archive-policy.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the policy + uploader**

`utils/archive-policy.ts`:
```ts
/**
 * WB-017: durable archiving is EXPLICIT opt-in. Never write vendor cost CSVs
 * to the default public MinIO media bucket by accident — only upload when the
 * operator has turned it on AND object storage is configured.
 */
export function shouldUploadArchive(durableArchiveEnabled: boolean, minioConfigured: boolean): boolean {
  return durableArchiveEnabled && minioConfigured
}
```

Append to `utils/archive.ts`:
```ts
import { Modules } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { promises as fsp } from "fs"

/**
 * Best-effort durable upload of a local archive file to object storage via the
 * File module. Returns the stored key, or null on any failure (archiving must
 * never block the pipeline). The caller decides IF to call this
 * (shouldUploadArchive); descriptor.archiveKey stays local for parsing.
 */
export async function uploadArchive(
  container: MedusaContainer,
  localPath: string,
  opts: { vendorCode: string; bucketPrefix: string }
): Promise<string | null> {
  try {
    const fileModule = container.resolve(Modules.FILE)
    const content = await fsp.readFile(localPath)
    const base = localPath.split(/[\\/]/).pop() ?? "feed.csv"
    const [file] = await fileModule.createFiles([
      {
        filename: `${opts.bucketPrefix}/${opts.vendorCode}/${base}`,
        mimeType: "text/csv",
        content: content.toString("binary"),
      },
    ])
    return file?.url ?? file?.id ?? null
  } catch (err: any) {
    console.warn(`[vendor-sync] durable archive upload failed for ${opts.vendorCode}: ${err.message}`)
    return null
  }
}
```
(Verify `fileModule.createFiles` input shape against `@medusajs/framework/types` `IFileModuleService` during implementation — the `{ filename, mimeType, content }` triple is the stable v2 shape; adjust `content` encoding if the type demands `Buffer`.)

- [ ] **Step 4: Wire it into `executeRun` after fetch**

In `service.ts` `executeRun`, right after the block that sets `source_filename`/`source_archive_key` from the descriptor (around service.ts:219-223), add:
```ts
      const durableArchive = this.options_.durableArchive ?? false
      const minioConfigured = !!process.env.MINIO_ENDPOINT
      if (shouldUploadArchive(durableArchive, minioConfigured)) {
        const durableKey = await uploadArchive(
          resolveApplyContainer(options?.container, this.container_),
          descriptor.archiveKey,
          { vendorCode, bucketPrefix: this.options_.archiveBucket ?? "vendor-feeds" }
        )
        if (durableKey) {
          await (this as any).updateVendorFeedRuns({ id: runId, source_archive_key: durableKey })
        }
      }
```
Add the imports at the top of `service.ts`: `import { uploadArchive } from "./utils/archive"` and `import { shouldUploadArchive } from "./utils/archive-policy"`. Add `durableArchive?: boolean` to `VendorSyncModuleOptions`.

- [ ] **Step 5: Add the config option**

In `medusa-config.js` vendor-sync options (near line 201), add:
```js
        durableArchive: process.env.VENDOR_SYNC_DURABLE_ARCHIVE === 'true',
```

- [ ] **Step 6: Test + typecheck**

Run: `npx -y pnpm@9.10.0 exec jest src/modules/vendor-sync/__tests__/archive-policy.test.ts` then `npx -y pnpm@9.10.0 exec tsc --noEmit`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/vendor-sync/utils/archive-policy.ts backend/src/modules/vendor-sync/utils/archive.ts backend/src/modules/vendor-sync/service.ts backend/medusa-config.js backend/src/modules/vendor-sync/__tests__/archive-policy.test.ts
git commit -m "feat(vendor-sync): durable feed archive, private-bucket opt-in (WB-017)"
```

---

## Task 9: Stock-only fast path + cron (WB-018)

**Files:**
- Create: `backend/src/modules/vendor-sync/pipeline/stock-select.ts` + test
- Modify: `backend/src/modules/vendor-sync/service.ts` (`runStockOnly`)
- Create: `backend/src/jobs/vendor-sync-stock-tick.ts`

**Interfaces:**
- Produces: `selectStockPartNumbers(stagedPartNumbers: string[], currentPartNumbers: Set<string>): string[]`; `runStockOnly(vendorCode, options?): Promise<{ runId: string }>`.
- Consumes: `startRun` (Task 5, with `mode:"stock"`), `stageFeed`, `applyStockLevels`, `ensureDefaultSalesChannel`.

- [ ] **Step 1: Write the failing selector test**

```ts
// __tests__/stock-select.test.ts
import { selectStockPartNumbers } from "../pipeline/stock-select"

describe("selectStockPartNumbers", () => {
  it("keeps only staged parts that have a current row, de-duped, staged order", () => {
    expect(
      selectStockPartNumbers(["A", "B", "C", "A"], new Set(["A", "C", "D"]))
    ).toEqual(["A", "C"])
  })
  it("returns empty when nothing intersects", () => {
    expect(selectStockPartNumbers(["X"], new Set(["Y"]))).toEqual([])
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx -y pnpm@9.10.0 exec jest src/modules/vendor-sync/__tests__/stock-select.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the selector**

```ts
// pipeline/stock-select.ts
/** Parts staged this run that also have a current (active-or-not) product row. */
export function selectStockPartNumbers(
  stagedPartNumbers: string[],
  currentPartNumbers: Set<string>
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const pn of stagedPartNumbers) {
    if (currentPartNumbers.has(pn) && !seen.has(pn)) {
      seen.add(pn)
      out.push(pn)
    }
  }
  return out
}
```

- [ ] **Step 4: Add `runStockOnly` to the service**

```ts
  /**
   * WB-018: stock-only fast path. Fetch + stage the feed, then apply ONLY
   * inventory levels (no product diff/create). Skipped if a run is already
   * in progress for the vendor.
   */
  async runStockOnly(
    vendorCode: string,
    options?: { container?: MedusaContainer }
  ): Promise<{ runId: string }> {
    const started = await this.startRun(vendorCode, "stock")
    if (started.inProgress) return { runId: started.runId }
    const runId = started.runId
    const container = options?.container ?? this.container_
    try {
      const vendorOpts = (this.options_.vendors ?? {})[vendorCode] ?? {}
      const feed = await resolveFeed(
        { feedPath: vendorOpts.feedPath, sftp: vendorOpts.sftp },
        null,
        { allowSample: this.options_.allowSampleFeed ?? false, vendorCode }
      )
      if (feed.kind === "empty" || feed.kind === "unchanged") {
        await (this as any).updateVendorFeedRuns({ id: runId, status: "completed", finished_at: new Date() })
        return { runId }
      }
      const adapter = resolveAdapter(vendorCode, feed.kind === "file" ? { csvPath: feed.csvPath } : undefined)
      const descriptor = await fetchFeed(adapter)
      await (this as any).updateVendorFeedRuns({ id: runId, status: "staging", source_filename: descriptor.sourceFilename })
      await stageFeed(adapter, descriptor, this, runId, this.logger_, this.options_.devMaxRows)

      // Which staged parts have a current row?
      const stockRows = await (this as any).listVendorStockStagings({ run_id: runId }, { take: null })
      const stagedParts = stockRows.map((r: any) => r.part_number)
      const currentRows = await (this as any).listVendorProductCurrents({ vendor_code: vendorCode }, { select: ["part_number"], take: null })
      const currentParts = new Set<string>(currentRows.map((r: any) => r.part_number))
      const parts = selectStockPartNumbers(stagedParts, currentParts)

      await (this as any).updateVendorFeedRuns({ id: runId, status: "applying" })
      const salesChannelId = await ensureDefaultSalesChannel(container)
      const stockResult = await applyStockLevels(container, this, runId, vendorCode, parts, salesChannelId, this.logger_)
      this.logger_.info(`[vendor-sync] [${runId}] stock-only: ${stockResult.updatedCount} updated, ${stockResult.errorCount} errors over ${parts.length} parts`)
      await (this as any).updateVendorFeedRuns({ id: runId, status: "completed", finished_at: new Date() })
      return { runId }
    } catch (err: any) {
      await (this as any).updateVendorFeedRuns({ id: runId, status: "failed", error_message: err.message?.slice(0, 2000), finished_at: new Date() }).catch(() => {})
      return { runId }
    }
  }
```
Add imports to `service.ts`: `selectStockPartNumbers` from `./pipeline/stock-select`, `applyStockLevels` from `./pipeline/apply-stock`, `ensureDefaultSalesChannel` from `./pipeline/bootstrap` (fetchFeed/stageFeed/resolveAdapter/resolveFeed are already imported).

- [ ] **Step 5: Add the stock cron**

```ts
// jobs/vendor-sync-stock-tick.ts
import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { VENDOR_SYNC_MODULE } from "../modules/vendor-sync"

export default async function vendorSyncStockTick(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const service = container.resolve(VENDOR_SYNC_MODULE) as any
  const enabledVendors: string[] = service.listEnabledVendors()
  if (enabledVendors.length === 0) {
    logger.info("[vendor-sync-stock-tick] No enabled vendors, skipping")
    return
  }
  for (const vendorCode of enabledVendors) {
    try {
      logger.info(`[vendor-sync-stock-tick] Stock refresh for vendor: ${vendorCode}`)
      await service.runStockOnly(vendorCode, { container })
    } catch (err: any) {
      logger.error(`[vendor-sync-stock-tick] Failed for ${vendorCode} — ${err.message}`)
    }
  }
}

export const config = {
  name: "vendor-sync-stock-tick",
  schedule: process.env.VENDOR_SYNC_STOCK_CRON || "0 */3 * * *",
}
```

- [ ] **Step 6: Test + full suite + build**

Run: `npx -y pnpm@9.10.0 exec jest src/modules/vendor-sync/__tests__/stock-select.test.ts` then `npx -y pnpm@9.10.0 run test:sync` then `npx -y pnpm@9.10.0 exec medusa build`
Expected: `medusa build` exit 0.

- [ ] **Step 7: Manual smoke (documented)**

On a dev DB with products already applied: change some warehouse QOH in the feed → `runStockOnly` (or wait for the cron) updates inventory levels and creates a `mode='stock'` run row; confirm no product/variant rows are created or modified (compare `product` counts before/after).

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/vendor-sync/pipeline/stock-select.ts backend/src/modules/vendor-sync/service.ts backend/src/jobs/vendor-sync-stock-tick.ts backend/src/modules/vendor-sync/__tests__/stock-select.test.ts
git commit -m "feat(vendor-sync): stock-only fast path + cron (WB-018)"
```

---

## Task 10: Docs + `.env.template` + backlog/status

**Files:**
- Modify: `backend/.env.template` (document the new env)
- Modify: `docs/future/BACKLOG.md` (flip WB-011/012/013/014/015/017/018/037 → `done`)
- Modify: `docs/STATUS.md` ("Last verified" + Vendor-import pillar line + Active work entry)
- Modify: `docs/reference/vendor-sync-implementation.md` (async trigger, DB cancel, concurrency, streaming, durable archive, stock cron)
- Move: spec + this plan `in-progress → done` (on merge)

- [ ] **Step 1: Document env in `.env.template`**

Add:
```
# Vendor-sync scale/ops (G1)
VENDOR_SYNC_APPLY_CONCURRENCY=8         # parallel product-group apply (now load-bearing)
VENDOR_SYNC_STOCK_CRON=0 */3 * * *      # stock-only refresh cadence
VENDOR_SYNC_DURABLE_ARCHIVE=false       # opt-in: upload feed archives to object storage (needs a PRIVATE MinIO bucket)
```

- [ ] **Step 2: Flip the eight backlog items to `done`**

For each of WB-011/012/013/014/015/017/018/037 in `docs/future/BACKLOG.md`: set `status: done`, add a `done:` line naming the commit/approach, and drop them from the **G1** work-group member list at the top. Update the G1 group line (all members now done → mark the group ✅ DONE).

- [ ] **Step 3: Update STATUS.md**

Bump "Last verified" to 2026-07-05; update the **Vendor import** pillar row (async triggers, DB cancel, concurrency, streaming, durable archive, stock cron) and drop WB-011..018/037 from its "Open backlog"; add an "Active work" bullet summarizing this session.

- [ ] **Step 4: Run doc-review**

Invoke the `doc-review` skill; apply any drift fixes it proposes.

- [ ] **Step 5: Commit**

```bash
git add backend/.env.template docs/
git commit -m "docs(vendor-sync): G1 async+scale done — backlog/status/reference + env"
```

- [ ] **Step 6 (on merge): move spec + plan to done**

```bash
git mv docs/in-progress/specs/2026-07-05-vendor-sync-productionization-design.md docs/done/specs/
git mv docs/in-progress/plans/2026-07-05-vendor-sync-productionization.md docs/done/plans/
git commit -m "docs: move vendor-sync productionization spec+plan to done"
```

---

## Self-Review

**Spec coverage:** WB-011 (Task 5), WB-012 (Task 6), WB-013 (Task 6), WB-014 (Tasks 2+7), WB-015 (Task 3), WB-017 (Task 8), WB-018 (Task 9), WB-037 (Task 4). Shared migration (Task 1). Docs (Task 10). All spec sections §4–§10 map to a task.

**Type consistency:** `mapWithConcurrency` signature identical in Task 2 def and Task 7 use (async `shouldStop` supported). `isCancelled` is async in Task 4 and awaited in Tasks 5/7. `brandCollectionCache: Map<string, Promise<string>>` consistent across apply.ts:91/147/802. `startRun(...,mode)` used by `run`/`enqueueRun`/`runStockOnly`. `shouldUploadArchive(bool,bool)` consistent Task 8. `selectStockPartNumbers(string[], Set<string>)` consistent Task 9.

**Sequencing note:** Task 4 makes `isCancelled` async; `apply.ts`'s cancel gate is fixed in Task 7. If executing strictly in order, keep the tree green between 4 and 7 by having `apply.ts`'s `checkCancelled` `await` `isCancelled` as a one-line bridge until Task 7 replaces the loop (called out in Task 4 Step 6).
