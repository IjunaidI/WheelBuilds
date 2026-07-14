# WB-088 Discovery Truth — Implementation Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development.
> Spec: [../specs/2026-07-14-wb-088-discovery-truth-design.md](../specs/2026-07-14-wb-088-discovery-truth-design.md).

**Goal:** Discovery tells the truth — one physical bolt pattern = one checkbox, honest cards, outage-honest empty state, tire capped honesty, sane price inputs, full facet lists, correct sorts/pages/escaping.

**Global constraints:** Storefront-only except one backend `medusa-config.js` line (`maxValuesPerFacet`, restart only — no re-sync). Wheel = `modules/discovery/`, tire = `modules/tire-discovery/` (twin — most fixes done twice; `escape.ts` is shared). Storefront tests `npx vitest run` (import `{describe,it,expect} from "vitest"`; 5-error tsc baseline). D8 scoped to price inputs only — do NOT flip the shared `push` helper globally. Branch `feat/g11-wave1-discovery-nav`.

---

### Task 1: D4 — canonical bolt-pattern facet + dual-unit label

**Files:** `discovery/data/get-products.ts` (`FACET_FIELDS` 44, `buildFilters` 65-66, `hitToProduct` 115-127); `discovery/components/filter-rail/filter-sections.tsx` (bolt section ~177-187); `discovery/components/active-chips/index.tsx` (bolt chip 73-79); new `discovery/data/pcd-inch-label.ts` + golden test. (Wheel-only — tires have no bolt axis.)

- [ ] **Step 1 — failing test** `discovery/data/pcd-inch-label.test.ts`:
```ts
import { pcdInchLabel } from "./pcd-inch-label"
describe("pcdInchLabel (WB-088 D4)", () => {
  it("renders dual-unit for standard PCDs", () => {
    expect(pcdInchLabel("5x114.3")).toBe('5×114.3 (5×4.5″)')
    expect(pcdInchLabel("6x139.7")).toBe('6×139.7 (6×5.5″)')
  })
  it("passes a non-canonical value through unchanged", () => {
    expect(pcdInchLabel("BLANK")).toBe("BLANK")
  })
})
```
- [ ] **Step 2 — RED.**
- [ ] **Step 3 — implement** `pcd-inch-label.ts`: parse `^(\d+)x([\d.]+)$`; if no match return the input; convert mm→inch via a curated `PCD_INCH` map for standard PCDs (`{114.3:"4.5",139.7:"5.5",127:"5",120:"4.72",100:"3.94",108:"4.25",112:"4.41",130:"5.12",150:"5.9",165.1:"6.5",170:"6.69"}`) else `(mm/25.4).toFixed(2)`; return `` `${count}×${mm} (${count}×${inch}″)` ``. Then in `get-products.ts`: `FACET_FIELDS` swap `"bolt_patterns"` → `"bolt_patterns_canonical"`; `buildFilters` clause `bolt_patterns_canonical IN [...]`; `hitToProduct` keep `boltPatternsCanonical` (already there). In `filter-sections.tsx` bolt section: render the facet over `facets.boltPatterns` (now canonical values) with `labelMap` built from `pcdInchLabel`. In `active-chips.tsx`: the bolt chip label uses `pcdInchLabel(bp)`. (The `FacetCounts.boltPatterns` now carries canonical keys — confirm the facet parse in `get-products.ts` maps the `bolt_patterns_canonical` distribution into `boltPatterns`.)
- [ ] **Step 4 — GREEN** vitest; `tsc` clean.
- [ ] **Step 5 — commit** `fix(WB-088): canonical bolt-pattern facet with dual-unit label (D4)`.

---

### Task 2: D5 — card honesty (diameter range / N sizes / $0 suppression)

**Files:** `discovery/data/types.ts` (`DiscoveryProduct` — add `diameters: number[]` or `diameterMin/Max`+`sizeCount`); `discovery/data/get-products.ts` (`hitToProduct` — carry the array, drop `?? 0`); `discovery/components/grid/product-card.tsx` (range/N-sizes + active-diameter awareness); both `product-card.tsx` (98-101) + `tire-discovery/.../tire-product-card.tsx` (58-61) suppress `$0`.

