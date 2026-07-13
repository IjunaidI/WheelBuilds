# WB-089 Catalog Lifecycle & Data Integrity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix seven backend catalog-lifecycle defects so the search index and stock levels tell the truth — discontinued products get evicted, sold-out parts zero out, $0 rows are dropped, dead variants stop pricing the index, placeholder facets disappear, dash-metric tire sizes parse, and handle collisions stop silently failing groups.

**Architecture:** Targeted fixes inside `backend/src/modules/vendor-sync/` plus one `medusa-config.js` line and one migration. Every behavioral change is driven through a **pure, unit-tested helper** so `pnpm test:sync` gives a real RED→GREEN cycle; the wiring into `service.ts` / `apply.ts` / `stage.ts` / the Meili transformer is a thin, behavior-preserving refactor around those helpers. No new architecture, no new runtime dependency.

**Tech Stack:** MedusaJS 2.13.6, TypeScript, MikroORM (hand-authored migrations), Jest (`pnpm test:sync`), `@rokmohar/medusa-plugin-meilisearch@1.3.5`. One storefront twin change tested under Vitest (`pnpm test:unit`).

## Global Constraints

Copied verbatim from the spec — every task implicitly includes these:

- **Test gate:** `cd backend && pnpm test:sync` stays green after every task (script: `jest --passWithNoTests src/modules/vendor-sync`). New tests must fail RED against the pre-change behavior before you implement.
- **Price-unit convention:** vendor-sync writes MSRP in **major units (dollars)** onto Medusa `prices.amount`; `buildSearchDocument` converts to **integer cents** (`Math.round(major*100)`) for `price_min`/`price_max`. Do not disturb this split.
- **`MedusaService` update signature:** single object — `service.updateVendorFeedRuns({ id, ...fields })`, never `({id}, {fields})`.
- **Handle identity is a URL contract:** non-colliding product handles must stay **byte-identical**. The L10 suffix applies only on a real collision and is **deterministic per `group_key`**.
- **Tire alias is display-only:** the L8 brand→model alias map expands the product **title + search text only**, never the `group_key`/handle (`adapters/wheelpros-tires/group-key.ts` and `buildTireGroupHandle` stay on the raw model), so no tire re-grouping is triggered.
- **No fabricated data:** the alias map ships seeded with the one entry verified from the repo's own fixtures (`WDPEAK AT4W → Wildpeak A/T4W`); additional entries are added only from the live feed's real distinct-model list, not invented.
- **Migrations are hand-authored** minimal `ALTER … IF [NOT] EXISTS` statements matching `migrations/Migration20260705120000.ts`; this module keeps **no committed MikroORM snapshot**, so `db:generate` is not required.

**Build order:** Tasks are independent except Task 6 (tire confidence gate) which assumes Task 5 (dash-metric parse) has landed, and Task 10 (cron) which builds on Task 9's helper module directory. Execute in numeric order.

---

### Task 1: L5 — all-warehouse sellout zeroing (stock-only source table)

A stock-only run derives its part list from `vendor_stock_staging`, which only holds `qoh > 0` rows, so a part that sold out at **every** warehouse is never selected and its Medusa levels stay phantom-stocked. Source the list from `vendor_feed_staging` (all staged parts) instead.

**Files:**
- Modify: `backend/src/modules/vendor-sync/pipeline/stock-select.ts` (add a helper)
- Modify: `backend/src/modules/vendor-sync/service.ts:19` (import) and `:552-557` (`runStockOnly` sourcing)
- Test: `backend/src/modules/vendor-sync/__tests__/stock-select.test.ts`

**Interfaces:**
- Produces: `stockOnlyPartsToApply(feedStagedPartNumbers: string[], currentPartNumbers: Set<string>): string[]`

- [ ] **Step 1: Write the failing test** — append to `backend/src/modules/vendor-sync/__tests__/stock-select.test.ts`:

```ts
import { stockOnlyPartsToApply } from "../pipeline/stock-select"

describe("stockOnlyPartsToApply (WB-089 L5)", () => {
  it("selects a part that has NO stock rows this run (sold out everywhere) as long as it is staged + current", () => {
    // Part A is in the feed (so it's in feed-staging) but sold out at every
    // warehouse, so it would be ABSENT from stock-staging. It must still be
    // selected so applyStockLevels can zero its Medusa levels.
    expect(stockOnlyPartsToApply(["A", "B"], new Set(["A", "B"]))).toEqual(["A", "B"])
  })
  it("excludes a staged part that has no current Medusa product", () => {
    expect(stockOnlyPartsToApply(["A", "X"], new Set(["A"]))).toEqual(["A"])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/modules/vendor-sync/__tests__/stock-select.test.ts`
Expected: FAIL — `stockOnlyPartsToApply is not a function`.

- [ ] **Step 3: Add the helper** — append to `backend/src/modules/vendor-sync/pipeline/stock-select.ts`:

```ts
/**
 * Parts to run a stock pass on during a stock-only run. Source is the FULL set
 * of parts staged this run (vendor_feed_staging), NOT only those with positive
 * stock (vendor_stock_staging): a part that sold out at EVERY warehouse has no
 * stock-staging row, so sourcing from stock-staging skips it and its Medusa
 * levels never zero (WB-089 L5). Intersect with current products so we only
 * touch parts that actually have a Medusa product / inventory item.
 */
export function stockOnlyPartsToApply(
  feedStagedPartNumbers: string[],
  currentPartNumbers: Set<string>
): string[] {
  return selectStockPartNumbers(feedStagedPartNumbers, currentPartNumbers)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest src/modules/vendor-sync/__tests__/stock-select.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire `runStockOnly` to feed-staging** — in `backend/src/modules/vendor-sync/service.ts`, change the import at line 19:

```ts
import { selectStockPartNumbers, stockOnlyPartsToApply } from "./pipeline/stock-select"
```

Then replace lines 552-557 (`// Which staged parts have a current row?` through the `selectStockPartNumbers(...)` call) with:

```ts
      // Which staged parts have a current row? Source from vendor_feed_staging
      // (ALL parts staged this run), not vendor_stock_staging (only qoh>0 rows) —
      // else a part that sold out at every warehouse is never selected and its
      // Medusa levels stay phantom-stocked (WB-089 L5).
      const stagedRows = await (this as any).listVendorFeedStagings({ run_id: runId }, { select: ["part_number"], take: null })
      const stagedParts = stagedRows.map((r: any) => r.part_number)
      const currentRows = await (this as any).listVendorProductCurrents({ vendor_code: vendorCode }, { select: ["part_number"], take: null })
      const currentParts = new Set<string>(currentRows.map((r: any) => r.part_number))
      const parts = stockOnlyPartsToApply(stagedParts, currentParts)
```

- [ ] **Step 6: Run the full suite + typecheck**

