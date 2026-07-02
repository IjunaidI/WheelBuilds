# Tire Store — Sub-project 1: Backend grouping + indexing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make WheelPros tire feed rows collapse into grouped, multi-variant Medusa products (one product per tire model, size = the variant axis) and index them in Meilisearch as `product_type = "tire"` documents with real facets.

**Architecture:** Mirror the proven wheel pipeline. A pure model-name extractor becomes the grouping anchor (analogue of `computeWheelGroupKey`); the canonical tire size becomes the single variant axis (analogue of the wheel's diameter×width); a `tire-grouping.ts` module supplies the pure option/variant builders (analogue of `wheel-grouping.ts`); `applyNewTireGroup` is rewritten from a one-variant stub into a multi-variant builder; `buildSearchDocument` gains a tire branch; the Meili index config gains tire facets. No DB migration — tires use existing tables and the shared index.

**Tech Stack:** MedusaJS 2.13.6 (core-flows `createProductsWorkflow` / `createProductVariantsWorkflow`), TypeScript, Zod, Jest (`pnpm test:sync`), Meilisearch via `@rokmohar/medusa-plugin-meilisearch`.

## Global Constraints

- **Prices in MAJOR units (dollars) on Medusa `prices.amount`**; the search doc converts to **INTEGER CENTS** via `Math.round(major * 100)`. Keep this split intact (CLAUDE.md → Price-unit convention).
- **`MedusaService` update/create take a SINGLE object**: `service.updateVendorProductCurrents({ id, ...fields })`, never `(selector, update)`.
- **`createProductsWorkflow` does NOT eagerly populate `variant.inventory_items`** — re-query via `query.graph({ entity: "variant", fields: ["inventory_items.inventory_item_id"], filters: { id } })`. Reuse the existing `persistGroupAfterCreate` which already does this.
- **The Meili transformer must never return a falsy value** — the plugin coalesces `?? defaultTransformer`. Non-tire, non-wheel still fall to the `{ id, product_type }` stub in `medusa-config.js`.
- **Path resolution:** `tsconfig.json` maps `"*": ["./src/*"]` — import as `from "lib/..."`, not `@/`. Golden fixtures live at repo-root `fixtures/` (5 dirs up from `__tests__/`).
- **No `wb-` prefix** on any identifier (project convention).
- Run all backend tests from `cd backend/`. If `pnpm` is not on PATH, use `npx -y pnpm@9.10.0 <cmd>`.

## File structure

**Create:**
- `backend/src/modules/vendor-sync/adapters/wheelpros-tires/model-key.ts` — `extractTireModel` (pure).
- `backend/src/modules/vendor-sync/adapters/wheelpros-tires/group-key.ts` — `computeTireGroupKey` (pure).
- `backend/src/modules/vendor-sync/pipeline/tire-facets.ts` — `canonicalTireSize`, `tireSizeLabel`, `classifyTireType` (pure; shared by grouping + search).
- `backend/src/modules/vendor-sync/pipeline/tire-grouping.ts` — `TIRE_OPTION_TITLES`, `tireVariantAxisKey`, `buildTireProductOptions`, `buildTireVariantOptions`, `buildTireGroupTitle`, `buildTireGroupHandle`, `dedupeTireExactDuplicates`, `findTireExactDuplicates` (pure).
- `fixtures/tire-model-golden.json` — golden vectors for `extractTireModel`.
- Test files under `backend/src/modules/vendor-sync/__tests__/` (one per new module).

**Modify:**
- `backend/src/modules/vendor-sync/utils/tire-parse-helpers.ts` — add `sizeToken` to `TireSizeResult`.
- `backend/src/modules/vendor-sync/adapters/types.ts` — add `model: string | null` to `TireNormalizedRecord`.
- `backend/src/modules/vendor-sync/adapters/wheelpros-tires/normalize.ts` — populate `model` + real `groupKey`.
- `backend/src/modules/vendor-sync/__tests__/tire-normalize.test.ts` — update the `sku:` grouping assertion.
- `backend/src/modules/vendor-sync/pipeline/apply.ts` — rewrite `applyNewTireGroup`; teach the changed-group add path to add tire size variants.
- `backend/src/modules/vendor-sync/search/build-search-document.ts` — add the tire branch + `TireSearchDocument`.
- `backend/src/modules/vendor-sync/__tests__/build-search-document.test.ts` — replace the tire→null assertion with a real tire-doc assertion.
- `backend/medusa-config.js` — add tire facet fields to the Meili index settings.

---

## Task 1: Expose the matched size substring from `parseTireSize` (+ surface it on the record)

The model extractor and the canonical size both need the raw size token the parser already locates. Add it to the parse result so there is a single source of truth (no second size regex), and surface it on `TireNormalizedRecord` now so the pure facet helpers (Task 4) can read `record.sizeToken` without a forward dependency on Task 5.

**Files:**
- Modify: `backend/src/modules/vendor-sync/utils/tire-parse-helpers.ts`
- Modify: `backend/src/modules/vendor-sync/adapters/types.ts` (add `sizeToken` to `TireNormalizedRecord`)
- Modify: `backend/src/modules/vendor-sync/adapters/wheelpros-tires/schema.ts` (`tireNormalizedSchema`)
- Test: `backend/src/modules/vendor-sync/__tests__/tire-parse.test.ts` (add cases) ; `backend/src/modules/vendor-sync/__tests__/tire-normalize.test.ts` (add one assertion)

**Interfaces:**
- Produces: `TireSizeResult` gains `sizeToken: string | null` — the raw matched size (`"305/45R22"`, `"LT37X12.50R18"`, `"12.4-24"`), `null` when no format matched. `TireNormalizedRecord` gains `sizeToken: string | null` (populated automatically by the existing `...tireSize` spread in `normalizeTireRow`).

- [ ] **Step 1: Write the failing test**

Add to `backend/src/modules/vendor-sync/__tests__/tire-parse.test.ts` inside the `describe('parseTireSize', ...)` block:

```ts
  it('exposes the matched size token (metric)', () => {
    expect(parseTireSize('WDPEAK AT4W 305/45R22 118S').sizeToken).toBe('305/45R22')
  })

  it('exposes the matched size token (metric with Z modifier)', () => {
    expect(parseTireSize('255/35ZR19 FK453 (96Y) XL BLK 2553519').sizeToken).toBe('255/35ZR19')
  })

  it('exposes the matched size token (LT inch)', () => {
    expect(parseTireSize('WDPEAK AT4W LT37X12.50R18 128R E').sizeToken).toBe('LT37X12.50R18')
  })

  it('exposes the matched size token (bias, excludes ply)', () => {
    expect(parseTireSize('12.4-24 8PR BKT TR171 TT 451224').sizeToken).toBe('12.4-24')
  })

  it('returns null sizeToken for unparseable descriptions', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    expect(parseTireSize('UNKNOWN TIRE FORMAT').sizeToken).toBeNull()
    warnSpy.mockRestore()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx -y pnpm@9.10.0 test:sync -- tire-parse`
Expected: FAIL — `sizeToken` is `undefined` / property missing.

- [ ] **Step 3: Add `sizeToken` to the result**

In `tire-parse-helpers.ts`, add the field to the interface and to `NULL_RESULT`:

```ts
export interface TireSizeResult {
  tireWidthMm: number | null
  aspectRatio: number | null
  constructionType: string | null
  rimDiameterIn: number | null
  loadIndex: number | null
  speedRating: string | null
  plyRating: string | null
  tirePrefix: string | null
  sizeToken: string | null
}

const NULL_RESULT: TireSizeResult = {
  tireWidthMm: null,
  aspectRatio: null,
  constructionType: null,
  rimDiameterIn: null,
  loadIndex: null,
  speedRating: null,
  plyRating: null,
  tirePrefix: null,
  sizeToken: null,
}
```

Then set it in each matched branch. Metric branch (after the existing captures) — add `sizeToken: metricMatch[0].trim(),` to the returned object. LT branch — add `sizeToken: ltMatch[0].trim(),`. Bias branch — reconstruct without the ply: add `sizeToken: \`${biasMatch[1]}-${biasMatch[2]}\`,`. The final `return { ...NULL_RESULT }` fall-through already carries `sizeToken: null`.

Concretely, the metric return becomes:

```ts
    return {
      tireWidthMm,
      aspectRatio,
      constructionType,
      rimDiameterIn,
      loadIndex,
      speedRating,
      plyRating,
      tirePrefix,
      sizeToken: metricMatch[0].trim(),
    }
```

the LT return adds `sizeToken: ltMatch[0].trim(),` and the bias return adds ``sizeToken: `${biasMatch[1]}-${biasMatch[2]}`,``.

- [ ] **Step 4: Surface `sizeToken` on the tire record type + schema + assert in normalize**

In `backend/src/modules/vendor-sync/adapters/types.ts`, add `sizeToken: string | null` to `TireNormalizedRecord` (place it after `tirePrefix`):

```ts
  plyRating: string | null
  tirePrefix: string | null
  sizeToken: string | null
```

In `backend/src/modules/vendor-sync/adapters/wheelpros-tires/schema.ts`, add to `tireNormalizedSchema` (after `tirePrefix`):

```ts
  tirePrefix: z.string().nullable(),
  sizeToken: z.string().nullable(),
```

`normalizeTireRow` needs no change — its existing `...tireSize` spread now carries `sizeToken` through automatically. Add one assertion to `tire-normalize.test.ts` inside the `normalizeTireRow` describe block to lock it:

```ts
  it('carries the matched size token', () => {
    expect(normalizeTireRow(makeRow()).sizeToken).toBe('305/45R22')
  })
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && npx -y pnpm@9.10.0 test:sync -- tire-parse tire-normalize`
Expected: PASS (all existing + the new cases). TypeScript now sees `sizeToken` on both `TireSizeResult` and `TireNormalizedRecord`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/vendor-sync/utils/tire-parse-helpers.ts backend/src/modules/vendor-sync/adapters/types.ts backend/src/modules/vendor-sync/adapters/wheelpros-tires/schema.ts backend/src/modules/vendor-sync/__tests__/tire-parse.test.ts backend/src/modules/vendor-sync/__tests__/tire-normalize.test.ts
git commit -m "feat(vendor-sync): expose matched size token from parseTireSize + on record (WB-005)"
```

---

## Task 2: Tire model-name extractor + golden fixture

**Files:**
- Create: `backend/src/modules/vendor-sync/adapters/wheelpros-tires/model-key.ts`
- Create: `fixtures/tire-model-golden.json`
- Test: `backend/src/modules/vendor-sync/__tests__/tire-model-key.test.ts`

**Interfaces:**
- Consumes: `sizeToken` from Task 1.
- Produces: `extractTireModel(brand: string, description: string, sizeToken: string | null): { model: string | null; confident: boolean }`. `confident` is true iff a non-empty model with at least one alphabetic character survives stripping.

- [ ] **Step 1: Write the golden fixture**

Create `fixtures/tire-model-golden.json` (real feed rows + fallback cases). Each vector is `{ brand, description, sizeToken, model, confident }`:

```json
[
  { "brand": "Falken", "description": "WDPEAK AT4W 305/45R22 118S", "sizeToken": "305/45R22", "model": "WDPEAK AT4W", "confident": true },
  { "brand": "Falken", "description": "WDPEAK AT4W 305/50R20 120T", "sizeToken": "305/50R20", "model": "WDPEAK AT4W", "confident": true },
  { "brand": "Falken", "description": "WDPEAK AT4W LT37X12.50R18 128R E", "sizeToken": "LT37X12.50R18", "model": "WDPEAK AT4W", "confident": true },
  { "brand": "Falken", "description": "235/55ZR17  AZFK450 99W  SL 26.7 2355517", "sizeToken": "235/55ZR17", "model": "AZFK450", "confident": true },
  { "brand": "Falken", "description": "255/35ZR20  AZFK450 97Y  XL 28.4 2553520", "sizeToken": "255/35ZR20", "model": "AZFK450", "confident": true },
  { "brand": "Falken", "description": "255/45ZR20  AZFK450 101Y  SL29.8 2554520", "sizeToken": "255/45ZR20", "model": "AZFK450", "confident": true },
  { "brand": "Falken", "description": "275/35ZR19  AZFK450 100Y  XL29.8 2753519", "sizeToken": "275/35ZR19", "model": "AZFK450", "confident": true },
  { "brand": "Falken", "description": "255/35ZR19 FK453 (96Y) XL BLK 2553519", "sizeToken": "255/35ZR19", "model": "FK453", "confident": true },
  { "brand": "BKT", "description": "12.4-24 8PR BKT TR171 TT 451224", "sizeToken": "12.4-24", "model": "TR171", "confident": true },
  { "brand": "BKT", "description": "11.2-26 8PR BKT TR171 TT 451126", "sizeToken": "11.2-26", "model": "TR171", "confident": true },
  { "brand": "OHTSU", "description": "ST5000 285/45-22 114H", "sizeToken": "285/45-22", "model": "ST5000", "confident": true },
  { "brand": "Falken", "description": "305/45R22", "sizeToken": "305/45R22", "model": null, "confident": false },
  { "brand": "Nowhere", "description": "UNKNOWN TIRE FORMAT", "sizeToken": null, "model": "UNKNOWN TIRE FORMAT", "confident": true }
]
```

Note the OHTSU sizeToken `285/45-22` — that description uses a `-` metric-ish form; if `parseTireSize` does not match it, `sizeToken` from the feed will be null and the extractor must still strip the token by string match when present. For the golden we pass the token the parser actually produced (verify against the real parser output in Step 4; if `parseTireSize('ST5000 285/45-22 114H').sizeToken` is null, change this vector's `sizeToken` to `null` and keep `model: "ST5000"` — the extractor strips the service `114H` and trailing junk, leaving `ST5000`).

- [ ] **Step 2: Write the failing test**

Create `backend/src/modules/vendor-sync/__tests__/tire-model-key.test.ts`:

```ts
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { extractTireModel } from "../adapters/wheelpros-tires/model-key"

const golden = JSON.parse(
  readFileSync(join(__dirname, "../../../../../fixtures/tire-model-golden.json"), "utf8")
) as { brand: string; description: string; sizeToken: string | null; model: string | null; confident: boolean }[]

describe("extractTireModel matches the golden vectors", () => {
  for (const v of golden) {
    it(`${JSON.stringify(v.description)} -> ${JSON.stringify(v.model)}`, () => {
      const result = extractTireModel(v.brand, v.description, v.sizeToken)
      expect(result.model).toEqual(v.model)
      expect(result.confident).toEqual(v.confident)
    })
  }
})

describe("extractTireModel edge behaviour", () => {
  it("is not confident when only the size + service remain", () => {
    expect(extractTireModel("Falken", "305/45R22 118S", "305/45R22")).toEqual({
      model: null,
      confident: false,
    })
  })

  it("strips the brand when it appears inside the description", () => {
    expect(extractTireModel("BKT", "12.4-24 8PR BKT TR171 TT 451224", "12.4-24").model).toBe("TR171")
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && npx -y pnpm@9.10.0 test:sync -- tire-model-key`
Expected: FAIL — `extractTireModel` not defined.

- [ ] **Step 4: Implement `model-key.ts`**

Create `backend/src/modules/vendor-sync/adapters/wheelpros-tires/model-key.ts`:

```ts
/**
 * Extract a tire's model name from the free-text PartDescription.
 *
 * The WheelPros tire feed has no model column; the model is embedded in the
 * description at an inconsistent position (before OR after the size) surrounded
 * by strippable noise. Strategy: remove everything we recognise (size token,
 * service description, noise tokens, brand, trailing size-code) and keep the
 * remainder as the model. Mirrors computeWheelGroupKey's confident-else-per-SKU
 * shape: an un-extractable model returns { model: null, confident: false }, and
 * the caller falls back to a per-SKU group key. Pure function -- no side effects.
 */

// Tokens that are never part of a model name.
const NOISE_TOKENS = new Set([
  "SL", "XL", "BL", "BLK", "TT", "TL", "TR", // load range / sidewall / tube
])

export function extractTireModel(
  brand: string,
  description: string,
  sizeToken: string | null
): { model: string | null; confident: boolean } {
  if (!description || description.trim() === "") {
    return { model: null, confident: false }
  }

  let work = ` ${description.trim()} `

  // 1. Remove the size token (exact substring the parser matched).
  if (sizeToken) {
    work = work.split(sizeToken).join(" ")
  }

  // 2. Remove a parenthesised service description, e.g. "(96Y)".
  work = work.replace(/\([^)]*\)/g, " ")

  // 3. Remove service description: <2-3 digits><speed letter> optionally
  //    followed by a ply/load-range letter, e.g. "118S", "128R E", "99W".
  work = work.replace(/(?:^|\s)\d{2,3}[A-Z]\b(?:\s+[A-Z]\b)?/g, " ")

  // 4. Remove ply ratings ("8PR"), the trailing numeric size-code ("2355517",
  //    "451224"), and standalone decimals ("26.7", "SL29.8" -> the 29.8 part).
  work = work.replace(/\b\d+PR\b/g, " ")
  work = work.replace(/\b\d{4,}\b/g, " ")
  work = work.replace(/\d+\.\d+/g, " ")

  // 5. Remove the leading tire-class prefix and the brand when present.
  work = work.replace(/\b(P|LT|ST)\b/g, " ")
  const brandTrim = brand.trim()
  if (brandTrim) {
    work = work.replace(new RegExp(`\\b${escapeRegExp(brandTrim)}\\b`, "gi"), " ")
  }

  // 6. Drop any remaining pure-noise tokens; keep the rest in order.
  const kept = work
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !NOISE_TOKENS.has(t.toUpperCase()))

  const model = kept.join(" ").trim()
  const confident = model.length > 0 && /[A-Za-z]/.test(model)
  return { model: confident ? model : null, confident }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
```

- [ ] **Step 5: Run tests, iterate against the golden**

Run: `cd backend && npx -y pnpm@9.10.0 test:sync -- tire-model-key`
Expected: PASS. If a vector mismatches, first confirm the fixture's `sizeToken` equals the real `parseTireSize(desc).sizeToken` output; adjust the NOISE_TOKENS / regex strip order (not the expected model) until all real-row vectors pass. Do not weaken the `confident` guard.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/vendor-sync/adapters/wheelpros-tires/model-key.ts fixtures/tire-model-golden.json backend/src/modules/vendor-sync/__tests__/tire-model-key.test.ts
git commit -m "feat(vendor-sync): tire model-name extractor + golden fixture (WB-005)"
```

---

## Task 3: Tire group-key

**Files:**
- Create: `backend/src/modules/vendor-sync/adapters/wheelpros-tires/group-key.ts`
- Test: `backend/src/modules/vendor-sync/__tests__/tire-group-key.test.ts`

**Interfaces:**
- Produces: `computeTireGroupKey({ brand, model, confident, partNumber }): string` — `` `${brand}|${model}` `` when confident, else `` `sku:${partNumber}` ``.

- [ ] **Step 1: Write the failing test**

Create `backend/src/modules/vendor-sync/__tests__/tire-group-key.test.ts`:

```ts
import { computeTireGroupKey } from "../adapters/wheelpros-tires/group-key"

describe("computeTireGroupKey", () => {
  it("groups by brand + model when confident", () => {
    expect(
      computeTireGroupKey({ brand: "Falken", model: "WDPEAK AT4W", confident: true, partNumber: "F28840215" })
    ).toBe("Falken|WDPEAK AT4W")
  })

  it("falls back to per-SKU when not confident", () => {
    expect(
      computeTireGroupKey({ brand: "Falken", model: null, confident: false, partNumber: "F28840215" })
    ).toBe("sku:F28840215")
  })

  it("trims surrounding whitespace on brand and model", () => {
    expect(
      computeTireGroupKey({ brand: " Falken ", model: " FK453 ", confident: true, partNumber: "F1" })
    ).toBe("Falken|FK453")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx -y pnpm@9.10.0 test:sync -- tire-group-key`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `group-key.ts`**

```ts
/**
 * Compute the group key for a tire row.
 *
 *  - Model confidently extracted -> group by Brand + Model. All sizes of a
 *    Brand+Model collapse into one product, size carried as the variant axis.
 *  - Not confident -> per-SKU fallback (`sku:<partNumber>`), so unrelated rows
 *    never merge. Mirrors computeWheelGroupKey's DisplayStyleNo fallback.
 *
 * Pure function -- no side effects.
 */
export function computeTireGroupKey(opts: {
  brand: string
  model: string | null
  confident: boolean
  partNumber: string
}): string {
  if (opts.confident && opts.model) {
    return `${opts.brand.trim()}|${opts.model.trim()}`
  }
  return `sku:${opts.partNumber}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx -y pnpm@9.10.0 test:sync -- tire-group-key`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/vendor-sync/adapters/wheelpros-tires/group-key.ts backend/src/modules/vendor-sync/__tests__/tire-group-key.test.ts
git commit -m "feat(vendor-sync): tire group-key (brand+model, per-SKU fallback) (WB-005)"
```

---

## Task 4: Tire facet derivations — `canonicalTireSize`, `tireSizeLabel`, `classifyTireType`

**Files:**
- Create: `backend/src/modules/vendor-sync/pipeline/tire-facets.ts`
- Test: `backend/src/modules/vendor-sync/__tests__/tire-facets.test.ts`

**Interfaces:**
- Consumes: `TireNormalizedRecord` — reads `sizeToken` (added in Task 1), `loadIndex`, `speedRating`, `partNumber`, `tirePrefix`, `tireWidthMm`, `aspectRatio`, `constructionType`. Does NOT read `model` (that lands in Task 5 and is irrelevant to facets).
- Produces:
  - `canonicalTireSize(record): string | null` — size-only facet value (`"305/45R22"`, Z modifier removed), `null` if unresolvable.
  - `tireSizeLabel(record): string` — the Size option value / variant axis (`"305/45R22 118S"`); falls back to `partNumber` when size is null so it is always unique + non-empty.
  - `classifyTireType(record): "passenger" | "light-truck" | "other"`.

Note: every field these helpers read exists on `TireNormalizedRecord` by the end of Task 1 (`sizeToken`) — so this task compiles independently of Task 5's `model`/group-key wiring.

- [ ] **Step 1: Write the failing test**

Create `backend/src/modules/vendor-sync/__tests__/tire-facets.test.ts`:

```ts
import { canonicalTireSize, tireSizeLabel, classifyTireType } from "../pipeline/tire-facets"
import { TireNormalizedRecord } from "../adapters/types"

function tire(overrides: Partial<TireNormalizedRecord> = {}): TireNormalizedRecord {
  return {
    productType: "tire",
    partNumber: "F1",
    vendorCode: "wheelpros-tires",
    title: "WDPEAK AT4W 305/45R22 118S",
    brand: "Falken",
    imageUrl: null,
    invOrderType: "ST",
    totalQoh: 1,
    msrpUsd: 100,
    mapUsd: 0,
    runDateVendor: new Date("2026-05-17T00:00:00.000Z"),
    stockByWarehouse: {},
    groupKey: "Falken|WDPEAK AT4W",
    manufacturerPartNumber: null,
    division: null,
    tireWidthMm: 305,
    aspectRatio: 45,
    constructionType: "R",
    rimDiameterIn: 22,
    loadIndex: 118,
    speedRating: "S",
    plyRating: null,
    tirePrefix: null,
    sizeToken: "305/45R22",
    ...overrides,
  } as TireNormalizedRecord
}

describe("canonicalTireSize", () => {
  it("returns the size token uppercased", () => {
    expect(canonicalTireSize(tire())).toBe("305/45R22")
  })
  it("strips the Z speed modifier", () => {
    expect(canonicalTireSize(tire({ sizeToken: "255/35ZR19" }))).toBe("255/35R19")
  })
  it("keeps the LT inch token", () => {
    expect(canonicalTireSize(tire({ sizeToken: "LT37X12.50R18" }))).toBe("LT37X12.50R18")
  })
  it("returns null when there is no size token", () => {
    expect(canonicalTireSize(tire({ sizeToken: null }))).toBeNull()
  })
})

describe("tireSizeLabel", () => {
  it("appends the service description", () => {
    expect(tireSizeLabel(tire())).toBe("305/45R22 118S")
  })
  it("omits service when absent", () => {
    expect(tireSizeLabel(tire({ loadIndex: null, speedRating: null }))).toBe("305/45R22")
  })
  it("falls back to the part number when size is null", () => {
    expect(tireSizeLabel(tire({ sizeToken: null, partNumber: "F9" }))).toBe("F9")
  })
})

describe("classifyTireType", () => {
  it("classifies metric as passenger", () => {
    expect(classifyTireType(tire())).toBe("passenger")
  })
  it("classifies LT prefix as light-truck", () => {
    expect(classifyTireType(tire({ tirePrefix: "LT", tireWidthMm: null, aspectRatio: null, constructionType: "R" }))).toBe("light-truck")
  })
  it("classifies inch-format (no width, has construction) as light-truck", () => {
    expect(classifyTireType(tire({ tirePrefix: null, tireWidthMm: null, aspectRatio: null, constructionType: "R", sizeToken: "LT37X12.50R18" }))).toBe("light-truck")
  })
  it("classifies bias/ag (no width, no construction) as other", () => {
    expect(classifyTireType(tire({ tirePrefix: null, tireWidthMm: null, aspectRatio: null, constructionType: null, plyRating: "8PR", sizeToken: "12.4-24" }))).toBe("other")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx -y pnpm@9.10.0 test:sync -- tire-facets`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `tire-facets.ts`**

```ts
import { TireNormalizedRecord } from "../adapters/types"

/**
 * Size-only canonical facet value, e.g. "305/45R22". Uppercased; the "Z"
 * speed modifier (255/35ZR19) is removed so equivalent sizes match. Returns
 * null when the row carries no parseable size token.
 * Pure function -- no side effects.
 */
export function canonicalTireSize(record: TireNormalizedRecord): string | null {
  const token = record.sizeToken?.trim()
  if (!token) return null
  return token.toUpperCase().replace(/Z(?=[RBD]\d)/g, "")
}

/**
 * The Size option value / variant axis: canonical size + service description
 * ("305/45R22 118S"). Falls back to the part number when the size is null so
 * the value is always non-empty and unique within a group.
 */
export function tireSizeLabel(record: TireNormalizedRecord): string {
  const size = canonicalTireSize(record)
  if (!size) return record.partNumber
  const service =
    record.loadIndex != null && record.speedRating
      ? ` ${record.loadIndex}${record.speedRating}`
      : ""
  return `${size}${service}`
}

/**
 * Coarse tire class for the discovery facet. Prefix wins; otherwise infer from
 * the parsed structure: metric (width+aspect) -> passenger; inch-format
 * (construction present, no width) -> light-truck; everything else -> other.
 */
export function classifyTireType(
  record: TireNormalizedRecord
): "passenger" | "light-truck" | "other" {
  const prefix = record.tirePrefix?.toUpperCase()
  if (prefix === "LT") return "light-truck"
  if (prefix === "P") return "passenger"
  if (prefix === "ST") return "other"
  if (record.tireWidthMm != null && record.aspectRatio != null) return "passenger"
  if (record.constructionType != null) return "light-truck"
  return "other"
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx -y pnpm@9.10.0 test:sync -- tire-facets`
Expected: PASS. (Compiles independently — `sizeToken` was added to `TireNormalizedRecord` in Task 1; these helpers do not read `model`.)

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/vendor-sync/pipeline/tire-facets.ts backend/src/modules/vendor-sync/__tests__/tire-facets.test.ts
git commit -m "feat(vendor-sync): tire facet derivations (canonical size, label, type) (WB-005)"
```

---

## Task 5: Wire model + size + group-key into the tire record

**Files:**
- Modify: `backend/src/modules/vendor-sync/adapters/types.ts` (add `model`)
- Modify: `backend/src/modules/vendor-sync/adapters/wheelpros-tires/normalize.ts`
- Modify: `backend/src/modules/vendor-sync/adapters/wheelpros-tires/schema.ts` (`tireNormalizedSchema`)
- Test: `backend/src/modules/vendor-sync/__tests__/tire-normalize.test.ts` (replace the `sku:` assertion)

**Interfaces:**
- Consumes: `extractTireModel` (Task 2), `computeTireGroupKey` (Task 3), `sizeToken` (already on the record from Task 1).
- Produces: `TireNormalizedRecord` gains `model: string | null`; `normalizeTireRow` now computes `model` + a real `groupKey`.

- [ ] **Step 1: Update the failing test**

In `backend/src/modules/vendor-sync/__tests__/tire-normalize.test.ts`, replace the existing test at lines 177-180:

```ts
  it('emits per-SKU groupKey (no tire grouping rule yet)', () => {
    const result = normalizeTireRow(makeRow())
    expect(result.groupKey).toBe('sku:F28840215')
  })
```

with:

```ts
  it('groups by brand + extracted model', () => {
    const result = normalizeTireRow(makeRow())
    expect(result.model).toBe('WDPEAK AT4W')
    expect(result.groupKey).toBe('Falken|WDPEAK AT4W')
    expect(result.sizeToken).toBe('305/45R22')
  })

  it('falls back to a per-SKU groupKey when no model can be extracted', () => {
    // A bare size + service description leaves no model text after stripping,
    // so extraction is not confident → per-SKU group key. (A description with
    // stray words like "UNKNOWN TIRE FORMAT" is instead treated as a confident
    // model — see the golden fixture — so it is NOT a fallback case.)
    const result = normalizeTireRow(makeRow({ PartDescription: '305/45R22 118S' }))
    expect(result.model).toBeNull()
    expect(result.groupKey).toBe('sku:F28840215')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx -y pnpm@9.10.0 test:sync -- tire-normalize`
Expected: FAIL — `result.model` undefined / `groupKey` still `sku:...`.

- [ ] **Step 3: Add the `model` field to the type + normalized schema**

`sizeToken` is already on `TireNormalizedRecord` + the schema (Task 1). In `backend/src/modules/vendor-sync/adapters/types.ts`, add `model` to `TireNormalizedRecord` (immediately after `productType: 'tire'`):

```ts
  productType: 'tire'
  model: string | null
  sizeToken: string | null
  manufacturerPartNumber: string | null
```

In `backend/src/modules/vendor-sync/adapters/wheelpros-tires/schema.ts`, add to `tireNormalizedSchema` (after `groupKey`):

```ts
  model: z.string().nullable(),
```

- [ ] **Step 4: Populate them in `normalizeTireRow`**

In `backend/src/modules/vendor-sync/adapters/wheelpros-tires/normalize.ts`, add the import and compute the model + group key. Replace the current `const tireSize = parseTireSize(...)` line and the return's `groupKey` line:

```ts
import { ParsedRow, TireNormalizedRecord } from '../types'
import { parseVendorDate, parsePrice } from '../../utils/parse-helpers'
import { parseTireSize } from '../../utils/tire-parse-helpers'
import { tireRawRowSchema } from './schema'
import { extractTireModel } from './model-key'
import { computeTireGroupKey } from './group-key'
```

```ts
  const tireSize = parseTireSize(raw['PartDescription'])
  const { model, confident } = extractTireModel(
    raw['Brand'],
    raw['PartDescription'],
    tireSize.sizeToken
  )

  return {
    productType: 'tire',
    partNumber: row.partNumber,
    vendorCode: VENDOR_CODE,
    title: raw['PartDescription'],
    brand: raw['Brand'],
    imageUrl,
    invOrderType: raw['InvOrderType'] as 'ST' | 'N2' | 'SO',
    totalQoh: warehouseSum > 0 ? warehouseSum : totalQoh,
    msrpUsd: parsePrice(raw['MSRP_USD']),
    mapUsd: parsePrice(raw['MAP_USD']),
    runDateVendor: parseVendorDate(raw['RunDate']),
    stockByWarehouse,
    groupKey: computeTireGroupKey({
      brand: raw['Brand'],
      model,
      confident,
      partNumber: row.partNumber,
    }),
    model,
    manufacturerPartNumber,
    division,
    ...tireSize,
  }
```

Note `sizeToken` reaches the record via the `...tireSize` spread (added to `TireSizeResult` in Task 1) — no explicit line needed. `model` is not part of `tireSize`, so it stays as its own key. Leave `...tireSize` last as written.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && npx -y pnpm@9.10.0 test:sync -- tire-normalize`
Expected: PASS (grouped + fallback assertions). The Task 4 facets test still passes (it never depended on this task).

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/vendor-sync/adapters/types.ts backend/src/modules/vendor-sync/adapters/wheelpros-tires/normalize.ts backend/src/modules/vendor-sync/adapters/wheelpros-tires/schema.ts backend/src/modules/vendor-sync/__tests__/tire-normalize.test.ts
git commit -m "feat(vendor-sync): group tires by brand+model with per-SKU fallback (WB-005)"
```

---

## Task 6: Tire grouping helpers (option/variant builders)

**Files:**
- Create: `backend/src/modules/vendor-sync/pipeline/tire-grouping.ts`
- Test: `backend/src/modules/vendor-sync/__tests__/tire-grouping.test.ts`

**Interfaces:**
- Consumes: `TireNormalizedRecord`, `tireSizeLabel` (Task 4), `slugify` (from `wheel-grouping`).
- Produces:
  - `TIRE_OPTION_TITLES = { SIZE: "Size" }`
  - `tireVariantAxisKey(record): string` = `tireSizeLabel(record)`
  - `buildTireProductOptions(records): [{ title: "Size", values: string[] }]`
  - `buildTireVariantOptions(record): { Size: string }`
  - `buildTireGroupTitle(record): string` = `` `${brand} ${model}` `` or `record.title` (per-SKU fallback)
  - `buildTireGroupHandle(record): string`
  - `dedupeTireExactDuplicates(records): { survivors; dropped }` (in-stock-first)
  - `findTireExactDuplicates(records): TireNormalizedRecord[][]`

- [ ] **Step 1: Write the failing test**

Create `backend/src/modules/vendor-sync/__tests__/tire-grouping.test.ts`:

```ts
import {
  TIRE_OPTION_TITLES,
  tireVariantAxisKey,
  buildTireProductOptions,
  buildTireVariantOptions,
  buildTireGroupTitle,
  buildTireGroupHandle,
  dedupeTireExactDuplicates,
} from "../pipeline/tire-grouping"
import { TireNormalizedRecord } from "../adapters/types"

function tire(overrides: Partial<TireNormalizedRecord> = {}): TireNormalizedRecord {
  return {
    productType: "tire", partNumber: "F1", vendorCode: "wheelpros-tires",
    title: "WDPEAK AT4W 305/45R22 118S", brand: "Falken", imageUrl: null,
    invOrderType: "ST", totalQoh: 1, msrpUsd: 100, mapUsd: 0,
    runDateVendor: new Date("2026-05-17T00:00:00.000Z"), stockByWarehouse: {},
    groupKey: "Falken|WDPEAK AT4W", model: "WDPEAK AT4W",
    manufacturerPartNumber: null, division: null,
    tireWidthMm: 305, aspectRatio: 45, constructionType: "R", rimDiameterIn: 22,
    loadIndex: 118, speedRating: "S", plyRating: null, tirePrefix: null,
    sizeToken: "305/45R22", ...overrides,
  } as TireNormalizedRecord
}

describe("tire grouping", () => {
  it("uses the size label as the variant axis", () => {
    expect(tireVariantAxisKey(tire())).toBe("305/45R22 118S")
  })

  it("builds one Size option with the union of labels, numerically-ish sorted", () => {
    const opts = buildTireProductOptions([
      tire({ sizeToken: "305/45R22", loadIndex: 118, speedRating: "S" }),
      tire({ sizeToken: "305/50R20", loadIndex: 120, speedRating: "T", partNumber: "F2" }),
    ])
    expect(opts).toHaveLength(1)
    expect(opts[0].title).toBe("Size")
    expect(opts[0].values).toEqual(["305/45R22 118S", "305/50R20 120T"])
  })

  it("maps a record to its variant option object", () => {
    expect(buildTireVariantOptions(tire())).toEqual({ Size: "305/45R22 118S" })
  })

  it("titles a grouped product as brand + model", () => {
    expect(buildTireGroupTitle(tire())).toBe("Falken WDPEAK AT4W")
  })

  it("titles a per-SKU fallback product with the raw description", () => {
    expect(buildTireGroupTitle(tire({ model: null, groupKey: "sku:F1" }))).toBe(
      "WDPEAK AT4W 305/45R22 118S"
    )
  })

  it("handles a grouped product from brand + model", () => {
    expect(buildTireGroupHandle(tire())).toBe("falken-wdpeak-at4w")
  })

  it("dedupes exact-duplicate size labels, keeping in-stock first", () => {
    const { survivors, dropped } = dedupeTireExactDuplicates([
      tire({ partNumber: "OUT", totalQoh: 0 }),
      tire({ partNumber: "IN", totalQoh: 5 }),
    ])
    expect(survivors.map((r) => r.partNumber)).toEqual(["IN"])
    expect(dropped.map((r) => r.partNumber)).toEqual(["OUT"])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx -y pnpm@9.10.0 test:sync -- tire-grouping`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `tire-grouping.ts`**

```ts
import { TireNormalizedRecord } from "../adapters/types"
import { slugify } from "./wheel-grouping"
import { canonicalTireSize, tireSizeLabel } from "./tire-facets"

/** Tires have one meaningful variant axis: size. */
export const TIRE_OPTION_TITLES = {
  SIZE: "Size",
} as const

/**
 * Variant axis key = the size label (canonical size + service description), so
 * two rows of the same model that differ only by speed/load are DISTINCT
 * variants (never lost), and true exact duplicates collide and dedupe.
 */
export function tireVariantAxisKey(record: TireNormalizedRecord): string {
  return tireSizeLabel(record)
}

/** Sort size labels left-to-right as the size string reads: width, then aspect
 *  ratio, then rim diameter, then the raw label. (This matches the PDP's later
 *  rim-chip grouping: within a rim the sizes order by width/aspect.) */
function compareSizeLabels(a: string, b: string): number {
  const width = (s: string): number => {
    const m = s.match(/(\d{2,3})\//)
    return m ? parseInt(m[1], 10) : 0
  }
  const aspect = (s: string): number => {
    const m = s.match(/\/(\d{2,3})[A-Z]/)
    return m ? parseInt(m[1], 10) : 0
  }
  const rim = (s: string): number => {
    const m = s.match(/R(\d{2})\b/) ?? s.match(/-(\d{2})\b/)
    return m ? parseInt(m[1], 10) : 0
  }
  return width(a) - width(b) || aspect(a) - aspect(b) || rim(a) - rim(b) || a.localeCompare(b)
}

export function buildTireProductOptions(
  records: TireNormalizedRecord[]
): Array<{ title: string; values: string[] }> {
  const values = new Set<string>()
  for (const r of records) values.add(tireSizeLabel(r))
  return [
    { title: TIRE_OPTION_TITLES.SIZE, values: [...values].sort(compareSizeLabels) },
  ]
}

export function buildTireVariantOptions(
  record: TireNormalizedRecord
): Record<string, string> {
  return { [TIRE_OPTION_TITLES.SIZE]: tireSizeLabel(record) }
}

/** Grouped title = brand + model; per-SKU fallback uses the raw description. */
export function buildTireGroupTitle(record: TireNormalizedRecord): string {
  if (!record.model) return record.title
  return `${record.brand} ${record.model}`
}

/** Grouped handle = brand-model; per-SKU fallback = brand-partNumber. */
export function buildTireGroupHandle(record: TireNormalizedRecord): string {
  if (!record.model) {
    return `${slugify(record.brand)}-${slugify(record.partNumber)}`
  }
  return [slugify(record.brand), slugify(record.model)].filter(Boolean).join("-")
}

function groupByAxisKey(
  records: TireNormalizedRecord[]
): Map<string, TireNormalizedRecord[]> {
  const byKey = new Map<string, TireNormalizedRecord[]>()
  for (const r of records) {
    const k = tireVariantAxisKey(r)
    const list = byKey.get(k) ?? []
    list.push(r)
    byKey.set(k, list)
  }
  return byKey
}

export function findTireExactDuplicates(
  records: TireNormalizedRecord[]
): TireNormalizedRecord[][] {
  return [...groupByAxisKey(records).values()].filter((g) => g.length > 1)
}

function pickSurvivor(dupes: TireNormalizedRecord[]): TireNormalizedRecord {
  return [...dupes].sort((a, b) => {
    const aStock = a.totalQoh > 0 ? 0 : 1
    const bStock = b.totalQoh > 0 ? 0 : 1
    if (aStock !== bStock) return aStock - bStock
    return a.partNumber.localeCompare(b.partNumber)
  })[0]
}

export function dedupeTireExactDuplicates(records: TireNormalizedRecord[]): {
  survivors: TireNormalizedRecord[]
  dropped: TireNormalizedRecord[]
} {
  const survivors: TireNormalizedRecord[] = []
  const dropped: TireNormalizedRecord[] = []
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

/** Canonical size for a variant, used by the search facet. */
export { canonicalTireSize }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx -y pnpm@9.10.0 test:sync -- tire-grouping`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/vendor-sync/pipeline/tire-grouping.ts backend/src/modules/vendor-sync/__tests__/tire-grouping.test.ts
git commit -m "feat(vendor-sync): tire grouping helpers (size axis, options, dedupe) (WB-005)"
```

---

## Task 7: Rewrite `applyNewTireGroup` into a multi-variant builder

**Files:**
- Modify: `backend/src/modules/vendor-sync/pipeline/apply.ts` (`applyNewTireGroup` at ~346-403; the `external_id` fork at ~258-259; imports)

**Interfaces:**
- Consumes: `buildTireProductOptions`, `buildTireVariantOptions`, `buildTireGroupTitle`, `buildTireGroupHandle`, `dedupeTireExactDuplicates`, `findTireExactDuplicates` (Task 6); existing `getBrandCollectionId`, `pickGroupRepresentative` (wheel-typed — see note), `persistGroupAfterCreate`, `TireNormalizedRecord`.
- Note: this is an integration change verified by the dry-run in Task 11, not a new unit test (matches the wheel apply's test policy — the apply loop has no isolated unit test).

- [ ] **Step 1: Add imports**

At the top of `apply.ts`, add:

```ts
import {
  buildTireGroupHandle,
  buildTireGroupTitle,
  buildTireProductOptions,
  buildTireVariantOptions,
  dedupeTireExactDuplicates,
  findTireExactDuplicates,
} from "./tire-grouping"
import { TireNormalizedRecord } from "../adapters/types"
```

(Extend the existing `../adapters/types` import instead of adding a second line if lint prefers — add `TireNormalizedRecord` to the existing `{ NormalizedRecord, WheelNormalizedRecord }` import.)

- [ ] **Step 2: Fix the grouped external_id fork**

At `apply.ts:258-259`, the external id for tires must become the group key when grouped (so grouped tires adopt by group_key on retry) and stay the part number for per-SKU fallback groups. Replace:

```ts
  const externalId =
    first.productType === "wheel" ? group.group_key : first.partNumber
```

with:

```ts
  // Idempotency-adoption external id MUST equal what each create writes:
  //  - wheels: applyNewWheelGroup ALWAYS creates with external_id = group_key
  //    (including "sku:<pn>" fallback wheels) — so wheels adopt by group_key,
  //    unchanged from the original behavior. Do NOT strip "sku:" for wheels or
  //    per-SKU-fallback wheels fail to adopt on retry and duplicate.
  //  - tires: applyNewTireGroup creates with external_id = group_key when
  //    grouped, else the part number for "sku:" fallback groups — mirror that.
  const externalId =
    first.productType === "wheel"
      ? group.group_key
      : group.group_key.startsWith("sku:")
        ? first.partNumber
        : group.group_key
```

- [ ] **Step 3: Rewrite `applyNewTireGroup`**

Replace the entire `applyNewTireGroup` function (`apply.ts:346-403`) with:

```ts
async function applyNewTireGroup(
  ctx: ApplyContext,
  group: NewGroup,
  records: NormalizedRecord[]
): Promise<{ variantCount: number }> {
  const tires = records as TireNormalizedRecord[]

  // Collapse exact-duplicate size labels (in-stock-first), then guard.
  const { survivors, dropped } = dedupeTireExactDuplicates(tires)
  for (const d of dropped) {
    ctx.logger.warn(
      `[vendor-sync] [${ctx.runId}] deduped exact duplicate tire size, dropped ${d.partNumber} (group ${group.group_key})`
    )
  }
  const residual = findTireExactDuplicates(survivors)
  if (residual.length > 0) {
    throw new Error(
      `unexpected residual tire size collision after dedupe in group ${group.group_key}: ${residual[0]
        .map((r) => r.partNumber)
        .join(", ")}`
    )
  }

  const rep = pickGroupRepresentative(survivors as any) as TireNormalizedRecord
  const brandCollectionId = await getBrandCollectionId(ctx, rep.brand)
  const categoryId = ctx.categories.tiresCategoryId
  const productOptions = buildTireProductOptions(survivors)

  const imageUrls = Array.from(
    new Set(survivors.map((r) => r.imageUrl).filter((u): u is string => !!u))
  )

  const variants = survivors.map((r) => ({
    title: tireSizeLabelForVariantTitle(r),
    sku: r.partNumber,
    options: buildTireVariantOptions(r),
    manage_inventory: true,
    allow_backorder: false,
    metadata: buildVariantMetadata(r),
    prices: [{ amount: r.msrpUsd, currency_code: "usd" }],
  }))

  const { result } = await createProductsWorkflow(ctx.container).run({
    input: {
      products: [
        {
          title: buildTireGroupTitle(rep),
          handle: buildTireGroupHandle(rep),
          status: ProductStatus.PUBLISHED,
          thumbnail: rep.imageUrl ?? undefined,
          images: imageUrls.map((url) => ({ url })),
          collection_id: brandCollectionId,
          category_ids: [categoryId],
          sales_channels: [{ id: ctx.salesChannelId }],
          shipping_profile_id: ctx.shippingProfileId,
          external_id: group.group_key.startsWith("sku:")
            ? rep.partNumber
            : group.group_key,
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

// Variant display title: the size label is already unique + human-readable.
function tireSizeLabelForVariantTitle(r: TireNormalizedRecord): string {
  return buildTireVariantOptions(r).Size
}
```

Add the `buildVariantMetadata`, `buildProductMetadata` — already imported at the top of `apply.ts` (used by wheels). `ProductStatus` and `createProductsWorkflow` are already imported.

- [ ] **Step 4: Verify the type-check compiles**

Run: `cd backend && npx -y pnpm@9.10.0 exec tsc --noEmit -p tsconfig.json`
Expected: no NEW errors introduced by these edits (the repo may have pre-existing baseline errors elsewhere; confirm none reference `apply.ts` tire code). If `pickGroupRepresentative` typing complains, the `as any`/`as TireNormalizedRecord` casts above localize it — it only reads `partNumber`/`brand`/`imageUrl`, which both record types share.

- [ ] **Step 5: Run the full vendor-sync suite (no regressions)**

Run: `cd backend && npx -y pnpm@9.10.0 test:sync`
Expected: PASS (all prior tests + the new tire tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/vendor-sync/pipeline/apply.ts
git commit -m "feat(vendor-sync): multi-variant tire apply (size = variant axis) (WB-005)"
```

---

## Task 8: Teach the changed-group add path to add tire size variants

**Files:**
- Modify: `backend/src/modules/vendor-sync/pipeline/apply.ts` (the `else` branch at ~546-553, plus a tire option-extend helper)

**Interfaces:**
- Consumes: `TIRE_OPTION_TITLES`, `buildTireVariantOptions`, `tireVariantAxisKey`, `tireSizeLabel` (Task 6/4); existing `partitionRecordsBySku`, `indexVariantsBySku`, `persistAddedVariants`, `createProductVariantsWorkflow`, `updateProductOptionsWorkflow`.

- [ ] **Step 1: Replace the defensive tire skip**

At `apply.ts:546-553`, replace the `else { ...warn+skip... }` branch of the `if (productType === "wheel")` block with a real tire add path:

```ts
    } else {
      const tireAdds = addedRecords as TireNormalizedRecord[]

      const query = ctx.container.resolve(ContainerRegistrationKeys.QUERY)
      const { data: existingVariants } = await query.graph({
        entity: "variant",
        fields: ["id", "sku", "metadata", "inventory_items.inventory_item_id"],
        filters: { product_id: [productId] },
      })
      const existingSkus = new Set<string>(
        (existingVariants ?? []).map((v: any) => v.sku).filter(Boolean)
      )
      const { toCreate: skuNew } = partitionRecordsBySku(tireAdds, existingSkus)

      // Drop any added row whose size label already exists on the product.
      const existingSizeLabels = new Set<string>(
        (existingVariants ?? []).map((v: any) =>
          String((v.metadata as any)?.size_label ?? "")
        ).filter(Boolean)
      )
      const seen = new Set(existingSizeLabels)
      const toCreate: TireNormalizedRecord[] = []
      const droppedSkus = new Set<string>()
      for (const r of skuNew) {
        const label = tireVariantAxisKey(r)
        if (seen.has(label)) {
          droppedSkus.add(r.partNumber)
          ctx.logger.warn(
            `[vendor-sync] [${ctx.runId}] deduped duplicate tire size on add, dropped ${r.partNumber} (group ${group.group_key})`
          )
          continue
        }
        seen.add(label)
        toCreate.push(r)
      }

      let createdVariants: any[] = []
      if (toCreate.length > 0) {
        await extendTireOptions(ctx, productId, toCreate)
        const variants = toCreate.map((r) => ({
          product_id: productId,
          title: buildTireVariantOptions(r).Size,
          sku: r.partNumber,
          options: buildTireVariantOptions(r),
          manage_inventory: true,
          allow_backorder: false,
          metadata: buildVariantMetadata(r),
          prices: [{ amount: r.msrpUsd, currency_code: "usd" }],
        }))
        const created = await createProductVariantsWorkflow(ctx.container).run({
          input: { product_variants: variants },
        })
        createdVariants = created.result
      }

      const skuIndex = indexVariantsBySku([
        ...(existingVariants ?? []),
        ...createdVariants,
      ])
      const toPersist = tireAdds.filter((r) => !droppedSkus.has(r.partNumber))
      await persistAddedVariants(ctx, group.group_key, toPersist, skuIndex, productId)
      variantCount += toPersist.length
    }
```

This dedupes against a `size_label` variant-metadata key. To make that key exist, ensure `buildVariantMetadata` writes it (Step 2).

- [ ] **Step 2: Write `size_label` into tire variant metadata**

So the add-path dedupe has a stable key to read, add `size_label` to the tire branch of `buildVariantMetadata` in `backend/src/modules/vendor-sync/pipeline/build-metadata.ts`. Import the label helper and set it:

```ts
import { NormalizedRecord } from "../adapters/types"
import { tireSizeLabel } from "./tire-facets"
```

In the tire branch `return { ...base, ... }` add:

```ts
  return {
    ...base,
    manufacturer_part_number: normalized.manufacturerPartNumber,
    size_label: tireSizeLabel(normalized),
    canonical_size: normalized.sizeToken
      ? normalized.sizeToken.toUpperCase().replace(/Z(?=[RBD]\d)/g, "")
      : null,
    tire_width_mm: normalized.tireWidthMm,
    aspect_ratio: normalized.aspectRatio,
    construction_type: normalized.constructionType,
    rim_diameter_in: normalized.rimDiameterIn,
    load_index: normalized.loadIndex,
    speed_rating: normalized.speedRating,
    ply_rating: normalized.plyRating,
  }
```

(Reuse `canonicalTireSize` semantics inline here to avoid a circular import from `tire-facets` → `build-metadata`; `tire-facets` imports only from `adapters/types`, so importing `tireSizeLabel` into `build-metadata` is safe. If lint flags the inline canonical, import `canonicalTireSize` from `tire-facets` too and call `canonicalTireSize(normalized)`.)

Update `build-metadata.test.ts` if it asserts the exact tire metadata shape — add `size_label`/`canonical_size` to the expected object (search the test for `manufacturer_part_number` and extend that `toMatchObject`/`toEqual`).

- [ ] **Step 3: Add `extendTireOptions`**

Near `extendWheelOptions` in `apply.ts`, add:

```ts
/**
 * Extend the tire product's single "Size" option to include any new size label
 * introduced by added rows. createProductVariantsWorkflow only accepts option
 * values that already exist on the product.
 */
async function extendTireOptions(
  ctx: ApplyContext,
  productId: string,
  addedRecords: TireNormalizedRecord[]
): Promise<void> {
  const query = ctx.container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "options.id", "options.title", "options.values.value"],
    filters: { id: [productId] },
  })
  const sizeOption = (products?.[0] as any)?.options?.find(
    (o: any) => o.title === TIRE_OPTION_TITLES.SIZE
  )
  if (!sizeOption) return
  const existing = new Set<string>(
    (sizeOption.values ?? []).map((v: any) => v.value)
  )
  const merged = new Set(existing)
  for (const r of addedRecords) merged.add(buildTireVariantOptions(r).Size)
  if (merged.size === existing.size) return
  await updateProductOptionsWorkflow(ctx.container).run({
    input: {
      selector: { id: sizeOption.id },
      update: { values: [...merged] },
    },
  })
}
```

Confirm `updateProductOptionsWorkflow` and `TIRE_OPTION_TITLES` are imported at the top of `apply.ts` (the former is already imported for wheels; add `TIRE_OPTION_TITLES` to the `./tire-grouping` import from Task 7).

- [ ] **Step 4: Type-check + full suite**

Run: `cd backend && npx -y pnpm@9.10.0 exec tsc --noEmit -p tsconfig.json`
Expected: no new errors.
Run: `cd backend && npx -y pnpm@9.10.0 test:sync`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/vendor-sync/pipeline/apply.ts backend/src/modules/vendor-sync/pipeline/build-metadata.ts backend/src/modules/vendor-sync/__tests__/build-metadata.test.ts
git commit -m "feat(vendor-sync): add tire size variants on incremental feed changes (WB-005)"
```

---

## Task 9: `buildSearchDocument` tire branch

**Files:**
- Modify: `backend/src/modules/vendor-sync/search/build-search-document.ts`
- Modify: `backend/src/modules/vendor-sync/__tests__/build-search-document.test.ts`

**Interfaces:**
- Produces: for a `product_type === "tire"` product, a flat doc `{ id, handle, title, description, thumbnail, created_at, product_type: "tire", brand, skus, tire_sizes, rim_diameters, section_widths, aspect_ratios, load_indexes, speed_ratings, tire_type, price_min, price_max }`. Reads `variants[].metadata`: `canonical_size`, `rim_diameter_in`, `tire_width_mm`, `aspect_ratio`, `load_index`, `speed_rating`, plus product-level `tire_prefix`. `price_*` are integer cents.

- [ ] **Step 1: Replace the failing test**

In `build-search-document.test.ts`, replace the test at lines 72-75 (`returns null for non-wheel products`) with a real tire-doc assertion:

```ts
  it("builds a tire document with facet arrays", () => {
    const tire = {
      id: "prod_t1",
      handle: "falken-wildpeak-at4w",
      title: "Falken WDPEAK AT4W",
      thumbnail: "https://cdn.example.com/t.jpg",
      created_at: "2026-05-17T00:00:00.000Z",
      metadata: { product_type: "tire", brand: "Falken", tire_prefix: null },
      variants: [
        {
          sku: "F28840215",
          prices: [{ amount: 462, currency_code: "usd" }],
          metadata: {
            size_label: "305/45R22 118S", canonical_size: "305/45R22",
            rim_diameter_in: 22, tire_width_mm: 305, aspect_ratio: 45,
            load_index: 118, speed_rating: "S", construction_type: "R",
          },
        },
        {
          sku: "F28844030",
          prices: [{ amount: 405, currency_code: "usd" }],
          metadata: {
            size_label: "305/50R20 120T", canonical_size: "305/50R20",
            rim_diameter_in: 20, tire_width_mm: 305, aspect_ratio: 50,
            load_index: 120, speed_rating: "T", construction_type: "R",
          },
        },
      ],
    }
    const doc = buildSearchDocument(tire as any)
    expect(doc).toMatchObject({
      id: "prod_t1",
      product_type: "tire",
      brand: "Falken",
      skus: ["F28840215", "F28844030"],
      tire_sizes: ["305/45R22", "305/50R20"],
      rim_diameters: [20, 22],
      section_widths: [305],
      aspect_ratios: [45, 50],
      load_indexes: [118, 120],
      speed_ratings: ["S", "T"],
      tire_type: "passenger",
      price_min: 40500,
      price_max: 46200,
    })
  })

  it("returns the minimal stub for products that are neither wheel nor tire", () => {
    const other = { ...product, metadata: { product_type: "accessory", brand: "X" } }
    expect(buildSearchDocument(other as any)).toBeNull()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx -y pnpm@9.10.0 test:sync -- build-search-document`
Expected: FAIL — tire currently returns null.

- [ ] **Step 3: Split the wheel body into `buildWheelDocument` + add a `buildTireDocument` dispatch**

So `WheelSearchDocument` and `TireSearchDocument` stay precise (deriving `WheelSearchDocument` off the widened `buildSearchDocument` union would pollute it with the tire shape).

First, rename the current function body: change the signature line

```ts
export function buildSearchDocument(product: IndexableProduct) {
  const meta = product.metadata ?? {}
  if (meta.product_type !== "wheel") return null

  const variants = product.variants ?? []
```

to a dedicated wheel builder that takes `meta` as a param (keep the ENTIRE existing body from `const variants = ...` through its `return { ... }` verbatim):

```ts
function buildWheelDocument(
  product: IndexableProduct,
  meta: Record<string, unknown>
) {
  const variants = product.variants ?? []
```

Then add the thin dispatcher immediately above `buildWheelDocument`:

```ts
/**
 * Medusa product → flat Meilisearch document. Dispatches by product_type:
 * a wheel doc, a tire doc, or null for anything else (the plugin coalesces a
 * falsy result to a minimal { id, product_type } stub in medusa-config.js).
 */
export function buildSearchDocument(product: IndexableProduct) {
  const meta = product.metadata ?? {}
  if (meta.product_type === "wheel") return buildWheelDocument(product, meta)
  if (meta.product_type === "tire") return buildTireDocument(product, meta)
  return null
}
```

Update the `WheelSearchDocument` export at the bottom to derive from the wheel builder (it never returns null):

```ts
export type WheelSearchDocument = ReturnType<typeof buildWheelDocument>
```

Then add, below the wheel function (before the `WheelSearchDocument` export):

```ts
const str = (v: unknown): string | null =>
  typeof v === "string" && v ? v : null

function buildTireDocument(
  product: IndexableProduct,
  meta: Record<string, unknown>
) {
  const variants = product.variants ?? []
  const sizes: string[] = []
  const rimDiameters: number[] = []
  const sectionWidths: number[] = []
  const aspectRatios: number[] = []
  const loadIndexes: number[] = []
  const speedRatings: string[] = []
  const usdPrices: number[] = []
  const skus: string[] = []

  for (const v of variants) {
    if (typeof v.sku === "string" && v.sku) skus.push(v.sku)
    const vm = v.metadata ?? {}
    const size = str(vm.canonical_size)
    if (size) sizes.push(size)
    const rim = num(vm.rim_diameter_in)
    if (rim !== null) rimDiameters.push(rim)
    const w = num(vm.tire_width_mm)
    if (w !== null) sectionWidths.push(w)
    const a = num(vm.aspect_ratio)
    if (a !== null) aspectRatios.push(a)
    const li = num(vm.load_index)
    if (li !== null) loadIndexes.push(li)
    const sr = str(vm.speed_rating)
    if (sr) speedRatings.push(sr)
    for (const p of v.prices ?? []) {
      if (p.currency_code === "usd" && Number.isFinite(p.amount)) {
        usdPrices.push(p.amount)
      }
    }
  }

  return {
    id: product.id,
    handle: product.handle,
    title: product.title,
    description: product.description ?? "",
    thumbnail: product.thumbnail ?? null,
    created_at: product.created_at ?? null,
    product_type: "tire",
    brand: typeof meta.brand === "string" ? meta.brand : "",
    skus: uniqStr(skus),
    tire_sizes: uniqStr(sizes),
    rim_diameters: uniqSorted(rimDiameters),
    section_widths: uniqSorted(sectionWidths),
    aspect_ratios: uniqSorted(aspectRatios),
    load_indexes: uniqSorted(loadIndexes),
    speed_ratings: uniqStr(speedRatings),
    tire_type: classifyTireTypeFromMeta(meta, variants),
    price_min: usdPrices.length ? Math.round(Math.min(...usdPrices) * 100) : 0,
    price_max: usdPrices.length ? Math.round(Math.max(...usdPrices) * 100) : 0,
  }
}

/**
 * Product-level tire class from prefix (product metadata) + first variant's
 * parsed structure. Mirrors classifyTireType but reads the flattened metadata
 * available in the indexer (no TireNormalizedRecord here).
 */
function classifyTireTypeFromMeta(
  meta: Record<string, unknown>,
  variants: IndexableVariant[]
): "passenger" | "light-truck" | "other" {
  const prefix = str(meta.tire_prefix)?.toUpperCase()
  if (prefix === "LT") return "light-truck"
  if (prefix === "P") return "passenger"
  if (prefix === "ST") return "other"
  const vm = variants[0]?.metadata ?? {}
  if (num(vm.tire_width_mm) !== null && num(vm.aspect_ratio) !== null) return "passenger"
  if (str(vm.construction_type) !== null) return "light-truck"
  return "other"
}

export type TireSearchDocument = ReturnType<typeof buildTireDocument>
```

Also update the stale docblock now sitting above `buildWheelDocument` (the old "Medusa wheel product → … Returns null for non-wheel" comment) to describe just the wheel builder — the null/dispatch behaviour is documented on the new `buildSearchDocument` dispatcher.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx -y pnpm@9.10.0 test:sync -- build-search-document`
Expected: PASS (wheel cases + new tire cases). Note `tire_type: "passenger"` derives from the variant structure (width+aspect present) since `tire_prefix` is null in the fixture.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/vendor-sync/search/build-search-document.ts backend/src/modules/vendor-sync/__tests__/build-search-document.test.ts
git commit -m "feat(vendor-sync): index tires in Meili with facet fields (WB-005)"
```

---

## Task 10: Add tire facets to the Meilisearch index config

**Files:**
- Modify: `backend/medusa-config.js` (the `products` index `indexSettings`, ~253-268)

**Interfaces:**
- No test (config only; validated by the dry-run + a live search in Task 11). This is build-safe: fields absent on wheel docs are simply not populated.

- [ ] **Step 1: Extend `displayedAttributes` and `filterableAttributes`**

In `backend/medusa-config.js`, update the two lists (leave `searchableAttributes` and `sortableAttributes` unchanged — `title`/`brand`/`skus` and `price_min`/`created_at`/`title` already cover tires):

```js
              displayedAttributes: [
                'id', 'handle', 'title', 'description', 'thumbnail', 'brand',
                'finishes', 'skus',
                'diameters', 'widths', 'offsets', 'bolt_patterns',
                'bolt_patterns_canonical', 'center_bores',
                'tire_sizes', 'rim_diameters', 'section_widths',
                'aspect_ratios', 'load_indexes', 'speed_ratings', 'tire_type',
                'price_min', 'price_max', 'created_at', 'product_type',
              ],
              filterableAttributes: [
                'brand', 'finishes', 'diameters', 'widths', 'bolt_patterns',
                'bolt_patterns_canonical', 'offsets', 'center_bores',
                'tire_sizes', 'rim_diameters', 'section_widths',
                'aspect_ratios', 'load_indexes', 'speed_ratings', 'tire_type',
                'price_min', 'price_max', 'product_type',
              ],
```

- [ ] **Step 2: Verify the backend builds**

Run: `cd backend && npx -y pnpm@9.10.0 build`
Expected: `medusa build` completes without config-load errors (the postBuild copy runs). If it fails on a pre-existing unrelated error, confirm via `git stash` A/B that this edit is not the cause.

- [ ] **Step 3: Commit**

```bash
git add backend/medusa-config.js
git commit -m "feat(vendor-sync): register tire facets in the Meili products index (WB-005)"
```

---

## Task 11: Manual verification (dry-run) + docs

**Files:**
- Modify: `docs/future/BACKLOG.md` (WB-005 → in-progress with a note), `docs/STATUS.md` (Vendor import pillar), move nothing yet (spec stays in-progress until sub-projects 2+3 land).

- [ ] **Step 1: Dry-run the tire feed (no Medusa mutations)**

Run: `cd backend && npx -y pnpm@9.10.0 vendor-sync:dry-run wheelpros-tires`
Expected: a summary printed with a run id; tire rows staged and grouped. Confirm in the output/log that multiple sizes of the same model share a `group_key` of the form `Brand|Model` (e.g. `Falken|WDPEAK AT4W` with 3 sizes) and that unparseable rows fall to `sku:<partNumber>`. This exercises parse → normalize → stage → diff for tires without writing to the catalog.

- [ ] **Step 2: (Optional, gated) Apply against a dev DB**

Only against a dev/staging `DATABASE_URL` (never prod from local — `VENDOR_SYNC_DEV_MAX_ROWS` truncates locally). Run `pnpm vendor-sync:apply <run-id>` and confirm: grouped tire products created with N size variants, each variant priced + stocked. This is the true integration proof; do not run against prod here (prod cutover is a separate deploy step in the spec).

- [ ] **Step 3: Run the whole backend test suite**

Run: `cd backend && npx -y pnpm@9.10.0 test:sync`
Expected: PASS — all wheel tests unchanged + the new tire tests. Record the new count.

- [ ] **Step 4: Update docs**

In `docs/future/BACKLOG.md`, flip WB-005 `status: todo` → `status: in-progress` and append a `done`-style note describing sub-project 1 (grouping + indexing) landing, with the ids of the new modules. Keep the item open (sub-projects 2+3 remain).

In `docs/STATUS.md`, update the Vendor import pillar row: change "Tires not grouped/indexed" to note tires are now grouped (brand+model, size axis) + indexed (`product_type = "tire"` with facets), backend-only; storefront discovery/PDP still pending (sub-projects 2+3). Bump "Last verified" to 2026-07-02.

- [ ] **Step 5: Run doc-review**

Invoke the `doc-review` skill (or `/doc-review`) to catch drift before committing docs.

- [ ] **Step 6: Commit docs**

```bash
git add docs/future/BACKLOG.md docs/STATUS.md
git commit -m "docs: WB-005 sub-project 1 (tire grouping + indexing) landed"
```

---

## Self-review notes (for the executor)

- **Spec coverage:** Task 2 = model extractor (spec 1a); Task 3 = group key (1b); Task 4 = canonical size + type (1c/1e derive); Task 6 = grouping helpers (1d builders); Task 7 = multi-variant apply (1d); Task 8 = changed-group add (1d); Task 9 = search branch (1e); Task 10 = Meili facets (1f). All of Sub-project 1's spec sections map to a task.
- **Deferred to later sub-projects:** storefront discovery (SP2), tire PDP (SP3) — not in this plan.
- **Cutover:** prod re-import is NOT in this plan (it is a deploy action in the spec's Rollout section). This plan lands the code + a dry-run proof.
- **Type consistency:** `tireSizeLabel`/`canonicalTireSize` names are used identically across Tasks 4/6/8/9; `TIRE_OPTION_TITLES.SIZE = "Size"` and the variant option key `Size` match across Tasks 6/7/8; the search doc reads `canonical_size`/`size_label` written by Task 8's `buildVariantMetadata`.