- [ ] **Step 1 — failing test** for a pure `diameterLabel(diameters, activeDiameters?)`:
```ts
import { diameterLabel } from "./diameter-label"
describe("diameterLabel (WB-088 D5)", () => {
  it("range for multi-size", () => { expect(diameterLabel([17,20,24])).toBe('17″–24″') })
  it("single size", () => { expect(diameterLabel([20])).toBe('20″') })
  it("matching diameter when a filter is active", () => { expect(diameterLabel([17,20,22],[20])).toBe('20″') })
  it("empty → N sizes fallback handled by caller (returns null)", () => { expect(diameterLabel([])).toBeNull() })
})
```
- [ ] **Step 2 — RED.**
- [ ] **Step 3 — implement** `discovery/data/diameter-label.ts` (min–max range, single value, matching-when-active, null when empty). Extend `DiscoveryProduct` with `diameters: number[]`; `hitToProduct` sets `diameters: h.diameters ?? []` (keep `diameter` for back-compat or replace usages). `product-card.tsx`: render `diameterLabel(product.diameters, activeDiameters)` — the card needs the active diameter filter (read from the product mapping or a prop; simplest: pass the active diameters via the grid from the query, OR show the range). If empty diameters, show `"N sizes"` style like the tire card (or omit). Suppress price in BOTH cards: `product.priceCents > 0 ? formatCentsUsd(...) : null` (render nothing / "Price on request").
- [ ] **Step 4 — GREEN** vitest; `tsc`.
- [ ] **Step 5 — commit** `fix(WB-088): honest card diameter range/N-sizes + $0 price suppression (D5)`.

---

### Task 3: D6 — outage-honest empty state (both surfaces)

**Files:** `discovery/data/types.ts` + `tire-discovery/data/types.ts` (result union); `discovery/data/get-products.ts` (372-386 catch) + `tire-discovery/data/get-tire-products.ts` (226-229 catch); `discovery/templates/index.tsx` + tire twin (55-56); `discovery/components/empty-state/index.tsx` + tire twin.

- [ ] **Step 1** Make the outer catch (the try/catch OUTSIDE `unstable_cache`) return a discriminated `{ ok: false }` result (add `ok?: true` to the success `DiscoveryResult`/`TireDiscoveryResult`, or a wrapper). The cached inner fn still THROWS (self-heals). Templates branch: if `result.ok === false` render a new "Catalog temporarily unavailable — retry" block (a small `<DiscoveryOutage/>` / tire twin), else the existing 0-match empty-state.
- [ ] **Step 2** Test: a pure helper or a template-level test that `{ok:false}` renders the outage copy, `{products:[]}` renders the no-matches copy. (If templates are hard to unit-test, test the discriminant helper.)
- [ ] **Step 3 — verify** vitest + `tsc`; confirm the throw still escapes `unstable_cache` (grep the adapter structure — the cached fn must rethrow).
- [ ] **Step 4 — commit** `fix(WB-088): outage-honest empty state, both surfaces (D6)`.

---

### Task 4: D7 — tire isCapped/estimatedTotalHits parity

**Files:** `tire-discovery/data/types.ts` (`TireDiscoveryResult` +`isCapped`+`estimatedTotalHits`); `tire-discovery/data/get-tire-products.ts` (fit branch 174-181); `tire-discovery/components/header/index.tsx`; `tire-discovery/components/filter-rail/mobile-trigger.tsx`. Port the wheel WB-074 machinery (`discovery/` is the reference).

- [ ] **Step 1** Mirror the wheel `DiscoveryResult.isCapped`/`estimatedTotalHits` onto tires: set `isCapped = estimatedTotalHits > FIT_CANDIDATE_CAP` in the fit branch; header shows "top 200 candidates — refine" when capped (copy the wheel `header` capped branch); mobile-trigger shows the honest capped label (port the wheel `mobile-trigger-copy.ts` helpers for tires).
- [ ] **Step 2** Test: the capped signal + label helper (pure) mirror the wheel tests.
- [ ] **Step 3 — verify** vitest + `tsc`.
- [ ] **Step 4 — commit** `fix(WB-088): tire fit-mode isCapped honesty parity (D7)`.

---

### Task 5: D8 — price inputs commit-on-blur (both surfaces)

**Files:** `discovery/components/filter-rail/filter-sections.tsx` (price block ~210-245) + tire twin (~252-287); the hooks' `setScalarFilter` uses `push` — add a `replace`-based commit for price only (do NOT change the shared `push`).

