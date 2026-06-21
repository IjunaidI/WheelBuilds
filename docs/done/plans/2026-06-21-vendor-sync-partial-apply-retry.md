# Vendor-Sync Partial-Apply Retry Implementation Plan (WB-016)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a partial apply failure retry safely instead of being marked `completed` and stranded by the feed short-circuit.

**Architecture:** A `partially_failed` run no longer short-circuits, so the next normal cron run re-applies failed groups idempotently (adopt-by-`external_id`/SKU); a bounded `apply_attempt_count` escalates to `exhausted` to stop churn. Pure decision helpers carry the logic; thin I/O wrappers are regression-tested.

**Tech Stack:** MedusaJS 2.13.6, TypeScript, MikroORM migrations, Jest + `@swc/jest`.

## Global Constraints

- Backlog id: WB-016 (merges WB-038). Spec: `docs/in-progress/specs/2026-06-21-vendor-sync-partial-apply-retry-design.md`.
- `vendor_feed_run.status` is `model.text()` — new statuses (`partially_failed`, `exhausted`) need NO enum change.
- `MedusaService` update takes ONE object: `service.updateVendorFeedRuns({ id, ...fields })` — NOT `(selector, update)` (CLAUDE.md gotcha).
- Migrations here are HAND-AUTHORED minimal ALTERs; the tracked `.snapshot-vendor-sync-module.json` is updated alongside (CLAUDE.md). Module token for the CLI: `vendorSyncModuleService`.
- All Jest commands run from `backend/` via `npx jest <path>` (pnpm may be off PATH on Windows).
- Existing test style: extract PURE functions and unit-test them (see `computeStockChanges`, `computeGroupDiffFromSets`); do NOT mock Medusa core-flow workflows.
- `applyMaxAttempts` default = 3 (total attempts incl. the first).
- End every commit message with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.

---

### Task 1: Migration + model fields (`apply_attempt_count`, `failed_group_keys`)

**Files:**
- Modify: `backend/src/modules/vendor-sync/models/vendor-feed-run.ts:20` (add two fields)
- Create: `backend/src/modules/vendor-sync/migrations/Migration20260621120000.ts`
- Modify: `backend/src/modules/vendor-sync/migrations/.snapshot-vendor-sync-module.json` (add two property blocks)

**Interfaces:**
- Produces: `vendor_feed_run.apply_attempt_count` (integer, NOT NULL, default 0), `vendor_feed_run.failed_group_keys` (jsonb, nullable).

- [ ] **Step 1: Add the model fields**

In `backend/src/modules/vendor-sync/models/vendor-feed-run.ts`, after the `failed_part_numbers` line (currently line 20), add:

```ts
  failed_group_keys: model.json().nullable(),
  apply_attempt_count: model.number().default(0),
```

- [ ] **Step 2: Hand-author the migration**

Create `backend/src/modules/vendor-sync/migrations/Migration20260621120000.ts`:

```ts
import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * WB-016: add apply_attempt_count + failed_group_keys to vendor_feed_run so a
 * partial apply can be retried a bounded number of times before being marked
 * `exhausted`. Hand-authored minimal ALTER to match this module's existing
 * migrations (db:generate emits a drop-everything migration; only the snapshot
 * is taken from the CLI).
 */
export class Migration20260621120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "vendor_feed_run" add column if not exists "failed_group_keys" jsonb null;`
    )
    this.addSql(
      `alter table if exists "vendor_feed_run" add column if not exists "apply_attempt_count" integer not null default 0;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "vendor_feed_run" drop column if exists "failed_group_keys";`
    )
    this.addSql(
      `alter table if exists "vendor_feed_run" drop column if exists "apply_attempt_count";`
    )
  }
}
```

- [ ] **Step 3: Update the module snapshot**

In `backend/src/modules/vendor-sync/migrations/.snapshot-vendor-sync-module.json`, find the `failed_part_numbers` property block inside the `vendor_feed_run` table's `properties`. Immediately after that block's closing `},`, insert two new blocks. **Duplicate the existing `failed_part_numbers` block verbatim and rename it** to `failed_group_keys` (identical jsonb/nullable shape), then **duplicate the existing `row_count` block verbatim and rename it** to `apply_attempt_count` (identical integer/default "0" shape):

```json
        "failed_group_keys": {
          "name": "failed_group_keys",
          "type": "jsonb",
          "unsigned": false,
          "autoincrement": false,
          "primary": false,
          "nullable": true,
          "unique": false,
          "length": null,
          "precision": null,
          "scale": null,
          "default": null,
          "comment": null,
          "enumItems": [],
          "mappedType": "json"
        },
        "apply_attempt_count": {
          "name": "apply_attempt_count",
          "type": "integer",
          "unsigned": false,
          "autoincrement": false,
          "primary": false,
          "nullable": false,
          "unique": false,
          "length": null,
          "precision": null,
          "scale": null,
          "default": "0",
          "comment": null,
          "enumItems": [],
          "mappedType": "integer"
        },
