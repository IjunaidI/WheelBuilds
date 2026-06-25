# PDP data honesty & fitment polish — Design

> Date: 2026-06-26. Status: in-progress. Pillar: PDP.
> Three storefront fixes to the wheel product page. **All storefront** — no backend change,
> no migration, no catalog re-import. New backlog item **WB-056**.

## Context

User-reported problems on the individual wheel page (`/products/[handle]`):
1. The purchase panel claims **"CONFIRMED FIT · {your vehicle}"** for *any* wheel whenever a vehicle is
   in the garage — a false fitment claim.
2. Spec values are **static placeholders** — notably "Per-wheel weight: **0 lb**".
3. The finish swatch image is a **tiny 72px drawn wheel** floating in a large empty square.

Investigation findings (this is what makes the fixes cheap and storefront-only):
- The Fitment section ([fitment/index.tsx](../../../storefront/src/modules/product-detail/components/fitment/index.tsx))
  ALREADY computes a real verdict via the pure `fitsVehicle(product, vehicle)` — the purchase-panel chip
  ([purchase-panel.tsx:134-145](../../../storefront/src/modules/product-detail/components/hero/purchase-panel.tsx))
  just doesn't use it; it gates only on "is there an active vehicle."
- Weight is **already persisted** by the importer: `apply.ts:305-320` sets Medusa `product.weight` (grams)
  from the feed's `ShippingWeight` (`rep.shippingWeightLb × 453.592`). But the PDP product query
  ([products.ts:36](../../../storefront/src/lib/data/products.ts)) requests
  `"*variants.calculated_price,+variants.inventory_quantity,+collection_id"` — **`weight` is not requested**,
  so `product.weight` returns empty → `mapToDetail`'s `num(product.weight)/453.592` = 0 → "0 lb".
- The finish swatch ([gallery.tsx:67-85](../../../storefront/src/modules/product-detail/components/hero/gallery.tsx))
  uses `flex-1 aspect-square` buttons (so a single finish becomes a full-width square) holding a fixed
  `<Wheel size={72}>` — a tiny wheel in a big box. Wheel products are grouped one-per-finish, so there is
  usually exactly one finish.

Design principle (same as G2/G3): real values show; anything genuinely missing is **hidden**, never a fake
placeholder. Logic in small pure helpers; React stays thin.

---

## Fix A · Purchase-panel fitment chip tells the truth

**File:** `storefront/src/modules/product-detail/components/hero/purchase-panel.tsx`

The panel already has `const { active } = useGarage()`. Import the existing pure verdict and use it:

```ts
import { fitsVehicle } from "@lib/fitment/fits-vehicle"
// ...
const verdict = active ? fitsVehicle(product, active) : null
const fits = verdict?.fits ?? false
```

Chip states (replaces the current `active ? CONFIRMED : pick`):
- **fits** → `<Chip variant="accent" dot>CONFIRMED FIT · {YEAR MAKE MODEL}</Chip>` (orange — as today)
- **active but not fits** → `<Chip variant="outline">MAY NOT FIT · {YEAR MAKE MODEL}</Chip>` (neutral, no orange dot — honest)
- **no active vehicle** → `<Chip variant="outline" onClick={openSearch}>…Pick a vehicle to confirm fit</Chip>` (unchanged)

`fitsVehicle` is the SAME function the Fitment section uses, so the chip and the section can never disagree.
The "MAY NOT FIT" copy is intentionally soft (offset/clearance can still work) and matches the section's
"Doesn't fit … might still fit with the right offset" tone.

