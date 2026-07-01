# Design — Fitment-aware PDP

> Status: done (merged to `main` 2026-07-01) · Date: 2026-07-01 · Area: storefront/product-detail + storefront/discovery
> Storefront-only. No backend, API, or migration changes.

## Problem

A shopper picks their vehicle (e.g. 2024 Toyota Corolla), sees the "fits my car" results,
and clicks a wheel. The PDP hero then blindly defaults to `boltPatternOptions[0]` → first size →
OEM offset → `finishOptions[0]`. Because the discovery fit filter (`?fit=`) narrows by **bolt
pattern only**, a wheel can reach that shopper on a shared bolt pattern (e.g. 5×114.3 is on
countless cars and wheels) while its default size/offset/color does **not** fit their vehicle. The
shopper can add-to-cart and buy a wheel that doesn't fit, even though they arrived through the
"fits my car" flow — a real product-correctness risk.

Related: `fitsVehicle` was just hardened (2026-07-01) so the purchase-panel chip only says
"CONFIRMED FIT" when the wheel is offered in an in-window size. This spec goes one step further —
it makes the **variant options themselves** fitment-aware when the shopper arrived via fitment.

## Goal

When a shopper arrives at a PDP **via the fitment flow**, filter the shown variant options
(bolt pattern, size, offset, and **color/finish**) to what actually fits their active vehicle and
default-select a fitting variant — with an explicit, warned "Show all" escape hatch. When they
arrive from the **full catalog**, behavior is unchanged.

## Decisions (from brainstorming)

- **Filter behavior:** filter to fitting options + default to a fitting variant, with a "Show all
  sizes & colors" escape hatch (not a hard hide, not default-only).
- **Trigger:** a **`?fit=1` link flag** carried from the fitment-filtered discovery results to the
  PDP (entry-path aware) — not merely "has an active vehicle".
- **"Show all" is warned:** expanding to the full option set requires confirming a dialog that the
  extra options may not fit.

## Architecture

### 1. Trigger propagation (discovery → PDP)

- Discovery is in fit mode when its URL carries `?fit=<patterns>` (not `"0"`). In that state, the
  discovery **product card** links to the PDP with `?fit=1` appended; in the full catalog it links
  without the flag.
- The PDP hero (already `"use client"`, already reads `useGarage().active`) reads
  `useSearchParams().get("fit") === "1"`.
- **Fitment mode is active only when** `fit=1` **AND** an active vehicle exists **AND**
  `buildFitView(...).hasFit` is true (vehicle has usable windows and ≥1 fitting variant). Otherwise
  the hero renders exactly as today — no regression for full-catalog or vehicle-less visitors.

### 2. `buildFitView(product, vehicle)` — pure, unit-tested

New file `storefront/src/modules/product-detail/data/fit-view.ts`. One pure function; no React, no
data fetching. Given the product's `finishOptions`/`boltPatternOptions`/`sizeOptions` and the active
vehicle's fitment (`canonicalBoltPatterns`, `hubBoreMm`, `diameterWindow`, `widthWindow`,
`offsetWindow`), it computes the fitting subsets + a fitting default.

**"Fits" (per variant), reusing the `fitsVehicle` gate semantics:**
- bolt pattern ∈ `vehicle.canonicalBoltPatterns`, AND
- center bore ≥ `hubBoreMm` (per-variant `centerBoreMm` when available, else product spec; a null
  bore on either side passes — same convention as `fitsVehicle`), AND
- diameter ∈ `diameterWindow` AND width ∈ `widthWindow` AND offset ∈ `offsetWindow` (a null window
  passes for that dimension; `inWin` semantics identical to `fits-vehicle.ts`).

**Returns** `FitView`:
```ts
type FitView = {
  hasFit: boolean            // ≥1 fitting variant AND the vehicle has ≥1 window
  boltPatterns: string[]     // only fitting patterns (subset of product.boltPatternOptions)
  finishOptions: FinishOption[]  // only finishes with ≥1 fitting variant; each finish's
                                 // sizeOptions trimmed to fitting sizes
  defaults: {
    boltPattern: string
    finishRaw: string
    size: SizeOption
    offsetMm: number         // a fitting offset for the default size (falls back to size OEM)
  }
}
```
`hasFit: false` when the vehicle has no windows, or no variant fits. Callers then show everything.

### 3. Hero integration + the "Show all" toggle