```

(Canonical alternative if a dev DB is reachable: run `node_modules/.bin/medusa db:generate vendorSyncModuleService`, keep the regenerated snapshot, and discard the drop-everything migration it emits — keep the hand-written one above.)

- [ ] **Step 4: Verify JSON + migration compile**

From `backend/`:
```bash
node -e "require('./src/modules/vendor-sync/migrations/.snapshot-vendor-sync-module.json'); console.log('snapshot valid JSON')"
npx tsc --noEmit src/modules/vendor-sync/migrations/Migration20260621120000.ts 2>&1 | head -5 || true
```
Expected: `snapshot valid JSON`. (tsc may print unrelated project-wide drift; the new file itself must have no syntax error.)

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/vendor-sync/models/vendor-feed-run.ts backend/src/modules/vendor-sync/migrations/
git commit -m "feat(vendor-sync): add apply_attempt_count + failed_group_keys to vendor_feed_run (WB-016)"
```

---

### Task 2: Retry-policy pure helpers

**Files:**
- Create: `backend/src/modules/vendor-sync/pipeline/retry-policy.ts`
- Test: `backend/src/modules/vendor-sync/__tests__/retry-policy.test.ts`

**Interfaces:**
- Produces:
  - `decideTerminalStatus(errorCount: number, attempt: number, maxAttempts: number): "completed" | "partially_failed" | "exhausted"`
  - `shouldShortCircuitFeed(latestSameFeedStatus: string | null | undefined): boolean`
  - `nextAttemptNumber(priorAttemptCounts: number[]): number`
  - `uniqueGroupKeys(errors: Array<{ groupKey?: string }>): string[]`

- [ ] **Step 1: Write the failing test**

Create `backend/src/modules/vendor-sync/__tests__/retry-policy.test.ts`:

```ts
import {
  decideTerminalStatus,
  shouldShortCircuitFeed,
  nextAttemptNumber,
  uniqueGroupKeys,
} from "../pipeline/retry-policy"

describe("decideTerminalStatus", () => {
  it("returns completed when there are no errors", () => {
    expect(decideTerminalStatus(0, 1, 3)).toBe("completed")
    expect(decideTerminalStatus(0, 9, 3)).toBe("completed")
  })
  it("returns partially_failed when errors remain and budget is left", () => {
    expect(decideTerminalStatus(2, 1, 3)).toBe("partially_failed")
    expect(decideTerminalStatus(2, 2, 3)).toBe("partially_failed")
  })
  it("returns exhausted when errors remain and attempt reaches the cap", () => {
    expect(decideTerminalStatus(1, 3, 3)).toBe("exhausted")
    expect(decideTerminalStatus(1, 4, 3)).toBe("exhausted")
  })
})

describe("shouldShortCircuitFeed", () => {
  it("short-circuits a completed or exhausted feed", () => {
    expect(shouldShortCircuitFeed("completed")).toBe(true)
    expect(shouldShortCircuitFeed("exhausted")).toBe(true)
  })
  it("does NOT short-circuit a partially_failed / failed / unknown feed", () => {
    expect(shouldShortCircuitFeed("partially_failed")).toBe(false)
    expect(shouldShortCircuitFeed("failed")).toBe(false)
    expect(shouldShortCircuitFeed(undefined)).toBe(false)
    expect(shouldShortCircuitFeed(null)).toBe(false)
  })
})

describe("nextAttemptNumber", () => {
  it("returns 1 for no prior attempts", () => {
    expect(nextAttemptNumber([])).toBe(1)
    expect(nextAttemptNumber([0])).toBe(1)
  })
  it("returns max prior + 1", () => {
    expect(nextAttemptNumber([1, 2, 1])).toBe(3)
  })
})

describe("uniqueGroupKeys", () => {
  it("dedupes group keys and drops entries without one", () => {
    expect(
      uniqueGroupKeys([{ groupKey: "a" }, { groupKey: "a" }, { groupKey: "b" }, {}])
    ).toEqual(["a", "b"])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

From `backend/`: `npx jest src/modules/vendor-sync/__tests__/retry-policy.test.ts`
Expected: FAIL — "Cannot find module '../pipeline/retry-policy'".

- [ ] **Step 3: Write minimal implementation**

Create `backend/src/modules/vendor-sync/pipeline/retry-policy.ts`:

```ts
/**
 * Pure decision helpers for the WB-016 bounded partial-apply retry.
 * No I/O — unit-tested in isolation.
 */

export type TerminalStatus = "completed" | "partially_failed" | "exhausted"

/**
 * Terminal status for a finished apply.
 *  - no errors                       -> completed
 *  - errors, attempt < maxAttempts   -> partially_failed (will be retried)
 *  - errors, attempt >= maxAttempts  -> exhausted (gave up)
 */
export function decideTerminalStatus(
  errorCount: number,
  attempt: number,
  maxAttempts: number
): TerminalStatus {
  if (errorCount === 0) return "completed"
  if (attempt >= maxAttempts) return "exhausted"
  return "partially_failed"
}

/**
 * The RunDate short-circuit fires only when this feed has already reached a
 * "done" state. A `partially_failed` latest run must NOT short-circuit so the
 * next cron cycle retries it.
 */
export function shouldShortCircuitFeed(
  latestSameFeedStatus: string | null | undefined
): boolean {
  return (
    latestSameFeedStatus === "completed" || latestSameFeedStatus === "exhausted"
  )
}