**Test:** `fitsVehicle` is already unit-tested (`lib/fitment/__tests__/fits-vehicle.test.ts`). The chip is a
presentational reuse — verified by `tsc` + a manual smoke (garage vehicle that fits → orange; one that
doesn't → neutral "MAY NOT FIT"; no vehicle → pick prompt).

---

## Fix B · Finish swatch is no longer a tiny wheel in a big box

**File:** `storefront/src/modules/product-detail/components/hero/gallery.tsx`

The swatch buttons go from `flex-1` (balloon to full width when there's one finish) to a **fixed, sensible
square**, and the inner wheel is enlarged to fill it:

- Swatch button: fixed `w-24 h-24` (96px) square (instead of `flex-1 aspect-square`), kept in the existing
  `flex gap-2` row so multiple finishes still lay out left-to-right.
- Inner render: `<Wheel size={80}>` (fills the 96px square with padding) instead of `size={72}` floating in
  a full-width box.

Result: a single finish renders as one tidy 96px swatch with an 80px wheel (proportionate), not a 72px wheel
lost in a ~500px box. The "Finish · N available" label is unchanged.

**Test:** presentational — verified by `tsc` + manual smoke (swatch is a tidy square, wheel fills it).

---

## Fix C · Real weight + no placeholder specs

### C1 · Fetch the weight that already exists
**File:** `storefront/src/lib/data/products.ts` (`getProductByHandle`, line ~36)

Add `+weight` to the fields so the persisted product weight is actually returned:

```ts
fields: "*variants.calculated_price,+variants.inventory_quantity,+collection_id,+weight",
```

`mapToDetail` already reads `product.weight` — once fetched, `weightLb` becomes the real value.

### C2 · Hide any zero/missing numeric spec (no fake "0 lb"/"0 mm"/"1")
**Files:** `storefront/src/modules/product-detail/components/specs/index.tsx` (+ a new pure helper),
`storefront/src/modules/product-detail/components/hero/variant-picker.tsx`

New pure helper `buildSpecRows(specs)` colocated with the specs component
(`storefront/src/modules/product-detail/components/specs/spec-rows.ts`):

```ts
import { ProductDetail } from "../../data/types"

export type SpecRow = { label: string; value: string }

/**
 * The visible spec rows for a wheel. Real values only — any numeric field that
 * is 0/missing is OMITTED rather than rendered as a fake "0 lb"/"0 mm". The
 * admin-metadata string fields (construction/origin/warranty) were already
 * null-guarded in WB-029; this extends the same honesty to the numerics. (WB-056)
 */
export function buildSpecRows(specs: ProductDetail["specs"]): SpecRow[] {
  const rows: SpecRow[] = []
  if (specs.construction) rows.push({ label: "Construction", value: specs.construction })
  if (specs.weightLb > 0) rows.push({ label: "Per-wheel weight", value: `${specs.weightLb} lb` })
  if (specs.loadRatingLb > 0)
    rows.push({ label: "Load rating", value: `${specs.loadRatingLb.toLocaleString()} lb` })
  if (specs.centerBoreMm > 0) rows.push({ label: "Center bore", value: `${specs.centerBoreMm} mm` })
  if (specs.hubBoreMm) rows.push({ label: "Hub bore", value: `${specs.hubBoreMm} mm` })
  if (specs.countryOfOrigin) rows.push({ label: "Country of origin", value: specs.countryOfOrigin })
  if (specs.warranty) rows.push({ label: "Warranty", value: specs.warranty })
  if (specs.finishOptions > 1)
    rows.push({ label: "Finish options", value: `${specs.finishOptions}` })
  return rows
}
```

(`weightLb` may be fractional from the grams→lb conversion; rounding for display is a follow-up — out of
scope. The `> 0` gate is what removes the placeholder.) `specs/index.tsx` replaces its inline `rows` array
with `buildSpecRows(product.specs)`; if `rows.length === 0` the grid still renders its frame harmlessly (a
wheel always has at least load rating or bore in practice).

**variant-picker.tsx** — the bottom "Weight / Status" 2-col readout shows `${selectedSize.weightLb} lb`
(→ "0 lb"). Gate it: render the Weight `<Stat>` only when `selectedSize.weightLb > 0`; when hidden, the
Status stat spans the row. Likewise drop the ` · {s.weightLb} lb` fragment from the size tooltip when 0.

**Test:** `buildSpecRows` is pure → unit-tested (weight 0 hidden; real weight shown; load/bore 0 hidden;
finishOptions 1 hidden, >1 shown; admin strings hidden when null). The variant-picker gate is presentational
(tsc + manual).

---

## Out of scope (explicitly)
- Full PDP visual redesign; new product photography.
- Real multi-finish switching (would require linking sibling per-finish products — a separate feature).
- Rounding/precision polish on the weight display value.
- The `AutoFitmentCard` "Auto-fitted to OEM spec" wording (it reflects the real OEM offset, not a vehicle
  claim — left as-is).

## File inventory
**New**
- `storefront/src/modules/product-detail/components/specs/spec-rows.ts` (+ test)

**Modified**
- `storefront/src/modules/product-detail/components/hero/purchase-panel.tsx` (Fix A — fitsVehicle chip)
- `storefront/src/modules/product-detail/components/hero/gallery.tsx` (Fix B — swatch size)
- `storefront/src/lib/data/products.ts` (Fix C1 — `+weight`)
- `storefront/src/modules/product-detail/components/specs/index.tsx` (Fix C2 — use buildSpecRows)
- `storefront/src/modules/product-detail/components/hero/variant-picker.tsx` (Fix C2 — gate weight stat/tooltip)

## Verification
- `cd storefront && pnpm test:unit` — new `spec-rows` tests green; existing 89 still pass.
- `cd storefront && npx tsc --noEmit` — no new errors (14 pre-existing on main).
- Manual PDP smoke (pre-deploy, live backend): chip shows MAY NOT FIT for a non-fitting garage vehicle;
  a wheel with feed weight shows real lb (not 0); a wheel without weight hides the row (no "0 lb"); the
  finish swatch is a tidy proportionate square.