Run: `cd backend && pnpm test:sync && npx tsc --noEmit -p tsconfig.json`
Expected: test:sync PASS; tsc no NEW errors vs baseline.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/vendor-sync/pipeline/stock-select.ts backend/src/modules/vendor-sync/service.ts backend/src/modules/vendor-sync/__tests__/stock-select.test.ts
git commit -m "$(cat <<'EOF'
fix(WB-089): zero all-warehouse sellouts in stock-only runs (L5)

runStockOnly sourced its part list from vendor_stock_staging (qoh>0 rows
only), so a part sold out at every warehouse was never selected and its
Medusa levels stayed phantom-stocked. Source from vendor_feed_staging via
the new pure stockOnlyPartsToApply helper.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: L3 — drop $0 / missing-MSRP rows at staging (+ run counter)

A row with `msrpUsd <= 0` becomes a $0 Medusa price and a "From $0.00" card that leads price-asc and is addable at $0. Drop it at staging and count it in a new `skipped_invalid_price_count` run column (mirrors `skipped_no_image_count`).

**Files:**
- Modify: `backend/src/modules/vendor-sync/models/vendor-feed-run.ts:11` (add column)
- Create: `backend/src/modules/vendor-sync/migrations/Migration20260713100000.ts`
- Modify: `backend/src/modules/vendor-sync/pipeline/stage.ts` (predicate + counter + run update + log)
- Test: `backend/src/modules/vendor-sync/__tests__/stage-skip-reason.test.ts`

**Interfaces:**
- Produces: `stageSkipReason(normalized: { imageUrl?: string | null; msrpUsd: number }): "no-image" | "invalid-price" | null`

- [ ] **Step 1: Write the failing test** — create `backend/src/modules/vendor-sync/__tests__/stage-skip-reason.test.ts`:

```ts
import { stageSkipReason } from "../pipeline/stage"

describe("stageSkipReason (WB-084 image gate + WB-089 L3 price gate)", () => {
  it("drops image-less rows", () => {
    expect(stageSkipReason({ imageUrl: "", msrpUsd: 100 })).toBe("no-image")
    expect(stageSkipReason({ imageUrl: null, msrpUsd: 100 })).toBe("no-image")
  })
  it("drops non-positive / missing MSRP once an image is present", () => {
    expect(stageSkipReason({ imageUrl: "x", msrpUsd: 0 })).toBe("invalid-price")
    expect(stageSkipReason({ imageUrl: "x", msrpUsd: -5 })).toBe("invalid-price")
    expect(stageSkipReason({ imageUrl: "x", msrpUsd: NaN })).toBe("invalid-price")
  })
  it("stages a real row", () => {
    expect(stageSkipReason({ imageUrl: "x", msrpUsd: 369.99 })).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/modules/vendor-sync/__tests__/stage-skip-reason.test.ts`
Expected: FAIL — `stageSkipReason is not a function`.

- [ ] **Step 3: Add the predicate and re-wire the loop** — in `backend/src/modules/vendor-sync/pipeline/stage.ts`, add the exported helper above `stageFeed` (after the `Logger` interface):

```ts
/**
 * Why a normalized row is dropped at staging, or null if it should be staged.
 * Image gate is WB-084; the non-positive/missing MSRP gate is WB-089 L3 (a $0
 * price becomes a $0 Medusa price + a "From $0.00" card addable at $0).
 */
export function stageSkipReason(
  normalized: { imageUrl?: string | null; msrpUsd: number }
): "no-image" | "invalid-price" | null {
  if (!normalized.imageUrl) return "no-image"
  if (!(normalized.msrpUsd > 0)) return "invalid-price"
  return null
}
```

Add `skippedInvalidPriceCount` to the `StageResult` interface:

```ts
interface StageResult {
  rowCount: number
  stagedCount: number
  skippedNoImageCount: number
  skippedInvalidPriceCount: number
}
```

Add the counter declaration next to the others (near line 37): `let skippedInvalidPriceCount = 0`.

Replace the existing image-skip block (the `// Skip rows with no image URL` `if (!normalized.imageUrl) { … }`) with:

```ts
    const skip = stageSkipReason(normalized)
    if (skip === "no-image") {
      skippedNoImageCount++
      continue
    }
    if (skip === "invalid-price") {
      skippedInvalidPriceCount++
      continue
    }
```

Update the run-row write (the `updateVendorFeedRuns({ id: runId, row_count, skipped_no_image_count })` call) to include the new count:

```ts
  await service.updateVendorFeedRuns({
    id: runId,
    row_count: rowCount,
    skipped_no_image_count: skippedNoImageCount,
    skipped_invalid_price_count: skippedInvalidPriceCount,
  })
```

Update the summary log to mention it, and the return object to include `skippedInvalidPriceCount`:

```ts
  logger.info(
    `Staging complete: ${rowCount} rows parsed, ${stagedCount} staged, ` +
      `${skippedNoImageCount} skipped (no image), ${skippedInvalidPriceCount} skipped (invalid price)` +
      (truncated ? ` [TRUNCATED to maxRows=${maxRows} — dev mode]` : '')
  )

  return { rowCount, stagedCount, skippedNoImageCount, skippedInvalidPriceCount }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest src/modules/vendor-sync/__tests__/stage-skip-reason.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the model column** — in `backend/src/modules/vendor-sync/models/vendor-feed-run.ts`, add the column right after `skipped_no_image_count`:

```ts
  skipped_no_image_count: model.number().default(0),
  skipped_invalid_price_count: model.number().default(0),
```

- [ ] **Step 6: Create the migration** — `backend/src/modules/vendor-sync/migrations/Migration20260713100000.ts`:

```ts
import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * WB-089 L3: count rows dropped at staging for a non-positive / missing MSRP,
 * mirroring skipped_no_image_count. Hand-authored ALTER to match this module's
 * existing migrations (no committed snapshot; db:generate not required).
 */
export class Migration20260713100000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "vendor_feed_run" add column if not exists "skipped_invalid_price_count" integer not null default 0;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "vendor_feed_run" drop column if exists "skipped_invalid_price_count";`
    )
  }
}
```

- [ ] **Step 7: Verify build + suite**

Run: `cd backend && pnpm test:sync && npx medusa build`
Expected: test:sync PASS; `medusa build` exit 0.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/vendor-sync/pipeline/stage.ts backend/src/modules/vendor-sync/models/vendor-feed-run.ts backend/src/modules/vendor-sync/migrations/Migration20260713100000.ts backend/src/modules/vendor-sync/__tests__/stage-skip-reason.test.ts
git commit -m "$(cat <<'EOF'
fix(WB-089): drop $0/missing-MSRP rows at staging, count them (L3)

Rows with msrpUsd<=0 became $0 Medusa prices + "From $0.00" cards addable
at $0. Gate them at staging via the pure stageSkipReason predicate (which
also folds in the WB-084 image gate) and count them in a new
skipped_invalid_price_count run column, mirroring skipped_no_image_count.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: L9 — placeholder bolt patterns never index (+ storefront twin)

