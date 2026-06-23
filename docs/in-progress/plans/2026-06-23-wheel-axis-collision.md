# Wheel Axis-Collision Six-Axis Variant Model — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the wheel-grouping axis-collision import failure (~300 groups / ~12.8k variants) by making center bore + load rating real variant axes, deduping only exact duplicates, and surfacing the new axes on the PDP via progressive disclosure.

**Architecture:** Wheel variants move from a 4-axis identity (bolt pattern × diameter × width × offset) to a **6-axis** identity (+ center bore + load rating). All six product options are emitted on every wheel product (single-value options are harmless and hidden on the PDP). The apply step deduplicates exact duplicates instead of throwing. The PDP reads variant metadata and renders center-bore / load-rating selectors only when the current selection genuinely branches. The existing 4-option catalog is replaced by a full wipe + re-import (`vendor-sync-dev-wipe --purge-products`).

**Tech Stack:** TypeScript, MedusaJS 2.13.6 core-flows, MikroORM, Jest (backend, `pnpm test:sync`), Vitest (storefront), Meilisearch (no change this plan).

## Global Constraints

- **Price-unit convention:** dollars in Medusa, cents in Meilisearch. This plan does not touch prices — keep `prices.amount` in major units. (CLAUDE.md)
- **`MedusaService` update signature:** single object — `service.updateVendorProductCurrents({id, ...fields})`, never `({id}, {fields})`. (CLAUDE.md)
- **Path resolution:** backend imports resolve via `paths: {"*": ["./src/*"]}` — no `@/` prefix in backend. (CLAUDE.md)
- **No `wb-` prefix** on storefront identifiers, files, or CSS classes. (memory/feedback_no_wb_prefix.md)
- **Lockstep twins:** `normalize-finish.ts` and `bolt-pattern-canonical.ts` have storefront copies — this plan does not change either, but do not introduce new un-guarded twins.
- **Sentinel for null optional axis:** the literal em dash `"—"` (U+2014). Use it everywhere a null center bore / load rating becomes an option value or axis-key segment, so the value is stable across rows.
- **Six axes, dedupe exact duplicates only.** No genuinely-distinct SKU is dropped; only identical-on-all-six rows are deduped. (spec decision 2)

---

## Task 1: Six-axis variant key + option titles (`wheel-grouping.ts`)

**Files:**
- Modify: `backend/src/modules/vendor-sync/pipeline/wheel-grouping.ts`
- Test: `backend/src/modules/vendor-sync/__tests__/wheel-grouping.test.ts`

**Interfaces:**
- Produces: `WHEEL_OPTION_TITLES.CENTER_BORE = "Center Bore"`, `WHEEL_OPTION_TITLES.LOAD_RATING = "Load Rating"`; `formatOptionalAxis(value: number | null): string`; `variantAxisKey(record: WheelNormalizedRecord): string` now a 6-segment `|`-joined string; `axisKeyFromMetadata(m: Record<string, unknown>): string`.
- Consumes: existing `formatNumericOption`, `WheelNormalizedRecord`.

- [ ] **Step 1: Write the failing tests.** Add to `wheel-grouping.test.ts`, replacing the existing `describe("variantAxisKey", …)` block:

```ts
import {
  WHEEL_OPTION_TITLES,
  // ...existing imports...
  formatOptionalAxis,
  axisKeyFromMetadata,
  variantAxisKey,
} from "../pipeline/wheel-grouping"

describe("formatOptionalAxis", () => {
  it("formats a present number like formatNumericOption", () => {
    expect(formatOptionalAxis(71.5)).toBe("71.5")
    expect(formatOptionalAxis(2200)).toBe("2200")
  })
  it("returns the em-dash sentinel for null", () => {
    expect(formatOptionalAxis(null)).toBe("—")
  })
})

describe("variantAxisKey (6-axis)", () => {
  it("combines all six axes into a stable key", () => {
    const r = makeWheel() // centerBoreMm 71.5, loadRatingLb 2200
    expect(variantAxisKey(r)).toBe("5X120|20|10|23|71.5|2200")
  })
  it("uses the sentinel when center bore / load rating are null", () => {
    const r = makeWheel({ centerBoreMm: null, loadRatingLb: null })
    expect(variantAxisKey(r)).toBe("5X120|20|10|23|—|—")
  })
  it("yields different keys when ONLY center bore differs", () => {
    expect(variantAxisKey(makeWheel({ centerBoreMm: 71.5 }))).not.toBe(
      variantAxisKey(makeWheel({ centerBoreMm: 67.1 }))
    )
  })
  it("yields different keys when ONLY load rating differs", () => {
    expect(variantAxisKey(makeWheel({ loadRatingLb: 2200 }))).not.toBe(
      variantAxisKey(makeWheel({ loadRatingLb: 2500 }))
    )
  })
})

describe("axisKeyFromMetadata", () => {
  it("reproduces variantAxisKey from a variant metadata bag", () => {
    const r = makeWheel({ centerBoreMm: 67.1, loadRatingLb: 2500 })
    const meta = {
      bolt_pattern_raw: r.boltPatternRaw,
      wheel_diameter_in: r.diameterIn,
      wheel_width_in: r.widthIn,
      offset_mm: r.offsetMm,
      center_bore_mm: r.centerBoreMm,
      load_rating_lb: r.loadRatingLb,
    }
    expect(axisKeyFromMetadata(meta)).toBe(variantAxisKey(r))
  })
  it("maps null/absent optional fields to the sentinel", () => {
    const meta = {
      bolt_pattern_raw: "5X120",
      wheel_diameter_in: 20,
      wheel_width_in: 10,
      offset_mm: 23,
      center_bore_mm: null,
      // load_rating_lb absent
    }
    expect(axisKeyFromMetadata(meta)).toBe("5X120|20|10|23|—|—")
  })
})
```

- [ ] **Step 2: Run the tests, verify they fail.**

Run: `cd backend && pnpm test:sync -- wheel-grouping`
Expected: FAIL — `formatOptionalAxis`/`axisKeyFromMetadata` not exported; `variantAxisKey` returns the old 4-segment string.

- [ ] **Step 3: Implement.** In `wheel-grouping.ts`:

Extend the option titles:

```ts
export const WHEEL_OPTION_TITLES = {
  BOLT_PATTERN: "Bolt Pattern",
  DIAMETER: "Diameter",
  WIDTH: "Width",
  OFFSET: "Offset",
  CENTER_BORE: "Center Bore",
  LOAD_RATING: "Load Rating",
} as const

/** Sentinel option value / axis-key segment for a null optional axis. */
export const OPTIONAL_AXIS_NONE = "—"

/** Format an optional numeric axis (center bore / load rating). */
export function formatOptionalAxis(value: number | null): string {
  return value == null ? OPTIONAL_AXIS_NONE : formatNumericOption(value)
}
```