/** Carry the attempt count forward: max over prior same-feed runs + 1. */
export function nextAttemptNumber(priorAttemptCounts: number[]): number {
  const max = priorAttemptCounts.reduce((m, n) => (n > m ? n : m), 0)
  return max + 1
}

/** Unique, defined group keys from an ApplyResult.errors list. */
export function uniqueGroupKeys(errors: Array<{ groupKey?: string }>): string[] {
  const set = new Set<string>()
  for (const e of errors) if (e.groupKey) set.add(e.groupKey)
  return [...set]
}
```

- [ ] **Step 4: Run test to verify it passes**

From `backend/`: `npx jest src/modules/vendor-sync/__tests__/retry-policy.test.ts`
Expected: PASS (4 describes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/vendor-sync/pipeline/retry-policy.ts backend/src/modules/vendor-sync/__tests__/retry-policy.test.ts
git commit -m "feat(vendor-sync): retry-policy pure helpers for WB-016"
```

---

### Task 3: Idempotency pure helpers (`partitionRecordsBySku`, `indexVariantsBySku`)

**Files:**
- Create: `backend/src/modules/vendor-sync/pipeline/adopt.ts`
- Test: `backend/src/modules/vendor-sync/__tests__/adopt.test.ts`

**Interfaces:**
- Produces:
  - `partitionRecordsBySku<T extends { partNumber: string }>(records: T[], existingSkus: Set<string>): { toCreate: T[]; toAdopt: T[] }`
  - `indexVariantsBySku(variants: any[]): Map<string, { variantId: string; inventoryItemId: string | null }>`

- [ ] **Step 1: Write the failing test**

Create `backend/src/modules/vendor-sync/__tests__/adopt.test.ts`:

```ts
import { partitionRecordsBySku, indexVariantsBySku } from "../pipeline/adopt"

describe("partitionRecordsBySku", () => {
  const recs = [{ partNumber: "A" }, { partNumber: "B" }, { partNumber: "C" }]

  it("creates all when none exist", () => {
    const { toCreate, toAdopt } = partitionRecordsBySku(recs, new Set())
    expect(toCreate.map((r) => r.partNumber)).toEqual(["A", "B", "C"])
    expect(toAdopt).toEqual([])
  })
  it("adopts all when all exist", () => {
    const { toCreate, toAdopt } = partitionRecordsBySku(recs, new Set(["A", "B", "C"]))
    expect(toCreate).toEqual([])
    expect(toAdopt.map((r) => r.partNumber)).toEqual(["A", "B", "C"])
  })
  it("splits a mix", () => {
    const { toCreate, toAdopt } = partitionRecordsBySku(recs, new Set(["B"]))
    expect(toCreate.map((r) => r.partNumber)).toEqual(["A", "C"])
    expect(toAdopt.map((r) => r.partNumber)).toEqual(["B"])
  })
})

describe("indexVariantsBySku", () => {
  it("maps sku -> variantId + inventoryItemId, skipping sku-less rows", () => {
    const index = indexVariantsBySku([
      { id: "var_1", sku: "A", inventory_items: [{ inventory_item_id: "inv_1" }] },
      { id: "var_2", sku: "B", inventory_items: [] },
      { id: "var_3" },
    ])
    expect(index.get("A")).toEqual({ variantId: "var_1", inventoryItemId: "inv_1" })
    expect(index.get("B")).toEqual({ variantId: "var_2", inventoryItemId: null })
    expect(index.size).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

From `backend/`: `npx jest src/modules/vendor-sync/__tests__/adopt.test.ts`
Expected: FAIL — "Cannot find module '../pipeline/adopt'".

- [ ] **Step 3: Write minimal implementation**

Create `backend/src/modules/vendor-sync/pipeline/adopt.ts`:

```ts
/**
 * Pure idempotency helpers (WB-016). A retry must not re-create products or
 * variants left behind by a prior failed attempt.
 */

/** Partition records into those whose SKU (== partNumber) already exists. */
export function partitionRecordsBySku<T extends { partNumber: string }>(
  records: T[],
  existingSkus: Set<string>
): { toCreate: T[]; toAdopt: T[] } {
  const toCreate: T[] = []
  const toAdopt: T[] = []
  for (const r of records) {
    if (existingSkus.has(r.partNumber)) toAdopt.push(r)
    else toCreate.push(r)
  }
  return { toCreate, toAdopt }
}

