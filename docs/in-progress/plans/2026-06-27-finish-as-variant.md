# Finish as a Variant Axis — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse wheels that differ only by color/finish into ONE product with selectable finish variants (`/products/petrol-p3b` with Matte Black / Gloss Silver), instead of N per-color products.

**Architecture:** Drop `finish` from the vendor-sync wheel group key (colors collapse into one group) and promote finish to a 7th variant axis (so same-size different-color rows are distinct variants, not deduped). Propagate finish as per-variant data through metadata, per-finish images, the Meilisearch transformer (multi-valued `finishes`), Discovery, and the PDP finish selector. Re-grouping is a full prod re-import done once as a gated cutover at the end.

**Tech Stack:** MedusaJS 2.13.6 vendor-sync pipeline (jest), `@rokmohar/medusa-plugin-meilisearch`, Next.js 15 / React 19 storefront (vitest).

## Global Constraints

- **Finish axis value = RAW vendor finish** ("Matte Black", "Gloss Silver"); blank finish → the existing `OPTIONAL_AXIS_NONE` sentinel `—`. Discovery facet = NORMALIZED buckets (black/silver/bronze), multi-valued per product.
- **No `wb-`/`WB`/`wheelbuilds-` prefix** on identifiers.
- **Price convention:** dollars in Medusa, integer cents in the Meili index (`Math.round(major*100)`); display ÷100. Unchanged.
- **`MedusaService` create/update take a single object.**
- **No in-place data migration** — re-group = full prod re-import (Phase 5, gated). Phases 1–4 are code+tests; prod stays on the current per-finish catalog until the single cutover.
- **Old per-finish URLs 404** (no redirect map).
- Storefront server components by default; PDP hero/gallery are `"use client"`.
- Backend tests: `cd backend && npx jest <path>`. Storefront: `cd storefront && npx vitest run`, `npx tsc --noEmit` (0 new vs the 14 pre-existing on `main`). Config: `node --check medusa-config.js`. Windows: use `npx` directly.
- **Commit trailer (every commit):** `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Branch: `feat/finish-as-variant` (already created; spec committed there).

---

## File Structure

**Backend (vendor-sync) — modified**
- `adapters/wheelpros-wheels/group-key.ts` — drop finish from the key.
- `pipeline/wheel-grouping.ts` — Finish as the 7th axis; finish out of title/handle.
- `pipeline/build-metadata.ts` — finish + image_url → variant; finish off product.
- `pipeline/apply.ts` — product thumbnail = rep image, images = union, variant image_url via metadata.
- `search/build-search-document.ts` — `finish` → `finishes` (normalized union).
- `medusa-config.js` — index settings `finish` → `finishes`.
- `docs/reference/vendor-sync-implementation.md` — document the 7-axis + finish grouping.

**Storefront — modified**
- `modules/discovery/data/types.ts` — `DiscoveryProduct.finish` → `finishes: Finish[]`.
- `modules/discovery/data/get-products.ts` — facet/filter/hit `finish` → `finishes`.
- `modules/discovery/components/grid/product-card.tsx` — render real `finishes`.
- `modules/product-detail/data/types.ts` — `FinishOption`; `finishOptions: FinishOption[]`.
- `modules/product-detail/data/get-product.ts` — per-finish partition.
- `modules/product-detail/data/finish-options.ts` (NEW) — pure partition helper + test.
- `modules/product-detail/components/hero/index.tsx` — finish drives the per-finish sizeOptions.
- `modules/product-detail/components/hero/gallery.tsx` — real finish swatches + per-finish image.
- `storefront/CLAUDE.md` — PDP finish-as-variant note.

---

# PHASE 1 — Backend grouping

## Task 1: Drop finish from the wheel group key

**Files:**
- Modify: `backend/src/modules/vendor-sync/adapters/wheelpros-wheels/group-key.ts`
- Test: `backend/src/modules/vendor-sync/__tests__/wheel-group-key.test.ts`

**Interfaces:**
- Produces: `computeWheelGroupKey({brand, displayStyleNo, finish, partNumber})` now returns `${brand}|${displayStyleNo}` (finish ignored) when displayStyleNo present; `sku:${partNumber}` otherwise.

- [ ] **Step 1: Update the failing tests** — in `wheel-group-key.test.ts`, change/extend assertions so two finishes of the same model share a key, and add a regression case:
```ts
it("groups all finishes of a model under one key (finish dropped)", () => {
  const base = { brand: "Petrol", displayStyleNo: "P3B", partNumber: "X" }
  const black = computeWheelGroupKey({ ...base, finish: "Matte Black" })
  const silver = computeWheelGroupKey({ ...base, finish: "Gloss Silver" })
  expect(black).toBe("Petrol|P3B")
  expect(black).toBe(silver)
})
it("still falls back to sku: when no DisplayStyleNo", () => {
  expect(computeWheelGroupKey({ brand: "DUB", displayStyleNo: null, finish: "X", partNumber: "Y305" }))
    .toBe("sku:Y305")
})
```
(Update any existing test that asserted a finish-bearing key like `"Petrol|P3B|Matte Black"`.)

- [ ] **Step 2: Run it RED** — `cd backend && npx jest src/modules/vendor-sync/__tests__/wheel-group-key.test.ts` → FAIL (key still includes finish).

- [ ] **Step 3: Drop finish** — in `group-key.ts`, delete the `finish` line and change the return:
```ts
export function computeWheelGroupKey(opts: {
  brand: string
  displayStyleNo: string | null
  finish: string | null
  partNumber: string
}): string {
  const brand = opts.brand.trim()
  const displayStyleNo = opts.displayStyleNo?.trim() ?? ""

  if (!displayStyleNo) {
    return `sku:${opts.partNumber}`
  }

  // Finish is intentionally NOT part of the key: all colors of a Brand+Model
  // collapse into one product, with finish carried as a variant axis (WB-059).
  return `${brand}|${displayStyleNo}`
}
```
(Keep the `finish` param in the signature — callers still pass it; it's now unused here.)

- [ ] **Step 4: Run it GREEN** — same command → PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/src/modules/vendor-sync/adapters/wheelpros-wheels/group-key.ts backend/src/modules/vendor-sync/__tests__/wheel-group-key.test.ts
git commit -m "feat(vendor-sync): drop finish from wheel group key — colors collapse into one product (WB-059)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Finish as the 7th variant axis

**Files:**
- Modify: `backend/src/modules/vendor-sync/pipeline/wheel-grouping.ts`
- Test: `backend/src/modules/vendor-sync/__tests__/wheel-grouping.test.ts`

**Interfaces:**
- Consumes: `WheelNormalizedRecord.finish: string | null`.
- Produces: `WHEEL_OPTION_TITLES.FINISH = "Finish"`; `formatFinish(finish: string | null): string` (raw trimmed, blank → `OPTIONAL_AXIS_NONE`); `variantAxisKey` is now a 7-tuple ending in finish; `buildProductOptions`/`buildVariantOptions`/`axisKeyFromMetadata` include Finish; `buildGroupTitle`/`buildGroupHandle` exclude finish.

- [ ] **Step 1: Write/extend the failing tests** — add to `wheel-grouping.test.ts`:
```ts
const wheel = (over: Partial<WheelNormalizedRecord> = {}): WheelNormalizedRecord => ({
  productType: "wheel", partNumber: "P", vendorCode: "v", title: "t", brand: "Petrol",
  imageUrl: "i", invOrderType: "", totalQoh: 1, msrpUsd: 1, mapUsd: 1,
  runDateVendor: new Date(0), stockByWarehouse: {}, groupKey: "Petrol|P3B",
  displayStyleNo: "P3B", finish: "Matte Black", diameterIn: 20, widthIn: 9,
  boltCount: 5, boltCircleIn: 4.5, boltPatternRaw: "5x114.3", offsetMm: 35,
  centerBoreMm: 73.1, loadRatingLb: 1500, shippingWeightLb: 30, style: "P3B", ...over,
})

