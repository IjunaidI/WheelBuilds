# Sync-lifecycle integrity (WB-070) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the 9 confirmed vendor-sync lifecycle bugs (+ folded mediums #11, #16) so the sync never reports success while its persisted state diverges from the feed — no phantom stock, no invisible DRAFT catalog loss, no stale prices in the index, no dry-run/approval footguns.

**Architecture:** Four root-cause seams in the existing imperative pipeline: (A) the stock pass reconciles against real Medusa levels, surfaces its errors, and owns the settled `content_hash`; (B) adoption/re-listing republishes and refreshes instead of writing zombie rows; (C) variant-only mutations emit `product.updated` for Meili; (D) dry-runs get their own `mode` and `awaiting_approval` blocks new runs + approve/replay take an explicit vendor lock. Pure decision logic is extracted into unit-tested helpers; I/O wiring rides on `tsc` + `medusa build` + review.

**Tech Stack:** MedusaJS 2.13.6 business module (MikroORM models, core-flows workflows, event bus), TypeScript, Jest (`pnpm test:sync`, no DB).

**Spec:** [docs/in-progress/specs/2026-07-06-sync-lifecycle-integrity-design.md](../specs/2026-07-06-sync-lifecycle-integrity-design.md)

## Global Constraints

- **Run all commands from `backend/`.** There is no root package.json. If `pnpm` is not on PATH, use `npx -y pnpm@9.10.0 <cmd>`.
- **Per-task gate:** `pnpm test:sync` green + `npx tsc --noEmit` shows **no NEW** errors beyond the ~14 pre-existing baseline. **Final gate (Task 10):** `medusa build` exits 0.
- **`MedusaService` update/create take a single merged object:** `service.updateVendorProductCurrents({ id, ...fields })`, never `({id}, {fields})` — the two-arg form silently no-ops in 2.13.6.
- **Price unit convention:** Medusa `prices.amount` is MAJOR units (dollars, e.g. `369.99`). Do not multiply/divide.
- **`content_hash` column is `model.text()` (NON-nullable).** The "unsettled" sentinel is the empty string `""`, never `null`.
- **`createProductsWorkflow`/`createProductVariantsWorkflow` do NOT eagerly populate `variant.inventory_items`.** Re-query via `query.graph({ entity: "variant", fields: ["inventory_items.inventory_item_id"], filters: { id: [...] } })`.
- **Commit style:** `fix(vendor-sync): <what> (WB-070 F<n>)`. End commit messages with the Co-Authored-By trailer.
- **Do NOT run against prod** (`trolley.proxy.rlwy.net`) or any live DB. Tests are no-DB; the integration suite stays `describe.skip` unless `RUN_INTEGRATION=true`.

## File Structure

| File | Responsibility | Tasks |
|---|---|---|
| `src/modules/vendor-sync/utils/hash.ts` | Deterministic content hash — now counts per-warehouse stock | T1 |
| `src/modules/vendor-sync/pipeline/apply-stock.ts` | Stock-level compute (location-based zero-out) + apply (errors + hash settlement) | T2, T4 |
| `src/modules/vendor-sync/pipeline/lifecycle-guards.ts` *(new)* | Pure run-lifecycle predicates | T3 |
| `src/modules/vendor-sync/pipeline/apply.ts` | Group apply: sentinel hashes, re-list refresh, adoption, `product.updated` emit | T4, T5, T6, T7 |
| `src/modules/vendor-sync/service.ts` | Orchestration: dry `mode`, blocking guard, approve/replay locks | T3, T4, T8, T9 |
| `src/api/admin/vendor-sync/runs/route.ts` | Trigger: dry mode + blocking pre-check | T8, T9 |
| `src/api/admin/vendor-sync/runs/[id]/approve/route.ts` | Approve: vendor-busy 409 | T9 |
| `src/api/admin/vendor-sync/runs/[id]/replay/route.ts` | Replay: vendor-busy 409 | T9 |
| `src/admin/routes/vendor-sync/page.tsx` | Admin console: real (full) run action | T8 |
| `src/modules/vendor-sync/__tests__/{hash,apply-stock,lifecycle-guards,diff-group}.test.ts` | Unit coverage | T1–T4 |

---

### Task 1: A3 — content hash counts per-warehouse stock (finding 11)

**Files:**
- Modify: `src/modules/vendor-sync/utils/hash.ts`
- Test: `src/modules/vendor-sync/__tests__/hash.test.ts`

**Interfaces:**
- Consumes: `NormalizedRecord`.
- Produces: `computeContentHash(record): string` — SAME signature; now sensitive to `stockByWarehouse` distribution. (T4 depends on this being deterministic over `normalized`.)

- [ ] **Step 1: Write the failing test** — append to the `describe('computeContentHash', ...)` block in `hash.test.ts`:

```ts
it('produces DIFFERENT hashes when per-warehouse stock is redistributed at constant total', () => {
  // Finding 11: the array-replacer serialized stockByWarehouse as {}, so a
  // W1 5->0 / W2 0->5 shuffle (same totalQoh) hashed identical -> never synced.
  const a = makeWheelRecord({ stockByWarehouse: { '1001': 5, '1002': 0 } })
  const b = makeWheelRecord({ stockByWarehouse: { '1001': 0, '1002': 5 } })
  expect(computeContentHash(a)).not.toBe(computeContentHash(b))
})
```

- [ ] **Step 2: Run it, verify it FAILS**

Run: `npx jest src/modules/vendor-sync/__tests__/hash.test.ts -t "redistributed" -v`
Expected: FAIL — the two hashes are currently equal (both serialize `stockByWarehouse` to `{}`).

- [ ] **Step 3: Implement the canonicalizer** — in `hash.ts`, change the `stockByWarehouse` line, replace the final `JSON.stringify` call, and replace `sortObject` with a deep `canonicalize`:

```ts
  const base: Record<string, unknown> = {
    partNumber: record.partNumber,
    vendorCode: record.vendorCode,
    title: record.title,
    brand: record.brand,
    imageUrl: record.imageUrl,
    invOrderType: record.invOrderType,
    totalQoh: record.totalQoh,
    msrpUsd: record.msrpUsd,
    mapUsd: record.mapUsd,
    productType: record.productType,
    // runDateVendor intentionally excluded
    stockByWarehouse: record.stockByWarehouse,
  }
```

Then (leaving the wheel/tire branches untouched) replace the serialization + helper:

```ts
  // Deep, order-independent canonical form: sort keys at EVERY level, then
  // stringify with NO replacer. The old array-replacer whitelisted only the
  // top-level keys, silently dropping nested warehouse codes (finding 11).
  const canonical = JSON.stringify(canonicalize(base))
  return createHash('sha256').update(canonical).digest('hex')
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = canonicalize((value as Record<string, unknown>)[k])
    }
    return out
  }
  return value
}
```

Delete the old `sortObject` function (now unused).

- [ ] **Step 4: Run the full hash suite, verify PASS**

Run: `npx jest src/modules/vendor-sync/__tests__/hash.test.ts -v`
Expected: PASS — the new test plus all 5 existing tests (reorder-stable now passes for the right reason).

- [ ] **Step 5: Commit**

```bash
git add src/modules/vendor-sync/utils/hash.ts src/modules/vendor-sync/__tests__/hash.test.ts
git commit -m "fix(vendor-sync): content hash counts per-warehouse stock (WB-070 F11)"
```

---

### Task 2: A1 — stock zero-out reconciles against Medusa (finding 1)

**Files:**
- Modify: `src/modules/vendor-sync/pipeline/apply-stock.ts` (`computeStockChanges` only)
- Test: `src/modules/vendor-sync/__tests__/apply-stock.test.ts`

**Interfaces:**
- Produces: `computeStockChanges(currentStaging, previousStock, existingLevels, warehouseToLocationMap, inventoryItemId): StockChanges` — SAME signature (`previousStock` retained but no longer drives the zero decision).

- [ ] **Step 1: Write the failing repro test** — append to the `describe("computeStockChanges", ...)` block:

```ts
it("zeroes a Medusa level absent from staging even when previousStock omits it (finding 1)", () => {
  // The changed path overwrote `normalized` before the stock pass, so
  // previousStock is the NEW feed and no longer lists the sold-out warehouse.
  // Medusa still holds its old stock -> must be zeroed from existingLevels.
  const currentStaging = [{ warehouse_code: "1001", qoh: 8 }]
  const previousStock: Record<string, number> = { "1001": 8 } // 1002 sold out, absent
  const existingLevels = new Map([
    ["loc_1001", { id: "level_001", stocked_quantity: 8 }],
    ["loc_1002", { id: "level_002", stocked_quantity: 5 }], // Medusa still shows 5
  ])
  const warehouseToLocationMap = new Map([
    ["1001", "loc_1001"],
    ["1002", "loc_1002"],
  ])
  const result = computeStockChanges(
    currentStaging, previousStock, existingLevels, warehouseToLocationMap, "inv_item_001"
  )
  expect(result.creates).toHaveLength(0)
  expect(result.updates).toEqual([
    { id: "level_002", inventory_item_id: "inv_item_001", location_id: "loc_1002", stocked_quantity: 0 },
  ])
})
```

- [ ] **Step 2: Run it, verify it FAILS**

Run: `npx jest src/modules/vendor-sync/__tests__/apply-stock.test.ts -t "finding 1" -v`
Expected: FAIL — `result.updates` is empty (old zero-out iterates `previousStock`, which omits 1002).

- [ ] **Step 3: Rewrite the zero-out** — replace the body of `computeStockChanges` (the section from `const seenWarehouseCodes` through the `// Zero out warehouses...` loop) with:

```ts
  const creates: StockCreate[] = []
  const updates: StockUpdate[] = []
  const coveredLocationIds = new Set<string>()

  // Apply current staging quantities into their locations.
  for (const row of currentStaging) {
    const locationId = warehouseToLocationMap.get(row.warehouse_code)
    if (!locationId) continue
    coveredLocationIds.add(locationId)
    const existing = existingLevels.get(locationId)
    if (existing) {
      if (existing.stocked_quantity !== row.qoh) {
        updates.push({
          id: existing.id,
          inventory_item_id: inventoryItemId,
          location_id: locationId,
          stocked_quantity: row.qoh,
        })
      }
    } else {
      creates.push({
        inventory_item_id: inventoryItemId,
        location_id: locationId,
        stocked_quantity: row.qoh,
      })
    }
  }

  // Finding 1: zero any EXISTING Medusa level whose location is not covered by
  // the current feed. Reconciling against Medusa's real state (existingLevels)
  // rather than `previousStock` means a sold-out warehouse is zeroed even after
  // the changed path overwrote the vendor_product_current snapshot.
  // `previousStock` is retained in the signature for caller compatibility.
  for (const [locationId, level] of existingLevels) {
    if (coveredLocationIds.has(locationId)) continue
    if (level.stocked_quantity === 0) continue
    updates.push({
      id: level.id,
      inventory_item_id: inventoryItemId,
      location_id: locationId,
      stocked_quantity: 0,
    })
  }

  return { creates, updates }
```

Keep the function's leading JSDoc; update its bullet for `previousStock` to note it is no longer consulted for zeroing.

- [ ] **Step 4: Run the full apply-stock suite, verify PASS**

Run: `npx jest src/modules/vendor-sync/__tests__/apply-stock.test.ts -v`
Expected: PASS — the new test plus all 7 existing cases (they align existingLevels with previousStock, so they hold under the new logic).

- [ ] **Step 5: Commit**

```bash
git add src/modules/vendor-sync/pipeline/apply-stock.ts src/modules/vendor-sync/__tests__/apply-stock.test.ts
git commit -m "fix(vendor-sync): stock zero-out reconciles against Medusa levels (WB-070 F1)"
```

---

### Task 3: Pure lifecycle-guard helpers (findings 8, 9, 16)

**Files:**
- Create: `src/modules/vendor-sync/pipeline/lifecycle-guards.ts`
- Modify: `src/modules/vendor-sync/service.ts` (import `IN_PROGRESS_STATUSES`, delete local const)
- Test: `src/modules/vendor-sync/__tests__/lifecycle-guards.test.ts` *(new)*

**Interfaces:**
- Produces: `IN_PROGRESS_STATUSES: string[]`, `BLOCKING_STATUSES: string[]`, `isVendorBusy(runs, excludeRunId?): boolean`, `isRunSuperseded(run, vendorRuns): boolean`, `canApprove(run): boolean`, type `RunLike`. (T9 consumes all; T8 consumes none.)

- [ ] **Step 1: Write the failing tests** — create `lifecycle-guards.test.ts`:

```ts
import {
  isVendorBusy,
  isRunSuperseded,
  canApprove,
  BLOCKING_STATUSES,
} from "../pipeline/lifecycle-guards"

describe("isVendorBusy", () => {
  it("is true when another run is applying", () => {
    expect(isVendorBusy([{ id: "a", status: "applying" }], "b")).toBe(true)
  })
  it("excludes the run under test", () => {
    expect(isVendorBusy([{ id: "a", status: "applying" }], "a")).toBe(false)
  })
  it("ignores terminal + awaiting_approval statuses", () => {
    expect(
      isVendorBusy(
        [{ id: "a", status: "completed" }, { id: "c", status: "awaiting_approval" }],
        "b"
      )
    ).toBe(false)
  })
})

describe("isRunSuperseded", () => {
  const base = { id: "r1", status: "awaiting_approval", run_date_vendor: "2026-01-01" }
  it("is true when a completed run has a newer feed date", () => {
    expect(
      isRunSuperseded(base, [{ id: "r2", status: "completed", run_date_vendor: "2026-02-01" }])
    ).toBe(true)
  })
  it("is false when the newer run is not completed", () => {
    expect(
      isRunSuperseded(base, [{ id: "r2", status: "applying", run_date_vendor: "2026-02-01" }])
    ).toBe(false)
  })
  it("is false when this run has no feed date", () => {
    expect(
      isRunSuperseded({ ...base, run_date_vendor: null }, [
        { id: "r2", status: "completed", run_date_vendor: "2026-02-01" },
      ])
    ).toBe(false)
  })
})

describe("canApprove", () => {
  it("is true only for awaiting_approval with no cancel", () => {
    expect(canApprove({ id: "r", status: "awaiting_approval", cancel_requested_at: null })).toBe(true)
    expect(canApprove({ id: "r", status: "cancelled", cancel_requested_at: null })).toBe(false)
    expect(canApprove({ id: "r", status: "awaiting_approval", cancel_requested_at: "2026-01-01" })).toBe(false)
  })
})

describe("BLOCKING_STATUSES", () => {
  it("includes awaiting_approval", () => {
    expect(BLOCKING_STATUSES).toContain("awaiting_approval")
  })
})
```

- [ ] **Step 2: Run, verify FAIL**

Run: `npx jest src/modules/vendor-sync/__tests__/lifecycle-guards.test.ts -v`
Expected: FAIL — cannot find module `../pipeline/lifecycle-guards`.

- [ ] **Step 3: Implement `lifecycle-guards.ts`:**

```ts
/**
 * Pure vendor-sync run-lifecycle guards (WB-070; findings 8/9/16). No I/O.
 */
export type RunLike = {
  id: string
  status: string
  run_date_vendor?: Date | string | null
  cancel_requested_at?: Date | string | null
}

/** Statuses where a run is actively executing the pipeline. */
export const IN_PROGRESS_STATUSES = ["fetching", "staging", "diffing", "applying"]

/**
 * Statuses that block STARTING a new run for the vendor. Includes
 * awaiting_approval (finding 8): a parked run must stop new runs so no newer
 * feed applies underneath it — which would make approving the parked run a
 * silent catalog rollback.
 */
export const BLOCKING_STATUSES = [...IN_PROGRESS_STATUSES, "awaiting_approval"]

/** True if some OTHER run for the vendor is actively applying (finding 9). */
export function isVendorBusy(runs: RunLike[], excludeRunId?: string): boolean {
  return runs.some(
    (r) => r.id !== excludeRunId && IN_PROGRESS_STATUSES.includes(r.status)
  )
}

/**
 * True if a COMPLETED run with a strictly newer run_date_vendor exists for the
 * vendor (finding 8): approving `run` would revert the catalog to an older feed.
 */
export function isRunSuperseded(run: RunLike, vendorRuns: RunLike[]): boolean {
  if (!run.run_date_vendor) return false
  const runTime = new Date(run.run_date_vendor).getTime()
  return vendorRuns.some(
    (r) =>
      r.id !== run.id &&
      r.status === "completed" &&
      r.run_date_vendor != null &&
      new Date(r.run_date_vendor).getTime() > runTime
  )
}

/** True if the run is still validly approvable (finding 16). */
export function canApprove(run: RunLike): boolean {
  return run.status === "awaiting_approval" && !run.cancel_requested_at
}
```

- [ ] **Step 4: Point `service.ts` at the shared constant** — delete the local `const IN_PROGRESS_STATUSES = [...]` (currently line ~52) and add to the import block near the other pipeline imports:

```ts
import { IN_PROGRESS_STATUSES } from "./pipeline/lifecycle-guards"
```