/** Index a product's variants by SKU -> { variantId, inventoryItemId }. */
export function indexVariantsBySku(
  variants: any[]
): Map<string, { variantId: string; inventoryItemId: string | null }> {
  const m = new Map<string, { variantId: string; inventoryItemId: string | null }>()
  for (const v of variants ?? []) {
    if (!v?.sku) continue
    m.set(v.sku, {
      variantId: v.id,
      inventoryItemId: v.inventory_items?.[0]?.inventory_item_id ?? null,
    })
  }
  return m
}
```

- [ ] **Step 4: Run test to verify it passes**

From `backend/`: `npx jest src/modules/vendor-sync/__tests__/adopt.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/vendor-sync/pipeline/adopt.ts backend/src/modules/vendor-sync/__tests__/adopt.test.ts
git commit -m "feat(vendor-sync): idempotency pure helpers (partition/index by SKU) for WB-016"
```

---

### Task 4: `finalizeApply` + `applyMaxAttempts` option

**Files:**
- Create: `backend/src/modules/vendor-sync/pipeline/finalize-apply.ts`
- Test: `backend/src/modules/vendor-sync/__tests__/finalize-apply.test.ts`
- Modify: `backend/src/modules/vendor-sync/service.ts:22-39` (add `applyMaxAttempts` to options interface)
- Modify: `backend/src/lib/constants.ts` (export `VENDOR_SYNC_APPLY_MAX_ATTEMPTS`)
- Modify: `backend/medusa-config.js` (read option), `backend/.env.template` (note)

**Interfaces:**
- Consumes: `decideTerminalStatus`, `nextAttemptNumber`, `uniqueGroupKeys` (Task 2); `ApplyResult` from `./apply`.
- Produces: `finalizeApply(service, params: { runId: string; vendorCode: string; feedDate: Date | null; result: ApplyResult; maxAttempts: number }): Promise<{ status: string; attempt: number }>`

- [ ] **Step 1: Write the failing test**

Create `backend/src/modules/vendor-sync/__tests__/finalize-apply.test.ts`:

```ts
import { finalizeApply } from "../pipeline/finalize-apply"

function makeService(priorRuns: any[] = []) {
  return {
    updates: [] as any[],
    async listVendorFeedRuns() {
      return priorRuns
    },
    async updateVendorFeedRuns(data: any) {
      this.updates.push(data)
      return data
    },
  }
}

const ok = { processedCount: 1, groupCount: 1, errorCount: 0, errors: [], cancelled: false }
const partial = {
  processedCount: 0,
  groupCount: 0,
  errorCount: 1,
  errors: [{ groupKey: "g1", error: "boom" }],
  cancelled: false,
}