Replace `variantAxisKey` (drop the old `AxisCollision` interface and `findAxisCollision` — they are superseded in Task 3):

```ts
/**
 * The 6-tuple that uniquely identifies a variant inside a group. Any
 * pairwise difference in any axis yields distinct variants; the only
 * residual collision is an exact duplicate (deduped in apply).
 */
export function variantAxisKey(record: WheelNormalizedRecord): string {
  return [
    record.boltPatternRaw,
    formatNumericOption(record.diameterIn),
    formatNumericOption(record.widthIn),
    formatNumericOption(record.offsetMm),
    formatOptionalAxis(record.centerBoreMm),
    formatOptionalAxis(record.loadRatingLb),
  ].join("|")
}

const toOptionalNumber = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null

/**
 * Reproduce variantAxisKey from a Medusa variant's metadata bag (used to
 * dedupe newly-added SKUs against variants already on a product).
 */
export function axisKeyFromMetadata(m: Record<string, unknown>): string {
  return [
    String(m.bolt_pattern_raw ?? ""),
    formatNumericOption(Number(m.wheel_diameter_in)),
    formatNumericOption(Number(m.wheel_width_in)),
    formatNumericOption(Number(m.offset_mm)),
    formatOptionalAxis(toOptionalNumber(m.center_bore_mm)),
    formatOptionalAxis(toOptionalNumber(m.load_rating_lb)),
  ].join("|")
}
```

Delete the `AxisCollision` interface and the `findAxisCollision` function (Task 3 replaces them; Task 4 updates the apply import).

- [ ] **Step 4: Run the tests, verify the new ones pass.** (The old `findAxisCollision` describe block will now fail to compile — that is expected; Task 3 removes it. To keep this task green in isolation, delete the `describe("findAxisCollision", …)` block now and re-add coverage in Task 3.)

Run: `cd backend && pnpm test:sync -- wheel-grouping`
Expected: PASS for the new `formatOptionalAxis` / `variantAxisKey` / `axisKeyFromMetadata` blocks.

- [ ] **Step 5: Commit.**

```bash
git add backend/src/modules/vendor-sync/pipeline/wheel-grouping.ts backend/src/modules/vendor-sync/__tests__/wheel-grouping.test.ts
git commit -m "feat(vendor-sync): 6-axis wheel variant key + center-bore/load-rating option titles (WB-051)"
```

---

## Task 2: Six-axis product + variant options (`wheel-grouping.ts`)

**Files:**
- Modify: `backend/src/modules/vendor-sync/pipeline/wheel-grouping.ts`
- Test: `backend/src/modules/vendor-sync/__tests__/wheel-grouping.test.ts`

**Interfaces:**
- Produces: `buildProductOptions(records)` returns 6 option groups; `buildVariantOptions(record)` returns an object with 6 keys.
- Consumes: `WHEEL_OPTION_TITLES`, `formatNumericOption`, `formatOptionalAxis` (Task 1).

- [ ] **Step 1: Write the failing tests.** Replace the existing `describe("buildProductOptions", …)` and `describe("buildVariantOptions", …)` blocks:

```ts
describe("buildProductOptions (6 axes)", () => {
  it("emits all six axes with deduplicated values", () => {
    const records = [
      makeWheel({ partNumber: "A", offsetMm: 23, centerBoreMm: 71.5, loadRatingLb: 2200 }),
      makeWheel({ partNumber: "B", offsetMm: 35, centerBoreMm: 67.1, loadRatingLb: 2200 }),
      makeWheel({ partNumber: "C", offsetMm: 43, centerBoreMm: 67.1, loadRatingLb: 2500 }),
    ]
    const byTitle = Object.fromEntries(
      buildProductOptions(records).map((o) => [o.title, o.values])
    )
    expect(byTitle[WHEEL_OPTION_TITLES.CENTER_BORE]).toEqual(["67.1", "71.5"])
    expect(byTitle[WHEEL_OPTION_TITLES.LOAD_RATING]).toEqual(["2200", "2500"])
  })

  it("includes the sentinel as a value when an optional axis is null on some rows", () => {
    const records = [
      makeWheel({ partNumber: "A", centerBoreMm: 78.1 }),
      makeWheel({ partNumber: "B", centerBoreMm: null }),
    ]
    const byTitle = Object.fromEntries(
      buildProductOptions(records).map((o) => [o.title, o.values])
    )
    expect(byTitle[WHEEL_OPTION_TITLES.CENTER_BORE].sort()).toEqual(["78.1", "—"])
  })
})

describe("buildVariantOptions (6 keys)", () => {
  it("emits all six option keys, sentinel for null optional axes", () => {
    const opts = buildVariantOptions(
      makeWheel({ centerBoreMm: null, loadRatingLb: 2200 })
    )
    expect(opts[WHEEL_OPTION_TITLES.CENTER_BORE]).toBe("—")
    expect(opts[WHEEL_OPTION_TITLES.LOAD_RATING]).toBe("2200")
  })
  it("round-trips: every variant option value is present in buildProductOptions", () => {
    const r = makeWheel({ centerBoreMm: 71.5, loadRatingLb: 2200 })
    const variantOpts = buildVariantOptions(r)
    for (const opt of buildProductOptions([r])) {
      expect(opt.values).toContain(variantOpts[opt.title])
    }
  })
})
```

- [ ] **Step 2: Run the tests, verify they fail.**

Run: `cd backend && pnpm test:sync -- wheel-grouping`
Expected: FAIL — center bore / load rating titles absent from output.

- [ ] **Step 3: Implement.** Extend `buildProductOptions`:

```ts
export function buildProductOptions(
  records: WheelNormalizedRecord[]
): Array<{ title: string; values: string[] }> {
  const boltPatterns = new Set<string>()
  const diameters = new Set<string>()
  const widths = new Set<string>()
  const offsets = new Set<string>()
  const centerBores = new Set<string>()
  const loadRatings = new Set<string>()

  for (const r of records) {
    boltPatterns.add(r.boltPatternRaw)
    diameters.add(formatNumericOption(r.diameterIn))
    widths.add(formatNumericOption(r.widthIn))
    offsets.add(formatNumericOption(r.offsetMm))
    centerBores.add(formatOptionalAxis(r.centerBoreMm))
    loadRatings.add(formatOptionalAxis(r.loadRatingLb))
  }

  const numericSort = (a: string, b: string) => parseFloat(a) - parseFloat(b)
  return [
    { title: WHEEL_OPTION_TITLES.BOLT_PATTERN, values: [...boltPatterns].sort() },
    { title: WHEEL_OPTION_TITLES.DIAMETER, values: [...diameters].sort(numericSort) },
    { title: WHEEL_OPTION_TITLES.WIDTH, values: [...widths].sort(numericSort) },
    { title: WHEEL_OPTION_TITLES.OFFSET, values: [...offsets].sort(numericSort) },
    { title: WHEEL_OPTION_TITLES.CENTER_BORE, values: [...centerBores].sort(numericSort) },
    { title: WHEEL_OPTION_TITLES.LOAD_RATING, values: [...loadRatings].sort(numericSort) },
  ]
}
```

> Note: `parseFloat("—")` is `NaN`, which sorts stably to the end — acceptable for a sentinel that is one value among numbers. The test asserts `["78.1", "—"]` after `.sort()` (lexical, in the test) to avoid depending on `NaN` ordering.

Extend `buildVariantOptions`:

```ts
export function buildVariantOptions(
  record: WheelNormalizedRecord
): Record<string, string> {
  return {
    [WHEEL_OPTION_TITLES.BOLT_PATTERN]: record.boltPatternRaw,
    [WHEEL_OPTION_TITLES.DIAMETER]: formatNumericOption(record.diameterIn),
    [WHEEL_OPTION_TITLES.WIDTH]: formatNumericOption(record.widthIn),
    [WHEEL_OPTION_TITLES.OFFSET]: formatNumericOption(record.offsetMm),
    [WHEEL_OPTION_TITLES.CENTER_BORE]: formatOptionalAxis(record.centerBoreMm),
    [WHEEL_OPTION_TITLES.LOAD_RATING]: formatOptionalAxis(record.loadRatingLb),
  }
}
```

- [ ] **Step 4: Run the tests, verify they pass.**

Run: `cd backend && pnpm test:sync -- wheel-grouping`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add backend/src/modules/vendor-sync/pipeline/wheel-grouping.ts backend/src/modules/vendor-sync/__tests__/wheel-grouping.test.ts
git commit -m "feat(vendor-sync): emit 6 product/variant options for wheels (WB-051)"
```

---

## Task 3: Dedupe exact duplicates (`wheel-grouping.ts`)

**Files:**
- Modify: `backend/src/modules/vendor-sync/pipeline/wheel-grouping.ts`
- Test: `backend/src/modules/vendor-sync/__tests__/wheel-grouping.test.ts`

**Interfaces:**
- Produces:
  - `findExactDuplicates(records: WheelNormalizedRecord[]): WheelNormalizedRecord[][]` — sets sharing a 6-tuple.
  - `dedupeExactDuplicates(records: WheelNormalizedRecord[]): { survivors: WheelNormalizedRecord[]; dropped: WheelNormalizedRecord[] }` — tie-break: in-stock (`totalQoh > 0`) first, then lowest `partNumber`.
  - `dedupeAddedAgainstExisting(records: WheelNormalizedRecord[], existingAxisKeys: Set<string>): { toCreate: WheelNormalizedRecord[]; dropped: WheelNormalizedRecord[] }` — skips records whose 6-tuple is already present (existing variant or earlier in the batch).
- Consumes: `variantAxisKey` (Task 1).

- [ ] **Step 1: Write the failing tests.** Remove the old `describe("findAxisCollision", …)` block (deleted in Task 1). Add:

```ts
import {
  findExactDuplicates,
  dedupeExactDuplicates,
  dedupeAddedAgainstExisting,
} from "../pipeline/wheel-grouping"

describe("findExactDuplicates", () => {
  it("returns nothing when every 6-tuple is distinct", () => {
    const records = [
      makeWheel({ partNumber: "A", centerBoreMm: 71.5 }),
      makeWheel({ partNumber: "B", centerBoreMm: 67.1 }),
    ]
    expect(findExactDuplicates(records)).toEqual([])
  })
  it("groups rows that share a 6-tuple", () => {
    const records = [
      makeWheel({ partNumber: "A" }),
      makeWheel({ partNumber: "B" }),
      makeWheel({ partNumber: "C", offsetMm: 35 }),
    ]
    const dups = findExactDuplicates(records)
    expect(dups).toHaveLength(1)
    expect(dups[0].map((r) => r.partNumber).sort()).toEqual(["A", "B"])
  })
})

describe("dedupeExactDuplicates", () => {
  it("does NOT dedupe center-bore- or load-rating-distinct rows", () => {
    const records = [
      makeWheel({ partNumber: "A", centerBoreMm: 78.1 }),
      makeWheel({ partNumber: "B", centerBoreMm: 87.1 }),
    ]
    const { survivors, dropped } = dedupeExactDuplicates(records)
    expect(survivors).toHaveLength(2)
    expect(dropped).toHaveLength(0)
  })
  it("keeps the in-stock SKU over an out-of-stock duplicate", () => {
    const records = [
      makeWheel({ partNumber: "ZZZ", totalQoh: 12 }),
      makeWheel({ partNumber: "AAA", totalQoh: 0 }),
    ]
    const { survivors, dropped } = dedupeExactDuplicates(records)
    expect(survivors.map((r) => r.partNumber)).toEqual(["ZZZ"])
    expect(dropped.map((r) => r.partNumber)).toEqual(["AAA"])
  })
  it("breaks ties by lowest part number when both in stock", () => {
    const records = [
      makeWheel({ partNumber: "BBB", totalQoh: 5 }),
      makeWheel({ partNumber: "AAA", totalQoh: 5 }),
    ]
    const { survivors } = dedupeExactDuplicates(records)
    expect(survivors.map((r) => r.partNumber)).toEqual(["AAA"])
  })
})

