# WB-003 · Bolt pattern gates the PDP variant grid — Design

> Status: design · Branch: `fix/pdp-bolt-pattern-axis` · Date: 2026-06-18
> Backlog: [WB-003](../../future/BACKLOG.md) (HIGH)

## Problem

The PDP variant grid groups variants by `${diameter}x${width}` only, so a product offered in the
same size across two bolt patterns (e.g. 20×9 in both 5x114.3 and 6x139.7) collapses into **one**
grid cell whose offsets, price, stock, and `variantId`s are mixed across patterns.

The bolt-pattern row in the picker is **purely cosmetic** today: `selectedBoltPattern` drives only the
chip's active styling — it is never threaded into variant resolution.

- Grouping: [get-product.ts:49-114](../../../storefront/src/modules/product-detail/data/get-product.ts) keys `byKey` on `${diameter}x${width}`.
- Resolution: [hero/index.tsx:60](../../../storefront/src/modules/product-detail/components/hero/index.tsx) resolves the cart variant by **size + offset only** (`resolveSelectedVariant(selectedSize, selectedOffsetMm)`).
- Cosmetic row: [variant-picker.tsx:104-129](../../../storefront/src/modules/product-detail/components/hero/variant-picker.tsx) — `selectedBoltPattern` is unused downstream.

**Now that WB-001 wired Add-to-Cart**, this is no longer display-only: picking a bolt pattern does
nothing, and Add-to-Cart can send a wrong-fitment variant (the first offset that matched under the
collapsed size cell). That is a fitment-safety bug.

## Approach (chosen: A — bolt pattern gates the grid)

Bolt pattern is the primary fitment axis — the vehicle physically dictates it. Selecting a pattern
**filters** the size grid to that pattern's sizes; offset and the cart resolve by (pattern, size,
offset). The existing 3-row picker layout is unchanged; the bolt-pattern row simply becomes functional.

Rejected **B — per-pattern size cells** (each `size × pattern` combo its own cell): clutters the grid
and shows look-alike duplicate "20×9" cells with no clear disambiguation; demotes the bolt-pattern row
to a caption. A matches physical reality and keeps the layout clean.

## Changes

### 1. Data model — `SizeOption` becomes bolt-pattern-scoped

- Add `boltPattern: string` (raw, e.g. `"5x114.3"`) to `SizeOption`
  ([types.ts](../../../storefront/src/modules/product-detail/data/types.ts)).
- Extract the grouping from `get-product.ts` into a pure module
  `storefront/src/modules/product-detail/data/group-sizes.ts`:
  - `groupVariantsIntoSizes(variants: HttpTypes.StoreProductVariant[], productWeightLb: number): SizeOption[]`
  - Group key changes from `${diameter}x${width}` to `${diameter}x${width}|${boltPatternRaw}` where
    `boltPatternRaw = String(v.metadata?.bolt_pattern_raw ?? "")`.
  - Each resulting `SizeOption` carries its `boltPattern` and only that pattern's offsets, with the
    same best-availability + min-non-zero-price logic as today, **computed within a pattern**.
  - `get-product.ts` imports `groupVariantsIntoSizes` (replacing the inline `toSizeOptions`). This
    shrinks the loader and makes the grouping unit-testable without the Store API.
- `OffsetVariant` is unchanged — each offset under a pattern-scoped size is already the right variant
  (`variantId` already present from WB-001).

### 2. Selection/state — the hero filters the grid by the selected pattern

Two more pure helpers in `group-sizes.ts`:

- `sizesForBoltPattern(sizes: SizeOption[], pattern: string): SizeOption[]` — returns the sizes whose
  `boltPattern === pattern`; **if none match (product has no bolt pattern, or an unknown pattern),
  returns all `sizes`** as a safe fallback. This guarantees zero regression for single-pattern and
  pattern-less products.
- `pickDefaultSize(sizes: SizeOption[]): SizeOption` — first in-stock, else first. (Extracts the
  current inline `defaultSize` logic.)

[hero/index.tsx](../../../storefront/src/modules/product-detail/components/hero/index.tsx):
- `const visibleSizes = sizesForBoltPattern(product.sizeOptions, selectedBoltPattern)` (memoized).
- Pass `visibleSizes` to `VariantPicker` as `sizes`.
- `defaultSize = pickDefaultSize(visibleSizes)`.
- When `selectedBoltPattern` changes and `selectedSize` is not in `visibleSizes`, re-snap
  `selectedSize` to `pickDefaultSize(visibleSizes)` (effect). The offset already re-snaps to the new
  size's OEM pick on size change.
- `resolveSelectedVariant(size, offset)` keeps its signature — the size is already pattern-scoped — so
  the cart receives the correct (pattern, size, offset) variant. The bolt-pattern row becomes
  load-bearing.

### 3. Components — no structural change

[variant-picker.tsx](../../../storefront/src/modules/product-detail/components/hero/variant-picker.tsx)
already takes `sizes` plus the bolt-pattern row props; it receives the filtered list now, and its
"N configs" count reflects the active pattern. PurchasePanel / AutoFitmentCard / AdvancedFitmentPanel
consume `selectedSize` / `currentOffset`, which are now pattern-correct.

## Single / no-pattern products — no regression

When a product has one bolt pattern (the common case) or none, `sizesForBoltPattern` returns all sizes
and the grid behaves exactly as today.

## Testing (Vitest, pure units only — no RTL/jsdom in the repo)

- `group-sizes.test.ts`:
  - **Regression case:** the same 20×9 in two patterns produces **two** pattern-scoped `SizeOption`s,
    each with the correct offsets / `variantId`s / price / availability — never one merged cell.
  - Single-pattern input yields one `SizeOption` per distinct size (unchanged behavior).
  - Best-availability (in_stock > low_stock > out_of_stock) and min-non-zero `priceCentsOverride` are
    computed within a pattern, not across patterns.
  - `sizesForBoltPattern`: returns only the matching pattern's sizes; returns **all** sizes when the
    pattern is absent/unknown (fallback).
  - `pickDefaultSize`: returns the first in-stock size; falls back to the first when all are out.
- [resolve-variant.test.ts](../../../storefront/src/modules/product-detail/data/resolve-variant.test.ts)
  stays green (signature unchanged).

Run: `npx vitest run src/modules/product-detail`.

## Verification (acceptance)

A catalog product with two distinct bolt patterns at the same Diameter × Width shows, per selected
bolt pattern, a size grid scoped to that pattern; switching the pattern reflows the grid; and
Add-to-Cart persists the variant for the selected (pattern, size, offset). Locate a multi-pattern
product handle via the Meilisearch `bolt_patterns` facet or the Store API.

## Out of scope

- Auto-selecting the bolt pattern from the active garage vehicle's fitment (WB-009 / fitment).
- Any backend or Meilisearch index change — variants already carry `bolt_pattern_raw`.
- Per-pattern size cells (Approach B).
