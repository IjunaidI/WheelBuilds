# WB-090 · PDP purchase honesty — design

> G11 Wave 2. Findings **P1, P2, P7–P12, P15–P19, L6** ([audit §P](../../future/plans/2026-07-13-ux-completeness-audit.md)).
> Re-verified against current `main` (`05ed651`) 2026-07-14 — evidence inline. Storefront-only (one fetch-fields line).

## Problem
On one PDP screen the size grid, Status stat, price, and buy button can disagree; quantity limits are invisible until a cryptic "try again" failure; and a cluster of display/guard gaps (0×0 cells, "+-12MM" offsets, one weight for every size, $0-priced but purchasable, backend-outage-404s-every-PDP, no wheel description).

## Wheel ↔ tire asymmetry (from re-verification — NOT just "do it twice")
Tires map 1:1 size→variant (no offset sub-axis), so several fixes are wheel-only by construction.
| Fix | Wheel | Tire |
|---|---|---|
| P1 Status/buy agree (size-rollup vs variant) | **yes** | n/a (1:1, no rollup) |
| P2 qty cap + "Only N left" + insufficient-stock msg | yes | yes (identical `Math.min(99)` clamp) |
| P7 sign-aware offset / P17 chip dedupe | yes | n/a (no offset axis) |
| P8/L6 per-variant weight | yes | n/a (tire spec differs) |
| P9 region-outage → boundary not 404 | shared `getRegion` (one fix) | shared |
| P10 description guard | **yes** | already guarded |
| P11 variant-less guard | already (wheel hero) | **yes** |
| P12 headline price = selected variant, $0→disabled | yes | yes |
| P15 finish continuity / P16 OOS focusable / P19 0×0 | yes | (tire finish n/a; OOS applies) |

## Decisions (defaults)
- **P2 exact count:** add `quantity: number` to `OffsetVariant` + `TireSizeOption` (`inventory_quantity` is *already fetched and read* in `group-sizes.ts:79` — just discarded after the enum). No new fetch.
- **P8/L6:** add `+variants.weight` to `getProductByHandle`'s fields string (per-variant weight already exists in Medusa — `apply.ts:1091` writes it); label "Shipping weight".
- **P9:** narrow `getRegion`'s catch so a *fetch failure* rethrows (→ existing `(main)/error.tsx` boundary) and only "no region for this countryCode" returns null. Spot-check all 7 callers so none re-swallow.
- **P16 all-OOS:** render an explicit "Currently out of stock" banner; OOS cells become `aria-disabled` focusable (tooltip reachable) rather than `disabled`.

## Design (storefront; one fetch-fields line)
1. **P1 consistent stock story (wheel).** `group-sizes.ts`: make `defaultOffsetMm` a running best-availability pick (copy the `rank[avail]>rank[existing]` merge pattern already 2 lines above the static assignment). Thread the resolved `selectedVariant`/`currentOffset` into `VariantPicker` so the **Status stat reads the selected variant's own availability**, not the size roll-up.
2. **P2/P18 inventory-aware qty (both).** Add `quantity` to `OffsetVariant`/`TireSizeOption`; the panel caps the stepper at the available qty, clamps the default to `min(4, available)`, shows "Only N left" at ≤ threshold; `addToCart`'s catch branches Medusa's insufficient-inventory error (via `extractMedusaMessage`) into "Only N in stock — reduce quantity", keeping the generic copy for real transport errors. Fix the "low stock — last few sets" wording (≤4 units = ≤1 set).
3. **P12 price truth (both).** Headline `unitPriceCents` = the selected variant's OWN price (no sibling `priceCentsOverride` fallback for the headline); `<= 0` → "Price unavailable" + disabled buy (`canPurchase` also requires `unitPriceCents > 0`).
4. **Guards (P11, P19).** Tire hero early-returns the "no purchasable options" block when `sizeOptions` is empty (mirror the wheel hero's existing guard); wheel grouping drops `diameter<=0 || width<=0` size cells.
5. **Availability of info (P16).** OOS cells `aria-disabled` + focusable (tooltip works); all-OOS product → explicit banner + no phantom "selected" highlight.
6. **P15 finish continuity (wheel).** On finish switch, look up the same `D×W|pattern` key in the new finish before falling back to default (key-based, not object-identity — the current `.includes(selectedSize)` reference check can never match fresh per-finish arrays).
7. **P8/L6 + P7/P17 data corrections (wheel).** Fetch `+variants.weight`, per-size weight in the grid/tooltips labeled "shipping weight"; sign-aware offset formatting (`{v>=0?'+':''}{v}mm`) in the advanced panel (3 sites); dedupe offset chips + key by `variantId`; the fit-mode "DEFAULT" badge tracks the true wheel default (P1's best-availability pick), separate from the fit-mode auto-pick.
8. **P9 resilience (both).** `getRegion` distinguishes fetch-failure (throw → boundary) from no-region (404).
9. **P10 description (wheel).** Guard the empty `<p>` (mirror tire's `{product.description && …}`); `generateMetadata` falls back to a templated description ("<Brand> <Model> wheels in N sizes — live fitment check").

## Verify
Vitest per rule: default-offset best-availability; qty clamp + "Only N left"; `$0`→disabled; finish continuity (same D×W survives a finish switch); weight threading; sign-aware offset; 0×0 dropped; region fetch-fail throws vs no-region null. Live (test): pick an in-stock size on a mixed-availability wheel → Status/price/button agree; add 4 of a 2-left variant → actionable message.

## Deploy
Storefront rebuild only.

## Out of scope
Real photography; wishlist backend; the fitment *verdict* copy (WB-091); set-of-4 framing / SKU line / lead-time (WB-098).
