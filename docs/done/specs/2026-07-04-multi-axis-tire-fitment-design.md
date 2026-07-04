# Multi-axis tire fitment (size + load + speed) — Design

> Date: 2026-07-04. Status: in-progress. Pillar: Fitment (tires). Backlog: **WB-068**.
> Tire fitment today matches on canonical **size** only (WB-063/065). The owner wants it multi-axis
> like wheels. Tires have no bolt-pattern/offset/bore analog (a tire mounts on the *wheel*, not the
> hub), so the one legitimate extension is **load index + speed rating**: a fitting tire must match an
> OEM size AND meet-or-exceed that size's OEM load index and speed rating. Full parity with the wheel
> WB-060 fit pipeline was chosen — the gate applies on every surface (badge, PDP, reverse, and the
> `/tires` browse filter via a candidate post-filter).

## The match rule (the load-bearing contract)

A tire **fits** a vehicle when the tire offers a **variant** whose:
1. `canonicalSize` equals one of the vehicle's OEM tire sizes (exact, as today), AND
2. `loadIndex ≥` that OEM size's load index, AND
3. `speedRatingRank(rating) ≥ speedRatingRank(oemSpeed)`.

**Missing data passes** (never exclude on a gap): if the OEM load/speed is unknown, or the variant's
is unknown, that dimension is not gated — mirroring how the wheel diameter/width/offset windows treat
a null window. So with full data this narrows by load+speed; without it, it degrades to size-only.

**Speed order.** `speedRatingRank` encodes the standard non-alphabetical order (ascending):
`L M N P Q R S T U H V W Y` (H sits between U and V). `Z`/`ZR` (>240 km/h) ranks high (≥ W) so a
genuinely-fast tire is never wrongly excluded. Unknown ratings return a sentinel that makes the gate
pass (never exclude). This is a shared domain constant — a pure `speedRatingRank` in each app, guarded
by a shared `fixtures/speed-rating-rank-golden.json` asserted in both (the `canonicalizeTireSize` /
`finish-normalize` precedent).

**Data is confirmed present** (verified against the cached wheel-size raw):
- Vehicle OEM (per `is_stock` rim `front`/`rear`): `tire` ("235/35ZR19"), `load_index` (91),
  `speed_index` ("Y") — clean separate fields, no string parsing needed.
- Product variant metadata: `canonical_size`, `load_index` (118), `speed_rating` ("S") — already indexed.

## Architecture

### Shared
- `speedRatingRank(rating: string | null | undefined): number` — pure, twinned in backend
  (`wheel-size/`) and storefront (`lib/fitment/`), golden-guarded.

### Backend (`wheel-size/` + vendor-sync search + reverse route)
1. **`OemTire` + `extractOemTires(raw)`** — `OemTire = { size: string; loadIndex: number | null;
   speedRating: string | null }`. Reads `is_stock` rims' `front`/`rear`: canonical `tire` → `size`,
   `load_index` → `loadIndex`, `speed_index` → `speedRating`. Dedupes by `size|load|speed`. `[]` on
   no data. `extractOemTireSizes` becomes a thin derive (`extractOemTires(raw).map(t => t.size)` deduped)
   so the coarse Meili filter + existing consumers are unchanged.
2. **`VehicleFitment.oemTires: OemTire[]`** — `toFitment` + `refreshFitment` populate it (alongside the
   existing `oemTireSizes`, now derived). `GET /store/fitment/by-vehicle` returns it in the envelope.
3. **Reverse** — `buildReverseTireFitment` takes the product's per-variant specs
   (`{ size, loadIndex, speedRating }[]`) instead of bare sizes and gates each cached vehicle on the
   full rule. `GET /store/fitment/by-tire-product` accepts the richer product specs (parallel CSV params
   `sizes` + `loads` + `speeds`, aligned by index).
4. **Meili tire doc `fit_specs`** — `buildTireDocument` emits a per-variant `fit_specs: string[]`
   (`"235/45R18|97|H"`, `load`/`speed` empty when absent). Registered in `medusa-config.js`
   (`displayedAttributes`; not filterable — the post-filter reads it from the hit). **Requires a Meili
   re-sync / backend restart** to populate.

### Storefront — garage (persist `oemTires`, mirrors WB-067)
5. `Vehicle.oemTires?: OemTire[]`; backend `customer_vehicle` gains an additive nullable `oem_tires`
   json column (+ migration), threaded through the service / `VehicleCreateSchema` / `[id]` update
   route and `medusa-garage.ts` `toWire`/`fromWire`/`update`. The YMM + garage panes write
   `oemTires: fitment.oemTires` alongside `oemTireSizes`. (`oemTireSizes` stays for the coarse `?fit=`.)

