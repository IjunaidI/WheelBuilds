# WB-090 PDP Honesty — Implementation Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Storefront-only (+1 fetch line). Spec: [../specs/2026-07-14-wb-090-pdp-honesty-design.md](../specs/2026-07-14-wb-090-pdp-honesty-design.md).

**Global constraints:** No `wb-` prefix. WB primitives inside `.frame`. Storefront tests `npx vitest run <path>` (import `{describe,it,expect} from "vitest"`; 5-error tsc baseline). Price = cents. Wheel PDP `modules/product-detail/components/hero/*` + `data/*`; tire PDP `components/tire/*` + `data/tire/*`. Many fixes are wheel-only (tires map 1:1 size→variant) — see the spec's asymmetry table. Branch `feat/g11-wave2-pdp-fitment`.

---

### Task 1: P1/P17 — consistent stock story + offset chip dedupe (wheel)
**Files:** `data/group-sizes.ts` (defaultOffsetMm best-availability), `components/hero/index.tsx` (thread selectedVariant), `components/hero/variant-picker.tsx` (Status reads selected variant), `components/hero/advanced-fitment-panel.tsx` (chip key by variantId). Test: `group-sizes.test.ts`.
- [ ] Failing test: a multi-offset size where the first-listed offset is OOS and a sibling is in_stock → `defaultOffsetMm` resolves to the in-stock offset (add a `bestAvailabilityOffset(offsetVariants)` pure helper or assert on the built SizeOption). Also: the Status stat helper reads the SELECTED variant's availability not the size rollup.
- [ ] RED → implement: in `group-sizes.ts`, replace the static `defaultOffsetMm: offsetMm` (first-seen) with a running best-availability pick over the size's `offsetVariants` (copy the `rank[avail] > rank[existing.availability]` merge pattern already above it). Thread the resolved `currentOffset`/`selectedVariant` into `VariantPicker`; the "Status" stat reads `selectedVariant.availability` (fall back to `selectedSize.availability` only if no variant). In `advanced-fitment-panel.tsx`, key the offset chips by `variantId` (dedupe by ET, keep the true-default badge on P1's best-availability default separate from the fit-mode auto-pick).
- [ ] GREEN → `npx vitest run src/modules/product-detail/data/group-sizes.test.ts`; `tsc`.
- [ ] Commit `fix(WB-090): consistent stock story (best-availability default + selected-variant Status) + offset chip dedupe (P1/P17)`.

---

### Task 2: P2/P18 — inventory-aware quantity (both surfaces)
**Files:** `data/types.ts` (`OffsetVariant.quantity`), `data/tire/tire-size-options.ts` (`TireSizeOption.quantity`), `data/group-sizes.ts` + tire builder (populate from the already-read `inventory_quantity`), `components/hero/purchase-panel.tsx` + `components/tire/hero/purchase-panel.tsx` (cap/clamp/message), `lib/data/cart.ts`/`lib/util/error-message.ts` (insufficient-stock message). Test: purchase-panel qty logic (pure helper).
- [ ] Failing test for a pure `qtyBounds(available)` / `clampQty(qty, available)` and an `insufficientStockMessage(err, available)` (parse Medusa's insufficient-inventory error via `extractMedusaMessage`, else generic).
- [ ] RED → implement: add `quantity: number` to `OffsetVariant` + `TireSizeOption`; populate from the `inventory_quantity` already read in `group-sizes.ts:79` (and the tire builder). Panel: stepper cap = `min(99, available)`, default = `min(DEFAULT_WHEEL_QTY, available)`, "Only N left" when `available <= LOW_STOCK_THRESHOLD` (fix the "last few sets" wording: ≤4 units = ≤1 set → say "Only N left" not "last few sets"). `addToCart` catch branches an insufficient-inventory error into "Only N in stock — reduce quantity", keeping the generic copy for transport errors.
- [ ] GREEN vitest; `tsc`.
- [ ] Commit `fix(WB-090): inventory-aware quantity cap + Only-N-left + insufficient-stock message, both surfaces (P2/P18)`.

---

### Task 3: P12/P10 — price truth + wheel description
**Files:** `components/hero/index.tsx` + `components/tire/hero/index.tsx` (headline price = selected variant own price), `components/hero/purchase-panel.tsx` + tire twin (`canPurchase` requires price>0; "Price unavailable"), `components/hero/purchase-panel.tsx` (guard empty `<p>`), `app/[countryCode]/(main)/products/[handle]/page.tsx` (templated meta fallback). Test: a pure `headlinePrice`/`canPurchase` helper.
- [ ] Failing test: headline price = the selected variant's OWN price (no sibling override); `unitPriceCents <= 0` → not purchasable + "Price unavailable".
- [ ] RED → implement: headline `unitPriceCents` reads the selected variant's own price (drop the `?? selectedSize.priceCentsOverride ?? product.priceCents` fallback for the *headline*); `<=0` → "Price unavailable" + `canPurchase` also requires `unitPriceCents > 0`. Guard the wheel `<p>{description}</p>` (mirror tire's `{product.description && …}`); `generateMetadata` falls back to a templated description when `product.description` empty.
- [ ] GREEN vitest; `tsc`.
- [ ] Commit `fix(WB-090): price truth ($0→unavailable+disabled, no sibling fallback) + wheel description guard (P12/P10)`.