The Meili transformer indexes any truthy `bolt_pattern_raw` into the raw `bolt_patterns` facet, so `"BLANK"`/`"CALL"` render as live filter checkboxes. Filter them at the transformer, and add `"call"` to the storefront placeholder set (which currently misses it).

**Files:**
- Create: `backend/src/modules/vendor-sync/search/placeholder-bolt-pattern.ts`
- Modify: `backend/src/modules/vendor-sync/search/build-search-document.ts` (import + guard the push, ~lines 77-81)
- Test: `backend/src/modules/vendor-sync/__tests__/build-search-document.test.ts` (add a case)
- Modify (storefront twin): `storefront/src/modules/product-detail/data/group-sizes.ts:14`
- Test (storefront): `storefront/src/modules/product-detail/data/group-sizes.test.ts:214`

**Interfaces:**
- Produces: `isRealBoltPattern(raw: unknown): boolean` (backend, in `search/placeholder-bolt-pattern.ts`)

- [ ] **Step 1: Write the failing test** — add to `backend/src/modules/vendor-sync/__tests__/build-search-document.test.ts` inside the `describe("buildSearchDocument", …)` block:

```ts
  it("does not index placeholder bolt patterns (BLANK/CALL/N/A) — WB-089 L9", () => {
    const doc: any = buildSearchDocument({
      ...product,
      variants: [
        { sku: "a", prices: [{ amount: 100, currency_code: "usd" }], metadata: { wheel_diameter_in: 20, bolt_pattern_raw: "BLANK" } },
        { sku: "b", prices: [{ amount: 100, currency_code: "usd" }], metadata: { wheel_diameter_in: 20, bolt_pattern_raw: "CALL" } },
        { sku: "c", prices: [{ amount: 100, currency_code: "usd" }], metadata: { wheel_diameter_in: 20, bolt_pattern_raw: "5X5.0" } },
      ],
    } as any)
    expect(doc.bolt_patterns).toEqual(["5X5.0"])
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/modules/vendor-sync/__tests__/build-search-document.test.ts`
Expected: FAIL — `bolt_patterns` is `["BLANK", "CALL", "5X5.0"]`.

- [ ] **Step 3: Create the placeholder helper** — `backend/src/modules/vendor-sync/search/placeholder-bolt-pattern.ts`:

```ts
/**
 * Vendor placeholders that must never index as a bolt-pattern facet value
 * (WB-089 L9). Mirrors the storefront twin in
 * storefront/src/modules/product-detail/data/group-sizes.ts.
 */
const PLACEHOLDER_BOLT_PATTERNS = new Set(["", "blank", "n/a", "na", "call"])

export function isRealBoltPattern(raw: unknown): boolean {
  return !PLACEHOLDER_BOLT_PATTERNS.has(String(raw ?? "").trim().toLowerCase())
}
```

- [ ] **Step 4: Guard the transformer push** — in `backend/src/modules/vendor-sync/search/build-search-document.ts`, add the import near the top (with the other search imports):

```ts
import { isRealBoltPattern } from "./placeholder-bolt-pattern"
```

Then change the bolt-pattern block inside `buildWheelDocument` (currently `if (bp) { boltRaw.push(bp); … }`) to:

```ts
    const bp = typeof vm.bolt_pattern_raw === "string" ? vm.bolt_pattern_raw : ""
    if (bp && isRealBoltPattern(bp)) {
      boltRaw.push(bp)
      boltCanonical.push(...canonicalBoltPatterns(bp))
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx jest src/modules/vendor-sync/__tests__/build-search-document.test.ts`
Expected: PASS.

- [ ] **Step 6: Storefront twin — write the failing test** — in `storefront/src/modules/product-detail/data/group-sizes.test.ts`, extend the placeholder-rejection loop (the `for (const raw of [...])` at line 214) to include `"CALL"` and `"call"`:

```ts
    for (const raw of ["", "   ", "BLANK", "blank", "Blank", "N/A", "n/a", "CALL", "call", null, undefined]) {
```

- [ ] **Step 7: Run it to verify it fails**

Run: `cd storefront && npx vitest run src/modules/product-detail/data/group-sizes.test.ts`
Expected: FAIL — `isRealBoltPattern("CALL")` returns `true`.

- [ ] **Step 8: Add `"call"` to the storefront set** — in `storefront/src/modules/product-detail/data/group-sizes.ts:14`:

```ts
const PLACEHOLDER_BOLT_PATTERNS = new Set(["", "blank", "n/a", "call"])
```

- [ ] **Step 9: Run both suites**

Run: `cd backend && pnpm test:sync` (PASS), then `cd ../storefront && npx vitest run src/modules/product-detail/data/group-sizes.test.ts` (PASS).

- [ ] **Step 10: Commit**