(startRun's guard keeps using `IN_PROGRESS_STATUSES` for now — behavior unchanged; T9 switches it to `BLOCKING_STATUSES`.)

- [ ] **Step 5: Run guards suite + typecheck, verify PASS**

Run: `npx jest src/modules/vendor-sync/__tests__/lifecycle-guards.test.ts -v && npx tsc --noEmit`
Expected: guards tests PASS; `tsc` shows no NEW errors.

- [ ] **Step 6: Commit**

```bash
git add src/modules/vendor-sync/pipeline/lifecycle-guards.ts src/modules/vendor-sync/__tests__/lifecycle-guards.test.ts src/modules/vendor-sync/service.ts
git commit -m "fix(vendor-sync): pure run-lifecycle guard helpers (WB-070 F8/F9/F16)"
```

---

### Task 4: A2 — honest stock pass: surface errors + settle the hash (finding 5)

**Files:**
- Modify: `src/modules/vendor-sync/pipeline/apply-stock.ts` (`applyStockLevels`)
- Modify: `src/modules/vendor-sync/pipeline/apply.ts` (sentinel `content_hash` at the 3 group-write sites; merge stock errors in `applyChanges`)
- Modify: `src/modules/vendor-sync/service.ts` (`runStockOnly` log line for the new return shape)
- Test: `src/modules/vendor-sync/__tests__/diff-group.test.ts`

**Interfaces:**
- Produces: `applyStockLevels(container, service, runId, vendorCode, partNumbers, salesChannelId, logger, opts?: { settleHash?: boolean }): Promise<{ updatedCount: number; errors: Array<{ partNumber: string; error: string }> }>`. (T7 adoption + the group writes rely on `content_hash: ""` being settled here.)

- [ ] **Step 1: Lock in the self-heal invariant** — add to `diff-group.test.ts` (this documents that an unsettled `""` hash re-selects the part; it passes on current diff code, which is the point — the sentinel is sound):

```ts
it("classifies an active current row with an unsettled ('') hash as changed", () => {
  const staging = [{ part_number: "P1", group_key: "G", content_hash: "realhash" }]
  const current = [{ part_number: "P1", group_key: "G", content_hash: "", discontinued_at: null }]
  const diff = computeGroupDiffFromSets(staging, current)
  expect(diff.changedGroups).toHaveLength(1)
  expect(diff.changedGroups[0].changed_part_numbers).toEqual(["P1"])
})
```

Run: `npx jest src/modules/vendor-sync/__tests__/diff-group.test.ts -t "unsettled" -v` → PASS (guard).

- [ ] **Step 2: Rework `applyStockLevels`** — in `apply-stock.ts`:

Add the import at top:

```ts
import { computeContentHash } from "../utils/hash"
```

Change the signature + accumulator + return. Replace the signature line and the `let updatedCount = 0 / let errorCount = 0` lines:

```ts
export async function applyStockLevels(
  container: MedusaContainer,
  service: VendorSyncService,
  runId: string,
  vendorCode: string,
  partNumbers: string[],
  salesChannelId: string,
  logger: Logger,
  opts: { settleHash?: boolean } = {}
): Promise<{ updatedCount: number; errors: Array<{ partNumber: string; error: string }> }> {
  const warehouseLocationCache = new Map<string, string>()
  const inventoryService = container.resolve(Modules.INVENTORY)

  let updatedCount = 0
  const errors: Array<{ partNumber: string; error: string }> = []
```

Inside the `try` block, after the `if (changes.creates.length > 0 || changes.updates.length > 0) { ... updatedCount++ }` block, add the hash settlement (finding 5) before the `catch`:

```ts
      // Finding 5: the stock pass is the LAST writer of content_hash. Group
      // processing wrote "" (unsettled); settle it to the real hash only now
      // that this part's stock has been applied. A failure below leaves "" so
      // the next diff re-selects the part. Only for the full apply
      // (settleHash) and only for active (non-discontinued) rows.
      if (opts.settleHash && currentRow.discontinued_at == null) {
        await (service as any).updateVendorProductCurrents({
          id: currentRow.id,
          content_hash: computeContentHash(currentRow.normalized),
        })
      }
```

Replace the `catch` body's `errorCount++` with:

```ts
    } catch (err: any) {
      logger.error(
        `[vendor-sync] [${runId}] Error applying stock for ${partNumber}: ${err.message}`
      )
      errors.push({ partNumber, error: err.message })
    }
```

Replace the final `return { updatedCount, errorCount }` with:

```ts
  return { updatedCount, errors }
```

- [ ] **Step 3: Write `""` sentinels + merge errors in `apply.ts`** — three group-write sites plus `applyChanges`:

**(a)** In `persistGroupAfterCreate`, change the `createVendorProductCurrents` call's `content_hash: stagingRow.content_hash` to:

```ts
      content_hash: "", // unsettled; the stock pass settles on success (F5)
```

**(b)** In `persistAddedVariants`, change the `fields` object's `content_hash: stagingRow.content_hash` to:

```ts
      content_hash: "", // unsettled; settled by the stock pass (F5)
```

**(c)** In `applyChangedGroup`'s changed write-back loop (`updateVendorProductCurrents({ id: currentRow.id, content_hash: stagingRow.content_hash, ... })`), change `content_hash: stagingRow.content_hash` to:

```ts
        content_hash: "", // unsettled; settled by the stock pass (F5)
```

**(d)** In `applyChanges`, replace the stock-pass block (`const stockResult = await applyStockLevels(...)` + its `logger.info`) with:

```ts
  if (!cancelled && stockPartNumbers.length > 0) {
    const stockResult = await applyStockLevels(
      container,
      service,
      runId,
      vendorCode,
      stockPartNumbers,
      salesChannelId,
      logger,
      { settleHash: true }
    )
    // Finding 5: stock errors are real apply errors — merge them so
    // finalizeApply marks partially_failed/exhausted (not completed) and
    // failed_part_numbers surfaces them for the console + replay-sku.
    for (const e of stockResult.errors) {
      errors.push({ partNumber: e.partNumber, error: e.error })
    }
    logger.info(
      `[vendor-sync] [${runId}] Stock levels applied: ${stockResult.updatedCount} updated, ${stockResult.errors.length} errors`
    )
  }
```

- [ ] **Step 4: Fix the `runStockOnly` log line** — in `service.ts`, the stock-only path calls `applyStockLevels(...)` without `settleHash` (default false — correct, it must not touch hashes). Update its log to the new shape:

```ts
      const stockResult = await applyStockLevels(container, this, runId, vendorCode, parts, salesChannelId, this.logger_)
      this.logger_.info(`[vendor-sync] [${runId}] stock-only: ${stockResult.updatedCount} updated, ${stockResult.errors.length} errors over ${parts.length} parts`)
```

- [ ] **Step 5: Typecheck + test suite, verify PASS**

Run: `npx tsc --noEmit && pnpm test:sync`
Expected: no NEW `tsc` errors; all vendor-sync tests green (the diff-group guard + everything else).

- [ ] **Step 6: Commit**

```bash
git add src/modules/vendor-sync/pipeline/apply-stock.ts src/modules/vendor-sync/pipeline/apply.ts src/modules/vendor-sync/service.ts src/modules/vendor-sync/__tests__/diff-group.test.ts
git commit -m "fix(vendor-sync): stock pass surfaces errors + owns settled content_hash (WB-070 F5)"
```

---

### Task 5: B4 — re-listed variants get refreshed (findings 2, 4)

**Files:**
- Modify: `src/modules/vendor-sync/pipeline/apply.ts` (add `refreshReListedVariants`; wire `toAdopt` in both `applyChangedGroup` branches)

**Interfaces:**
- Produces: `async function refreshReListedVariants(ctx: ApplyContext, productId: string, records: NormalizedRecord[]): Promise<void>` — clears `discontinued` flags + refreshes price/metadata for variants already on the product. (T7 adoption reuses it.)
- Consumes: `partitionRecordsBySku` `{ toCreate, toAdopt }` from `adopt.ts`.

- [ ] **Step 1: Add the `refreshReListedVariants` helper** — in `apply.ts`, near the other helpers (after `persistAddedVariants`):

```ts
/**
 * Findings 2/4: a previously-removed variant the vendor re-lists is adopted
 * onto an existing product. Clear its discontinued flags and refresh price +
 * metadata so it is neither hidden nor stale. Explicit discontinued:false /
 * discontinued_at:null defends against Medusa metadata-merge semantics.
 * (product.updated is emitted separately by applyChanges.)
 */
async function refreshReListedVariants(
  ctx: ApplyContext,
  productId: string,
  records: NormalizedRecord[]
): Promise<void> {
  if (records.length === 0) return
  const query = ctx.container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: variants } = await query.graph({
    entity: "variant",
    fields: ["id", "sku"],
    filters: { product_id: [productId] },
  })
  const idBySku = new Map<string, string>()
  for (const v of variants ?? []) {
    if ((v as any).sku) idBySku.set((v as any).sku, (v as any).id)
  }

  const updates = records
    .map((r) => {
      const id = idBySku.get(r.partNumber)
      if (!id) return null
      return {
        id,
        allow_backorder: false,
        metadata: {
          ...buildVariantMetadata(r),
          discontinued: false,
          discontinued_at: null,
        },
        prices: [{ amount: r.msrpUsd, currency_code: "usd" }],
        ...wheelVariantWeight(r),
      }
    })
    .filter((u): u is NonNullable<typeof u> => u !== null)

  if (updates.length > 0) {
    await updateProductVariantsWorkflow(ctx.container).run({
      input: { product_variants: updates },
    })
  }
}
```

- [ ] **Step 2: Wire `toAdopt` in the wheel added-path** — in `applyChangedGroup`, the wheel branch destructures `const { toCreate: skuNew } = partitionRecordsBySku(wheelAdds, existingSkus)`. Change it to capture `toAdopt`, and refresh those before persisting:

```ts
      const { toCreate: skuNew, toAdopt } = partitionRecordsBySku(wheelAdds, existingSkus)
```

Then, immediately before the `const toPersist = wheelAdds.filter(...)` line, add:

```ts
      // Finding 4: SKUs already on the product (re-listed after removal) are
      // otherwise only given a current-row write — refresh the live variant so
      // discontinued flags clear and the price is current.
      await refreshReListedVariants(ctx, productId, toAdopt)
```

- [ ] **Step 3: Wire `toAdopt` in the tire added-path** — in the tire branch, change `const { toCreate: skuNew } = partitionRecordsBySku(tireAdds, existingSkus)` to capture `toAdopt`, and add the same refresh before its `const toPersist = tireAdds.filter(...)`:

```ts
      const { toCreate: skuNew, toAdopt } = partitionRecordsBySku(tireAdds, existingSkus)
```

```ts
      await refreshReListedVariants(ctx, productId, toAdopt)
```

(The `replaySku` re-add path routes through this same added-path, so it is covered automatically.)

- [ ] **Step 4: Typecheck + tests, verify PASS**

Run: `npx tsc --noEmit && pnpm test:sync`
Expected: no NEW `tsc` errors; tests green. (No runnable unit test for the workflow call — verified by build + review; the `it.todo` integration case "re-listed variant" would cover it under `RUN_INTEGRATION`.)

- [ ] **Step 5: Commit**

```bash
git add src/modules/vendor-sync/pipeline/apply.ts
git commit -m "fix(vendor-sync): refresh re-listed variants (clear discontinued + price) (WB-070 F2/F4)"
```

---

### Task 6: C1 — emit `product.updated` after variant-only mutations (finding 6)

**Files:**
- Modify: `src/modules/vendor-sync/pipeline/apply.ts` (`ApplyContext` gains `touchedProductIds`; `applyChangedGroup` records; `applyChanges` emits)

**Interfaces:**
- Produces: `ApplyContext.touchedProductIds: Set<string>` — collected across the run and emitted once each. (T7 adds the republished product id to it.)

- [ ] **Step 1: Add `touchedProductIds` to `ApplyContext`** — in the `interface ApplyContext { ... }`, add:

```ts
  touchedProductIds: Set<string>
```

And in `applyChanges` where `const ctx: ApplyContext = { ... }` is built, add the field:

```ts
    brandCollectionCache: new Map<string, Promise<string>>(),
    touchedProductIds: new Set<string>(),
```

- [ ] **Step 2: Record touched products in `applyChangedGroup`** — at the end of `applyChangedGroup`, immediately before `return { variantCount }`, add:

```ts
  // Finding 6: the changed path mutates variants/options only, which never
  // emits product.updated — so Meilisearch keeps stale price_min/facets. Record
  // the product so applyChanges emits one product.updated for it.
  ctx.touchedProductIds.add(productId)
```

- [ ] **Step 3: Emit after the stock pass in `applyChanges`** — immediately after the stock-pass `if (...) { ... }` block and before the final `logger.info("... Apply complete ...")`, add:

```ts
  // Finding 6: re-index changed/re-listed products in Meilisearch. New-group
  // create and discontinue already emit via createProducts/updateProducts
  // workflows; this covers variant-only mutations. Emitted even if the stock
  // pass errored — the variant/price change committed and must be indexed.
  if (ctx.touchedProductIds.size > 0) {
    const eventBus = container.resolve(Modules.EVENT_BUS)
    for (const id of ctx.touchedProductIds) {
      await eventBus.emit({ name: "product.updated", data: { id } })
    }
    logger.info(
      `[vendor-sync] [${runId}] emitted product.updated for ${ctx.touchedProductIds.size} products (reindex)`
    )
  }
```

- [ ] **Step 4: Typecheck + tests, verify PASS**

Run: `npx tsc --noEmit && pnpm test:sync`
Expected: no NEW `tsc` errors (`Modules` is already imported in apply.ts); tests green.

- [ ] **Step 5: Commit**

```bash
git add src/modules/vendor-sync/pipeline/apply.ts
git commit -m "fix(vendor-sync): emit product.updated for changed products so Meili reindexes (WB-070 F6)"
```

---

### Task 7: B1 + B2 — adoption republishes and never writes zombie rows (findings 2, 3)

**Files:**
- Modify: `src/modules/vendor-sync/pipeline/apply.ts` (`findProductByExternalId` fields; new `addVariantsToProduct`; rewrite `persistAdoptedGroup`)

**Interfaces:**
- Consumes: `refreshReListedVariants` (T5), `ctx.touchedProductIds` (T6), `dedupeExactDuplicates`/`dedupeTireExactDuplicates`, `indexVariantsBySku`, `buildWheelVariantInput`, `extendWheelOptions`/`extendTireOptions`, `buildTireVariantOptions`, `buildVariantMetadata`.
- Produces: `async function addVariantsToProduct(ctx, productId, records, productType): Promise<Map<string, { variantId: string; inventoryItemId: string | null }>>`.

- [ ] **Step 1: Widen `findProductByExternalId`** — add `status`, `metadata`, and per-variant `metadata` to the graph fields so the adopt branch can tell "partial apply" (published) from "re-listed" (draft/discontinued):

```ts
    fields: [
      "id",
      "status",
      "metadata",
      "variants.id",
      "variants.sku",
      "variants.metadata",
      "variants.inventory_items.inventory_item_id",
    ],
```

- [ ] **Step 2: Add `addVariantsToProduct`** — a focused helper that creates the missing variants on an existing product (findings 3). Place it after `refreshReListedVariants`:

```ts
/**
 * Create the given records as NEW variants on an existing product and return a
 * SKU -> {variantId, inventoryItemId} index over the product's full variant set
 * afterwards. Used by adoption (finding 3) to heal a product that exists but is
 * missing variants, instead of persisting a null-variant current row.
 */
async function addVariantsToProduct(
  ctx: ApplyContext,
  productId: string,
  records: NormalizedRecord[],
  productType: "wheel" | "tire"
): Promise<Map<string, { variantId: string; inventoryItemId: string | null }>> {
  if (records.length > 0) {
    if (productType === "wheel") {
      const wheels = records as WheelNormalizedRecord[]
      await extendWheelOptions(ctx, productId, wheels)
      await createProductVariantsWorkflow(ctx.container).run({
        input: {
          product_variants: wheels.map((r) => ({
            product_id: productId,
            ...buildWheelVariantInput(r),
          })),
        },
      })
    } else {
      const tires = records as TireNormalizedRecord[]
      await extendTireOptions(ctx, productId, tires)
      await createProductVariantsWorkflow(ctx.container).run({
        input: {
          product_variants: tires.map((r) => ({
            product_id: productId,
            title: tireSizeLabelForVariantTitle(r),
            sku: r.partNumber,
            options: buildTireVariantOptions(r),
            manage_inventory: true,
            allow_backorder: false,
            metadata: buildVariantMetadata(r),
            prices: [{ amount: r.msrpUsd, currency_code: "usd" }],
          })),
        },
      })
    }
  }

  // Re-query the product's variants (with inventory item ids) to index by SKU.
  const query = ctx.container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: variants } = await query.graph({
    entity: "variant",
    fields: ["id", "sku", "inventory_items.inventory_item_id"],
    filters: { product_id: [productId] },
  })
  return indexVariantsBySku(variants ?? [])
}
```

- [ ] **Step 3: Rewrite `persistAdoptedGroup`** — replace the whole function body with the dedupe → republish → create-missing → refresh → persist flow:

```ts
async function persistAdoptedGroup(
  ctx: ApplyContext,
  group: NewGroup,
  records: NormalizedRecord[],
  existingProduct: any
): Promise<void> {
  const productType: "wheel" | "tire" =
    records[0]?.productType === "tire" ? "tire" : "wheel"

  // 1. Dedupe like the create path so dropped duplicates never get a row (F3).
  const deduped: NormalizedRecord[] =
    productType === "wheel"
      ? dedupeExactDuplicates(records as WheelNormalizedRecord[]).survivors
      : (dedupeTireExactDuplicates(records as TireNormalizedRecord[])
          .survivors as NormalizedRecord[])

  // 2. Re-list detection (F2): the product was drafted when discontinued.
  const relisted =
    existingProduct.status === "draft" ||
    (existingProduct.metadata as any)?.discontinued_at != null
  if (relisted) {
    const meta = { ...((existingProduct.metadata as any) ?? {}) }
    delete meta.discontinued_at
    await updateProductsWorkflow(ctx.container).run({
      input: {
        selector: { id: existingProduct.id },
        update: { status: "published" as any, metadata: meta },
      },
    })
    ctx.touchedProductIds.add(existingProduct.id)
  }

  // 3. Create any variant that does not yet exist on the product (F3).
  let skuIndex = indexVariantsBySku(existingProduct.variants ?? [])
  const missing = deduped.filter((r) => !skuIndex.get(r.partNumber)?.variantId)
  if (missing.length > 0) {
    skuIndex = await addVariantsToProduct(
      ctx,
      existingProduct.id,
      missing,
      productType
    )
  }

  // 4. Refresh the variants that already existed when re-listing (F2/F4).
  if (relisted) {
    const missingSet = new Set(missing.map((r) => r.partNumber))
    const existed = deduped.filter((r) => !missingSet.has(r.partNumber))
    await refreshReListedVariants(ctx, existingProduct.id, existed)
  }

  // 5. Persist current rows with REAL variant ids + unsettled hash. Never write
  //    a null-variant row (F3): a truly unresolvable SKU throws so the group is
  //    recorded partially_failed and retried.
  for (const r of deduped) {
    const info = skuIndex.get(r.partNumber)
    if (!info?.variantId) {
      throw new Error(
        `adopt: could not resolve or create a variant for ${r.partNumber} (group ${group.group_key})`
      )
    }
    const fields = {
      group_key: r.groupKey,
      content_hash: "", // settled by the stock pass on success (F5)
      medusa_product_id: existingProduct.id,
      medusa_variant_id: info.variantId,
      inventory_item_id: info.inventoryItemId ?? null,
      normalized: r,
      last_seen_run_id: ctx.runId,
      applied_at: new Date(),
      discontinued_at: null,
    }
    const [existingRow] = await (ctx.service as any).listVendorProductCurrents(
      { vendor_code: ctx.vendorCode, part_number: r.partNumber },
      { take: 1 }
    )
    if (existingRow) {
      await (ctx.service as any).updateVendorProductCurrents({
        id: existingRow.id,
        ...fields,
      })
    } else {
      await (ctx.service as any).createVendorProductCurrents({
        vendor_code: ctx.vendorCode,
        part_number: r.partNumber,
        ...fields,
      })
    }
  }
}
```

- [ ] **Step 4: Typecheck + tests, verify PASS**

Run: `npx tsc --noEmit && pnpm test:sync`
Expected: no NEW `tsc` errors; tests green. (Runtime behavior verified by build + review; `it.todo` integration cases would cover it under `RUN_INTEGRATION`. Axis-collision on adoption is finding #13 — out of scope, unchanged.)

- [ ] **Step 5: Commit**

```bash
git add src/modules/vendor-sync/pipeline/apply.ts
git commit -m "fix(vendor-sync): adoption republishes re-listed products + heals missing variants, no zombie rows (WB-070 F2/F3)"
```

---

### Task 8: D1 — dry runs get their own mode (finding 7)

**Files:**
- Modify: `src/modules/vendor-sync/service.ts` (`run()` passes dry-aware mode)
- Modify: `src/api/admin/vendor-sync/runs/route.ts` (`startRun` dry-aware mode)
- Modify: `src/admin/routes/vendor-sync/page.tsx` (add a real "Run sync" action)

**Interfaces:**
- Consumes: `startRun(vendorCode, mode)` — `mode` may now be `"dry"`. The full-run delta + RunDate short-circuit already filter `mode: "full"`, so `"dry"` rows are invisible to them.

- [ ] **Step 1: Make `run()` create dry runs with `mode:"dry"`** — in `service.ts`, replace the first two lines of `run()`:

```ts
  async run(
    vendorCode: string,
    options?: { dryRun?: boolean; container?: MedusaContainer; allowSample?: boolean }
  ): Promise<{ runId: string }> {
    const isDry = options?.dryRun ?? this.options_.dryRun ?? false
    const started = await this.startRun(vendorCode, isDry ? "dry" : "full")
    if (started.inProgress) return { runId: started.runId }
    await this.executeRun(started.runId, vendorCode, options)
    return { runId: started.runId }
  }
```

- [ ] **Step 2: Make the admin trigger route create dry runs with `mode:"dry"`** — in `runs/route.ts` POST, replace the `startRun` call:

```ts
  const { runId, inProgress: reservedInProgress } = await service.startRun(
    vendor_code,
    dry_run ? "dry" : "full"
  )
```

- [ ] **Step 3: Add a real "Run sync" action to the admin console** — in `page.tsx`, add a full-run handler mirroring `onTrigger` (which passes `true`):

```ts
  const onTriggerFull = async () => {
    try {
      await triggerRun(triggerVendor, false)
      toast.success(`Sync started for ${triggerVendor}`)
      load()
    } catch (e: any) {
      toast.error(e?.message ?? "Trigger failed")
    }
  }
```

Then, in the JSX where the existing dry-run trigger `<Button ... onClick={onTrigger}>` renders, add a sibling primary button next to it:

```tsx
<Button variant="primary" size="small" onClick={onTriggerFull}>
  Run sync
</Button>
```

Keep the existing dry-run button (relabel its text to "Dry-run" if it isn't already). Match the surrounding `@medusajs/ui` `Button` usage and spacing exactly as the neighboring button.

- [ ] **Step 4: Typecheck + tests, verify PASS**

Run: `npx tsc --noEmit && pnpm test:sync`
Expected: no NEW `tsc` errors; tests green. (Admin `.tsx` compiles via the admin bundler at build time — final check is Task 10's `medusa build`.)

- [ ] **Step 5: Commit**

```bash
git add src/modules/vendor-sync/service.ts src/api/admin/vendor-sync/runs/route.ts src/admin/routes/vendor-sync/page.tsx
git commit -m "fix(vendor-sync): dry runs use mode:dry so they never skip the next real sync (WB-070 F7)"
```

---

### Task 9: D2 + D3 — blocking guard + approve/replay locks (findings 8, 9, 16)

**Files:**
- Modify: `src/modules/vendor-sync/service.ts` (`startRun` guard → `BLOCKING_STATUSES`; `approveAndApply` re-validate + lock + supersede; `replayRun`/`replaySku` lock)
- Modify: `src/api/admin/vendor-sync/runs/route.ts` (pre-check → `BLOCKING_STATUSES`)
- Modify: `src/api/admin/vendor-sync/runs/[id]/approve/route.ts` (vendor-busy 409)
- Modify: `src/api/admin/vendor-sync/runs/[id]/replay/route.ts` (vendor-busy 409)

**Interfaces:**
- Consumes: `BLOCKING_STATUSES`, `isVendorBusy`, `isRunSuperseded`, `canApprove` from `lifecycle-guards.ts` (T3).

- [ ] **Step 1: Import the guards + block on `awaiting_approval` in `startRun`** — in `service.ts`, extend the lifecycle-guards import and switch the guard:

```ts
import {
  IN_PROGRESS_STATUSES,
  BLOCKING_STATUSES,
  isVendorBusy,
  isRunSuperseded,
  canApprove,
} from "./pipeline/lifecycle-guards"
```

In `startRun`, change the in-progress guard query status list from `IN_PROGRESS_STATUSES` to `BLOCKING_STATUSES`:

```ts
    const inProgress = await (this as any).listVendorFeedRuns(
      { vendor_code: vendorCode, status: BLOCKING_STATUSES },
      { take: 1 }
    )
```

(Keep the `IN_PROGRESS_STATUSES` import — `isVendorBusy` uses it internally, and it may remain referenced elsewhere; if `tsc` flags it as unused after this change, drop it from the import list.)

- [ ] **Step 2: Re-validate + lock + supersede in `approveAndApply`** — replace the opening of `approveAndApply` (the initial `updateVendorFeedRuns({ id: runId, status: "applying", ... })` call, before the `try`) with a guard preamble, then set applying:

```ts
  async approveAndApply(
    runId: string,
    actorId?: string,
    container?: MedusaContainer
  ): Promise<void> {
    // F16: re-read — the run may have been cancelled between the 202 and this
    // subscriber firing. Do not apply a run that is no longer approvable.
    const [current] = await (this as any).listVendorFeedRuns({ id: runId })
    if (!current || !canApprove(current)) {
      this.logger_.warn(
        `[vendor-sync] [${runId}] approve skipped: status=${current?.status} cancel=${current?.cancel_requested_at}`
      )
      return
    }
    const vendorCode = current.vendor_code
    const vendorRuns = await (this as any).listVendorFeedRuns(
      { vendor_code: vendorCode },
      { order: { started_at: "DESC" }, take: 25 }
    )
    // F9: never run two apply loops for one vendor at once.
    if (isVendorBusy(vendorRuns, runId)) {
      this.logger_.warn(
        `[vendor-sync] [${runId}] approve skipped: another run is applying for ${vendorCode}`
      )
      return
    }
    // F8: refuse a stale approval that would roll the catalog back.
    if (isRunSuperseded(current, vendorRuns)) {
      this.logger_.warn(
        `[vendor-sync] [${runId}] approve refused: superseded by a newer completed feed`
      )
      await (this as any).updateVendorFeedRuns({
        id: runId,
        status: "superseded",
        finished_at: new Date(),
      })
      return
    }

    await (this as any).updateVendorFeedRuns({
      id: runId,
      status: "applying",
      approved_by: actorId ?? "admin",
      approved_at: new Date(),
      cancel_requested_at: null,
    })

    try {
```

Then in the `try` body, delete the now-redundant `const [run] = await ...` + `const vendorCode = run.vendor_code` lines (both are already resolved as `current`/`vendorCode` above) and use `current` where `run` was referenced (the `feedDate: run.run_date_vendor ? ...` becomes `current.run_date_vendor`).

- [ ] **Step 3: Lock `replayRun`** — in `replayRun`, after `const vendorCode = run.vendor_code` and before the `updateVendorFeedRuns({ id: runId, status: "applying", ... })`, add:

```ts
    const vendorRuns = await (this as any).listVendorFeedRuns(
      { vendor_code: vendorCode },
      { order: { started_at: "DESC" }, take: 25 }
    )
    if (isVendorBusy(vendorRuns, runId)) {
      throw new Error(
        `replay refused: another run is applying for ${vendorCode}`
      )
    }
```

- [ ] **Step 4: Lock `replaySku`** — in `replaySku`, after `const runId = stagingRow.run_id` (and before it clears the cancel flag / applies), add:

```ts
    const vendorRuns = await (this as any).listVendorFeedRuns(
      { vendor_code: vendorCode },
      { order: { started_at: "DESC" }, take: 25 }
    )
    if (isVendorBusy(vendorRuns, runId)) {
      throw new Error(
        `replay-sku refused: another run is applying for ${vendorCode}`
      )
    }
```

- [ ] **Step 5: Route pre-checks (nicer synchronous 409s)** —

In `runs/route.ts`, add the import and switch the pre-check list to blocking:

```ts
import { BLOCKING_STATUSES } from "../../../../modules/vendor-sync/pipeline/lifecycle-guards"
```

```ts
  const inProgress = await service.listVendorFeedRuns({
    vendor_code,
    status: BLOCKING_STATUSES,
  })
```

In `runs/[id]/approve/route.ts`, after the `run.status !== "awaiting_approval"` guard and before emitting the event, add a vendor-busy pre-check:

```ts
  const { isVendorBusy } = await import(
    "../../../../../../modules/vendor-sync/pipeline/lifecycle-guards"
  )
  const vendorRuns = await service.listVendorFeedRuns(
    { vendor_code: run.vendor_code },
    { order: { started_at: "DESC" }, take: 25 }
  )
  if (isVendorBusy(vendorRuns, id)) {
    res.status(409).json({
      type: "conflict",
      message: "Another run is applying for this vendor",
    })
    return
  }
```

In `runs/[id]/replay/route.ts`, after the status guard and before emitting, add the identical vendor-busy pre-check (same code, using this route's `run` + `id`).

- [ ] **Step 6: Typecheck + tests, verify PASS**

Run: `npx tsc --noEmit && pnpm test:sync`
Expected: no NEW `tsc` errors; tests green (lifecycle-guards suite already covers the predicates).

- [ ] **Step 7: Commit**

```bash
git add src/modules/vendor-sync/service.ts src/api/admin/vendor-sync/runs/route.ts "src/api/admin/vendor-sync/runs/[id]/approve/route.ts" "src/api/admin/vendor-sync/runs/[id]/replay/route.ts"
git commit -m "fix(vendor-sync): block awaiting_approval + lock approve/replay + re-validate (WB-070 F8/F9/F16)"
```

---

### Task 10: Full gate sweep

**Files:** none (verification only).

- [ ] **Step 1: Full unit suite**

Run: `pnpm test:sync`
Expected: PASS (all suites, including the 4 new/extended ones).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: only the ~14 pre-existing baseline errors — zero new ones. If a new error traces to a task, fix it and amend that task's commit.

- [ ] **Step 3: Production build**

Run: `pnpm build`
Expected: exit 0 (compiles the admin bundle too — catches `page.tsx` issues from Task 8).

- [ ] **Step 4: Confirm no stray references**

Run: `git grep -n "errorCount" src/modules/vendor-sync/pipeline/apply.ts` and `git grep -n "sortObject" src/modules/vendor-sync`
Expected: no matches (the stock pass now returns `errors`; `sortObject` was removed in Task 1).

- [ ] **Step 5: Final commit if anything changed**

```bash
git add -A && git commit -m "chore(vendor-sync): WB-070 gate sweep — tsc + build green"
```

---

## Self-Review

**Spec coverage:** A1→T2, A2→T4, A3→T1, B1→T7, B2→T7, B3(helper)→T5, B4→T5, C1→T6, D1→T8, D2→T9, D3→T9; #11→T1, #16→T9. All 11 findings mapped. Testing (§5) → T1–T4 unit + T10 gates. Deploy notes (§6) documented; no new migration (mode:"dry" + `""` are values, not schema).

**Type consistency:** `applyStockLevels` return `{ updatedCount, errors }` consumed by `applyChanges` (T4) and `runStockOnly` (T4) identically. `refreshReListedVariants(ctx, productId, records)` defined T5, consumed T7. `addVariantsToProduct(...): Map<sku,{variantId,inventoryItemId}>` defined + consumed T7. `ctx.touchedProductIds: Set<string>` defined T6, consumed T6/T7. Guards (`isVendorBusy`/`isRunSuperseded`/`canApprove`/`BLOCKING_STATUSES`) defined T3, consumed T9. `content_hash: ""` written T4/T7, settled by `applyStockLevels` T4, re-selected by diff (guard test T4).

**Ordering:** T5 (refreshReListedVariants) and T6 (touchedProductIds) both precede T7 (adoption), which consumes both — correct. T3 (guards) precedes T9 (wiring) — correct.

**Placeholder scan:** no TBD/TODO; every code step shows full code. The two admin-console specifics (button JSX placement in T8) reference the existing neighboring button as the exact pattern to mirror, with the handler given in full.