describe("dedupeAddedAgainstExisting", () => {
  it("drops a record whose 6-tuple already exists on the product", () => {
    const existing = new Set([variantAxisKey(makeWheel({ partNumber: "X" }))])
    const { toCreate, dropped } = dedupeAddedAgainstExisting(
      [makeWheel({ partNumber: "DUP" }), makeWheel({ partNumber: "NEW", offsetMm: 35 })],
      existing
    )
    expect(toCreate.map((r) => r.partNumber)).toEqual(["NEW"])
    expect(dropped.map((r) => r.partNumber)).toEqual(["DUP"])
  })
  it("dedupes within the batch as well", () => {
    const { toCreate, dropped } = dedupeAddedAgainstExisting(
      [makeWheel({ partNumber: "A" }), makeWheel({ partNumber: "B" })],
      new Set()
    )
    expect(toCreate.map((r) => r.partNumber)).toEqual(["A"])
    expect(dropped.map((r) => r.partNumber)).toEqual(["B"])
  })
})
```

- [ ] **Step 2: Run the tests, verify they fail.**

Run: `cd backend && pnpm test:sync -- wheel-grouping`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement.** Append to `wheel-grouping.ts`:

```ts
function groupByAxisKey(
  records: WheelNormalizedRecord[]
): Map<string, WheelNormalizedRecord[]> {
  const byKey = new Map<string, WheelNormalizedRecord[]>()
  for (const r of records) {
    const k = variantAxisKey(r)
    const list = byKey.get(k) ?? []
    list.push(r)
    byKey.set(k, list)
  }
  return byKey
}

/** Sets of records that share a 6-tuple (i.e. exact duplicates). */
export function findExactDuplicates(
  records: WheelNormalizedRecord[]
): WheelNormalizedRecord[][] {
  return [...groupByAxisKey(records).values()].filter((g) => g.length > 1)
}

/** The one survivor of an exact-duplicate set: in-stock first, then lowest part number. */
function pickSurvivor(dupes: WheelNormalizedRecord[]): WheelNormalizedRecord {
  return [...dupes].sort((a, b) => {
    const aStock = a.totalQoh > 0 ? 0 : 1
    const bStock = b.totalQoh > 0 ? 0 : 1
    if (aStock !== bStock) return aStock - bStock
    return a.partNumber.localeCompare(b.partNumber)
  })[0]
}

/**
 * Collapse exact duplicates (identical 6-tuple) to one survivor each.
 * Center-bore- / load-rating-distinct rows are NOT duplicates and pass through.
 */
export function dedupeExactDuplicates(records: WheelNormalizedRecord[]): {
  survivors: WheelNormalizedRecord[]
  dropped: WheelNormalizedRecord[]
} {
  const survivors: WheelNormalizedRecord[] = []
  const dropped: WheelNormalizedRecord[] = []
  for (const group of groupByAxisKey(records).values()) {
    if (group.length === 1) {
      survivors.push(group[0])
      continue
    }
    const keep = pickSurvivor(group)
    survivors.push(keep)
    for (const r of group) if (r !== keep) dropped.push(r)
  }
  return { survivors, dropped }
}

/**
 * Filter newly-added records against the 6-tuples already on a product
 * (and against each other), so an exact duplicate is never created as a
 * second variant with the same option tuple.
 */
export function dedupeAddedAgainstExisting(
  records: WheelNormalizedRecord[],
  existingAxisKeys: Set<string>
): { toCreate: WheelNormalizedRecord[]; dropped: WheelNormalizedRecord[] } {
  const seen = new Set(existingAxisKeys)
  const toCreate: WheelNormalizedRecord[] = []
  const dropped: WheelNormalizedRecord[] = []
  for (const r of records) {
    const k = variantAxisKey(r)
    if (seen.has(k)) {
      dropped.push(r)
      continue
    }
    seen.add(k)
    toCreate.push(r)
  }
  return { toCreate, dropped }
}
```

- [ ] **Step 4: Run the tests, verify they pass.**

Run: `cd backend && pnpm test:sync -- wheel-grouping`
Expected: PASS (whole file green — old collision tests removed, new ones pass).

- [ ] **Step 5: Commit.**

```bash
git add backend/src/modules/vendor-sync/pipeline/wheel-grouping.ts backend/src/modules/vendor-sync/__tests__/wheel-grouping.test.ts
git commit -m "feat(vendor-sync): dedupe exact-duplicate wheel variants (WB-051)"
```

---

## Task 4: Wire dedupe into the new-group apply path (`apply.ts`)

**Files:**
- Modify: `backend/src/modules/vendor-sync/pipeline/apply.ts` (imports ~L37-46; `applyNewWheelGroup` L271-329; `buildWheelVariantInput` L802-823)
- Test: `backend/src/modules/vendor-sync/__tests__/integration.test.ts` (add `it.todo` stubs)

**Interfaces:**
- Consumes: `findExactDuplicates`, `dedupeExactDuplicates`, `formatNumericOption` (from `wheel-grouping`).
- Produces: `applyNewWheelGroup` no longer throws on collision; builds variants from survivors.

- [ ] **Step 1: Update the imports.** In `apply.ts`, change the `./wheel-grouping` import block to drop `findAxisCollision` and add the new symbols:

```ts
import {
  WHEEL_OPTION_TITLES,
  buildGroupHandle,
  buildGroupTitle,
  buildProductOptions,
  buildVariantOptions,
  dedupeExactDuplicates,
  findExactDuplicates,
  formatNumericOption,
  pickGroupRepresentative,
  slugify,
} from "./wheel-grouping"
```

- [ ] **Step 2: Rewrite the collision block in `applyNewWheelGroup`.** Replace the existing `findAxisCollision` block (the `const collision = findAxisCollision(records)` … `throw` … and the lines that build from `records`) with dedupe + a defensive guard, and build from `survivors`:

```ts
async function applyNewWheelGroup(
  ctx: ApplyContext,
  group: NewGroup,
  records: WheelNormalizedRecord[]
): Promise<{ variantCount: number }> {
  // Dedupe exact duplicates (identical 6-tuple, e.g. the same wheel listed
  // twice). Center-bore- / load-rating-distinct rows are NOT duplicates and
  // survive as separate variants (WB-051).
  const { survivors, dropped } = dedupeExactDuplicates(records)
  for (const d of dropped) {
    ctx.logger.warn(
      `[vendor-sync] [${ctx.runId}] deduped exact duplicate, dropped ${d.partNumber} (group ${group.group_key})`
    )
  }
  // Defensive guard: dedupe must leave a collision-free survivor set. If not,
  // fail loud rather than create two variants with the same option tuple.
  const residual = findExactDuplicates(survivors)
  if (residual.length > 0) {
    throw new Error(
      `unexpected residual 6-axis collision after dedupe in group ${group.group_key}: ${residual[0]
        .map((r) => r.partNumber)
        .join(", ")}`
    )
  }

  const rep = pickGroupRepresentative(survivors)
  const productOptions = buildProductOptions(survivors)
  const brandCollectionId = await getBrandCollectionId(ctx, rep.brand)
  const categoryId = ctx.categories.wheelsCategoryId

  const productWeight = rep.shippingWeightLb
    ? Math.round(rep.shippingWeightLb * 453.592)
    : undefined

  const variants = survivors.map((r) => buildWheelVariantInput(r))

  const { result } = await createProductsWorkflow(ctx.container).run({
    input: {
      products: [
        {
          title: buildGroupTitle(rep),
          handle: buildGroupHandle(rep),
          status: ProductStatus.PUBLISHED,
          thumbnail: rep.imageUrl ?? undefined,
          images: rep.imageUrl ? [{ url: rep.imageUrl }] : [],
          weight: productWeight,
          collection_id: brandCollectionId,
          category_ids: [categoryId],
          sales_channels: [{ id: ctx.salesChannelId }],
          shipping_profile_id: ctx.shippingProfileId,
          external_id: group.group_key,
          metadata: buildProductMetadata(rep),
          options: productOptions,
          variants,
        },
      ],
    },
  })

  const createdProduct = result[0]
  await persistGroupAfterCreate(ctx, group, survivors, createdProduct)
  return { variantCount: survivors.length }
}
```

- [ ] **Step 3: Disambiguate the variant title** in `buildWheelVariantInput` (so two variants differing only by bore/load are distinguishable in admin):

```ts
function buildWheelVariantInput(r: WheelNormalizedRecord) {
  const variantTitle = [
    r.boltPatternRaw,
    `${r.diameterIn}x${r.widthIn}`,
    `ET${r.offsetMm}`,
    r.centerBoreMm != null ? `CB${formatNumericOption(r.centerBoreMm)}` : null,
    r.loadRatingLb != null ? `LR${formatNumericOption(r.loadRatingLb)}` : null,
  ]
    .filter(Boolean)
    .join(" ")
  return {
    title: variantTitle,
    sku: r.partNumber,
    options: buildVariantOptions(r),
    manage_inventory: true,
    allow_backorder: false,
    metadata: buildVariantMetadata(r),
    prices: [{ amount: r.msrpUsd, currency_code: "usd" }],
    ...wheelVariantWeight(r),
  }
}
```

- [ ] **Step 4: Add integration `it.todo` stubs** to `integration.test.ts` (matching the file's existing stub style):

```ts
  it.todo("imports a center-bore-distinct group as ONE product with N distinct variants (WB-051)")
  // Setup: stage a group whose SKUs share bolt/diameter/width/offset but
  //        differ on center_bore_mm; apply.
  // Assertions: exactly one product (external_id = group_key); one variant
  //        per distinct 6-tuple; each variant's Center Bore option matches its
  //        center_bore_mm; apply errors = 0.

  it.todo("dedupes an exact-duplicate group to one variant and logs the dropped SKU (WB-051)")
  // Setup: stage two SKUs identical on all six axes (one in-stock, one not).
  // Assertions: one variant created (the in-stock SKU); a "deduped exact
  //        duplicate" warning names the dropped SKU; no current row for it.