---

### Task 4: P11/P19/P16/P15 — guards, a11y, finish continuity
**Files:** `components/tire/hero/index.tsx` (variant-less guard), `data/group-sizes.ts` (drop 0×0), `components/hero/variant-picker.tsx` (OOS focusable + all-OOS banner), `components/hero/index.tsx` + `data/finish-options.ts` (finish continuity). Test: group-sizes 0×0 drop; finish continuity key.
- [ ] Failing tests: `groupVariantsIntoSizes` drops `diameter<=0||width<=0`; a finish switch keeps the same `D×W|pattern` (key-based) when it exists under the new finish.
- [ ] RED → implement: tire hero early-returns the "no purchasable options" block when `sizeOptions` empty (mirror wheel hero's existing guard); wheel grouping filters `0×0`; OOS cells `aria-disabled` + focusable (tooltip reachable), all-OOS product renders an explicit "Currently out of stock" banner; finish switch matches by `sizeKey` (D×W|pattern) not object identity before defaulting.
- [ ] GREEN vitest; `tsc`.
- [ ] Commit `fix(WB-090): tire variant-less + 0x0 guards, focusable OOS cells + all-OOS banner, finish-switch continuity (P11/P19/P16/P15)`.

---

### Task 5: P7/P8/L6 — offset signs + per-variant weight (wheel)
**Files:** `components/hero/advanced-fitment-panel.tsx` (sign offsets, 3 sites), `lib/data/products.ts` (fields `+variants.weight`), `data/get-product.ts`/`data/group-sizes.ts` (per-variant weight → SizeOption). Test: sign format + per-size weight threading.
- [ ] Failing test: `formatOffset(-12)` → "-12mm"/"ET -12" (not "+-12"); a per-size weight differs across sizes (weight threaded per variant).
- [ ] RED → implement: sign-aware offset in the 3 advanced-panel sites (`{v>=0?'+':''}{v}mm`); add `+variants.weight` to `getProductByHandle` fields; thread per-variant `weight` (grams→lb) into each `SizeOption.weightLb` (instead of the single product-level weight); label "Shipping weight".
- [ ] GREEN vitest; `tsc`.
- [ ] Commit `fix(WB-090): sign-aware offsets + per-size shipping weight (P7/P8/L6)`.

---

### Task 6: P9 — region-outage resilience (both)
**Files:** `lib/data/regions.ts` (`getRegion` narrow catch). Verify the 7 callers. Test: region fetch-fail throws vs no-region null.
- [ ] Failing test: `getRegion` on a genuine fetch error rethrows (or a testable `resolveRegion` that distinguishes); a valid-fetch-no-matching-code returns null.
- [ ] RED → implement: narrow `getRegion`'s catch so a fetch/transport failure propagates (→ the existing `(main)/error.tsx` boundary) and only "no region for this countryCode" returns null. Spot-check all 7 callers (`get-product.ts`, `home/data/get-featured.ts`, `store/.../paginated-products.tsx`, `cart.ts`, `products.ts`, `related-products`, `account addresses`) so none re-swallow the newly-thrown error into a silent no-op — note any that intentionally catch.
- [ ] GREEN vitest; `tsc`; `npx next build` compiles (SSG data collection may need a backend — tsc+vitest are the code gate).
- [ ] Commit `fix(WB-090): getRegion distinguishes outage (throw→boundary) from no-region (404) (P9)`.
