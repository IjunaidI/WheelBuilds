# WB-009 · PDP reverse fitment ("N confirmed models") — Design

> Status: design · Branch: `feat/pdp-reverse-fitment` · Date: 2026-06-18
> Backlog: [WB-009](../../future/BACKLOG.md) (HIGH)

## Problem

The PDP loader hard-returns `fitment: []`
([get-product.ts:173](../../../storefront/src/modules/product-detail/data/get-product.ts)), so the
"FITMENT · N CONFIRMED MODELS" section
([fitment/index.tsx:37](../../../storefront/src/modules/product-detail/components/fitment/index.tsx))
always shows 0 and an empty list, regardless of the wheel-size data we hold. (The active-vehicle "Fits
your vehicle" band in the same component already works — it runs `fitsVehicle(product, active)`
client-side against the garage vehicle. Only the confirmed-models LIST is dead.)

## Data we have

The `wheel_size_fitment` cache stores **forward** lookups (vehicle → fitment), populated lazily as
users pick vehicles via the YMM dropdown / garage
([service.ts `getFitment`](../../../backend/src/modules/wheel-size/service.ts)). Each row holds:
`cache_key` (`make|model|(modSlug|year)|region`), `region`, **`raw`** (the full wheel-size `by_model`
body), `canonical_bolt_patterns` (JSON), `hub_bore_mm`, the diameter/width/offset windows, `status`
(`"ok"|"not_found"`), `fetched_at`.

Crucially, the stored `raw.data[0]` carries clean vehicle identity — confirmed against the test
fixtures: `make: {slug,name}`, `model: {slug,name}`, `trim: "3.0i"`, `start_year`, `end_year`. So a
good display string is available from data we already cache — **no migration / schema change needed.**

## Approach

**Reverse over the local forward-cache, reading identity from `raw`.** For a product, find cached
`status="ok"` vehicles whose `canonical_bolt_patterns` intersect the product's `boltPatternsCanonical`
and whose hub the wheel's center bore clears, and emit them as `FitmentEntry[]`. This is exactly the
backlog's prescribed fix ("query wheel-size cache by product bolt patterns/bore/offset ranges").