```bash
git add backend/src/modules/vendor-sync/search/placeholder-bolt-pattern.ts backend/src/modules/vendor-sync/search/build-search-document.ts backend/src/modules/vendor-sync/__tests__/build-search-document.test.ts storefront/src/modules/product-detail/data/group-sizes.ts storefront/src/modules/product-detail/data/group-sizes.test.ts
git commit -m "$(cat <<'EOF'
fix(WB-089): stop indexing placeholder bolt patterns (L9)

The Meili transformer indexed BLANK/CALL/N/A into the raw bolt_patterns
facet as live checkboxes. Gate them via isRealBoltPattern at the
transformer (root cause of the WB-074 D7 follow-up) and add the missing
"call" to the storefront placeholder twin.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: L4 — discontinued variants out of the index

The doc builders iterate every variant, so a kept-but-discontinued variant still contributes price/facets ("From $279" can be a dead variant). Filter to live variants; a product with zero live variants returns `null` (excluded stub, like image-less).

**Files:**
- Modify: `backend/src/modules/vendor-sync/search/build-search-document.ts` (both `buildWheelDocument` + `buildTireDocument`)
- Test: `backend/src/modules/vendor-sync/__tests__/build-search-document.test.ts`

- [ ] **Step 1: Write the failing test** — add to `build-search-document.test.ts`:

```ts
describe("buildSearchDocument — discontinued variants (WB-089 L4)", () => {
  it("excludes discontinued variants from price + facets", () => {
    const doc: any = buildSearchDocument({
      ...product,
      variants: [
        { sku: "live", prices: [{ amount: 200, currency_code: "usd" }], metadata: { wheel_diameter_in: 20, bolt_pattern_raw: "5X5.0" } },
        { sku: "dead", prices: [{ amount: 50, currency_code: "usd" }], metadata: { wheel_diameter_in: 18, bolt_pattern_raw: "5X5.0", discontinued: true } },
      ],
    } as any)
    expect(doc.price_min).toBe(20000) // 200.00 → cents; NOT the dead 50.00 → 5000
    expect(doc.diameters).toEqual([20])
  })

  it("returns null when every variant is discontinued", () => {
    const doc = buildSearchDocument({
      ...product,
      variants: [
        { sku: "dead", prices: [{ amount: 50, currency_code: "usd" }], metadata: { discontinued: true } },
      ],
    } as any)
    expect(doc).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/modules/vendor-sync/__tests__/build-search-document.test.ts -t "discontinued"`
Expected: FAIL — `price_min` is `5000` and the all-dead product yields a doc, not null.

- [ ] **Step 3: Filter to live variants** — in `buildWheelDocument`, replace `const variants = product.variants ?? []` with:

```ts
  const variants = (product.variants ?? []).filter(
    (v) => (v.metadata ?? {}).discontinued !== true
  )
  if (variants.length === 0) return null
```

Apply the identical change at the top of `buildTireDocument` (replace its `const variants = product.variants ?? []`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest src/modules/vendor-sync/__tests__/build-search-document.test.ts`
Expected: PASS (existing cases unaffected — none of their variants carry `discontinued`).

- [ ] **Step 5: Run the full suite + typecheck**

Run: `cd backend && pnpm test:sync && npx tsc --noEmit -p tsconfig.json`
Expected: PASS; no new tsc errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/vendor-sync/search/build-search-document.ts backend/src/modules/vendor-sync/__tests__/build-search-document.test.ts
git commit -m "$(cat <<'EOF'
fix(WB-089): drop discontinued variants from the search index (L4)

buildWheelDocument/buildTireDocument iterated every variant, so a
kept-but-discontinued variant still fed price/facets into Meili. Derive
from live variants only (v.metadata.discontinued !== true); a product with
zero live variants returns null (excluded stub, like image-less).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: L8a — parse dash-metric tire sizes (`285/45-22` → `285/45R22`)

`parseTireSize` matches three formats, none of which handle the dash-metric radial `WWW/AA-RR`, so those tires get a null size, fall back to a part-number label, and drop out of the size facet and fit filter. Add a fourth pattern.

**Files:**
- Modify: `backend/src/modules/vendor-sync/utils/tire-parse-helpers.ts` (new pattern after Pattern 1)
- Test: `backend/src/modules/vendor-sync/__tests__/tire-parse-helpers.test.ts`

- [ ] **Step 1: Write the failing test** — create `backend/src/modules/vendor-sync/__tests__/tire-parse-helpers.test.ts`:

```ts
import { parseTireSize } from "../utils/tire-parse-helpers"

describe("parseTireSize dash-metric radial (WB-089 L8)", () => {
  it("parses 285/45-22 as radial 285/45R22 with load/speed", () => {
    const r = parseTireSize("ST5000 285/45-22 114H")
    expect(r.tireWidthMm).toBe(285)
    expect(r.aspectRatio).toBe(45)
    expect(r.rimDiameterIn).toBe(22)
    expect(r.constructionType).toBe("R")
    expect(r.sizeToken).toBe("285/45R22")
    expect(r.loadIndex).toBe(114)
    expect(r.speedRating).toBe("H")
  })
  it("leaves standard metric (with an R) unchanged", () => {
    expect(parseTireSize("305/45R22 118S").sizeToken).toBe("305/45R22")
  })
  it("does not mis-handle bias sizes that use a dash (12.4-24 8PR)", () => {
    expect(parseTireSize("12.4-24 8PR BKT TR171 TT").sizeToken).toBe("12.4-24")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/modules/vendor-sync/__tests__/tire-parse-helpers.test.ts`
Expected: FAIL — dash-metric case returns `sizeToken: null`.

- [ ] **Step 3: Add the dash-metric pattern** — in `tire-parse-helpers.ts`, insert immediately after Pattern 1's `if (metricMatch) { … }` block (before `// --- Pattern 2 ---`):

```ts
  // --- Pattern 1b: Dash-metric radial (size written with a dash instead of R) ---
  // Matches: 285/45-22, 285/45-22 114H  (WWW/AA-RR). The slash distinguishes it
  // from bias sizes (12.4-24, no slash). Canonicalized to radial "R".
  const dashMetricMatch = desc.match(
    /(?:^|[\s])(P|LT|ST)?(\d{2,3})\/(\d{2,3})-(\d{2})\b/
  )
  if (dashMetricMatch) {
    const tirePrefix = dashMetricMatch[1] || null
    const tireWidthMm = parseInt(dashMetricMatch[2], 10)
    const aspectRatio = parseInt(dashMetricMatch[3], 10)
    const rimDiameterIn = parseInt(dashMetricMatch[4], 10)

    const afterSize = desc.slice(desc.indexOf(dashMetricMatch[0]) + dashMetricMatch[0].length)
    const { loadIndex, speedRating, plyRating } = parseLoadSpeedPly(afterSize)

    return {
      tireWidthMm,
      aspectRatio,
      constructionType: "R",
      rimDiameterIn,
      loadIndex,
      speedRating,
      plyRating,
      tirePrefix,
      sizeToken: `${tireWidthMm}/${aspectRatio}R${rimDiameterIn}`,
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest src/modules/vendor-sync/__tests__/tire-parse-helpers.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite** (guards existing tire-parse/normalize tests)

Run: `cd backend && pnpm test:sync`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/vendor-sync/utils/tire-parse-helpers.ts backend/src/modules/vendor-sync/__tests__/tire-parse-helpers.test.ts
git commit -m "$(cat <<'EOF'
fix(WB-089): parse dash-metric tire sizes 285/45-22 -> 285/45R22 (L8a)

parseTireSize matched no pattern for WWW/AA-RR sizes, so those tires got a
null size, a part-number label, and dropped out of the size facet + fit
filter. Add a slash-gated dash-metric pattern canonicalized to radial R
(the slash keeps it distinct from bias sizes like 12.4-24).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: L8b — tie tire model confidence to a parsed size

`extractTireModel` marks a model "confident" on any surviving alphabetic token, so junk ("UNKNOWN TIRE FORMAT") becomes a confident grouped title. Require that the row actually parsed as a tire (a real `sizeToken`); otherwise fall back to a per-SKU group.

**Files:**
- Modify: `backend/src/modules/vendor-sync/adapters/wheelpros-tires/model-key.ts:69`
- Modify: `fixtures/tire-model-golden.json` (vectors 12 + 14)
- Test: `backend/src/modules/vendor-sync/__tests__/tire-model-key.test.ts` (golden-driven, already present)

- [ ] **Step 1: Update the golden to the corrected behavior** — in `fixtures/tire-model-golden.json`, replace the OHTSU vector (line 12) and the Nowhere vector (line 14):

```json
  { "brand": "OHTSU", "description": "ST5000 285/45-22 114H", "sizeToken": "285/45R22", "model": "ST5000", "confident": true },
```
```json
  { "brand": "Nowhere", "description": "UNKNOWN TIRE FORMAT", "sizeToken": null, "model": null, "confident": false }
```

- [ ] **Step 2: Run the golden test to verify it fails**

Run: `cd backend && npx jest src/modules/vendor-sync/__tests__/tire-model-key.test.ts`
Expected: FAIL — the "UNKNOWN TIRE FORMAT" vector still returns `{ model: "UNKNOWN TIRE FORMAT", confident: true }`.

- [ ] **Step 3: Add the size-parseability gate** — in `model-key.ts`, replace the two final lines of `extractTireModel` (`const confident = …; return …`) with:

```ts
  const model = kept.join(" ").trim()
  // A model is only trustworthy when the row actually parsed as a tire (a real
  // size token was found). Junk text with letters but no parseable size → not
  // confident → per-SKU group fallback, so garbage never becomes a grouped
  // product title (WB-089 L8).
  const confident = model.length > 0 && /[A-Za-z]/.test(model) && sizeToken != null
  return { model: confident ? model : null, confident }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx jest src/modules/vendor-sync/__tests__/tire-model-key.test.ts`
Expected: PASS — the OHTSU vector (now with a real sizeToken) is confident "ST5000"; the junk vector is unconfident/null; the existing `size + service only` and `BKT TR171` edge tests still pass.

- [ ] **Step 5: Run the full suite**

Run: `cd backend && pnpm test:sync`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/vendor-sync/adapters/wheelpros-tires/model-key.ts fixtures/tire-model-golden.json backend/src/modules/vendor-sync/__tests__/tire-model-key.test.ts
git commit -m "$(cat <<'EOF'
fix(WB-089): gate tire-model confidence on a parsed size (L8b)

extractTireModel was confident on any leftover alphabetic token, so junk
descriptions became confident grouped titles. Require sizeToken != null so
an unparseable row falls back to a per-SKU group. Golden updated: the
dash-metric OHTSU vector is now confident (Task 5 parses its size); the
junk vector is unconfident.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: L8c — brand→model alias map (display + search only)

Expand known vendor abbreviations (e.g. `WDPEAK AT4W → Wildpeak A/T4W`) in the product **title** only — never the `group_key`/handle — so names improve with zero re-grouping.

**Files:**
- Create: `backend/src/modules/vendor-sync/adapters/wheelpros-tires/model-alias.ts`
- Modify: `backend/src/modules/vendor-sync/pipeline/tire-grouping.ts` (`buildTireGroupTitle`)
- Test: `backend/src/modules/vendor-sync/__tests__/tire-model-alias.test.ts`
- Test: `backend/src/modules/vendor-sync/__tests__/tire-grouping.test.ts` (add title + handle-stability cases)

**Interfaces:**
- Produces: `expandTireModelName(model: string | null): string | null`

- [ ] **Step 1: Write the failing test (helper)** — create `backend/src/modules/vendor-sync/__tests__/tire-model-alias.test.ts`:

```ts
import { expandTireModelName } from "../adapters/wheelpros-tires/model-alias"

describe("expandTireModelName (WB-089 L8 alias, display-only)", () => {
  it("expands a known abbreviation", () => {
    expect(expandTireModelName("WDPEAK AT4W")).toBe("Wildpeak A/T4W")
  })
  it("is case-insensitive on the key", () => {
    expect(expandTireModelName("wdpeak at4w")).toBe("Wildpeak A/T4W")
  })
  it("passes an unknown model through unchanged", () => {
    expect(expandTireModelName("FK453")).toBe("FK453")
  })
  it("passes null/empty through", () => {
    expect(expandTireModelName(null)).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx jest src/modules/vendor-sync/__tests__/tire-model-alias.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the alias map** — `backend/src/modules/vendor-sync/adapters/wheelpros-tires/model-alias.ts`:

```ts
/**
 * Expand common vendor model ABBREVIATIONS to their human marketing name for
 * DISPLAY + SEARCH only. Deliberately NOT applied to the group_key/handle
 * (adapters/wheelpros-tires/group-key.ts, buildTireGroupHandle) so product
 * identity + URLs stay stable and expanding a name never re-groups or
 * re-creates a product (WB-089 L8).
 *
 * Keys are the raw extracted model, UPPERCASED. Seeded with the one entry
 * verified from the repo's tire fixtures; add more ONLY from the live feed's
 * real `SELECT DISTINCT model` list (human-verified) — never invent entries.
 * An unknown model passes through unchanged (safe default).
 */
const TIRE_MODEL_ALIASES: Record<string, string> = {
  "WDPEAK AT4W": "Wildpeak A/T4W",
}

export function expandTireModelName(model: string | null): string | null {
  if (!model) return model
  return TIRE_MODEL_ALIASES[model.trim().toUpperCase()] ?? model
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd backend && npx jest src/modules/vendor-sync/__tests__/tire-model-alias.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing grouping test** — add to `backend/src/modules/vendor-sync/__tests__/tire-grouping.test.ts` (import `buildTireGroupTitle` and `buildTireGroupHandle` from `../pipeline/tire-grouping` if not already imported):

```ts
describe("buildTireGroupTitle / handle — alias is display-only (WB-089 L8)", () => {
  it("expands a known model abbreviation in the title", () => {
    const rec = { brand: "Falken", model: "WDPEAK AT4W", title: "raw" } as any
    expect(buildTireGroupTitle(rec)).toBe("Falken Wildpeak A/T4W")
  })
  it("does NOT expand the handle (identity/URL stays stable)", () => {
    const rec = { brand: "Falken", model: "WDPEAK AT4W", partNumber: "P1" } as any
    expect(buildTireGroupHandle(rec)).toBe("falken-wdpeak-at4w")
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd backend && npx jest src/modules/vendor-sync/__tests__/tire-grouping.test.ts -t "alias is display-only"`
Expected: FAIL — title is `"Falken WDPEAK AT4W"`.

- [ ] **Step 7: Wire the alias into the title only** — in `backend/src/modules/vendor-sync/pipeline/tire-grouping.ts`, add the import at the top:

```ts
import { expandTireModelName } from "../adapters/wheelpros-tires/model-alias"
```

Change `buildTireGroupTitle` (leave `buildTireGroupHandle` untouched):

```ts
/** Grouped title = brand + expanded model name; per-SKU fallback uses the raw description. */
export function buildTireGroupTitle(record: TireNormalizedRecord): string {
  if (!record.model) return record.title
  return `${record.brand} ${expandTireModelName(record.model)}`
}
```

- [ ] **Step 8: Run the suite**

Run: `cd backend && pnpm test:sync`
Expected: PASS (the handle-stability case proves identity is unchanged).

- [ ] **Step 9: Commit**

```bash
git add backend/src/modules/vendor-sync/adapters/wheelpros-tires/model-alias.ts backend/src/modules/vendor-sync/pipeline/tire-grouping.ts backend/src/modules/vendor-sync/__tests__/tire-model-alias.test.ts backend/src/modules/vendor-sync/__tests__/tire-grouping.test.ts
git commit -m "$(cat <<'EOF'
feat(WB-089): expand tire model abbreviations in the title only (L8c)

Add a small brand->model alias map (WDPEAK AT4W -> Wildpeak A/T4W) applied
in buildTireGroupTitle only, NOT the group_key/handle, so display names
improve with zero re-grouping/URL churn. Seeded from the verified fixture
entry; extend from the live feed's distinct models.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: L10 — deterministic handle-collision retry

Distinct `group_key`s that slugify to the same handle fail on the unique-handle DB constraint and are silently skipped every run. On a handle conflict, retry once with a deterministic `-<hash6(group_key)>` suffix.

**Files:**
- Create: `backend/src/modules/vendor-sync/pipeline/handle-collision.ts`
- Modify: `backend/src/modules/vendor-sync/pipeline/apply.ts` (import + refactor the two `createProductsWorkflow` call sites: wheels ~392-417, tires ~464-490)
- Test: `backend/src/modules/vendor-sync/__tests__/handle-collision.test.ts`

**Interfaces:**
- Produces: `handleSuffix(groupKey: string): string`, `suffixedHandle(baseHandle: string, groupKey: string): string`, `isHandleConflictError(err: unknown): boolean`

- [ ] **Step 1: Write the failing test** — create `backend/src/modules/vendor-sync/__tests__/handle-collision.test.ts`:

```ts
import { handleSuffix, suffixedHandle, isHandleConflictError } from "../pipeline/handle-collision"

describe("handle collision (WB-089 L10)", () => {
  it("suffix is deterministic per group_key and 6 hex chars", () => {
    expect(handleSuffix("Falken|Wildpeak")).toBe(handleSuffix("Falken|Wildpeak"))
    expect(handleSuffix("Falken|Wildpeak")).toMatch(/^[0-9a-f]{6}$/)
  })
  it("distinct group_keys colliding on a base handle get distinct handles", () => {
    const a = suffixedHandle("xd-820-grenade", "XD 820|Grenade")
    const b = suffixedHandle("xd-820-grenade", "XD|820-Grenade")
    expect(a).not.toBe(b)
    expect(a.startsWith("xd-820-grenade-")).toBe(true)
  })
  it("recognises a handle uniqueness violation, not unrelated errors", () => {
    expect(isHandleConflictError({ code: "23505" })).toBe(true)
    expect(isHandleConflictError({ message: 'Product with handle "x" already exists' })).toBe(true)
    expect(isHandleConflictError(new Error("network timeout"))).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx jest src/modules/vendor-sync/__tests__/handle-collision.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the pure helpers** — `backend/src/modules/vendor-sync/pipeline/handle-collision.ts`:

```ts
import { createHash } from "node:crypto"

/**
 * Deterministic 6-hex-char suffix from a group_key, for disambiguating a
 * colliding product handle (WB-089 L10). Same group_key → same suffix every
 * run, so a suffixed handle is stable across re-applies.
 */
export function handleSuffix(groupKey: string): string {
  return createHash("sha1").update(groupKey).digest("hex").slice(0, 6)
}

/** The collision-disambiguated handle for a group. */
export function suffixedHandle(baseHandle: string, groupKey: string): string {
  return `${baseHandle}-${handleSuffix(groupKey)}`
}

/** Does this create error look like a product-handle uniqueness violation? */
export function isHandleConflictError(err: unknown): boolean {
  const msg = String((err as any)?.message ?? "").toLowerCase()
  const code = String((err as any)?.code ?? "")
  return (
    code === "23505" ||
    (msg.includes("handle") &&
      (msg.includes("duplicate") || msg.includes("unique") || msg.includes("already exists")))
  )
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd backend && npx jest src/modules/vendor-sync/__tests__/handle-collision.test.ts`
Expected: PASS.

- [ ] **Step 5: Add a create-with-retry helper in apply.ts** — in `backend/src/modules/vendor-sync/pipeline/apply.ts`, add the import near the other pipeline imports:

```ts
import { suffixedHandle, isHandleConflictError } from "./handle-collision"
```

Add this helper function (place it just above `applyNewWheelGroup`):

```ts
/**
 * Create a product, retrying ONCE under a deterministic handle suffix if the
 * base handle collides with an existing product (distinct group_keys can
 * slugify to the same handle — WB-089 L10). buildInput must return the full
 * product input for a given handle; everything else stays identical.
 */
async function createProductWithUniqueHandle(
  ctx: ApplyContext,
  groupKey: string,
  baseHandle: string,
  buildInput: (handle: string) => any
): Promise<any> {
  try {
    const { result } = await createProductsWorkflow(ctx.container).run({
      input: { products: [buildInput(baseHandle)] },
    })
    return result[0]
  } catch (err: any) {
    if (!isHandleConflictError(err)) throw err
    const retryHandle = suffixedHandle(baseHandle, groupKey)
    ctx.logger.warn(
      `[vendor-sync] [${ctx.runId}] handle "${baseHandle}" collided for group ${groupKey}; retrying as "${retryHandle}"`
    )
    const { result } = await createProductsWorkflow(ctx.container).run({
      input: { products: [buildInput(retryHandle)] },
    })
    return result[0]
  }
}
```

- [ ] **Step 6: Route the wheel create through it** — in `applyNewWheelGroup`, replace the `createProductsWorkflow(...).run({ … })` block plus `const createdProduct = result[0]` (lines ~392-415) with:

```ts
  const createdProduct = await createProductWithUniqueHandle(
    ctx,
    group.group_key,
    buildGroupHandle(rep),
    (handle) => ({
      title: buildGroupTitle(rep),
      handle,
      status: ProductStatus.PUBLISHED,
      thumbnail: rep.imageUrl ?? undefined,
      images: imageUrls.map((url) => ({ url })),
      weight: productWeight,
      collection_id: brandCollectionId,
      category_ids: [categoryId],
      sales_channels: [{ id: ctx.salesChannelId }],
      shipping_profile_id: ctx.shippingProfileId,
      external_id: group.group_key,
      metadata: buildProductMetadata(rep),
      options: productOptions,
      variants,
    })
  )
```

- [ ] **Step 7: Route the tire create through it** — in `applyNewTireGroup`, replace its `createProductsWorkflow(...).run({ … })` block plus `const createdProduct = result[0]` (lines ~464-488) with:

```ts
  const createdProduct = await createProductWithUniqueHandle(
    ctx,
    group.group_key,
    buildTireGroupHandle(rep),
    (handle) => ({
      title: buildTireGroupTitle(rep),
      handle,
      status: ProductStatus.PUBLISHED,
      thumbnail: rep.imageUrl ?? undefined,
      images: imageUrls.map((url) => ({ url })),
      collection_id: brandCollectionId,
      category_ids: [categoryId],
      sales_channels: [{ id: ctx.salesChannelId }],
      shipping_profile_id: ctx.shippingProfileId,
      external_id: group.group_key.startsWith("sku:") ? rep.partNumber : group.group_key,
      metadata: buildProductMetadata(rep),
      options: productOptions,
      variants,
    })
  )
```

- [ ] **Step 8: Verify build + suite + typecheck**

Run: `cd backend && pnpm test:sync && npx tsc --noEmit -p tsconfig.json && npx medusa build`
Expected: test:sync PASS; no new tsc errors; `medusa build` exit 0.

- [ ] **Step 9: Commit**

```bash
git add backend/src/modules/vendor-sync/pipeline/handle-collision.ts backend/src/modules/vendor-sync/pipeline/apply.ts backend/src/modules/vendor-sync/__tests__/handle-collision.test.ts
git commit -m "$(cat <<'EOF'
fix(WB-089): retry colliding product handles deterministically (L10)

Distinct group_keys that slugify to the same handle failed the unique
constraint and were silently skipped every run. On a handle conflict,
createProductWithUniqueHandle retries once with a deterministic
-<hash6(group_key)> suffix (stable across runs); non-colliding handles are
byte-unchanged. Applied to both wheel + tire create paths.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: L1a — add `status` to the Meili index fields (root eviction fix)

The plugin's per-event upsert step fetches the product with only our configured `fields` and deletes it when `status !== 'published'`; because `status` is absent, `product.status` is `undefined` and drafted products are silently re-added. Extract the fields to a guarded constant and add `status`.

**Files:**
- Create: `backend/src/modules/vendor-sync/search/meili-index-settings.ts`
- Modify: `backend/medusa-config.js` (import + use the constant, ~line 56 import, ~lines 258-263 fields)
- Test: `backend/src/modules/vendor-sync/__tests__/meili-index-settings.test.ts`

**Interfaces:**
- Produces: `MEILI_PRODUCT_FIELDS: readonly string[]`

- [ ] **Step 1: Write the failing test** — create `backend/src/modules/vendor-sync/__tests__/meili-index-settings.test.ts`:

```ts
import { MEILI_PRODUCT_FIELDS } from "../search/meili-index-settings"

describe("MEILI_PRODUCT_FIELDS (WB-089 L1)", () => {
  it("includes 'status' so the plugin can evict drafted/discontinued products", () => {
    expect(MEILI_PRODUCT_FIELDS).toContain("status")
  })
  it("still requests metadata + variants for the transformer", () => {
    expect(MEILI_PRODUCT_FIELDS).toEqual(
      expect.arrayContaining(["metadata", "variants.metadata", "variants.prices.amount"])
    )
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx jest src/modules/vendor-sync/__tests__/meili-index-settings.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the fields constant** — `backend/src/modules/vendor-sync/search/meili-index-settings.ts`:

```ts
/**
 * Product fields the Meilisearch plugin fetches (via query.graph) for each
 * product before running our transformer. MUST include 'status': the plugin's
 * per-event upsert step (@rokmohar/medusa-plugin-meilisearch 1.3.5) branches on
 * product.status to DELETE drafted products from the index; without it,
 * product.status is undefined and drafts are silently re-added (WB-089 L1).
 * Standalone constant so a unit test guards the 'status' entry.
 */
export const MEILI_PRODUCT_FIELDS = [
  "id", "title", "description", "handle", "thumbnail", "created_at", "status",
  "metadata",
  "variants.sku", "variants.metadata",
  "variants.prices.amount", "variants.prices.currency_code",
] as const
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd backend && npx jest src/modules/vendor-sync/__tests__/meili-index-settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the constant into medusa-config.js** — add the import next to the existing `buildSearchDocument` import (~line 56):

```js
import { MEILI_PRODUCT_FIELDS } from 'modules/vendor-sync/search/meili-index-settings';
```

Then replace the inline `fields: [ … ]` array (lines ~257-263) with:

```js
            // Widened so the transformer receives variants + metadata + prices;
            // 'status' lets the plugin evict drafted products (WB-089 L1).
            fields: MEILI_PRODUCT_FIELDS,
```

- [ ] **Step 6: Verify build (medusa-config loads the constant)**

Run: `cd backend && npx medusa build`
Expected: exit 0 (config resolves the imported constant).

- [ ] **Step 7: Run the suite**

Run: `cd backend && pnpm test:sync`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/vendor-sync/search/meili-index-settings.ts backend/medusa-config.js backend/src/modules/vendor-sync/__tests__/meili-index-settings.test.ts
git commit -m "$(cat <<'EOF'
fix(WB-089): index product status so drafts get evicted from Meili (L1a)

The plugin's per-event upsert deletes a product when status != 'published',
but only if it fetched status — our fields list omitted it, so drafted
(discontinued) products were silently re-added instead of deleted. Extract
the fields to a guarded MEILI_PRODUCT_FIELDS constant and add 'status'.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: L1b — daily Meilisearch reconcile cron (belt-and-braces)

Sweep strays the per-event delete can miss (dropped events, image-less publishes, anything indexed before Task 9) by emitting the plugin's own `meilisearch.sync` reconcile event on a daily cron. Testable logic lives in the module so `test:sync` covers it.

**Files:**
- Create: `backend/src/modules/vendor-sync/meili-reconcile.ts`
- Create: `backend/src/jobs/meilisearch-reconcile-tick.ts`
- Test: `backend/src/modules/vendor-sync/__tests__/meili-reconcile.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `meiliConfigured(env: NodeJS.ProcessEnv): boolean`, `emitMeiliReconcile(container: MedusaContainer): Promise<boolean>`

- [ ] **Step 1: Write the failing test** — create `backend/src/modules/vendor-sync/__tests__/meili-reconcile.test.ts`:

```ts
import { meiliConfigured, emitMeiliReconcile } from "../meili-reconcile"

describe("meili reconcile (WB-089 L1)", () => {
  it("meiliConfigured requires both env vars", () => {
    expect(meiliConfigured({ MEILISEARCH_HOST: "h", MEILISEARCH_ADMIN_KEY: "k" } as any)).toBe(true)
    expect(meiliConfigured({ MEILISEARCH_HOST: "h" } as any)).toBe(false)
    expect(meiliConfigured({} as any)).toBe(false)
  })

  it("emitMeiliReconcile emits meilisearch.sync when configured", async () => {
    process.env.MEILISEARCH_HOST = "h"
    process.env.MEILISEARCH_ADMIN_KEY = "k"
    const emit = jest.fn()
    const ok = await emitMeiliReconcile({ resolve: () => ({ emit }) } as any)
    expect(ok).toBe(true)
    expect(emit).toHaveBeenCalledWith({ name: "meilisearch.sync", data: {} })
  })

  it("is a no-op when Meili is not configured", async () => {
    delete process.env.MEILISEARCH_HOST
    delete process.env.MEILISEARCH_ADMIN_KEY
    const emit = jest.fn()
    expect(await emitMeiliReconcile({ resolve: () => ({ emit }) } as any)).toBe(false)
    expect(emit).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx jest src/modules/vendor-sync/__tests__/meili-reconcile.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the module helper** — `backend/src/modules/vendor-sync/meili-reconcile.ts`:

```ts
import { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

/** Both env vars must be set for the Meilisearch plugin to be registered. */
export function meiliConfigured(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.MEILISEARCH_HOST) && Boolean(env.MEILISEARCH_ADMIN_KEY)
}

/**
 * Emit the @rokmohar/medusa-plugin-meilisearch `meilisearch.sync` event, whose
 * handler re-indexes published products and DELETES orphaned/drafted docs
 * (WB-089 L1 belt-and-braces). No-op + returns false when Meili is unconfigured.
 */
export async function emitMeiliReconcile(container: MedusaContainer): Promise<boolean> {
  if (!meiliConfigured(process.env)) return false
  const eventBus = container.resolve(Modules.EVENT_BUS)
  await eventBus.emit({ name: "meilisearch.sync", data: {} })
  return true
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd backend && npx jest src/modules/vendor-sync/__tests__/meili-reconcile.test.ts`
Expected: PASS.

- [ ] **Step 5: Create the thin cron job** — `backend/src/jobs/meilisearch-reconcile-tick.ts`:

```ts
import { MedusaContainer } from "@medusajs/framework/types"
import { emitMeiliReconcile } from "../modules/vendor-sync/meili-reconcile"

/**
 * Daily belt-and-braces Meilisearch reconcile (WB-089 L1). Delegates to the
 * unit-tested emitMeiliReconcile; no-op when Meili is not configured.
 */
export default async function meilisearchReconcileTick(container: MedusaContainer) {
  await emitMeiliReconcile(container)
}

export const config = {
  name: "meilisearch-reconcile",
  schedule: "0 4 * * *",
}
```

- [ ] **Step 6: Verify build + suite** (build confirms the job registers)

Run: `cd backend && pnpm test:sync && npx medusa build`
Expected: test:sync PASS; `medusa build` exit 0.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/vendor-sync/meili-reconcile.ts backend/src/jobs/meilisearch-reconcile-tick.ts backend/src/modules/vendor-sync/__tests__/meili-reconcile.test.ts
git commit -m "$(cat <<'EOF'
feat(WB-089): daily Meilisearch reconcile cron (L1b)

Belt-and-braces on top of the per-event delete: a daily job emits the
plugin's own meilisearch.sync event (re-index published + delete orphans)
to sweep strays — dropped events, image-less publishes, anything indexed
before the status fix. Logic lives in the module (test:sync-covered); the
job is a thin delegate. No-op when Meili is unconfigured.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Docs closeout + verification handoff

**Files:**
- Modify: `docs/future/BACKLOG.md` (WB-089 entry + G11 line)
- Modify: `docs/STATUS.md` (Tests block, Vendor-import + Discovery pillar rows, "Last verified")
- Move: `docs/in-progress/specs/2026-07-13-wb-089-catalog-lifecycle-design.md` + `docs/in-progress/plans/2026-07-13-wb-089-catalog-lifecycle.md` → `docs/done/…`

- [ ] **Step 1: Full gate** — run the whole backend suite and the touched storefront test:

Run: `cd backend && pnpm test:sync && npx tsc --noEmit -p tsconfig.json && npx medusa build`, then `cd ../storefront && npx vitest run src/modules/product-detail/data/group-sizes.test.ts`
Expected: test:sync all PASS (record the new count); no new tsc errors; `medusa build` exit 0; storefront test PASS.

- [ ] **Step 2: Flip the backlog** — in `docs/future/BACKLOG.md`, set the WB-089 entry `status: done` with a `done:` line summarizing the seven fixes + the deploy/re-sync requirement, and drop WB-089 from the G11 "Build order" open list.

- [ ] **Step 3: Update STATUS.md** — set "Last verified" to the merge date; re-baseline the Tests block backend `test:sync` count; add a dated "Active work" entry for WB-089; note the Vendor-import + Discovery pillar rows now include index eviction / stock-zeroing / $0-gate / placeholder-filter.

- [ ] **Step 4: Move the docs** — `git mv docs/in-progress/specs/2026-07-13-wb-089-catalog-lifecycle-design.md docs/done/specs/` and `git mv docs/in-progress/plans/2026-07-13-wb-089-catalog-lifecycle.md docs/done/plans/`; fix any relative links that shift.

- [ ] **Step 5: Run `/doc-review`** (per CLAUDE.md) and apply any drift fixes it flags.

- [ ] **Step 6: Commit**

```bash
git add docs/
git commit -m "$(cat <<'EOF'
docs(WB-089): mark done, re-baseline STATUS, move spec+plan to done/

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Deploy / ops (operator-run, after merge — per G9/G10 precedent)

1. **Backend deploy → restart** — picks up `MEILI_PRODUCT_FIELDS` (status), the reconcile cron; the `skipped_invalid_price_count` migration auto-runs on `db:migrate`.
2. **Full Meili re-sync** — doc shape changed (L4 live-variant filtering, L9 placeholder filtering, L8 titles); restart triggers the plugin's boot reconcile, or emit `meilisearch.sync`. Also evicts already-indexed drafts (L1). **This is the same re-sync WB-087 needs.**
3. **Next FULL vendor sync** — re-applies groups where staging rules changed (L3 gate), idempotent, off-peak. L8's alias is title-only ⇒ **no tire re-grouping**.
4. **Verify live:** a drafted product leaves Meili within the reconcile window; a forced all-warehouse-zero part reads 0 stock after the next stock tick; a dash-metric tire shows a real size + appears in the size facet; no `BLANK`/`CALL` bolt-pattern checkbox; a $0 feed row is absent from the catalog and counted in the run summary.

---

## Self-Review

**1. Spec coverage** — every WB-089 finding maps to a task: L1→Tasks 9+10, L3→Task 2, L4→Task 4, L5→Task 1, L8 (dash-metric/confidence/alias)→Tasks 5/6/7, L9→Task 3, L10→Task 8. Docs closeout→Task 11. No gaps.

**2. Placeholder scan** — every code step contains full code; every run step names an exact command + expected result. No TBD/TODO/"similar to". The alias map ships one **verified** entry with an explicit "add only from real feed data" rule (honors the no-fabrication constraint) — not a placeholder.

**3. Type consistency** — helper names are used identically across tasks: `stockOnlyPartsToApply` (Task 1), `stageSkipReason` (Task 2), `isRealBoltPattern` backend twin (Task 3), `expandTireModelName` (Task 7), `handleSuffix`/`suffixedHandle`/`isHandleConflictError` + `createProductWithUniqueHandle` (Task 8), `MEILI_PRODUCT_FIELDS` (Task 9), `meiliConfigured`/`emitMeiliReconcile` (Task 10). Task 6 depends on Task 5's parse landing (called out in Build order). `updateVendorFeedRuns` uses the single-object signature (Global Constraints). Handle identity stays byte-stable except on real collision; the tire alias touches title only — both asserted by tests (Tasks 7-8).