describe("finalizeApply", () => {
  it("marks a clean apply completed and clears failure columns", async () => {
    const svc = makeService()
    const out = await finalizeApply(svc as any, {
      runId: "run_1", vendorCode: "v", feedDate: new Date("2026-06-08"), result: ok, maxAttempts: 3,
    })
    expect(out.status).toBe("completed")
    expect(svc.updates[0]).toMatchObject({
      id: "run_1", status: "completed", failed_part_numbers: null, failed_group_keys: null, apply_attempt_count: 1,
    })
  })

  it("marks a first partial failure partially_failed with attempt 1", async () => {
    const svc = makeService()
    const out = await finalizeApply(svc as any, {
      runId: "run_1", vendorCode: "v", feedDate: new Date("2026-06-08"), result: partial, maxAttempts: 3,
    })
    expect(out.status).toBe("partially_failed")
    expect(svc.updates[0]).toMatchObject({
      status: "partially_failed", apply_attempt_count: 1, failed_group_keys: ["g1"],
    })
  })

  it("escalates to exhausted at the attempt cap (carrying prior same-feed attempts)", async () => {
    const svc = makeService([
      { id: "old", run_date_vendor: "2026-06-08", apply_attempt_count: 2 },
    ])
    const out = await finalizeApply(svc as any, {
      runId: "run_2", vendorCode: "v", feedDate: new Date("2026-06-08"), result: partial, maxAttempts: 3,
    })
    expect(out.attempt).toBe(3)
    expect(out.status).toBe("exhausted")
  })

  it("on cancellation only records partial-progress failures (no status change)", async () => {
    const svc = makeService()
    const out = await finalizeApply(svc as any, {
      runId: "run_1", vendorCode: "v", feedDate: null,
      result: { ...partial, cancelled: true }, maxAttempts: 3,
    })
    expect(out.status).toBe("cancelled")
    expect(svc.updates[0]).toMatchObject({ id: "run_1", failed_group_keys: ["g1"] })
    expect(svc.updates[0].status).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

From `backend/`: `npx jest src/modules/vendor-sync/__tests__/finalize-apply.test.ts`
Expected: FAIL — "Cannot find module '../pipeline/finalize-apply'".

- [ ] **Step 3: Write minimal implementation**

Create `backend/src/modules/vendor-sync/pipeline/finalize-apply.ts`:

```ts
import { ApplyResult } from "./apply"
import {
  decideTerminalStatus,
  nextAttemptNumber,
  uniqueGroupKeys,
} from "./retry-policy"

interface FinalizeService {
  listVendorFeedRuns(filter: any, config?: any): Promise<any[]>
  updateVendorFeedRuns(data: any): Promise<any>
}

/**
 * Single terminal transition for an apply (WB-016), shared by run /
 * approveAndApply / replayRun. On cancellation, preserve today's behavior
 * (record partial-progress failures only). Otherwise compute the bounded
 * attempt number and set completed / partially_failed / exhausted.
 */
export async function finalizeApply(
  service: FinalizeService,
  params: {
    runId: string
    vendorCode: string
    feedDate: Date | null
    result: ApplyResult
    maxAttempts: number
  }
): Promise<{ status: string; attempt: number }> {
  const { runId, vendorCode, feedDate, result, maxAttempts } = params

  if (result.cancelled) {
    if (result.errors.length > 0) {
      await service.updateVendorFeedRuns({
        id: runId,
        failed_part_numbers: result.errors,
        failed_group_keys: uniqueGroupKeys(result.errors),
      })
    }
    return { status: "cancelled", attempt: 0 }
  }

  const priorCounts = feedDate
    ? (
        await service.listVendorFeedRuns(
          { vendor_code: vendorCode },
          { order: { started_at: "DESC" }, take: 25 }
        )
      )
        .filter(
          (r: any) =>
            r.id !== runId &&
            r.run_date_vendor != null &&
            new Date(r.run_date_vendor).getTime() === feedDate.getTime()
        )
        .map((r: any) => Number(r.apply_attempt_count ?? 0))
    : []

  const attempt = nextAttemptNumber(priorCounts)
  const status = decideTerminalStatus(result.errorCount, attempt, maxAttempts)
  const hasErrors = result.errors.length > 0

  await service.updateVendorFeedRuns({
    id: runId,
    status,
    failed_part_numbers: hasErrors ? result.errors : null,
    failed_group_keys: hasErrors ? uniqueGroupKeys(result.errors) : null,
    apply_attempt_count: attempt,
    finished_at: new Date(),
  })

  return { status, attempt }
}
```

- [ ] **Step 4: Run test to verify it passes**

From `backend/`: `npx jest src/modules/vendor-sync/__tests__/finalize-apply.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Add the `applyMaxAttempts` module option**

In `backend/src/modules/vendor-sync/service.ts`, in the `VendorSyncModuleOptions` interface (after `applyConcurrency?: number` on line 24), add:

```ts
  /** WB-016: max apply attempts per feed before a partial failure becomes `exhausted` (default 3). */
  applyMaxAttempts?: number
```

In `backend/src/lib/constants.ts`, after the `VENDOR_SYNC_APPLY_CONCURRENCY` export (line 109), add:

```ts
export const VENDOR_SYNC_APPLY_MAX_ATTEMPTS = process.env.VENDOR_SYNC_APPLY_MAX_ATTEMPTS
```

In `backend/medusa-config.js`, add `VENDOR_SYNC_APPLY_MAX_ATTEMPTS` to the import list from `lib/constants` (next to `VENDOR_SYNC_APPLY_CONCURRENCY`), and in the vendor-sync module options block (after the `applyConcurrency` line ~197) add:

```js
        applyMaxAttempts: parseInt(VENDOR_SYNC_APPLY_MAX_ATTEMPTS ?? '3', 10),
```

In `backend/.env.template`, after the `# VENDOR_SYNC_APPLY_CONCURRENCY=8` line, add:

```
# WB-016: max apply attempts per feed before a partial failure is marked `exhausted`
# (stops infinite 12h re-processing of a permanently-broken group). Default 3.
# VENDOR_SYNC_APPLY_MAX_ATTEMPTS=3
```

- [ ] **Step 6: Run the suite + commit**

From `backend/`: `npx jest src/modules/vendor-sync/__tests__/finalize-apply.test.ts`
Expected: PASS.

```bash
git add backend/src/modules/vendor-sync/pipeline/finalize-apply.ts backend/src/modules/vendor-sync/__tests__/finalize-apply.test.ts backend/src/modules/vendor-sync/service.ts backend/src/lib/constants.ts backend/medusa-config.js backend/.env.template
git commit -m "feat(vendor-sync): finalizeApply terminal transition + applyMaxAttempts option (WB-016)"
```

---

### Task 5: Wire `finalizeApply` + rewrite the RunDate short-circuit

**Files:**
- Modify: `backend/src/modules/vendor-sync/service.ts` (import; RunDate short-circuit 235-258; three terminal transitions in `run`/`approveAndApply`/`replayRun`)

**Interfaces:**
- Consumes: `finalizeApply` (Task 4), `shouldShortCircuitFeed` (Task 2).

- [ ] **Step 1: Add imports**

In `backend/src/modules/vendor-sync/service.ts`, after the existing pipeline imports (near line 13), add:

```ts
import { finalizeApply } from "./pipeline/finalize-apply"
import { shouldShortCircuitFeed } from "./pipeline/retry-policy"
```

- [ ] **Step 2: Rewrite the RunDate short-circuit**

Replace the block at `service.ts:235-258` (`if (runDateVendor) { ... }`) with:

```ts
      if (runDateVendor) {
        // Short-circuit only when this feed has already reached a "done" state
        // (completed or exhausted). A partially_failed latest run for the same
        // feed must fall through so this cycle retries the failed groups.
        const recentRuns = await (this as any).listVendorFeedRuns(
          { vendor_code: vendorCode },
          { order: { started_at: "DESC" }, take: 25 }
        )
        const latestSameFeed = recentRuns.find(
          (r: any) =>
            r.id !== runId &&
            r.run_date_vendor != null &&
            new Date(r.run_date_vendor).getTime() === runDateVendor.getTime()
        )
        if (shouldShortCircuitFeed(latestSameFeed?.status)) {
          const durationMs = Date.now() - startTime
          this.logger_.info(
            `[vendor-sync] [${runId}] stage=short-circuited vendor=${vendorCode} feedDate=${runDateVendor.toISOString()} priorStatus=${latestSameFeed?.status} durationMs=${durationMs}`
          )
          await (this as any).updateVendorFeedRuns({
            id: runId,
            status: "completed",
            run_date_vendor: runDateVendor,
            finished_at: new Date(),
          })
          return { runId }
        }
      }
```

- [ ] **Step 3: Replace the `run()` terminal transition**

In `run()`, replace the block at `service.ts:361-378` (the `if (applyResult.cancelled) { ... } else { ... }`) with:

```ts
      await finalizeApply(this as any, {
        runId,
        vendorCode,
        feedDate: runDateVendor,
        result: applyResult,
        maxAttempts: this.options_.applyMaxAttempts ?? 3,
      })
```

(The following `this.clearCancelled_(runId)` and `return { runId }` stay.)

- [ ] **Step 4: Replace the `approveAndApply()` terminal transition**

In `approveAndApply()`, replace the block at `service.ts:446-461` (`if (result.cancelled) { ... } else { ... }` plus the trailing `this.clearCancelled_(runId)`) with:

```ts
      await finalizeApply(this as any, {
        runId,
        vendorCode,
        feedDate: run.run_date_vendor ? new Date(run.run_date_vendor) : null,
        result,
        maxAttempts: this.options_.applyMaxAttempts ?? 3,
      })
      this.clearCancelled_(runId)
```

- [ ] **Step 5: Replace the `replayRun()` terminal transition**

In `replayRun()`, replace the block at `service.ts:516-531` (`if (result.cancelled) { ... } else { ... }` plus the trailing `this.clearCancelled_(runId)`) with:

```ts
      await finalizeApply(this as any, {
        runId,
        vendorCode,
        feedDate: run.run_date_vendor ? new Date(run.run_date_vendor) : null,
        result,
        maxAttempts: this.options_.applyMaxAttempts ?? 3,
      })
      this.clearCancelled_(runId)
```

- [ ] **Step 6: Run the full vendor-sync suite + commit**

From `backend/`: `npx jest src/modules/vendor-sync`
Expected: PASS — no regressions (existing suite + the new retry-policy/adopt/finalize-apply tests).

```bash
git add backend/src/modules/vendor-sync/service.ts
git commit -m "feat(vendor-sync): partially_failed/exhausted statuses via finalizeApply + RunDate short-circuit honors them (WB-016)"
```

---

### Task 6: Adopt-by-`external_id` for new groups

**Files:**
- Modify: `backend/src/modules/vendor-sync/pipeline/apply.ts` (`applyNewGroup` adopt check + `findProductByExternalId` + `persistAdoptedGroup`)

**Interfaces:**
- Consumes: `indexVariantsBySku` (Task 3).

- [ ] **Step 1: Add the import**

In `backend/src/modules/vendor-sync/pipeline/apply.ts`, after the `import VendorSyncService from "../service"` line (~47), add:

```ts
import { indexVariantsBySku } from "./adopt"
```

- [ ] **Step 2: Add the adopt check to `applyNewGroup`**

In `applyNewGroup` (apply.ts:236-252), after the `if (records.length === 0) { throw ... }` block and before `const first = records[0]`, insert the adopt short-circuit. Replace:

```ts
  const first = records[0]
  if (first.productType === "wheel") {
    return applyNewWheelGroup(ctx, group, records as WheelNormalizedRecord[])
  }
  return applyNewTireGroup(ctx, group, records)
```

with:

```ts
  const first = records[0]

  // Idempotency (WB-016): a prior failed attempt may have created the product
  // (createProductsWorkflow succeeded) but never persisted vendor_product_current
  // rows, so the re-diff still classifies this group as "new". Adopt the existing
  // product by external_id instead of creating a duplicate.
  const externalId =
    first.productType === "wheel" ? group.group_key : first.partNumber
  const existing = await findProductByExternalId(ctx, externalId)
  if (existing) {
    ctx.logger.warn(
      `[vendor-sync] [${ctx.runId}] adopting existing product ${existing.id} for group ${group.group_key} (external_id=${externalId}); prior partial apply`
    )
    await persistAdoptedGroup(ctx, group, records, existing)
    return { variantCount: records.length }
  }

  if (first.productType === "wheel") {
    return applyNewWheelGroup(ctx, group, records as WheelNormalizedRecord[])
  }
  return applyNewTireGroup(ctx, group, records)
```

- [ ] **Step 3: Add the helper functions**

In `backend/src/modules/vendor-sync/pipeline/apply.ts`, in the Helpers section (after `listCurrentRowsForGroup`, ~686), add:

```ts
async function findProductByExternalId(
  ctx: ApplyContext,
  externalId: string
): Promise<any | null> {
  const query = ctx.container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "variants.id",
      "variants.sku",
      "variants.inventory_items.inventory_item_id",
    ],
    filters: { external_id: [externalId] },
  })
  return data?.[0] ?? null
}

/**
 * Persist vendor_product_current rows for a group whose Medusa product already
 * exists (adopted on retry). Upsert by (vendor_code, part_number) so a partial
 * re-adopt is itself idempotent.
 */
async function persistAdoptedGroup(
  ctx: ApplyContext,
  group: NewGroup,
  records: NormalizedRecord[],
  existingProduct: any
): Promise<void> {
  const skuIndex = indexVariantsBySku(existingProduct.variants ?? [])
  for (const r of records) {
    const stagingRow = await readStagingRow(ctx, r.partNumber)
    const info = skuIndex.get(r.partNumber)
    if (!info?.inventoryItemId) {
      ctx.logger.warn(
        `[vendor-sync] [${ctx.runId}] adopted variant ${r.partNumber} missing inventory_item_id`
      )
    }
    const fields = {
      group_key: r.groupKey,
      content_hash: stagingRow.content_hash,
      medusa_product_id: existingProduct.id,
      medusa_variant_id: info?.variantId ?? null,
      inventory_item_id: info?.inventoryItemId ?? null,
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
      await (ctx.service as any).updateVendorProductCurrents({ id: existingRow.id, ...fields })
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

- [ ] **Step 4: Run the vendor-sync suite + commit**

From `backend/`: `npx jest src/modules/vendor-sync`
Expected: PASS — no regressions (adopt path is additive; existing create path unchanged when no product exists).

```bash
git add backend/src/modules/vendor-sync/pipeline/apply.ts
git commit -m "feat(vendor-sync): adopt-by-external_id so retry never duplicates a new-group product (WB-016)"
```

---

### Task 7: Adopt-by-SKU for changed-group added variants

**Files:**
- Modify: `backend/src/modules/vendor-sync/pipeline/apply.ts` (`applyChangedGroup` added-variants branch + `persistAddedVariants` signature)

**Interfaces:**
- Consumes: `partitionRecordsBySku`, `indexVariantsBySku` (Task 3).

- [ ] **Step 1: Extend the import**

In `backend/src/modules/vendor-sync/pipeline/apply.ts`, change the Task-6 import line to:

```ts
import { indexVariantsBySku, partitionRecordsBySku } from "./adopt"
```

- [ ] **Step 2: Rewrite the added-variants branch**

In `applyChangedGroup`, replace the wheel branch of the `added_part_numbers` block (apply.ts:452-478, the `if (productType === "wheel") { ... }` body up to `variantCount += wheelAdds.length`) with:

```ts
    if (productType === "wheel") {
      const wheelAdds = addedRecords as WheelNormalizedRecord[]

      // Idempotency (WB-016): a prior failed attempt may have already created
      // some of these variants. Only create the SKUs not already on the product;
      // adopt the rest.
      const query = ctx.container.resolve(ContainerRegistrationKeys.QUERY)
      const { data: existingVariants } = await query.graph({
        entity: "variant",
        fields: ["id", "sku", "inventory_items.inventory_item_id"],
        filters: { product_id: [productId] },
      })
      const existingSkus = new Set<string>(
        (existingVariants ?? []).map((v: any) => v.sku).filter(Boolean)
      )
      const { toCreate } = partitionRecordsBySku(wheelAdds, existingSkus)

      let createdVariants: any[] = []
      if (toCreate.length > 0) {
        // Extend product options with any new values introduced by the new
        // variants before creating them.
        await extendWheelOptions(ctx, productId, toCreate)

        const variants = toCreate.map((r) => ({
          product_id: productId,
          ...buildWheelVariantInput(r),
        }))

        const created = await createProductVariantsWorkflow(ctx.container).run({
          input: { product_variants: variants },
        })
        createdVariants = created.result
      }

      // Persist current rows for ALL added parts, sourcing variant ids from the
      // existing + freshly-created variants.
      const skuIndex = indexVariantsBySku([
        ...(existingVariants ?? []),
        ...createdVariants,
      ])
      await persistAddedVariants(ctx, group.group_key, wheelAdds, skuIndex, productId)
      variantCount += wheelAdds.length
    } else {
```

- [ ] **Step 3: Change `persistAddedVariants` to take a prebuilt SKU index**

Replace the entire `persistAddedVariants` function (apply.ts:777-847) with:

```ts
async function persistAddedVariants(
  ctx: ApplyContext,
  groupKey: string,
  records: NormalizedRecord[],
  skuIndex: Map<string, { variantId: string; inventoryItemId: string | null }>,
  productId: string
): Promise<void> {
  for (const r of records) {
    const stagingRow = await readStagingRow(ctx, r.partNumber)
    const info = skuIndex.get(r.partNumber)

    // UPSERT by (vendor_code, part_number): the part may already have a current
    // row (moved from another group, or a prior partial attempt).
    const [existing] = await (ctx.service as any).listVendorProductCurrents(
      { vendor_code: ctx.vendorCode, part_number: r.partNumber },
      { take: 1 }
    )
    const fields = {
      group_key: groupKey,
      content_hash: stagingRow.content_hash,
      medusa_product_id: productId,
      medusa_variant_id: info?.variantId ?? null,
      inventory_item_id: info?.inventoryItemId ?? null,
      normalized: r,
      last_seen_run_id: ctx.runId,
      applied_at: new Date(),
      discontinued_at: null,
    }
    if (existing) {
      await (ctx.service as any).updateVendorProductCurrents({ id: existing.id, ...fields })
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

- [ ] **Step 4: Run the vendor-sync suite + commit**

From `backend/`: `npx jest src/modules/vendor-sync`
Expected: PASS — no regressions.

```bash
git add backend/src/modules/vendor-sync/pipeline/apply.ts
git commit -m "feat(vendor-sync): adopt-by-SKU so retry never re-creates an added variant (WB-016)"
```

---

### Task 8: Full regression + docs finalization

**Files:**
- Modify: `docs/future/BACKLOG.md` (WB-016 → done; WB-038 already merged into WB-016)
- Modify: `docs/STATUS.md` (Last verified, Vendor-import row, Active work / deploy-readiness)
- Move: spec + plan `in-progress` → `done`

- [ ] **Step 1: Full backend regression**

From `backend/`: `npx jest`
Expected: prior count (237 pass / 4 skipped) PLUS the new tests (retry-policy + adopt + finalize-apply) all PASS — no regressions.

- [ ] **Step 2: Flip WB-016 to done**

In `docs/future/BACKLOG.md`, set WB-016 `- status: done`, update `- evidence:` to the new files, and add a `- done:` line:

```
- status: done
- evidence: backend/src/modules/vendor-sync/pipeline/finalize-apply.ts ; backend/src/modules/vendor-sync/pipeline/retry-policy.ts ; backend/src/modules/vendor-sync/pipeline/apply.ts (adopt-by-external_id/SKU) ; backend/src/modules/vendor-sync/service.ts (RunDate short-circuit)
- done: 2026-06-21 — partial apply now sets partially_failed (not completed); the RunDate short-circuit (shouldShortCircuitFeed) only fires for completed/exhausted, so the next cron retries failed groups. Bounded by apply_attempt_count + applyMaxAttempts (default 3) → exhausted stops churn. Retry is idempotent: adopt-by-external_id (new groups) + adopt-by-SKU (added variants) so no duplicate products/variants. Shared finalizeApply fixes run/approveAndApply/replayRun. Migration adds apply_attempt_count + failed_group_keys. Verified by retry-policy/adopt/finalize-apply unit tests + full suite green.
- refs: done/specs/2026-06-21-vendor-sync-partial-apply-retry-design.md · done/plans/2026-06-21-vendor-sync-partial-apply-retry.md
```

- [ ] **Step 3: Update `docs/STATUS.md`**

Bump "Last verified" to `2026-06-21`; bump the Tests backend count to the new total. In the Vendor-import pillar row, note WB-016 done (partial-apply retry) and drop WB-016 from its open-backlog cell. In "Active work" / deploy-readiness, mark WB-016 fixed → **all four 2026-06-05 NO-GO blockers now resolved; backend deploy-ready.**

- [ ] **Step 4: Move spec + plan to done/**

```bash
git mv docs/in-progress/specs/2026-06-21-vendor-sync-partial-apply-retry-design.md docs/done/specs/2026-06-21-vendor-sync-partial-apply-retry-design.md
git mv docs/in-progress/plans/2026-06-21-vendor-sync-partial-apply-retry.md docs/done/plans/2026-06-21-vendor-sync-partial-apply-retry.md
```
Then update the spec's `Status:` banner to `done (shipped 2026-06-21)`.

- [ ] **Step 5: Run `/doc-review`**

Invoke the `doc-review` skill; resolve any drift it flags.

- [ ] **Step 6: Commit**

```bash
git add docs/
git commit -m "docs(vendor-sync): close WB-016 — flip backlog, bump STATUS, move spec+plan to done"
```

---

## Self-Review

**Spec coverage:**
- Status model (partially_failed/exhausted) → Task 2 (`decideTerminalStatus`) + Task 4/5 (wiring) ✓
- RunDate short-circuit honors statuses → Task 2 (`shouldShortCircuitFeed`) + Task 5 ✓
- apply_attempt_count bound + carry → Task 1 (column) + Task 2 (`nextAttemptNumber`) + Task 4 (`finalizeApply`) ✓
- failed_group_keys → Task 1 (column) + Task 2 (`uniqueGroupKeys`) + Task 4 ✓
- Shared finalizeApply across 3 callers → Task 4 + Task 5 ✓
- Adopt-by-external_id (new groups) → Task 3 (`indexVariantsBySku`) + Task 6 ✓
- Adopt-by-SKU (added variants) → Task 3 (`partitionRecordsBySku`) + Task 7 ✓
- Migration → Task 1 ✓ · applyMaxAttempts option → Task 4 ✓
- Verification + docs → Task 8 ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; commands have expected output.

**Type consistency:** `finalizeApply(service, {runId, vendorCode, feedDate, result, maxAttempts})` identical in Task 4 (def) and Task 5 (3 call sites). `indexVariantsBySku`/`partitionRecordsBySku` signatures identical across Tasks 3, 6, 7. `persistAddedVariants` new 5-arg signature (`ctx, groupKey, records, skuIndex, productId`) used only by its single caller in Task 7. Statuses `completed`/`partially_failed`/`exhausted` spelled identically everywhere.

## Out of scope
- WB-011/012/013 (background-job the apply), WB-014 (apply concurrency) — apply stays sequential/in-process.
- Backfilling `apply_attempt_count` for historical rows (defaults to 0).