- [ ] **Step 1** Price Min/Max inputs: hold local state; commit on blur OR Enter (or a ≥500ms debounce) via a `router.replace` (not per-keystroke `push`). Clamp negatives to 0; if min>max, swap. Add a small pure `commitPriceRange(minStr, maxStr)` → `{min?:number,max?:number}` (parse, clamp, swap) + unit-test it. Wire both surfaces.
- [ ] **Step 2 — RED/GREEN** on `commitPriceRange` (negatives clamped, min>max swapped, empties → undefined).
- [ ] **Step 3 — verify** vitest + `tsc`.
- [ ] **Step 4 — commit** `fix(WB-088): price inputs commit-on-blur + clamp/swap, both surfaces (D8)`.

---

### Task 6: D9 — facet scale + tire Size search-as-you-type

**Files:** `backend/medusa-config.js` (`indexSettings` — add `faceting`); `tire-discovery/components/filter-rail/filter-sections.tsx` (Size section 191-201).

- [ ] **Step 1** `medusa-config.js` `indexSettings` gains `faceting: { maxValuesPerFacet: 500 }` (backend restart only — no re-sync; index config).
- [ ] **Step 2** Tire "Size" `AccordionItem`: add a filter-as-you-type text input above the `ChecklistSection` that filters the rendered `facets.sizes` by substring (client-side over the loaded values). Small pure `filterFacetKeys(keys, query)` + test.
- [ ] **Step 3 — verify** `npx medusa build` exit 0 (config); vitest + `tsc`.
- [ ] **Step 4 — commit** `fix(WB-088): maxValuesPerFacet 500 + tire size filter-as-you-type (D9)`.

---

### Task 7: D10–D13 + X10 polish (both surfaces)

**Files:** `filter-sections.tsx` (both — facet sort 45-47, wheel diameter inch mark, dup ids 54); `discovery/data/escape.ts` (shared `lit`); the hooks' `setPage` (scroll) both; `search/components/search-drawer/header.tsx:35` (preserve fit=0); `get-products.ts:348` + tire twin (exhaustive count); `templates/index.tsx` both (page clamp).

- [ ] **Step 1 — D12 (escape, shared, golden)** `escape.ts` `lit`: escape backslashes before quotes: `String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')`. Test: `lit('a\\b"c')` → `"a\\\\b\\"c"` (a backslash-containing value round-trips). Single file — fixes both.
- [ ] **Step 2 — D10 numeric sort + inch mark** in both `filter-sections.tsx`: the `ChecklistSection` numeric facets (diameter, etc.) sort by `Number(a[0]) - Number(b[0])` when keys are numeric (add a `numeric?: boolean` prop or detect); port the tire `inchLabelMap` pattern to the wheel Diameter section (append `″`).
- [ ] **Step 3 — D11 page clamp** in both `templates/index.tsx`: once `totalCount`/`pageSize` known, if the requested page exceeds `Math.ceil(total/pageSize)`, clamp to the last valid page (redirect/replace or render the last page) instead of the empty state.
- [ ] **Step 4 — D13** both hooks' `setPage`: scroll to the grid top on page change (`window.scrollTo` or scroll the grid into view). `search-drawer/header.tsx:35`: when building the `/store?q=` URL, if the current URL has `fit=0`, carry it. `get-products.ts:348` + tire twin: prefer an exhaustive `totalHits`/`exhaustiveNbHits` over `estimatedTotalHits` for the header count + pagination math.
- [ ] **Step 5 — X10 dup ids** both `filter-sections.tsx`: the `id = \`filter-${key}\`` (line 54) gains an instance prefix (a `instanceId` prop: desktop rail passes `"rail"`, mobile drawer passes `"drawer"`) → `id = \`filter-${instanceId}-${key}\`` (and the matching `htmlFor`).
- [ ] **Step 6 — RED/GREEN** unit tests where pure (lit backslash golden; numeric sort; page-clamp math); the rest verified by `tsc` + build.
- [ ] **Step 7 — verify** vitest + `tsc` + `npx next build` exit 0.
- [ ] **Step 8 — commit** `fix(WB-088): facet sort/inch-mark, page clamp, lit() backslash, scroll, fit=0 survival, exhaustive counts, dup ids (D10-D13, X10)`.
