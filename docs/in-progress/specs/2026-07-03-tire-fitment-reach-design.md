# Tire fitment reach — Design (reverse fitment + vehicle funnel)

> Date: 2026-07-03. Status: in-progress. Pillar: Fitment + PDP + Discovery entry.
> Backlog: **WB-065** (reverse tire fitment on the PDP) + **WB-066** (vehicle funnel into tires).
> Tires have forward fitment (WB-063: pick a car → filter/badge fitting tires), but two reach gaps
> remain: the tire PDP has no "which vehicles this fits" list (the wheel WB-009 analog), and the
> whole vehicle-picker funnel routes only to wheels. This closes both, each mirroring a proven
> wheel pattern.

## Context

Wheels already have both features; this substitutes *tire size* for *bolt pattern* through them.

**Reverse fitment (wheels, WB-009).** The tire PDP's missing half. The wheel PDP shows a
"FITMENT · N CONFIRMED MODELS" list, populated by a pure reverse over the cached
`wheel_size_fitment` rows:
- [`reverse-fitment.ts`](../../../backend/src/modules/wheel-size/reverse-fitment.ts) —
  `extractVehicleIdentity(raw)` (make/model/trim/year label from `raw.data[0]`), `matchedPattern`,
  `buildReverseFitment(rows, productPatterns, wheelBoreMm, limit)` → deduped/sorted/capped
  `ReverseFitmentVehicle[]`.
