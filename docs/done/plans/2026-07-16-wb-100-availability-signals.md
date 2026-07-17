# WB-100 Availability signals in discovery — Implementation Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. **Backend + storefront. Needs a Meili re-index to go live.** Spec: [../specs/2026-07-16-wb-100-availability-signals-design.md](../specs/2026-07-16-wb-100-availability-signals-design.md).

**Global constraints:** Backend tests `cd backend && npx jest src/modules/vendor-sync` (`test:sync`) + `npx medusa build` (exit 0). Storefront `npx vitest run <path>` (no globals), tsc **2-error baseline**, `npx next build`, `npx next lint`. Branch `feat/g12-wave-a-discovery-merch` (WB-098 + WB-099 land first). A backend is on :9000. **Product-level `in_stock` = OR over non-discontinued variants of (available > 0)** — a product is out only when EVERY variant is out. Reuse WB-089's `emitMeiliReconcile` / the reconcile machinery — don't build a new full-reconcile. Keep the dollars-in-Medusa / cents-in-index and the `discontinued`-filter conventions intact. **Runs LAST in the wave — after this, the wave needs a backend deploy + re-index, unlike 098/099.**

---

### Task 1: THE SPIKE — how does the transformer learn stock? + compute in_stock
**Files:** `backend/src/modules/vendor-sync/search/build-search-document.ts` (both `buildWheelDocument` + `buildTireDocument`); possibly `backend/src/modules/vendor-sync/search/meili-index-settings.ts` (`MEILI_PRODUCT_FIELDS`); `backend/medusa-config.js` (the plugin `fields`); tests in `backend/src/modules/vendor-sync/search/__tests__/`.
- [ ] **VERIFY FIRST (empirical, against the running backend — this decides the mechanism):** can the Meili plugin's `query.graph` fields reach per-variant inventory? Try widening `MEILI_PRODUCT_FIELDS` to a remote-query inventory path (e.g. `variants.inventory_items.inventory.location_levels.stocked_quantity` + `.reserved_quantity`, or whatever resolves in Medusa 2.13.6 — `apply.ts` proves `variants.inventory_items.*` is reachable from a variant graph query) and confirm the transformer receives real numbers. **If it resolves → field-widening (PRIMARY: single source of truth, transformer computes in_stock fresh).** **If it does NOT resolve → fallback: mirror a boolean onto `variant.metadata.in_stock` at stock-apply (Task 2 wires the write); the transformer reads `variant.metadata.in_stock`.** Report in the task report which mechanism you confirmed and the exact field path.
- [ ] Failing test: pure `computeInStock(variants)` (extract the OR logic) → true if any non-discontinued variant has available>0 (field-widening) or `metadata.in_stock===true` (fallback); false if all out; consistent with the existing `discontinued` drop (all-discontinued → product already dropped). Cover: mixed, all-out, single-in-stock, empty.
- [ ] RED → implement: both doc builders emit `in_stock: boolean`. The `null`-transformer stub (`medusa-config.js:299-314`) gets `in_stock: false` so a filtered/displayed attr never references a missing field.
- [ ] GREEN `test:sync`; `medusa build`. Commit `feat(WB-100): compute in_stock in the wheel + tire Meili docs (<mechanism>)`.

---