The list reflects vehicles looked up so far — partial, but honest and zero-API-cost, and it grows as
the cache fills. An empty/sparse list degrades cleanly (the section already reads "The list is
non-exhaustive — submit your build for spec confirmation").

Rejected: a wheel-size reverse (wheels → vehicles) API endpoint (unbounded, quota-heavy, not wired);
pre-warming the cache with popular vehicles (that is WB-008's warm cron); adding identity columns +
a migration (parsing the already-stored `raw` makes it unnecessary).

## Match gate (chosen: bolt pattern + hub bore)

A cached vehicle is "confirmed" when **both** hard gates pass — the same gates the active-vehicle band
uses ([fits-vehicle.ts:18-30](../../../storefront/src/lib/fitment/fits-vehicle.ts)), so the list and
the band never contradict:

- **boltOk:** `product.boltPatternsCanonical ∩ row.canonical_bolt_patterns` is non-empty (both already
  canonical `"{count}x{pcd}"`, so set intersection is exact).
- **boreOk:** `wheelBoreMm >= row.hub_bore_mm`. If either value is unknown, the gate passes (don't
  exclude on missing data — mirrors `fitsVehicle`).

Window (diameter/width/offset) refinement is intentionally out of scope for this pass.

## Changes

### Backend

1. **Pure module** `backend/src/modules/wheel-size/reverse-fitment.ts` (no DB — unit-testable):
   - `extractVehicleIdentity(raw): { make: string; model: string; trim?: string; yearLabel: string } | null`
     — reads `raw.data[0].make.name`, `.model.name`, `.trim`, and builds `yearLabel` from
     `start_year`/`end_year` (`"2014–2020"`, or `"2014"` when equal/single, `""` when absent). Returns
     `null` when make or model is missing.
   - `matchesProduct(row, productPatterns: string[], wheelBoreMm: number | null): boolean` — `boltOk &&
     boreOk` as defined above.
   - `buildReverseFitment(rows, productPatterns, wheelBoreMm, limit): ReverseFitmentVehicle[]` — filters
     by `matchesProduct`, maps via `extractVehicleIdentity` (dropping `null`), **dedupes** by
     `make|model|trim|yearLabel` (lowercased), sorts by make → model → yearLabel, caps at `limit`. Each
     result carries the matched canonical pattern as `boltPattern`.
2. **Service method** `WheelSizeService.reverseFitment({ canonicalBoltPatterns, wheelBoreMm?, limit? })`
   ([service.ts](../../../backend/src/modules/wheel-size/service.ts)): loads `listWheelSizeFitments({
   status: "ok" })` and delegates to `buildReverseFitment` (default `limit = 24`). Makes **no** wheel-size
   API calls — pure cache read, no quota impact.
3. **Type** `ReverseFitmentVehicle = { year: string; make: string; model: string; trim?: string;
   boltPattern: string }` in [types.ts](../../../backend/src/modules/wheel-size/types.ts).
4. **Route** `GET /store/fitment/by-product`
   (`backend/src/api/store/fitment/by-product/route.ts`): reads `boltPatterns` (comma-separated
   canonical) + optional `boreMm`; `resolveOptional(WHEEL_SIZE_MODULE)`; returns `{ vehicles: [] }` when
   the module is absent or `boltPatterns` is empty (graceful — never 503s, since the PDP list is an
   enhancement); otherwise `{ vehicles: await svc.reverseFitment(...) }`.

### Storefront

5. **Data layer** `lib/data/fitment.ts`: `getFitmentByProduct(boltPatternsCanonical: string[], boreMm?:
   number): Promise<FitmentEntry[]>` — server-side `sdk.client.fetch` of `/store/fitment/by-product`
   with `next: { revalidate: 300 }`; maps `vehicles` to `FitmentEntry`; returns `[]` on any
   error/empty.
6. **Loader** `product-detail/data/get-product.ts`: in `getProductDetail`, call `getFitmentByProduct(
   detail.boltPatternsCanonical, detail.specs.centerBoreMm)` and return `{ ...detail, fitment }`,
   replacing the hardcoded `fitment: []`. (`mapToDetail` keeps returning `fitment: []` as the default;
   `getProductDetail` overrides it.)

### Component — no change

[fitment/index.tsx](../../../storefront/src/modules/product-detail/components/fitment/index.tsx)
already renders `product.fitment` rows and the `product.fitment.length` count, and highlights a row
whose make/model match the active garage vehicle. It just receives a non-empty list now.

## Error handling / degradation

- Module off / any fetch failure / empty cache → `fitment: []` → the section shows "0 CONFIRMED MODELS"
  and the existing "Submit your build" CTA. No page break.
- The route performs no upstream API calls, so it cannot trip the wheel-size quota.

## Testing

- **Backend Jest (pure)** `reverse-fitment.test.ts`:
  - `extractVehicleIdentity`: full identity from a fixture-shaped body; `null` when make/model missing;
    year label single (`start==end`) vs range vs empty (no years).
  - `matchesProduct`: bolt intersect yes/no; bore gate pass / fail (`wheelBore < hub`) / unknown-passes.
  - `buildReverseFitment`: dedupes duplicate (make,model,trim,year) rows; skips non-matching; sorts;
    caps at `limit`.
- **Backend service test** (existing hand-mocked `listWheelSizeFitments` style): `reverseFitment`
  returns the matching vehicles from a seeded in-memory row set.
- **Route**: no unit harness in the repo — verified by the live check.
- **Live verify** (final task): backend up → seed the cache via two `/store/fitment/by-vehicle`
  lookups for vehicles whose bolt pattern matches a known product → `GET /store/fitment/by-product`
  with that product's patterns returns those vehicles → load the PDP and confirm "N CONFIRMED MODELS"
  > 0 with the right vehicles.

## Out of scope

- Pre-warming the fitment cache with popular vehicles (WB-008 warm/refresh cron).
- A wheel-size reverse (wheels → vehicles) API integration.
- Diameter/width/offset window refinement of the match (bolt + bore only).
- Any schema change / migration (parsing the stored `raw` makes identity columns unnecessary).

## Verification (acceptance)

A wheel product whose bolt patterns match one or more vehicles present in the `wheel_size_fitment`
cache shows a non-empty "N CONFIRMED MODELS" list on its PDP, each entry a real `Year Make Model
[Trim]`, and a cached vehicle that fails the hub-bore gate is excluded.