### Storefront — one multi-axis verdict
6. **`tireFitsVehicle(productVariants: TireFitSpec[], vehicleOemTires: OemTire[]): boolean`** where
   `TireFitSpec = { size: string; loadIndex: number | null; speedRating: string | null }` — true when
   some product variant satisfies the match rule against some OEM tire. Replaces the current
   `(productSizes, vehicleOemSizes)` signature. Callers updated:
   - **Card FITS badge** — `TireDiscoveryProduct` gains `fitSpecs: TireFitSpec[]` (parsed from the hit's
     `fit_specs`); the badge calls `tireFitsVehicle(fitSpecs, active.oemTires)`.
   - **PDP fit chip** — computes `TireFitSpec[]` from `sizeOptions` (each already has `canonicalSize`,
     `loadIndex`, `speedRating`) and checks vs `active.oemTires`.
   - **PDP fit-mode size filtering** — a size option is "fitting" when its own `TireFitSpec` satisfies
     the rule (WB-068 replaces the size-only `tireFitsVehicle([o.canonicalSize], oemSizes)` check the
     hero currently uses).
   - **Reverse list** — unchanged consumer (backend already gated).

### Storefront — `/tires` discovery post-filter (mirrors WB-060 Option A)
7. `?fit=` now carries the vehicle spec as three aligned CSVs: `fit` (sizes, unchanged) + `fitl`
   (load indexes) + `fits` (speed ratings). `FitmentSync` writes them from `active.oemTires`; the
   parser reconstructs `vehicleOemTires: OemTire[]`.
8. `getTireDiscoveryProducts` fit mode: the coarse `tire_sizes IN [sizes]` Meili clause gets the
   size-matching candidates **with `fit_specs`**; an in-memory post-filter drops any candidate with no
   variant that fully fits (`tireProductHasFittingVariant(fitSpecs, oemTires)`), then paginates +
   recomputes facets over the fitting set. **Lighter than the wheel WB-060 post-filter**: `fit_specs`
   is in the Meili hit, so there is **no Store-API variant round-trip** — the few-seconds wheel wait is
   largely avoided (the cost is pulling the size-matched candidate set + in-memory facet recount, capped).

## Data flow

```
by-vehicle → { fitment: { …, oemTireSizes, oemTires } } → garage (oemTires persisted authed+guest)
active.oemTires → FitmentSync → /tires?fit=<sizes>&fitl=<loads>&fits=<speeds>
  → coarse Meili tire_sizes IN[sizes] (+fit_specs) → post-filter tireProductHasFittingVariant → grid+facets
active.oemTires + product fitSpecs → tireFitsVehicle → card badge / PDP chip / PDP fit-mode filter
product variant specs → by-tire-product → reverseTireFitment (full rule) → PDP "N confirmed models"
```

## Error handling / degradation

- Missing load/speed on either side → that dimension passes (size-only fallback) — never a false exclude.
- `getTireDiscoveryProducts` stays throw-safe (empty result on Meili failure); the post-filter degrades
  to the coarse size result if `fit_specs` is absent (pre-re-sync docs) — so it never returns empty
  because of the new field.
- Guest + authed both persist `oemTires`; a vehicle saved before this ships re-resolves on select
  (the garage pane already re-resolves when fitment data is missing — extend its guard to `oemTires`).

## Testing

- **Shared:** `speedRatingRank` golden (order incl. H between U/V; Z high; unknown passes), asserted
  in both apps.
- **Backend:** `extractOemTires` (per-rim load/speed, dedupe, no-data); `buildReverseTireFitment`
  multi-axis (size hit but load/speed fail → excluded; missing data passes); `buildTireDocument`
  `fit_specs` shape. `test:fitment` + `test:sync`.
- **Storefront:** `tireFitsVehicle` multi-axis (size/load/speed pass+fail matrix, missing-data passes,
  ordinal speed); the `?fit=`/`fitl`/`fits` encode-decode; `tireProductHasFittingVariant`; the card
  `fitSpecs` parse. vitest + tsc.
- **Live:** after the Meili re-sync, a vehicle whose OEM speed exceeds a low-speed tire's rating drops
  that tire from `/tires ?fit`, its card loses the FITS badge, and its PDP reads "MAY NOT FIT".

## Out of scope

- Any change to the wheel fitment pipeline.
- Plus-sizing / alternate sizes; staggered front/rear distinction (front+rear still flattened into the
  OEM set, now as `OemTire` tuples).
- Exact-match load/speed (we use meet-or-exceed, which is the correct fitment rule).

## References

- Mirror sources: wheel WB-060 — `discovery/data/get-products.ts` (fit-mode candidate post-filter +
  facet recompute), `product-has-fitting-variant.ts`, `vehicle-constraint.ts` (window param encode/decode),
  `components/hero/{index,fit-banner}.tsx`. Tire prior: WB-063 (`tireFitsVehicle`, `canonicalizeTireSize`,
  `TireFitmentSync`, tire discovery `?fit`), WB-065 (reverse), WB-067 (`oem_tire_sizes` garage column).