### Task 2: index settings + ~3h freshness wiring
**Files:** `backend/medusa-config.js` (~282-296 `filterableAttributes` + `displayedAttributes` — add `in_stock`); `backend/src/modules/vendor-sync/service.ts` (~493-572 `runStockOnly`); if the fallback mechanism was chosen, `backend/src/modules/vendor-sync/pipeline/apply-stock.ts` (write `metadata.in_stock` on the changed parts). Tests: the wiring / write.
- [ ] Failing test: a unit over the freshness path chosen — either (targeted) that a variant-metadata write is emitted for parts whose in_stock flipped, or (full) that `runStockOnly` calls `emitMeiliReconcile` after `applyStockLevels`. Assert the call ORDER (reconcile AFTER the stock write) and that it's not called when zero parts changed.
- [ ] RED → implement: add `in_stock` to `filterableAttributes` + `displayedAttributes`. **Freshness — check the plugin behavior first:** does a variant/product update from the stock write already trigger a targeted per-product Meili re-index (the plugin's event subscription)? If YES → prefer that (targeted, no full reconcile); if NO → `runStockOnly` calls `emitMeiliReconcile(container)` after `applyStockLevels` (the approved full re-index). If the fallback metadata-mirror is in play, write `metadata.in_stock = available>0` on each changed variant in `applyStockLevels` (only the delta parts it already processes).
- [ ] GREEN `test:sync`; `medusa build`. Commit `feat(WB-100): in_stock filterable + re-index after the 3-hourly stock refresh`.

---

### Task 3: storefront types + data layer (wheel + tire)
**Files:** `storefront/src/modules/discovery/data/types.ts` (`DiscoveryProduct.inStock`, `DiscoveryFilters.inStockOnly`); `discovery/data/get-products.ts` (`Hit`, `hitToProduct`, `buildFilters`, `parseQueryFromSearchParams`); `discovery/data/use-discovery-query.ts` (read/write `inStockOnly`); the tire twins (`tire-discovery/data/types.ts`, `get-tire-products.ts`, `use-tire-query.ts`).
- [ ] Failing test: `buildFilters` pushes `in_stock = true` iff `inStockOnly` is truthy (nothing when undefined/false) — mirror the price-scalar tests; `hitToProduct` maps `hit.in_stock` → `product.inStock` (missing/undefined → treat as out `false`, the safe default before a re-index backfills). `parseQueryFromSearchParams` reads `?in_stock=1` → `inStockOnly:true`. Same for the tire twin.
- [ ] RED → implement: `inStock: boolean` on both product types (mirror `isNew`); `inStockOnly?: boolean` on both filter types (optional scalar, same family as `priceMinCents`); the hooks read/write via the existing `replaceScalars` path.
- [ ] GREEN vitest; `tsc`. Commit `fix(WB-100): thread inStock + inStockOnly through discovery + tire data layers`.

---

### Task 4: OUT-OF-STOCK badge + "In stock only" toggle (wheel + tire)
**Files:** `discovery/components/grid/product-card.tsx` + `tire-discovery/components/grid/tire-product-card.tsx` (badge); `discovery/components/filter-rail/filter-sections.tsx` + the tire twin (toggle); `discovery/components/active-chips/` + tire active-chips (the removable chip).
- [ ] Failing test: none practical (JSX) — grep + live is the gate; a thin unit if a badge-visibility helper emerges (`!product.inStock`).
- [ ] Implement: an absolutely-positioned OUT-OF-STOCK chip in each card's image wrapper, placed to not collide with the `NEW` chip / fit badge (e.g. opposite corner), gated on `!product.inStock`, using the WB-096 contrast tokens. An "In stock only" single `<Checkbox>`/switch in both rails (NOT a `ChecklistSection`) bound to `filters.inStockOnly` via `replaceScalars({ inStockOnly: true | undefined })` — default off; and a removable "In stock only" active chip.
- [ ] Grep: badge gated on `!inStock`; toggle uses `replaceScalars` not `toggleArrayFilter`. `next build`; `tsc`; `next lint`. Commit `feat(WB-100): OUT-OF-STOCK badge + "In stock only" toggle on both discovery rails`.

---

### Task 5: chunk review
- [ ] `scripts/review-package <base> HEAD` → an **opus** reviewer (backend transformer + index-settings + a re-index-triggering change that runs in prod cron; fails silently if wrong). Focus: (a) the spike's chosen mechanism is sound — if field-widening, the path genuinely resolves real stock (not always-0); if metadata-mirror, the write covers product-creation AND stock-flip, not just one; (b) `in_stock` OR semantics — a product with ONE in-stock size is in_stock (not out); the all-discontinued case still drops the product; (c) the freshness wiring can't spam a full reconcile on every no-op stock-tick, and the reconcile is AFTER the stock write; (d) the storefront treats a missing `in_stock` (pre-backfill) as the safe default + the toggle/badge behave before the re-index lands; (e) the toggle rides the disjunctive-facet machinery without corrupting counts; (f) tire twins got every change; `test:sync` + `medusa build` + vitest + `next build` all green, tsc at baseline. **Confirm the DEPLOY note (backend deploy + re-index) is captured for closeout.**