`hero/index.tsx`:
- Compute `fitView = useMemo(() => (fitParam && active ? buildFitView(product, active) : null), …)`.
- `fitActive = !!fitView?.hasFit`.
- Add `const [showAll, setShowAll] = useState(false)` and
  `const [fitWarningAcknowledged, setFitWarningAcknowledged] = useState(false)`.
- `useFilter = fitActive && !showAll`.
- The pickers consume filtered options when `useFilter`, else the product's full options:
  - `finishOptions = useFilter ? fitView.finishOptions : product.finishOptions`
  - `boltPatternOptions = useFilter ? fitView.boltPatterns : product.boltPatternOptions`
  - initial selection state seeds from `fitView.defaults` when `fitActive` on first render, else the
    current product defaults.
- **Re-snap on option-set change:** the existing size re-snap (keyed on `visibleSizes`) is extended
  with equivalents for **finish** and **bolt pattern** — when `useFilter` flips (or the filtered
  lists change) and the current `activeFinishRaw` / `selectedBoltPattern` is no longer in the
  visible set, snap to the first available (fitting default when filtering).
- **Fit banner** above the picker (only in fit mode): shows
  `Showing sizes & colors that fit your {year} {make} {model}` with a **"Show all"** action when
  filtered, or `Showing all sizes & colors — some may not fit your {vehicle}` with a **"Only show
  what fits"** action when expanded.

**"Show all" confirmation dialog** (shadcn `Dialog`, already wired in `components/ui`):
- Pressing "Show all" while filtered, if `!fitWarningAcknowledged`, opens the dialog:
  > **These sizes may not fit your {year} {make} {model}.**
  > Showing all sizes and colors includes fitments outside your vehicle's spec. You can still order,
  > but double-check fit before you buy.
  > **[ Cancel ]  [ Show all anyway ]**
- **Cancel** → stays filtered. **Show all anyway** → `setShowAll(true)` + `setFitWarningAcknowledged(true)`.
- Collapsing back to "only what fits" is free. Once acknowledged on that PDP, further toggles don't
  re-prompt (single-visit flag).
- The purchase-panel fit chip stays live, so any non-fitting pick after expanding still reads
  "MAY NOT FIT · {vehicle}".

### 4. Colors / finishes

Because finish is the 7th variant axis (WB-059) and some finishes exist only in certain
sizes/patterns, `buildFitView` drops any finish with no fitting variant and trims each kept finish's
`sizeOptions` to fitting sizes. The gallery finish switcher (`gallery.tsx`) therefore only offers
colors available in a fitting size and defaults to a fitting one. `gallery.tsx` needs no logic
change — it already renders whatever `finishOptions` the hero passes; the hero passes the filtered
list when `useFilter`.

## Files

- **Create:** `storefront/src/modules/product-detail/data/fit-view.ts` (`buildFitView`, `FitView`).
- **Create:** `storefront/src/modules/product-detail/data/__tests__/fit-view.test.ts`.
- **Modify:** `storefront/src/modules/product-detail/components/hero/index.tsx` — fit mode, `showAll`,
  re-snap for finish + bolt pattern, fit banner, warning dialog.
- **Modify (small):** the fit banner may be extracted to
  `hero/fit-banner.tsx` if `index.tsx` grows unwieldy.
- **Modify:** `storefront/src/modules/discovery/components/grid/*` (the product card) — append
  `?fit=1` to the PDP href when discovery is in fit mode.

## Testing

- `fit-view.test.ts` (pure, vitest):
  - fitting bolt patterns / sizes / offsets computed correctly from windows.
  - a finish with no fitting variant is dropped; a kept finish's sizes are trimmed.
  - `defaults` point at a genuinely fitting variant.
  - empty-fit (bolt-matched but no in-window size) → `hasFit: false`.
  - vehicle without windows → `hasFit: false`.
- Hero wiring: `npx tsc --noEmit` (0 new) + `npx vitest run` green; the filtering/toggle/dialog
  verified by reasoning + the existing render (no React test runner in this repo).

## Non-goals

- No change to the discovery fit filter (still bolt-pattern-level) — this spec makes the **PDP**
  honest about the *variant*, not discovery.
- No hard purchase block; "Show all" (warned) is always available.
- No backend / API / migration / re-index.
- Not tied to "has an active vehicle" alone — full-catalog visitors with a vehicle set still see
  everything (the `?fit=1` flag is the gate).