- [`service.reverseFitment`](../../../backend/src/modules/wheel-size/service.ts#L119) lists
  `status: "ok"` rows and delegates — a pure cache read, **no wheel-size API calls, no quota**.
- [`GET /store/fitment/by-product`](../../../backend/src/api/store/fitment/by-product/route.ts)
  returns `{ vehicles }`, degrading to `{ vehicles: [] }` (never 503).
- Storefront: [`getFitmentByProduct`](../../../storefront/src/lib/data/fitment.ts#L17) calls it with
  `next: { revalidate: 300 }`; the wheel PDP loader populates `ProductDetail.fitment`; the
  [`fitment/`](../../../storefront/src/modules/product-detail/components/fitment/) section renders it.

The tire side already has the join key: [`extractOemTireSizes(raw)`](../../../backend/src/modules/wheel-size/oem-tire-sizes.ts)
(WB-063) reads a vehicle's factory tire sizes from the same cached `raw` (canonical, `is_stock` only),
and product `tire_sizes` are canonical from SP1. So the reverse match is a canonical-size intersection
over the same cached rows — the identity extraction (`extractVehicleIdentity`) is reused verbatim.

**The funnel (wheels only).** Every "find by vehicle" entry routes to `/store`:
[`ymm-pane.tsx:233`](../../../storefront/src/modules/search/components/search-drawer/find-by-vehicle/ymm-pane.tsx#L233)
(`router.push(/${countryCode}/store${fitParam})`) and the garage pane's `selectVehicle`. The YMM
fitment lookup already returns `oemTireSizes` and writes them onto the garage vehicle
([`ymm-pane.tsx:213`](../../../storefront/src/modules/search/components/search-drawer/find-by-vehicle/ymm-pane.tsx#L213)),
and `/tires` auto-applies the active vehicle's OEM sizes via `TireFitmentSync`. So routing a vehicle
pick into tires is a destination choice, not new fitment logic.

## Decisions (from brainstorming)

- **Reverse tire fitment mirrors WB-009**, keyed on OEM tire size (`is_stock`) intersection instead of
  bolt pattern. Pure cache read; no new API/quota/migration. Reuse `extractVehicleIdentity`.
- **Funnel: a "Shop for: Wheels | Tires" toggle** in the drawer (default Wheels), on both the YMM pane
  and the garage pane. Tires destination carries the vehicle's OEM sizes as `?fit=` so `/tires` renders
  pre-fitted on first paint (symmetric with the wheels `?fit=`). Toggle state is local to the drawer, no
  persistence.
- **Out of scope:** aftermarket/plus-size vehicles (OEM-only, matching WB-063); a tire "submit your build"
  CTA; changing the wheel funnel default; reworking hero tiles / popular-search chips to offer tires
  (separate, larger merchandising item).

## Architecture — WB-065: reverse tire fitment

### Backend (mirror WB-009; no migration, no API calls)

1. **Type** `ReverseTireFitmentVehicle` ([`wheel-size/types.ts`](../../../backend/src/modules/wheel-size/types.ts)):
   `{ year: string; make: string; model: string; trim?: string; size: string }` (the wheel twin carries
   `boltPattern`; here `size` is the matched canonical OEM tire size).
2. **Pure helper** `reverse-tire-fitment.ts` beside `reverse-fitment.ts`:
   `buildReverseTireFitment(rows, productSizes: string[], limit: number): ReverseTireFitmentVehicle[]`.
   For each row (skip `status !== "ok"`): `sizes = extractOemTireSizes(row.raw)`; find the first
   `productSizes` entry present in `sizes` (canonical intersection); if none, skip; else read identity via
   the **imported** `extractVehicleIdentity(row.raw)` (skip identity-less rows); dedupe on
   `make|model|trim|year`, sort by make/model/year, cap at `limit`. Empty `productSizes` → `[]`.
3. **Service** `reverseTireFitment({ tireSizes, limit }): Promise<ReverseTireFitmentVehicle[]>` — lists
   `status: "ok"` rows, delegates to the pure helper. Mirrors `reverseFitment`.
4. **Route** `GET /store/fitment/by-tire-product?sizes=<CSV>&limit=` → `{ vehicles }`; empty/absent
   `sizes` or missing service → `{ vehicles: [] }`; never 503. Mirrors `by-product/route.ts`.

### Storefront

5. **Data type** `TireFitmentEntry = { year, make, model, trim?, size }` (storefront twin) +
   `TireProductDetail.fitment: TireFitmentEntry[]` (default `[]`)
   ([`product-detail/data/types.ts`](../../../storefront/src/modules/product-detail/data/types.ts#L143)).
6. **Data layer** `getFitmentByTireProduct(sizes: string[]): Promise<TireFitmentEntry[]>` in
   [`lib/data/fitment.ts`](../../../storefront/src/lib/data/fitment.ts) — mirrors `getFitmentByProduct`
   (`/store/fitment/by-tire-product`, `revalidate: 300`, `[]` on any error / empty input).
7. **Loader** the tire PDP mapper (`product-detail/data/tire/`) calls `getFitmentByTireProduct(canonical
   sizes from `sizeOptions`)` and sets `fitment`, mirroring how the wheel loader awaits
   `getFitmentByProduct`. `notFound()` behavior unchanged.
8. **Section** `components/tire/fitment.tsx` — mirrors
   [`components/fitment/`](../../../storefront/src/modules/product-detail/components/fitment/): a
   "FITMENT · N CONFIRMED MODELS" header, an active-vehicle status band (uses the WB-063
   `tireFitsVehicle` verdict against the active vehicle's `oemTireSizes`), and a 2-column confirmed-vehicle
   list (`Year Make Model [Trim]` + matched size). Empty `fitment` → the section degrades (shows the
   active-vehicle band only, or renders nothing when there is neither a list nor an active vehicle), exactly
   like the wheel section. Rendered in
   [`templates/tire-detail.tsx`](../../../storefront/src/modules/product-detail/templates/tire-detail.tsx)
   between `TireSpecs` and `TireRelated`.

## Architecture — WB-066: vehicle funnel into tires

### Storefront (search drawer only)

9. **Destination toggle.** A small "Shop for: Wheels | Tires" segmented control (client state, default
   `"wheels"`), added to the YMM pane and the garage pane. Built from existing primitives (`Chip`/`Label`
   or a minimal inline segmented control); no new shadcn primitive.
10. **Pure URL builder** `fitmentDestinationUrl({ countryCode, target, boltPatterns, oemTireSizes })` (small
    testable helper, co-located with the panes or in the search module's data):
    - `target === "wheels"` → `/${countryCode}/store` + (`?fit=<boltPatterns.join(",")>` when non-empty).
    - `target === "tires"` → `/${countryCode}/tires` + (`?fit=<oemTireSizes.join(",")>` when non-empty).
    Both fall back to the bare path when their fit array is empty.
11. **Wire-in.** The YMM `submit` handler and the garage pane's `selectVehicle` route via the builder using
    the toggle's `target`. The wheels branch reproduces today's behavior exactly (bolt-pattern `?fit`, the
    existing "no fitment data" toast unchanged). The tires branch uses the vehicle's `oemTireSizes` (from
    the just-run fitment lookup in YMM, or the stored `vehicle.oemTireSizes` in the garage pane); a vehicle
    with no OEM sizes routes to bare `/tires` (full catalog — `TireFitmentSync` also no-ops).

## Data flow

```
Reverse (WB-065):
  tire PDP loader → getFitmentByTireProduct(sizeOptions.canonicalSize[])
    → GET /store/fitment/by-tire-product?sizes=CSV → service.reverseTireFitment
    → buildReverseTireFitment(ok rows, sizes) [extractOemTireSizes ∩ productSizes, identity from raw]
    → TireProductDetail.fitment → <TireFitment/> "N CONFIRMED MODELS" + active-vehicle band

Funnel (WB-066):
  YMM/garage pick → toggle target ∈ {wheels, tires}
    → fitmentDestinationUrl(...) → /store?fit=<boltPatterns>  OR  /tires?fit=<oemTireSizes>
```

## Error handling

- Backend reverse route degrades to `{ vehicles: [] }` and never 503s (pure DB read; enhancement section).
- `getFitmentByTireProduct` returns `[]` on any fetch error or empty input; the `<TireFitment/>` section is
  additive and renders nothing meaningful when empty — the tire PDP is unaffected.
- The funnel builder always yields a valid URL (bare path when no fit array); an empty `oemTireSizes`
  simply routes to the full tire catalog.

## Testing

- **Backend:** `buildReverseTireFitment` pure unit tests (canonical intersection hit/miss, `is_stock`
  already handled by `extractOemTireSizes`, dedupe/sort/cap, empty `productSizes`, identity-less rows
  skipped, `status !== "ok"` skipped) mirroring the wheel `reverse-fitment` tests. Wired into `test:fitment`.
- **Storefront:** `fitmentDestinationUrl` pure unit tests (wheels vs tires, with/without fit arrays,
  countryCode prefix). The `<TireFitment/>` section + toggle wiring are gated by `tsc` + build (no branching
  logic worth a component test). The WB-063 canonical golden already guards the size-match space.

## Out of scope

- Aftermarket / plus-size vehicles in the reverse list (OEM-only, matching WB-063 forward).
- A tire "submit your build / request fitment" CTA.
- Changing the wheel funnel's default destination or its behavior.
- Reworking hero vehicle tiles, popular-search chips, or trending to offer a tire path (separate item).
- Persisting the toggle choice across drawer opens.

## References

- Mirror sources (wheels): `reverse-fitment.ts` + `service.reverseFitment` + `by-product/route.ts` +
  `getFitmentByProduct` + `components/fitment/`; the YMM/garage panes.
- Prior tire fitment: [WB-063 design](2026-07-03-tire-fitment-design.md) — `extractOemTireSizes`,
  `tireFitsVehicle`, `canonicalizeTireSize`, `TireFitmentSync`.