it("finish is a variant axis — same size, different finish = distinct variants", () => {
  const black = variantAxisKey(wheel({ finish: "Matte Black" }))
  const silver = variantAxisKey(wheel({ finish: "Gloss Silver" }))
  expect(black).not.toBe(silver)
})
it("matte vs gloss black stay distinct (raw finish, not normalized)", () => {
  expect(variantAxisKey(wheel({ finish: "Matte Black" })))
    .not.toBe(variantAxisKey(wheel({ finish: "Gloss Black" })))
})
it("blank finish → sentinel in the axis key", () => {
  expect(variantAxisKey(wheel({ finish: null }))).toContain(OPTIONAL_AXIS_NONE)
})
it("buildProductOptions includes a Finish option with the union of finishes", () => {
  const opts = buildProductOptions([wheel({ finish: "Matte Black" }), wheel({ finish: "Gloss Silver" })])
  const finishOpt = opts.find((o) => o.title === WHEEL_OPTION_TITLES.FINISH)
  expect(finishOpt?.values.sort()).toEqual(["Gloss Silver", "Matte Black"])
})
it("buildVariantOptions carries the raw finish", () => {
  expect(buildVariantOptions(wheel({ finish: "Matte Black" }))[WHEEL_OPTION_TITLES.FINISH]).toBe("Matte Black")
})
it("axisKeyFromMetadata matches variantAxisKey for the same record", () => {
  const r = wheel({ finish: "Gloss Silver" })
  const m = { bolt_pattern_raw: r.boltPatternRaw, wheel_diameter_in: r.diameterIn,
    wheel_width_in: r.widthIn, offset_mm: r.offsetMm, center_bore_mm: r.centerBoreMm,
    load_rating_lb: r.loadRatingLb, finish: r.finish }
  expect(axisKeyFromMetadata(m)).toBe(variantAxisKey(r))
})
it("handle and title drop the finish", () => {
  expect(buildGroupHandle(wheel({ finish: "Matte Black" }))).toBe("petrol-p3b")
  expect(buildGroupTitle(wheel({ finish: "Matte Black" }))).toBe("Petrol P3B")
})
```
(Ensure `OPTIONAL_AXIS_NONE`, `WHEEL_OPTION_TITLES`, `axisKeyFromMetadata`, `buildVariantOptions`, `buildGroupHandle`, `buildGroupTitle` are imported in the test.)

- [ ] **Step 2: Run it RED** — `cd backend && npx jest src/modules/vendor-sync/__tests__/wheel-grouping.test.ts` → FAIL.

- [ ] **Step 3: Add the Finish axis to `wheel-grouping.ts`**

Add to `WHEEL_OPTION_TITLES` (after `LOAD_RATING`):
```ts
  LOAD_RATING: "Load Rating",
  FINISH: "Finish",
