# Tire fitment (car → OEM tire sizes → fitting tires) — Design

> Date: 2026-07-03. Status: in-progress. Pillar: Fitment + Discovery + PDP. Backlog: **WB-063**.
> The tire store is live (WB-005: grouping, `/tires` discovery, tire PDP). Wheels have full fitment — pick a car
> → filter/badge wheels that fit — but tires have none. This adds the tire equivalent, **joining on the vehicle's
> factory (OEM) tire size** instead of bolt pattern, reusing the existing garage + wheel-size fitment cache.

## Context

Wheel fitment already works end-to-end: the YMM drawer writes a garage vehicle + calls wheel-size.com `by_model`;
the cached fitment (bolt patterns + rim windows) drives a `?fit=` discovery filter, per-card FITS badges, and a
PDP fit chip. The load-bearing files:

- Cache: `wheel_size_fitment` stores the **full raw `by_model` body** in a `raw` JSON column
  ([`models/wheel-size-fitment.ts:6`](../../../backend/src/modules/wheel-size/models/wheel-size-fitment.ts#L6),
  written at [`service.ts:100`](../../../backend/src/modules/wheel-size/service.ts#L100)). Reverse-fitment (WB-009)
  already re-reads that `raw` ([`reverse-fitment.ts`](../../../backend/src/modules/wheel-size/reverse-fitment.ts)),
  proving the raw is retained and consumable.
- **The raw body already contains the tire sizes** — every `config.wheels[].front/rear` has `tire` (`"225/55R18"`),
  `tire_full` (`"225/55R18 97H"`), `tire_width`, `tire_aspect_ratio`, `is_stock` (OEM vs aftermarket). Today
  [`normalize.ts`](../../../backend/src/modules/wheel-size/normalize.ts) extracts only the rim/bolt-pattern fields
  and discards every `tire_*` field.
- `VehicleFitment` ([`wheel-size/types.ts:4-12`](../../../backend/src/modules/wheel-size/types.ts#L4-L12)) → returned
  by `GET /store/fitment/by-vehicle` ([`by-vehicle/route.ts`](../../../backend/src/api/store/fitment/by-vehicle/route.ts))
  → consumed by the storefront ([`lib/data/fitment.ts`](../../../storefront/src/lib/data/fitment.ts)) and written
  onto the garage `Vehicle` ([`garage/types.ts:9-22`](../../../storefront/src/lib/garage/types.ts#L9-L22)) in the YMM
  pane ([`ymm-pane.tsx`](../../../storefront/src/modules/search/components/search-drawer/find-by-vehicle/ymm-pane.tsx)).
- The wheel `?fit=` flow: encode/decode ([`discovery/data/vehicle-constraint.ts`](../../../storefront/src/modules/discovery/data/vehicle-constraint.ts)),
  the auto-writer ([`discovery/components/fitment-sync/index.tsx`](../../../storefront/src/modules/discovery/components/fitment-sync/index.tsx)),
  the parser+constraint ([`discovery/data/types.ts:147-164`](../../../storefront/src/modules/discovery/data/types.ts#L147-L164)),
  the verdict ([`lib/fitment/fits-vehicle.ts`](../../../storefront/src/lib/fitment/fits-vehicle.ts)), the card badge
  ([`discovery/components/grid/fit-badge.tsx`](../../../storefront/src/modules/discovery/components/grid/fit-badge.tsx)),
  and the PDP fitment section ([`product-detail/components/fitment/`](../../../storefront/src/modules/product-detail/components/fitment/)).

SP2 already indexes a canonical `tire_sizes` facet on tire products (`"305/45R22"` form) and the `/tires` surface
already reads it. wheel-size's `tire` value is the **same canonical format**, so the join is a direct string match.

## Decisions made in brainstorming

- **Fitment set = OEM only.** A tire fits when its canonical size matches a **factory** (`is_stock === true`) tire
  size for the vehicle. Aftermarket/alternative sizes and `/upsteps/` plus-sizing are out of scope.
- **Forward fitment only.** Build the "car → fitting tires" direction: a `/tires` fit filter, per-card FITS badges,
  and a tire-PDP fit chip. The reverse "N vehicles this tire fits" list (wheel WB-009 analog) is deferred.
- **Auto-apply, exactly like the wheel `/store`.** When a garage vehicle is active, `/tires` auto-writes the fit
  filter (`FitmentSync` mirror), shows a "FITS YOUR CAR" header chip, and offers the `fit=0` "Show all" escape.
- **Flatten front/rear.** A vehicle's OEM front + rear tire sizes are merged into one size set; a tire that matches
  either "fits." No staggered front/rear distinction.
- **No new API calls, no migration.** OEM tire sizes are extracted from the already-cached `raw` on read (mirroring
  reverse-fitment), so every cached vehicle works immediately — no wheel-size quota, no backfill.

**Design principle:** substitute *tire size* for *bolt pattern* throughout the proven wheel fitment pipeline. One
pure verdict (`tireFitsVehicle`) drives the badge, the discovery filter, and the PDP chip so they cannot disagree
(the same discipline as `fitsVehicle`). A shared `canonicalizeTireSize` normalizes both sides against a golden
fixture so the vehicle-size↔product-size match can't drift.

## Architecture

### Backend (2 additions; no migration)

1. **`extractOemTireSizes(raw)`** — pure helper (new, beside `reverse-fitment.ts`'s `extractVehicleIdentity`). Reads
   `raw.data[0].wheels[]`, takes `front`/`rear` `tire` values where `is_stock === true`, runs each through
   `canonicalizeTireSize`, dedupes → `string[]`. Empty when the vehicle has no OEM data.
2. **`VehicleFitment` gains `oemTireSizes: string[]`** ([`wheel-size/types.ts`](../../../backend/src/modules/wheel-size/types.ts));
   `toFitment` ([`service.ts:82-92`](../../../backend/src/modules/wheel-size/service.ts#L82-L92)) reads `c.raw` via
   `extractOemTireSizes` and populates it (the one place `toFitment` now touches `raw`). `GET /store/fitment/by-vehicle`
   returns it unchanged in the `{ fitment }` envelope; `not_found` → `[]`.

### Shared canonicalization (drift-guarded)

`canonicalizeTireSize(size)` → uppercase, strip the `Z` speed modifier (`255/35ZR19` → `255/35R19`), trim — matching
SP1's `canonicalTireSize` output. Backend uses it in `extractOemTireSizes`; the storefront verdict uses it on the
vehicle sizes. A shared `fixtures/tire-size-canonical-golden.json` asserted by a test in each app guards drift (the
`bolt-pattern-canonical-golden` / `finish-normalize-golden` precedent). Product `tire_sizes` are already canonical
from SP1, so only the vehicle side needs canonicalizing at read.

### Storefront — garage

- **`Vehicle` gains `oemTireSizes?: string[]`** ([`garage/types.ts`](../../../storefront/src/lib/garage/types.ts));
  the storefront `VehicleFitment` mirror gains it too. The YMM pane's `update(vehicle.id, {...})` call
  ([`ymm-pane.tsx`](../../../storefront/src/modules/search/components/search-drawer/find-by-vehicle/ymm-pane.tsx))
  writes `oemTireSizes` from the fitment response (swap-stable per the garage-provider contract).

### Storefront — `/tires` discovery (mirror the wheel `?fit=` flow)

- **Param:** reuse the `fit` param on `/tires`, value = the vehicle's OEM sizes CSV (e.g. `?fit=225/55R18,225/50R18`);
  `fit=0` = explicit off. (No `fitb/fitd/fitw/fito` — tires have no bore/offset windows.)
- **Writer:** a tire `FitmentSync` client island on the `/tires` template (mirrors the wheel one) — when
  `useGarage().active` has `oemTireSizes` and `fit !== "0"`, writes `?fit=<sizes>` + resets page; never auto-strips an
  existing `fit`.
- **Parser + constraint:** `parseTireQueryFromSearchParams` (SP2) reads `fit` → `vehicleTireSizes: string[]`;
  `buildTireFilters` adds a `tire_sizes IN [<sizes>]` clause (reusing the existing SP2 facet). The disjunctive
  facet counting stays correct (the fit clause is a base filter, like the wheel `vehicleConstraint`).
- **Card FITS badge:** `TireDiscoveryProduct` gains `sizes: string[]` (canonical), populated in `hitToTireProduct`
  from the `tire_sizes` hit field. A `TireFitBadge` client island (mirror `fit-badge.tsx`) shows "FITS" when the
  active vehicle's `oemTireSizes` intersect the product's `sizes`.
- **Header chip + escape:** the tire discovery header shows "FITS YOUR CAR" when a real fit is applied (else "Select
  a vehicle"); the active-chips / rail carry the `fit=0` "Show all" escape — mirroring the wheel header/chips.

### Storefront — tire PDP

- **Verdict:** pure `tireFitsVehicle(productSizes: string[], vehicleOemSizes: string[]): boolean` = non-empty
  canonical intersection. Single source for the card badge, the discovery gate, and the PDP chip.
- **Fit chip:** the tire PDP purchase panel shows "FITS YOUR [car]" / "MAY NOT FIT" from `tireFitsVehicle(product
  sizes, active.oemTireSizes)` (mirror the wheel purchase-panel chip, WB-056 honesty).
- **Fit-aware default (WB-060 analog):** arriving via `?fit=1`, the tire PDP defaults the rim/size selector to a
  fitting OEM size when the product offers one (else falls back to the normal default); a light "Show all sizes"
  affordance if the user wants the non-fitting sizes. The discovery card threads `?fit=1` only in fit mode
  (mirroring `DiscoveryProductCard`).

## Data flow

```
YMM drawer → getFitmentByVehicle → { fitment: { …, oemTireSizes } }
          → update(vehicle, { canonicalBoltPatterns…, oemTireSizes }) → garage
active vehicle → /tires FitmentSync → ?fit=<oemTireSizes>
             → parseTireQuery → tire_sizes IN […] Meili clause → fitting tires
             → TireFitBadge / header chip / tire PDP chip via tireFitsVehicle
```

## Testing (pure helpers + goldens)

- Backend: `extractOemTireSizes` (OEM-only, front+rear flatten, dedupe, empty/no-data) against a `by_model` fixture;
  `canonicalizeTireSize` golden.
- Storefront: `tireFitsVehicle` (intersection, empty sets, canonical normalization); the `fit` param encode/decode;
  `buildTireFilters` fit clause; `hitToTireProduct` `sizes` mapping; `canonicalizeTireSize` golden (twin).

## Out of scope

- Aftermarket / plus-size / `/upsteps/` sizes (OEM-only).
- Reverse "N vehicles this tire fits" list (forward-only).
- Staggered front/rear distinction (flattened).
- Any new wheel-size.com API calls or a cache migration (extract from cached `raw`).

## References

- Mirror source (wheels): the fitment files cited in Context.
- Prior tire work: [tire-store design](2026-07-02-tire-store-design.md) + the SP1/SP2/SP3 specs;
  SP2 `tire_sizes` facet; SP3 `TireProductDetail.sizeOptions`.