```

- [ ] **Step 5: Verify the backend compiles and the suite is green.**

Run: `cd backend && npx tsc --noEmit && pnpm test:sync`
Expected: 0 TS errors; full suite green (253+ pass; the wheel-grouping count grows).

- [ ] **Step 6: Commit.**

```bash
git add backend/src/modules/vendor-sync/pipeline/apply.ts backend/src/modules/vendor-sync/__tests__/integration.test.ts
git commit -m "fix(vendor-sync): dedupe instead of throw on wheel axis collision (WB-051)"
```

---

## Task 5: Dedupe added variants on the changed-group path (`apply.ts`)

**Files:**
- Modify: `backend/src/modules/vendor-sync/pipeline/apply.ts` (`applyChangedGroup` wheel added-path, L469-517)

**Interfaces:**
- Consumes: `axisKeyFromMetadata`, `dedupeAddedAgainstExisting` (from `wheel-grouping`).
- Produces: a feed that later introduces a new exact-duplicate SKU to an existing group skips it (no corrupt second variant).

> **Why:** after the migration re-import, exact-duplicate SKUs that were dropped have no `vendor_product_current` row, so the diff reports them as `added` on the next cron. Without this guard, the changed-group path would create a second variant with an identical option tuple — the very corruption the dedupe prevents. Dropped rows here get no current row; the resulting harmless "deduped" warning recurs each run (documented in Task 6).

- [ ] **Step 1: Extend the imports** in `apply.ts` (`./wheel-grouping` block) to add `axisKeyFromMetadata` and `dedupeAddedAgainstExisting`.

- [ ] **Step 2: Rewrite the wheel branch of the added-path.** Replace the body from the `existingVariants` query through `persistAddedVariants`:

```ts
    if (productType === "wheel") {
      const wheelAdds = addedRecords as WheelNormalizedRecord[]

      const query = ctx.container.resolve(ContainerRegistrationKeys.QUERY)
      const { data: existingVariants } = await query.graph({
        entity: "variant",
        fields: ["id", "sku", "metadata", "inventory_items.inventory_item_id"],
        filters: { product_id: [productId] },
      })
      const existingSkus = new Set<string>(
        (existingVariants ?? []).map((v: any) => v.sku).filter(Boolean)
      )
      const { toCreate: skuNew } = partitionRecordsBySku(wheelAdds, existingSkus)

      // Drop any added SKU whose 6-tuple already exists on the product
      // (exact duplicate of a current variant) or repeats within this batch.
      const existingAxisKeys = new Set<string>(
        (existingVariants ?? []).map((v: any) =>
          axisKeyFromMetadata((v.metadata ?? {}) as Record<string, unknown>)
        )
      )
      const { toCreate, dropped } = dedupeAddedAgainstExisting(
        skuNew,
        existingAxisKeys
      )
      for (const d of dropped) {
        ctx.logger.warn(
          `[vendor-sync] [${ctx.runId}] deduped exact duplicate on add, dropped ${d.partNumber} (group ${group.group_key})`
        )
      }
      const droppedSkus = new Set(dropped.map((r) => r.partNumber))

      let createdVariants: any[] = []
      if (toCreate.length > 0) {
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

      // Persist current rows for every added part EXCEPT the dropped duplicates
      // (which have no variant of their own).
      const skuIndex = indexVariantsBySku([
        ...(existingVariants ?? []),
        ...createdVariants,
      ])
      const toPersist = wheelAdds.filter((r) => !droppedSkus.has(r.partNumber))
      await persistAddedVariants(
        ctx,
        group.group_key,
        toPersist,
        skuIndex,
        productId
      )
      variantCount += toPersist.length
    } else {
```

(`buildWheelVariantInput` already emits the 6-axis options via Task 4; `extendWheelOptions` already calls `buildProductOptions`, so it now extends all six option values automatically — no change needed there.)

- [ ] **Step 3: Verify the backend compiles and the suite stays green.**

Run: `cd backend && npx tsc --noEmit && pnpm test:sync`
Expected: 0 TS errors; suite green.

- [ ] **Step 4: Commit.**

```bash
git add backend/src/modules/vendor-sync/pipeline/apply.ts
git commit -m "fix(vendor-sync): dedupe exact-duplicate SKUs on the changed-group add path (WB-051)"
```

---

## Task 6: Document the always-6-options / admin-noise trade-off

**Files:**
- Modify: `docs/reference/vendor-sync-implementation.md`
- Modify: `backend/src/modules/vendor-sync/pipeline/wheel-grouping.ts` (comment on `WHEEL_OPTION_TITLES`)

> The spec records the decision, but the dated spec moves to `done/` on merge. Future devs read the living reference doc and the code — put the trade-off where they will see it.

- [ ] **Step 1: Add a reference-doc section.** Under the wheel-grouping / apply section of `docs/reference/vendor-sync-implementation.md`, add:

```markdown
### Wheel variant axes (6) and the always-emit trade-off (WB-051)

Wheel variants are identified by a **6-axis** tuple: bolt pattern × diameter × width × offset ×
center bore × load rating (`variantAxisKey`). Center bore and load rating became axes so SKUs that
differ only on those fields import as distinct variants instead of failing the whole group on an
axis collision.

**Every wheel product emits all six options, even when center bore or load rating has a single value
across the group.** This is deliberate:

- Medusa can only *add values* to an existing option (`extendWheelOptions`), never add a new option to
  a product. Conditional axes would break the 12h-cron add path the day a previously-constant axis
  starts varying. Always-6 is incremental-safe.
- **Cost — admin-side noise:** most products carry a single-value "Center Bore"/"Load Rating" option,
  and a null optional axis shows the sentinel `—`. This is *admin-only*: the storefront PDP hides any
  single-value selector (progressive disclosure), so shoppers never see it.

Only **exact duplicates** (identical on all six axes, different part number) are deduped — kept by
tie-break (in-stock first, then lowest part number), with a logged warning naming the dropped SKU.
Dropped duplicates get no `vendor_product_current` row, so a feed that keeps listing them re-emits a
harmless "deduped exact duplicate" warning each run.
```

- [ ] **Step 2: Add a code comment** above `WHEEL_OPTION_TITLES` in `wheel-grouping.ts`:

```ts
/**
 * The six wheel variant axes. ALL six options are emitted on every wheel
 * product, even single-value ones — Medusa cannot add a new option to an
 * existing product (only new values), so always-6 keeps the incremental
 * add path safe. Single-value Center Bore / Load Rating options are
 * admin-only noise; the PDP hides single-value selectors. See WB-051 /
 * docs/reference/vendor-sync-implementation.md.
 */
export const WHEEL_OPTION_TITLES = {
```

- [ ] **Step 3: Commit.**

```bash
git add docs/reference/vendor-sync-implementation.md backend/src/modules/vendor-sync/pipeline/wheel-grouping.ts
git commit -m "docs(vendor-sync): record the always-6-options / admin-noise trade-off (WB-051)"
```

---

## Task 7: PDP — carry center bore / load rating + leaf resolution (`group-sizes.ts`)

**Files:**
- Modify: `storefront/src/modules/product-detail/data/types.ts` (`OffsetVariant`)
- Modify: `storefront/src/modules/product-detail/data/group-sizes.ts`
- Test: `storefront/src/modules/product-detail/data/group-sizes.test.ts`

**Interfaces:**
- Produces:
  - `OffsetVariant` gains `centerBoreMm: number | null`, `loadRatingLb: number | null`.
  - `boresFor(variants: OffsetVariant[], offsetMm: number): number[]` — distinct non-null center bores among the offset's candidates (sorted).
  - `loadsFor(variants: OffsetVariant[], offsetMm: number): number[]` — distinct non-null load ratings (sorted).
  - `resolveLeafVariant(size: SizeOption, offsetMm: number, centerBoreMm?: number | null, loadRatingLb?: number | null): OffsetVariant | null` — narrows candidates by offset, then bore, then load; prefers an in-stock match.
- Consumes: `num` (existing).

- [ ] **Step 1: Write the failing tests.** Extend the `variant()` factory and add a describe block in `group-sizes.test.ts`:

```ts
import {
  groupVariantsIntoSizes,
  sizesForBoltPattern,
  pickDefaultSize,
  boresFor,
  loadsFor,
  resolveLeafVariant,
} from "./group-sizes"

// Optional bore/load extension of the factory (defaults keep existing tests valid).
function variantCB(
  id: string, diameter: number, width: number, offset: number, bolt: string,
  qty: number, priceMajor: number, centerBore: number | null, load: number | null
) {
  return {
    id,
    metadata: {
      wheel_diameter_in: diameter, wheel_width_in: width, offset_mm: offset,
      bolt_pattern_raw: bolt, center_bore_mm: centerBore, load_rating_lb: load,
    },
    inventory_quantity: qty,
    calculated_price: { calculated_amount: priceMajor },
  } as any
}

describe("center-bore / load-rating leaf resolution (WB-051)", () => {
  const sizes = groupVariantsIntoSizes(
    [
      variantCB("v_a", 22, 8.25, 105, "8x6.5", 0, 360, 78.1, 2500),
      variantCB("v_b", 22, 8.25, 105, "8x6.5", 8, 360, 87.1, 2500),
    ],
    40
  )
  const size = sizes[0]

  it("keeps both center-bore variants under one (size, offset)", () => {
    expect(size.offsetVariants).toHaveLength(2)
    expect(boresFor(size.offsetVariants!, 105)).toEqual([78.1, 87.1])
  })
  it("resolves the exact variant by (offset, centerBore)", () => {
    expect(resolveLeafVariant(size, 105, 87.1)?.variantId).toBe("v_b")
    expect(resolveLeafVariant(size, 105, 78.1)?.variantId).toBe("v_a")
  })
  it("prefers an in-stock candidate when bore is unspecified", () => {
    expect(resolveLeafVariant(size, 105)?.variantId).toBe("v_b") // v_b has stock
  })
  it("a single-bore (size, offset) reports no branch", () => {
    const single = groupVariantsIntoSizes(
      [variantCB("v_x", 20, 9, 18, "5x114.3", 5, 300, 73.1, 2000)],
      28
    )[0]
    expect(boresFor(single.offsetVariants!, 18)).toEqual([73.1])
    expect(loadsFor(single.offsetVariants!, 18)).toEqual([2000])
  })
})
```

- [ ] **Step 2: Run the tests, verify they fail.**

Run: `cd storefront && npx vitest run src/modules/product-detail/data/group-sizes.test.ts`
Expected: FAIL — `boresFor`/`loadsFor`/`resolveLeafVariant` not exported; `OffsetVariant` lacks the fields.

- [ ] **Step 3: Implement.** Add the two fields to `OffsetVariant` in `types.ts`:

```ts
  /** Center bore (mm) for this exact variant; null when the vendor omits it. */
  centerBoreMm: number | null
  /** Load rating (lb) for this exact variant; null when the vendor omits it. */
  loadRatingLb: number | null
```

In `group-sizes.ts`, populate them where the `offset` object is built inside `groupVariantsIntoSizes`:

```ts
    const offset: OffsetVariant = {
      value: offsetMm,
      backspaceIn: "",
      priceCents: priceCents > 0 ? priceCents : undefined,
      variantId: v.id,
      availability: avail,
      centerBoreMm: numOrNull(m.center_bore_mm),
      loadRatingLb: numOrNull(m.load_rating_lb),
    }
```

Add the helpers (and `numOrNull`) at the bottom of `group-sizes.ts`:

```ts
/** Coerce to a finite number or null (distinct from num()'s 0 default). */
const numOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null

const candidatesFor = (variants: OffsetVariant[], offsetMm: number) =>
  variants.filter((o) => o.value === offsetMm)

const sortedDistinct = (xs: (number | null)[]): number[] =>
  Array.from(new Set(xs.filter((x): x is number => x != null))).sort((a, b) => a - b)

/** Distinct non-null center bores available at a given offset. */
export function boresFor(variants: OffsetVariant[], offsetMm: number): number[] {
  return sortedDistinct(candidatesFor(variants, offsetMm).map((o) => o.centerBoreMm))
}

/** Distinct non-null load ratings available at a given offset. */
export function loadsFor(variants: OffsetVariant[], offsetMm: number): number[] {
  return sortedDistinct(candidatesFor(variants, offsetMm).map((o) => o.loadRatingLb))
}

const availRank = { in_stock: 2, low_stock: 1, out_of_stock: 0 } as const

/**
 * Narrow a size's offset variants to one leaf by (offset, [bore], [load]).
 * Unspecified bore/load are wildcards; ties resolve to the best-availability
 * candidate, so an unspecified pick lands on an in-stock variant when possible.
 */
export function resolveLeafVariant(
  size: SizeOption,
  offsetMm: number,
  centerBoreMm?: number | null,
  loadRatingLb?: number | null
): OffsetVariant | null {
  const matches = (size.offsetVariants ?? [])
    .filter((o) => o.value === offsetMm)
    .filter((o) => centerBoreMm == null || o.centerBoreMm === centerBoreMm)
    .filter((o) => loadRatingLb == null || o.loadRatingLb === loadRatingLb)
  if (matches.length === 0) return null
  return matches.sort(
    (a, b) => availRank[b.availability] - availRank[a.availability]
  )[0]
}
```

- [ ] **Step 4: Run the tests, verify they pass.**

Run: `cd storefront && npx vitest run src/modules/product-detail`
Expected: PASS (new block + existing `group-sizes` / `resolve-variant` tests stay green — the factory's existing variants now carry `center_bore_mm: undefined` → `null`, which the new fields tolerate).

- [ ] **Step 5: Commit.**

```bash
git add storefront/src/modules/product-detail/data/types.ts storefront/src/modules/product-detail/data/group-sizes.ts storefront/src/modules/product-detail/data/group-sizes.test.ts
git commit -m "feat(pdp): carry center bore + load rating on offset variants; leaf resolution (WB-051)"
```

---

## Task 8: PDP — progressive-disclosure selectors in the hero

**Files:**
- Create: `storefront/src/modules/product-detail/components/hero/spec-selector.tsx`
- Modify: `storefront/src/modules/product-detail/components/hero/index.tsx`

**Interfaces:**
- Consumes: `boresFor`, `loadsFor`, `resolveLeafVariant` (Task 7).
- Produces: a Center Bore and/or Load Rating selector that renders only when the current `(size, offset)` has >1 distinct value; otherwise nothing.

- [ ] **Step 1: Create the presentational selector.** `spec-selector.tsx`:

```tsx
"use client"

import { cn } from "@/lib/utils"
import Label from "@modules/common/components/label"

type SpecSelectorProps = {
  label: string
  values: number[]
  selected: number | null
  onSelect: (v: number) => void
  /** Suffix shown on each chip, e.g. "mm" or "lb". */
  unit?: string
}

/**
 * A single labelled row of numeric option chips. Used for the PDP's
 * progressive-disclosure Center Bore / Load Rating selectors — rendered by the
 * hero only when a (size, offset) genuinely branches on that axis (WB-051).
 */
const SpecSelector = ({ label, values, selected, onSelect, unit }: SpecSelectorProps) => (
  <div>
    <Label tone="muted" style={{ display: "block", marginBottom: 8 }}>
      {label}
    </Label>
    <div className="flex flex-wrap gap-1.5">
      {values.map((v) => {
        const active = v === selected
        return (
          <button
            key={v}
            type="button"
            onClick={() => onSelect(v)}
            className={cn(
              "h-10 px-4 rounded-[var(--radius)] border text-[13px] font-semibold transition-colors",
              active
                ? "border-[var(--ink)] bg-[var(--ink)] text-white"
                : "border-[var(--hairline)] bg-white text-[var(--ink)] hover:border-[var(--ink)]"
            )}
          >
            {v}
            {unit ? unit : ""}
          </button>
        )
      })}
    </div>
  </div>
)

export default SpecSelector
```

- [ ] **Step 2: Wire state + selectors into `hero/index.tsx`.** Add imports:

```tsx
import { sizesForBoltPattern, pickDefaultSize, boresFor, loadsFor, resolveLeafVariant } from "../../data/group-sizes"
import SpecSelector from "./spec-selector"
```

Replace the offset-resolution section (the `const currentOffset = resolveSelectedVariant(...)` line and surrounding offset state) with bore/load-aware resolution. After the existing `selectedOffsetMm` state + its size-change effect, add:

```tsx
  const offsetVariants = selectedSize.offsetVariants ?? []

  // Progressive disclosure: branch axes for the current (size, offset).
  const availableBores = useMemo(
    () => boresFor(offsetVariants, selectedOffsetMm),
    [offsetVariants, selectedOffsetMm]
  )
  const availableLoads = useMemo(
    () => loadsFor(offsetVariants, selectedOffsetMm),
    [offsetVariants, selectedOffsetMm]
  )
  const [selectedBore, setSelectedBore] = useState<number | null>(null)
  const [selectedLoad, setSelectedLoad] = useState<number | null>(null)

  // Snap bore/load to the resolved leaf whenever the (size, offset) changes,
  // so the selection always points at a real variant (in-stock-preferred).
  useEffect(() => {
    const leaf = resolveLeafVariant(selectedSize, selectedOffsetMm)
    setSelectedBore(leaf?.centerBoreMm ?? null)
    setSelectedLoad(leaf?.loadRatingLb ?? null)
  }, [selectedSize, selectedOffsetMm])

  const currentOffset = resolveLeafVariant(
    selectedSize,
    selectedOffsetMm,
    selectedBore,
    selectedLoad
  )
```

Remove the now-unused `resolveSelectedVariant` import and the old `oemOffsetMm`/`isOem` lines only if they become unused — keep `oemOffsetMm`/`isOem` (still used by AutoFitmentCard). The `currentOffset` variable name is unchanged, so `unitPriceCents`, `PurchasePanel`, and `AutoFitmentCard` need no edits.

Render the selectors after `<VariantPicker … />` and before `<AutoFitmentCard … />`:

```tsx
        {availableBores.length > 1 && (
          <SpecSelector
            label="Center bore"
            values={availableBores}
            selected={selectedBore}
            onSelect={setSelectedBore}
            unit="mm"
          />
        )}
        {availableLoads.length > 1 && (
          <SpecSelector
            label="Load rating"
            values={availableLoads}
            selected={selectedLoad}
            onSelect={setSelectedLoad}
            unit="lb"
          />
        )}
```

- [ ] **Step 3: Verify the storefront typechecks, lints, and tests pass.**

Run: `cd storefront && npx tsc --noEmit && pnpm lint && npx vitest run src/modules/product-detail`
Expected: no NEW tsc errors (pre-existing ones listed in storefront/CLAUDE.md are unrelated); lint clean for touched files; tests green.

- [ ] **Step 4: Commit.**

```bash
git add storefront/src/modules/product-detail/components/hero/spec-selector.tsx storefront/src/modules/product-detail/components/hero/index.tsx
git commit -m "feat(pdp): progressive-disclosure center-bore / load-rating selectors (WB-051)"
```

---

## Task 9: Migration, end-to-end verification, and doc close-out

**Files:**
- Modify: `docs/STATUS.md`, `docs/future/BACKLOG.md`
- Move: `docs/in-progress/specs/2026-06-23-wheel-axis-collision-design.md` → `docs/done/specs/`, `docs/in-progress/plans/2026-06-23-wheel-axis-collision.md` → `docs/done/plans/`

> Steps 1-2 are an **operator action against the real database** — run them only against the intended `DATABASE_URL`, after the code above is merged/deployed. They are not unit-testable; they are the rollout.

- [ ] **Step 1: Wipe + purge the old 4-option catalog.** Confirm the target DB, then:

```bash
cd backend
pnpm exec medusa exec ./src/scripts/vendor-sync-dev-wipe.ts          # prints the host; refuses to act
pnpm exec medusa exec ./src/scripts/vendor-sync-dev-wipe.ts -- --confirm-host=<host printed above> --purge-products
```

Expected: log lines for rows deleted across the four vendor tables + `product (Medusa) N` deleted.

- [ ] **Step 2: Re-import.**

```bash
pnpm vendor-sync:dry-run wheelpros-wheels      # note the run id
pnpm vendor-sync:apply <run-id>
```

Expected (acceptance): the apply summary reads `Apply complete: groups=… variants=… errors=0` — the previously-failing ~300 groups now import. Spot-check an XD845-style handle in the admin: one product, multiple variants whose Center Bore option values differ.

- [ ] **Step 3: Verify the storefront PDP.** Open a center-bore-branching product (`/us/products/<handle>`): the Center Bore selector appears and switching it resolves to the correct variant; open a single-bore product: no extra selector. Confirm Discovery still lists wheels (Meilisearch unchanged).

- [ ] **Step 4: Run `/doc-review`** to catch STATUS/BACKLOG drift, then update docs:
  - `docs/future/BACKLOG.md`: flip WB-051 `status: in-progress` → `done`; append a `- done: 2026-06-23 — …` line summarizing the fix + the `errors=0` re-import evidence.
  - `docs/STATUS.md`: bump "Last verified" to the verification date; update the **Vendor import** pillar line (note 6-axis variant model, ~300 groups recovered) and the test counts.
  - Move the spec + plan from `docs/in-progress/` to `docs/done/`.

- [ ] **Step 5: Commit.**

```bash
git add docs/
git commit -m "docs(vendor-sync): close WB-051 — 6-axis variant model live, ~300 groups recovered"
```

---

## Self-Review

**Spec coverage:**
- §1 grouping helpers → Tasks 1, 2. §2 dedupe-not-throw → Tasks 3, 4 (+ changed path in 5). §3 PDP progressive disclosure → Tasks 7, 8. §4 Meili no-change → verified in Task 9 Step 3. Migration → Task 9 Steps 1-2. Testing → Tasks 1-3, 7 (unit) + Task 4 (it.todo). Verification → Task 9. Admin-noise doc (user request) → Task 6.
- Gap intentionally documented: dropped-duplicate current rows are not persisted; the recurring "deduped" warning is accepted and documented (Tasks 5, 6).

**Type consistency:** `variantAxisKey`/`axisKeyFromMetadata` produce byte-identical 6-segment keys (Task 1, asserted in test). `dedupeExactDuplicates` returns `{survivors, dropped}`; `dedupeAddedAgainstExisting` returns `{toCreate, dropped}` — both consumed with those exact names in Tasks 4/5. `OffsetVariant.centerBoreMm/loadRatingLb` (Task 7) consumed by `boresFor`/`loadsFor`/`resolveLeafVariant` and the hero (Task 8). `WHEEL_OPTION_TITLES.CENTER_BORE/LOAD_RATING` used consistently across Tasks 1, 2, and the variant-title in Task 4.

**Placeholder scan:** no TBD/TODO; every code step shows full code; commands have expected output. `<host>` / `<run-id>` / `<handle>` in Task 9 are operator-supplied runtime values, not plan gaps.