```
Add a finish formatter (after `formatOptionalAxis`):
```ts
/** Format the finish axis value: raw trimmed label, blank → sentinel. */
export function formatFinish(finish: string | null): string {
  const f = finish?.trim()
  return f ? f : OPTIONAL_AXIS_NONE
}
```
Append finish to `variantAxisKey` (add as the last array element before `.join("|")`):
```ts
    formatOptionalAxis(record.loadRatingLb),
    formatFinish(record.finish),
  ].join("|")
```
Append finish to `axisKeyFromMetadata` (last element):
```ts
    formatOptionalAxis(toOptionalNumber(m.load_rating_lb)),
    formatFinish(typeof m.finish === "string" ? m.finish : null),
  ].join("|")
```
In `buildProductOptions`, add a finishes set + option. Add `const finishes = new Set<string>()` with the others; inside the loop add `finishes.add(formatFinish(r.finish))`; append to the returned array:
```ts
    { title: WHEEL_OPTION_TITLES.LOAD_RATING, values: [...loadRatings].sort(numericSort) },
    { title: WHEEL_OPTION_TITLES.FINISH, values: [...finishes].sort() },
  ]
```
In `buildVariantOptions`, add the finish entry:
```ts
    [WHEEL_OPTION_TITLES.LOAD_RATING]: formatOptionalAxis(record.loadRatingLb),
    [WHEEL_OPTION_TITLES.FINISH]: formatFinish(record.finish),
  }
```
In `buildGroupTitle`, drop finish:
```ts
  if (!record.displayStyleNo) {
    return record.title
  }
  return [record.brand, record.displayStyleNo].join(" ")
```
In `buildGroupHandle`, drop finish:
```ts
  if (!record.displayStyleNo) {
    return `${slugify(record.brand)}-${slugify(record.partNumber)}`
  }
  return [slugify(record.brand), slugify(record.displayStyleNo)].filter(Boolean).join("-")
```
(Update the `variantAxisKey` doc comment from "6-tuple" → "7-tuple" and the `buildGroupHandle` comment example from `…-gloss-black` → no finish.)

- [ ] **Step 4: Run it GREEN** — same command → PASS. Also run `cd backend && npx jest src/modules/vendor-sync/__tests__/wheel-group-key.test.ts` (regression, still green).

- [ ] **Step 5: Commit**
```bash
git add backend/src/modules/vendor-sync/pipeline/wheel-grouping.ts backend/src/modules/vendor-sync/__tests__/wheel-grouping.test.ts
git commit -m "feat(vendor-sync): finish as the 7th wheel variant axis; drop finish from title/handle (WB-059)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Finish + per-finish image → variant metadata

**Files:**
- Modify: `backend/src/modules/vendor-sync/pipeline/build-metadata.ts`
- Test: `backend/src/modules/vendor-sync/__tests__/build-metadata.test.ts`

**Interfaces:**
- Produces: wheel `buildProductMetadata` NO LONGER has `finish`; wheel `buildVariantMetadata` gains `finish` (raw) + `image_url`.

- [ ] **Step 1: Extend the failing tests** — in `build-metadata.test.ts`:
```ts
it("product metadata no longer carries finish (it's per-variant now)", () => {
  const m = buildProductMetadata(wheelRecord({ finish: "Matte Black" }))
  expect(m.finish).toBeUndefined()
  expect(m.display_style_no).toBeDefined()
})
it("variant metadata carries raw finish + its own image_url", () => {
  const m = buildVariantMetadata(wheelRecord({ finish: "Matte Black", imageUrl: "https://cdn/x.jpg" }))
  expect(m.finish).toBe("Matte Black")
  expect(m.image_url).toBe("https://cdn/x.jpg")
})
```
(Use the file's existing record factory; if none, mirror the `wheel()` factory from Task 1's test.)

- [ ] **Step 2: Run it RED** — `cd backend && npx jest src/modules/vendor-sync/__tests__/build-metadata.test.ts` → FAIL.

- [ ] **Step 3: Move finish to the variant** — in `build-metadata.ts`:

In `buildProductMetadata`'s wheel branch, **remove** the `finish` line:
```ts
  if (normalized.productType === "wheel") {
    return {
      ...base,
      display_style_no: normalized.displayStyleNo,
      style: normalized.style,
    }
  }
```
In `buildVariantMetadata`'s wheel branch, **add** finish + image_url:
```ts
  if (normalized.productType === "wheel") {
    return {
      ...base,
      finish: normalized.finish,
      image_url: normalized.imageUrl,
      wheel_diameter_in: normalized.diameterIn,
      wheel_width_in: normalized.widthIn,
      bolt_count: normalized.boltCount,
      bolt_circle_in: normalized.boltCircleIn,
      bolt_pattern_raw: normalized.boltPatternRaw,
      offset_mm: normalized.offsetMm,
      center_bore_mm: normalized.centerBoreMm,
      load_rating_lb: normalized.loadRatingLb,
    }
  }
```
(Update the file's header comment: finish moves from product → variant.)

- [ ] **Step 4: Run it GREEN** — same command → PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/src/modules/vendor-sync/pipeline/build-metadata.ts backend/src/modules/vendor-sync/__tests__/build-metadata.test.ts
git commit -m "feat(vendor-sync): finish + per-finish image_url move to variant metadata (WB-059)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Product images span all finishes (apply)

**Files:**
- Modify: `backend/src/modules/vendor-sync/pipeline/apply.ts` (`applyNewWheelGroup`, ~lines 300–332)

**Interfaces:**
- Consumes: `survivors: WheelNormalizedRecord[]` (each with `.imageUrl`), `rep = pickGroupRepresentative(survivors)`, `buildWheelVariantInput` (already writes `buildVariantMetadata`, which now includes `image_url`).

- [ ] **Step 1: Union the finish images** — in `applyNewWheelGroup`, just before the `createProductsWorkflow` call, add:
```ts
  // One image per finish: the product carries the union; the thumbnail is the
  // representative finish's image; each variant keeps its own image_url in
  // metadata (buildVariantMetadata) for the PDP finish swatch. (WB-059)
  const imageUrls = Array.from(
    new Set(survivors.map((r) => r.imageUrl).filter((u): u is string => !!u))
  )
```

- [ ] **Step 2: Use it in the product input** — change the `thumbnail`/`images` lines in the `products: [{ ... }]` block:
```ts
          thumbnail: rep.imageUrl ?? undefined,
          images: imageUrls.map((url) => ({ url })),
```

- [ ] **Step 3: Verify** —
```
cd backend && node -e "require('ts-node/register'); require('./src/modules/vendor-sync/pipeline/wheel-grouping.ts')" 2>/dev/null; echo done
cd backend && npx tsc --noEmit
```
Expected: `apply.ts` has no new type errors (pre-existing backend errors elsewhere are out of scope). Then run the apply-adjacent suites that exist: `npx jest src/modules/vendor-sync/__tests__/apply-stock.test.ts src/modules/vendor-sync/__tests__/adopt.test.ts` → still green.

- [ ] **Step 4: Commit**
```bash
git add backend/src/modules/vendor-sync/pipeline/apply.ts
git commit -m "feat(vendor-sync): wheel product carries the union of finish images; thumbnail = rep finish (WB-059)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

**Note (deferred to cutover):** variant `image_url` and the multi-image product are validated live during the Phase 5 re-import.

---

# PHASE 2 — Search index (Meilisearch)

## Task 5: Transformer emits `finishes` (normalized union)

**Files:**
- Modify: `backend/src/modules/vendor-sync/search/build-search-document.ts`
- Test: `backend/src/modules/vendor-sync/__tests__/build-search-document.test.ts`

**Interfaces:**
- Produces: the wheel doc has `finishes: string[]` (normalized buckets, deduped) instead of `finish: string`. `WheelSearchDocument` type updates automatically (derived from the return).

- [ ] **Step 1: Extend the failing test** — in `build-search-document.test.ts`, add (and remove/replace any assertion on the old singular `finish`):
```ts
it("emits the normalized union of variant finishes", () => {
  const doc = buildSearchDocument({
    id: "p", handle: "h", title: "t", metadata: { product_type: "wheel", brand: "Petrol" },
    variants: [
      { metadata: { finish: "Matte Black", bolt_pattern_raw: "5x114.3", wheel_diameter_in: 20, wheel_width_in: 9, offset_mm: 35 } },
      { metadata: { finish: "Gloss Silver", bolt_pattern_raw: "5x114.3", wheel_diameter_in: 20, wheel_width_in: 9, offset_mm: 35 } },
    ],
  } as any)
  expect(doc).not.toBeNull()
  expect([...(doc!.finishes as string[])].sort()).toEqual(["black", "silver"])
  expect((doc as any).finish).toBeUndefined()
})
```

- [ ] **Step 2: Run it RED** — `cd backend && npx jest src/modules/vendor-sync/__tests__/build-search-document.test.ts` → FAIL.

- [ ] **Step 3: Compute `finishes` from variants** — in `build-search-document.ts`:

Add a finishes collector in the variant loop (alongside the others):
```ts
  const finishes: string[] = []
```
Inside `for (const v of variants)`, after reading `vm`:
```ts
    const fin = normalizeFinish(typeof vm.finish === "string" ? vm.finish : null)
    if (fin) finishes.push(fin)
```
In the returned object, **replace** the `finish:` line with:
```ts
    finishes: uniqStr(finishes),
```
(Remove the now-unused product-level `meta.finish` read.)

- [ ] **Step 4: Run it GREEN** — same command → PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/src/modules/vendor-sync/search/build-search-document.ts backend/src/modules/vendor-sync/__tests__/build-search-document.test.ts
git commit -m "feat(search): wheel doc emits multi-valued normalized finishes (WB-059)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Meili index settings `finish` → `finishes`

**Files:**
- Modify: `backend/medusa-config.js` (products `indexSettings`)

- [ ] **Step 1: Swap the attribute** — in the products plugin block:
  - `displayedAttributes`: replace `'finish'` with `'finishes'`.
  - `filterableAttributes`: replace `'finish'` with `'finishes'`.
  - (`sortableAttributes`/`searchableAttributes` don't mention finish — leave them.)
  - Confirm `fields` already includes `variants.metadata` (it does — the transformer reads variant metadata); no change.

- [ ] **Step 2: Verify** — `cd backend && node --check medusa-config.js` → no output (valid JS).

- [ ] **Step 3: Commit**
```bash
git add backend/medusa-config.js
git commit -m "feat(search): index settings finish -> finishes (multi-valued facet) (WB-059)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
**Note:** activates on the next Meili settings re-sync (plugin pushes settings on boot) — folded into the Phase 5 cutover.

---

# PHASE 3 — Discovery (storefront)

## Task 7: Discovery reads multi-valued `finishes`

**Files:**
- Modify: `storefront/src/modules/discovery/data/types.ts`
- Modify: `storefront/src/modules/discovery/data/get-products.ts`
- Modify: `storefront/src/modules/discovery/components/grid/product-card.tsx`

**Interfaces:**
- Produces: `DiscoveryProduct.finishes: Finish[]` (replaces `finish: Finish`).

- [ ] **Step 1: Type change** — in `discovery/data/types.ts`, on `DiscoveryProduct` replace:
```ts
  finish: Finish
```
with
```ts
  /** Normalized finish buckets this product is offered in (multi-valued). */
  finishes: Finish[]
```
(`DiscoveryFilters.finishes: Finish[]` and `FacetCounts.finishes` already exist — leave them.)

- [ ] **Step 2: Adapter** — in `discovery/data/get-products.ts`:
  - `FACET_FIELDS`: `"finish"` → `"finishes"`.
  - `facetQueryByDim`: change the key `finish: "finishes"` → `finishes: "finishes"`.
  - `buildFilters`: `` `finish IN [${...}]` `` → `` `finishes IN [${...}]` ``.
  - `Hit` type: `finish: Finish` → `finishes: Finish[]`.
  - `hitToProduct`: replace `finish: (h.finish as Finish) ?? "black"` → `finishes: (h.finishes as Finish[]) ?? []`.
  - facets mapping: `finishes: facetByField["finish"]` → `finishes: facetByField["finishes"]`.

- [ ] **Step 3: Product card** — in `discovery/components/grid/product-card.tsx`, replace the finish-swatch source. The current code does `[product.finish, "black", "silver"].slice(0, 3)`. Change to use the product's real finishes (cap 3), falling back to a single black dot when empty:
```tsx
        {(product.finishes.length ? product.finishes : ["black"]).slice(0, 3).map((f, i) => (
```
(and the `<Label>` after it reads `{product.diameter}" · {product.boltPattern}` — unchanged.)

- [ ] **Step 4: Typecheck** — `cd storefront && npx tsc --noEmit` → 0 new errors. Fix any other consumer of `DiscoveryProduct.finish` the compiler flags (e.g. the PDP loader is updated in Task 8; if tsc flags `get-product.ts` here, that's expected and resolved in Task 8 — note it and continue, OR sequence Task 8 before this typecheck). If a stray non-PDP consumer references `.finish`, update it to `.finishes`.

- [ ] **Step 5: Commit**
```bash
git add storefront/src/modules/discovery/data/types.ts storefront/src/modules/discovery/data/get-products.ts storefront/src/modules/discovery/components/grid/product-card.tsx
git commit -m "feat(discovery): products carry multi-valued finishes; facet reads finishes (WB-059)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

# PHASE 4 — PDP finish selector (storefront)

## Task 8: PDP data — per-finish partition

**Files:**
- Modify: `storefront/src/modules/product-detail/data/types.ts`
- Create: `storefront/src/modules/product-detail/data/finish-options.ts`
- Test: `storefront/src/modules/product-detail/data/finish-options.test.ts`
- Modify: `storefront/src/modules/product-detail/data/get-product.ts`

**Interfaces:**
- Produces: `FinishOption = { raw: string; normalized: Finish; imageUrl: string | null; sizeOptions: SizeOption[] }`; `ProductDetail.finishOptions: FinishOption[]`; pure `buildFinishOptions(variants, productWeightLb): FinishOption[]`.

- [ ] **Step 1: Types** — in `product-detail/data/types.ts`:

Add the `FinishOption` type (after `SizeOption`):
```ts
/** One finish a wheel is offered in, with its own image + size matrix. */
export type FinishOption = {
  /** Raw vendor finish label, e.g. "Matte Black". The selectable variant value. */
  raw: string
  /** Normalized bucket (black/silver/bronze) — drives the <Wheel> fallback color. */
  normalized: Finish
  /** This finish's product image (vendor CDN); null falls back to <Wheel>. */
  imageUrl: string | null
  /** Size matrix scoped to THIS finish's variants. */
  sizeOptions: SizeOption[]
}
```
Change `ProductDetail.finishOptions`:
```ts
  /** Finishes the product is offered in; the hero finish selector switches between these. */
  finishOptions: FinishOption[]
```

- [ ] **Step 2: Write the failing helper test** — `finish-options.test.ts`:
```ts
import { describe, it, expect } from "vitest"
import { buildFinishOptions } from "./finish-options"

const variant = (finish: string, image: string | null, d: number) =>
  ({ id: `v-${finish}-${d}`, metadata: { finish, image_url: image, wheel_diameter_in: d, wheel_width_in: 9, offset_mm: 35, bolt_pattern_raw: "5x114.3" }, calculated_price: { calculated_amount: 100 }, inventory_quantity: 5 } as any)

describe("buildFinishOptions", () => {
  it("partitions variants by raw finish, each with its own sizeOptions + image", () => {
    const out = buildFinishOptions(
      [variant("Matte Black", "b.jpg", 20), variant("Gloss Silver", "s.jpg", 22)], 30
    )
    expect(out.map((f) => f.raw).sort()).toEqual(["Gloss Silver", "Matte Black"])
    const black = out.find((f) => f.raw === "Matte Black")!
    expect(black.imageUrl).toBe("b.jpg")
    expect(black.normalized).toBe("black")
    expect(black.sizeOptions.length).toBe(1)
    expect(black.sizeOptions[0].diameter).toBe(20)
  })
  it("collapses multiple variants of one finish into that finish's size matrix", () => {
    const out = buildFinishOptions(
      [variant("Matte Black", "b.jpg", 20), variant("Matte Black", "b.jpg", 22)], 30
    )
    expect(out.length).toBe(1)
    expect(out[0].sizeOptions.length).toBe(2)
  })
  it("blank finish → a single '—' finish option", () => {
    const out = buildFinishOptions([variant("", null, 20)], 30)
    expect(out.length).toBe(1)
    expect(out[0].raw).toBe("—")
  })
})
```

- [ ] **Step 3: Run it RED** — `cd storefront && npx vitest run src/modules/product-detail/data/finish-options.test.ts` → FAIL (no module).

- [ ] **Step 4: Implement** — `finish-options.ts`:
```ts
import { HttpTypes } from "@medusajs/types"
import { Finish } from "@modules/common/components/wheel"
import { normalizeFinish } from "@lib/fitment/normalize-finish"
import { groupVariantsIntoSizes } from "./group-sizes"
import { FinishOption } from "./types"

const BLANK_FINISH = "—"

/**
 * Partition a product's variants by their RAW finish (matching the backend's
 * Finish variant axis), and build a per-finish size matrix + image. Blank
 * finishes collapse under the "—" sentinel. Sorted by raw label. (WB-059)
 */
export function buildFinishOptions(
  variants: HttpTypes.StoreProductVariant[],
  productWeightLb: number
): FinishOption[] {
  const byFinish = new Map<string, HttpTypes.StoreProductVariant[]>()
  for (const v of variants) {
    const m = (v.metadata ?? {}) as Record<string, unknown>
    const raw = String(m.finish ?? "").trim() || BLANK_FINISH
    const list = byFinish.get(raw) ?? []
    list.push(v)
    byFinish.set(raw, list)
  }
  return [...byFinish.entries()]
    .map(([raw, vs]) => {
      const firstImage = vs
        .map((v) => ((v.metadata ?? {}) as any).image_url)
        .find((u): u is string => typeof u === "string" && !!u) ?? null
      return {
        raw,
        normalized: normalizeFinish(raw) as Finish,
        imageUrl: firstImage,
        sizeOptions: groupVariantsIntoSizes(vs, productWeightLb),
      }
    })
    .sort((a, b) => a.raw.localeCompare(b.raw))
}
```

- [ ] **Step 5: Run it GREEN** — same command → PASS.

- [ ] **Step 6: Wire into `get-product.ts`** — `mapToDetail` currently sets `finishOptions: [finish]` and `sizeOptions: groupVariantsIntoSizes(variants, weightLb)`. Replace those two:
```ts
    finishOptions: buildFinishOptions(variants, weightLb),
    sizeOptions: groupVariantsIntoSizes(variants, weightLb),
```
Keep `sizeOptions` (the flat all-finish matrix) as the fallback the hero uses when there's a single finish — OR (cleaner) the hero reads the active finish's `sizeOptions`. Set the top-level `finishes` (DiscoveryProduct base, now `Finish[]`) from the finish options:
```ts
    finishes: Array.from(new Set(finishOptionsList.map((f) => f.normalized))),
```
where `const finishOptionsList = buildFinishOptions(variants, weightLb)` is computed once and reused for both `finishes` and `finishOptions`. Add the import:
```ts
import { buildFinishOptions } from "./finish-options"
```
(Also update the `finish` references in `mapToDetail`: the base `DiscoveryProduct.finish` no longer exists — replace with `finishes`. Keep `specs.finishOptions: finishOptionsList.length` for the specs grid count.)

- [ ] **Step 7: Typecheck + full unit run** — `cd storefront && npx tsc --noEmit` (0 new) + `npx vitest run` (existing + new finish-options cases green).

- [ ] **Step 8: Commit**
```bash
git add storefront/src/modules/product-detail/data/types.ts storefront/src/modules/product-detail/data/finish-options.ts storefront/src/modules/product-detail/data/finish-options.test.ts storefront/src/modules/product-detail/data/get-product.ts
git commit -m "feat(pdp): per-finish partition — finishOptions carry raw finish + image + size matrix (WB-059)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: PDP finish selector drives the variant machine

**Files:**
- Modify: `storefront/src/modules/product-detail/components/hero/index.tsx`
- Modify: `storefront/src/modules/product-detail/components/hero/gallery.tsx`

**Interfaces:**
- Consumes: `ProductDetail.finishOptions: FinishOption[]` (Task 8).

- [ ] **Step 1: Hero — finish drives the active size matrix** — in `hero/index.tsx`:

Replace the `activeFinish` state + the `visibleSizes` derivation so the active **FinishOption** supplies the sizes. After the props destructure:
```tsx
  const finishOptions = product.finishOptions
  const [activeFinishRaw, setActiveFinishRaw] = useState<string>(
    finishOptions[0]?.raw ?? "—"
  )
  const activeFinish = useMemo(
    () => finishOptions.find((f) => f.raw === activeFinishRaw) ?? finishOptions[0],
    [finishOptions, activeFinishRaw]
  )
  const finishSizeOptions = activeFinish?.sizeOptions ?? product.sizeOptions
```
Change `visibleSizes` to read `finishSizeOptions`:
```tsx
  const visibleSizes = useMemo<SizeOption[]>(
    () => sizesForBoltPattern(finishSizeOptions, selectedBoltPattern),
    [finishSizeOptions, selectedBoltPattern]
  )
```
The existing `useEffect([visibleSizes])` already re-snaps `selectedSize` when the set changes — so switching finish (which changes `finishSizeOptions` → `visibleSizes`) re-snaps size/offset/bore/load for free. Update the `Gallery` usage:
```tsx
      <Gallery
        finishes={finishOptions}
        activeFinishRaw={activeFinishRaw}
        onFinishChange={setActiveFinishRaw}
      />
```
(Remove the old `Finish`/`product.finish` import usage; `activeFinish` is now a `FinishOption`. If `boltPatternOptions` should be per-finish, leave product-level for now — bolt patterns rarely vary by finish; the size re-snap covers mismatches.)

- [ ] **Step 2: Gallery — real finish swatches + per-finish image** — replace `gallery.tsx` contents:
```tsx
"use client"

import Image from "next/image"
import Wheel from "@modules/common/components/wheel"
import Label from "@modules/common/components/label"
import { FinishOption } from "../../data/types"

type GalleryProps = {
  finishes: FinishOption[]
  activeFinishRaw: string
  onFinishChange: (raw: string) => void
}

const Gallery = ({ finishes, activeFinishRaw, onFinishChange }: GalleryProps) => {
  const active = finishes.find((f) => f.raw === activeFinishRaw) ?? finishes[0]
  const showSelector = finishes.length > 1

  return (
    <div className="flex flex-col gap-4">
      <div
        className="relative aspect-square rounded-[var(--radius)] flex items-center justify-center overflow-hidden border border-[var(--hairline)]"
        style={{ background: "var(--soft)" }}
      >
        <div className="wheel-glow" style={{ position: "absolute", inset: 40, zIndex: 0 }} />
        {active?.imageUrl ? (
          <Image
            src={active.imageUrl}
            alt={active.raw}
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-contain p-8 z-10"
            priority
          />
        ) : (
          <Wheel size={460} finish={active?.normalized ?? "black"} style={{ position: "relative", zIndex: 1 }} />
        )}
        {active && (
          <div
            className="absolute bottom-4 right-4"
            style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--ink-soft)", letterSpacing: "0.08em" }}
          >
            {active.raw.toUpperCase()}
          </div>
        )}
      </div>

      {showSelector && (
        <div>
          <Label tone="muted" style={{ display: "block", marginBottom: 8 }}>
            Finish · {finishes.length} available
          </Label>
          <div className="flex gap-2 flex-wrap">
            {finishes.map((f) => (
              <button
                key={f.raw}
                type="button"
                onClick={() => onFinishChange(f.raw)}
                aria-label={`Show ${f.raw} finish`}
                aria-pressed={f.raw === activeFinishRaw}
                title={f.raw}
                className={`w-24 h-24 shrink-0 rounded-[var(--radius)] border-2 flex items-center justify-center overflow-hidden transition-colors ${
                  f.raw === activeFinishRaw
                    ? "border-[var(--orange)]"
                    : "border-[var(--hairline)] hover:border-[var(--ink-soft)]"
                }`}
                style={{ background: "var(--soft)" }}
              >
                {f.imageUrl ? (
                  <Image src={f.imageUrl} alt={f.raw} width={88} height={88} className="object-contain p-1" />
                ) : (
                  <Wheel size={80} finish={f.normalized} />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default Gallery
```

- [ ] **Step 3: Typecheck** — `cd storefront && npx tsc --noEmit` → 0 new errors. Confirm no remaining reference to the removed `FINISH_LABELS`-based gallery API or `product.finish` in the hero/gallery.

- [ ] **Step 4: Commit**
```bash
git add storefront/src/modules/product-detail/components/hero/index.tsx storefront/src/modules/product-detail/components/hero/gallery.tsx
git commit -m "feat(pdp): finish selector switches image + per-finish size matrix (WB-059)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

**Note (deferred to cutover):** live PDP smoke (pick Matte Black vs Gloss Silver → image + price + sizes change) runs after the Phase 5 re-import.

---

# PHASE 5 — Cutover (gated, runs last)

## Task 10: Docs + cutover runbook

**Files:**
- Modify: `backend/docs/reference/vendor-sync-implementation.md` (7-axis incl. Finish; group key = Brand+DisplayStyleNo; per-variant finish+image)
- Modify: `storefront/CLAUDE.md` (PDP §: finishOptions now `FinishOption[]`; gallery switches per-finish image; Discovery `finishes` multi-valued)

- [ ] **Step 1: Update both docs** to describe the 7-axis variant model (Finish added), the group key dropping finish, per-variant `finish`/`image_url`, the Meili `finishes` array, and the PDP finish selector.

- [ ] **Step 2: Commit**
```bash
git add backend/docs/reference/vendor-sync-implementation.md storefront/CLAUDE.md
git commit -m "docs: document finish-as-variant (7-axis model, finishes facet, PDP selector) (WB-059)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 3: CUTOVER (user-gated, destructive, prod `trolley.proxy.rlwy.net`)** — run ONLY after all phases merge to `main` and the user gives explicit go-ahead. The WB-051 dance:
  1. `POST /admin/vendor-sync/purge-products` looped until `{ remaining: 0 }`.
  2. `cd backend && pnpm exec medusa exec ./src/scripts/vendor-sync-truncate-state.ts -- --confirm-host=trolley.proxy.rlwy.net`
  3. `POST /admin/vendor-sync/runs { vendor_code: "wheelpros-wheels", dry_run: false }`
  4. Confirm the Meili re-sync (plugin pushes the `finishes` settings on boot) — restart/redeploy the backend so the index settings update.
  - **Verify live:** a known multi-color model imports as ONE product at `/products/<brand>-<style>` with a working finish selector (image + price + sizes change per finish); Discovery shows it under each normalized bucket it offers; old `…-<finish>` URL 404s; apply `errors` ≈ 0; product count dropped / variant count rose vs the prior import.

---

## Final verification (after Phases 1–4 merge, before cutover)
- [ ] `cd backend && pnpm test:sync` — all green (group-key, grouping, build-metadata, build-search-document cases updated).
- [ ] `cd backend && node --check medusa-config.js` — valid.
- [ ] `cd backend && npx tsc --noEmit` — no new errors from the changed pipeline/search files.
- [ ] `cd storefront && npx vitest run` — existing + finish-options cases green.
- [ ] `cd storefront && npx tsc --noEmit` — 0 new vs the 14 pre-existing on `main`.
- [ ] Grep `\bfinish\b` in `discovery/data/get-products.ts` + `product-card.tsx` → only `finishes` remains (no stray singular `finish` facet/field).

## Self-review notes
- **Spec coverage:** Part 1 → Tasks 1–4; Part 2 → Tasks 5–6; Part 3 → Task 7; Part 4 → Tasks 8–9; Part 5 → Task 10. All covered.
- **Type consistency:** `formatFinish` (backend) ↔ `BLANK_FINISH "—"` (storefront) both map blank → `—`. `variantAxisKey` 7-tuple ends in finish; `axisKeyFromMetadata` mirrors it. `DiscoveryProduct.finishes: Finish[]` ↔ Meili doc `finishes: string[]` ↔ adapter `Hit.finishes`. `FinishOption` shape identical in types.ts, finish-options.ts, gallery.tsx, hero.
- **Ordering:** Task 7's tsc may flag `get-product.ts` (still on `.finish`) until Task 8 lands — run Task 8 immediately after, or do the `get-product.ts` `.finishes` rename as part of Task 7 if executing strictly in order. Either way both land before the Phase-4 typecheck gate.
