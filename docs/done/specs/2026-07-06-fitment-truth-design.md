# Fitment truth — correct, fresh, non-over-claiming fit (G9 cluster 3) — Design

> Status: **done** — implemented + merged to `main` 2026-07-07. Session = epic **G9** (audit remediation), cluster **fitment-truth**.
> Backlog id: **WB-072** (under the WB-069 umbrella). Whole-branch review clean after fixing one Important (band bore-axis → per-variant `buildFitView`); residual nits tracked as follow-ups (see WB-072 backlog entry).
> Remediates **17 findings** (8 backend B1–B8 + 9 storefront S1–S9), **all re-verified against current `main`
> 2026-07-07 — all HOLD** (the tire arc WB-063–068 added `oem_*` columns only; it never touched cache-key
> construction, quota gating, the catalog cache, vehicle-write validation, or the fit-verdict logic).
> Governing dashboard: [docs/STATUS.md](../../STATUS.md) · Backlog: [docs/future/BACKLOG.md](../../future/BACKLOG.md)
> Umbrella: [docs/future/plans/2026-07-06-audit-remediation-theme.md](../../future/plans/2026-07-06-audit-remediation-theme.md)
> Raw findings: [audit-findings-fitment-garage.md](../../future/plans/2026-07-06-audit-findings-fitment-garage.md) (#1,2,6,7,8,9,10,11,12,19,20,21,22,23,26) + [audit-findings-storefront.md](../../future/plans/2026-07-06-audit-findings-storefront.md) (#1)

## 1. Context

"Does this wheel fit your vehicle?" is the core product promise. The audit found it is answered from
**data that can be wrong or stale** (a cache key that drops the model year → wrong-generation fitment; a
hub-bore column that truncates the decimal → a corrupted safety gate; quota exhaustion cached as a durable
"no fitment data") **and rendered by UI that over- or under-claims** (a "Fits your X" band that passes when
no single variant fits; a "confirmed models" list that contradicts the band on the same page; a "FITS"
badge from a bolt-pattern-only check; a "doesn't fit" verdict for a vehicle whose data is merely unknown).

All 17 findings were single-reviewer PENDING; a two-agent re-verification against current `main`
(2026-07-07) confirmed **every one still holds**. The remediation principle (G9 theme): **the fit answer
must come from correct, fresh, quota-honest data, and must never claim more (or less) than a single
purchasable variant actually supports.**

### The findings this cluster closes

| # | Sev | One-line | Where |
|---|---|---|---|
| B1 | HIGH | Fitment cache key drops the YEAR when a trim slug is present → wrong-generation fitment for 90d | backend wheel-size |
| B2 | HIGH | `customer_vehicle.hub_bore_mm` is INTEGER → truncates 106.1→106, corrupting the bore gate | backend customer-vehicle |
| B3 | MED | Warm cron is a guaranteed-failure loop for trim-keyed rows (never self-heals them) | backend job |
| B4 | MED | Quota exhaustion mid-lookup is cached as a fresh `not_found` for 90d | backend wheel-size |
| B5 | MED | Catalog reads bypass the quota counter; public routes mint junk rows + 500 on failure | backend wheel-size + routes |
| B6 | MED | `wheel_size_catalog` read-through never expires (dropdowns frozen at first fetch) | backend wheel-size |
| B7 | MED | Vehicle UPDATE route persists a fully unvalidated body into fitment columns | backend route |
| B8 | LOW | Concurrent first-lookups race list-then-create into a unique-constraint 500 | backend wheel-size |
| S1 | HIGH | `fitsVehicle` checks size windows per-DIMENSION across all sizes → "Fits your X" when no variant fits | storefront |
| S2 | HIGH | PDP "confirmed models" list is bolt+bore only → contradicts the size-hardened band on the same page | storefront + backend reverse |
| S3 | MED | Fit mode never filters/defaults the OFFSET axis → out-of-window ET under "only what fits" | storefront |
| S4 | MED | `buildFitView` decouples the bore check from the offset-window check across variants | storefront |
| S5 | MED | Vehicle saved without fitment data makes every PDP assert "bolt pattern does not match" (false negative) | storefront |
| S6 | MED | Discovery/home "FITS" badge is bolt-pattern-only → over-claims vs the per-variant filter | storefront |
| S7 | MED | Fitment section claims entries are "bench-verified" (data supports none) + dead `href="#"` CTA | storefront |
| S8 | LOW | Advanced fitment panel renders duplicate offset chips with duplicate React keys | storefront |
| S9 | LOW | "YOUR VEHICLE" highlight matches make/model only (tags other generations) | storefront |

### Current-state facts (grounded, re-verified 2026-07-07)

| Fact | Evidence |
|---|---|
| `cache_key = [make, model, (modificationSlug ?? year ?? ""), region].join("|")` — year dropped when trim present; storefront always sends both. | [service.ts:67,101](../../../backend/src/modules/wheel-size/service.ts#L67), [storefront fitment.ts:68-74](../../../storefront/src/lib/data/fitment.ts#L68) |
| `customer_vehicle.hub_bore_mm` is `integer null`; no later migration fixed it; both writers store the raw fractional value; model DSL `model.number().nullable()`. The sibling `wheel_size_fitment` was fixed to `hub_bore_mm_x100` (Migration20260623120000). | [Migration20260601111335.ts:7](../../../backend/src/modules/customer-vehicle/migrations/Migration20260601111335.ts#L7), [customer-vehicle/service.ts:44](../../../backend/src/modules/customer-vehicle/service.ts#L44), [vehicles/[id]/route.ts:15](../../../backend/src/api/store/customer/vehicles/[id]/route.ts#L15), [Migration20260623120000.ts:6](../../../backend/src/modules/wheel-size/migrations/Migration20260623120000.ts#L6) |
| Warm cron `parseCacheKey` gives trim-keyed rows no year → `client.byModel` 400s → `fetched_at` never advances (per-row try/catch, so the batch survives; read-path stale-revalidate uses the original params incl. year, so live traffic still refreshes). | [wheel-size-warm.ts:26-44](../../../backend/src/jobs/wheel-size-warm.ts#L36) |
| Quota-out on the trim-retry (return emptyBody) + region-probe (break) paths → `refreshFitment` persists `not_found` `fetched_at=now`; only the first `incrementAndCheckQuota` throws 503. | [service.ts:160,173,181](../../../backend/src/modules/wheel-size/service.ts#L173), [service.ts:100-114](../../../backend/src/modules/wheel-size/service.ts#L100) |
| `catalog()`/`list*` call the metered client with no `incrementAndCheckQuota`; the four catalog routes pass raw query strings, no try/catch for `QuotaOutageError`. `catalog()` throws on `status>=300`. | [service.ts:215-228](../../../backend/src/modules/wheel-size/service.ts#L215), `api/store/vehicle-catalog/{makes,models,years,modifications}/route.ts` |
| `catalog()` returns `hit[0].payload` forever — no `isStale`/TTL; `isStale` only ever runs on `wheel_size_fitment`. | [service.ts:215-222](../../../backend/src/modules/wheel-size/service.ts#L215) |
| `POST /store/customer/vehicles/[id]` = `req.body as any` → `updateCustomerVehicles(...)`, no zod. Create/merge use `parseVehicleCreate`/`VehicleCreateSchema`. | [vehicles/[id]/route.ts:9-18](../../../backend/src/api/store/customer/vehicles/[id]/route.ts#L9), [validators.ts:8-24](../../../backend/src/api/store/customer/vehicles/validators.ts#L8) |
| `refreshFitment` list-then-create is non-atomic vs the partial unique index `IDX_wheel_size_fitment_cache_key_unique`. | [service.ts:111-113](../../../backend/src/modules/wheel-size/service.ts#L111), [Migration20260601111311.ts:15](../../../backend/src/modules/wheel-size/migrations/Migration20260601111311.ts#L15) |
| `fitsVehicle.withinWindow` ANDs three independent per-dimension `inWin` checks over all sizes/offsets, not per-variant, not bolt-scoped. Only consumer: `fitment/index.tsx:31`. PDP chip uses correct `variantFitsVehicle`. | [fits-vehicle.ts:22,42-46](../../../storefront/src/lib/fitment/fits-vehicle.ts#L42), [fitment/index.tsx:31](../../../storefront/src/modules/product-detail/components/fitment/index.tsx#L31) |
| Reverse list gate = bolt intersection + bore-clears-or-unknown only; loader passes only bolt patterns + bore; `by-product` route accepts only `boltPatterns`/`boreMm`/`limit`. | [reverse-fitment.ts:38-49](../../../backend/src/modules/wheel-size/reverse-fitment.ts#L38), [get-product.ts:118-121](../../../storefront/src/modules/product-detail/data/get-product.ts#L118), [by-product/route.ts:11-17](../../../backend/src/api/store/fitment/by-product/route.ts#L11) |
| Hero `defaultOffsetMm = selectedSize.defaultOffsetMm ?? selectedSize.offsetMm` (no fit-awareness); `fit-view.ts` `trim()` filters `sizeOptions` only, never `offsetVariants`; `boltCompatible`/`withinWindows` are two independent `.some()` over `offsetVariants`. | [hero/index.tsx:115,238](../../../storefront/src/modules/product-detail/components/hero/index.tsx#L115), [fit-view.ts:35-69](../../../storefront/src/modules/product-detail/data/fit-view.ts#L35) |
| `fitsVehicle` `boltOk = vPats.length>0 && …` → empty patterns push "Bolt pattern does not match"; `fitmentStatus` persisted but never consulted. | [fits-vehicle.ts:22](../../../storefront/src/lib/fitment/fits-vehicle.ts#L22) |
| Card badge = `productFitsVehicle` bolt-set intersection, unconditional on every card; fit-mode listing filter uses rigorous `productHasFittingVariant`. | [fit-badge.tsx:14](../../../storefront/src/modules/discovery/components/grid/fit-badge.tsx#L14), [product-card.tsx:57](../../../storefront/src/modules/discovery/components/grid/product-card.tsx#L57), [get-products.ts:164-213](../../../storefront/src/modules/discovery/data/get-products.ts#L164) |
| Fitment header copy "bench-verified for offset, hub bore, and brake clearance"; CTA `href="#"`; `isActive` compares make/model only. | [fitment/index.tsx:39,124,142](../../../storefront/src/modules/product-detail/components/fitment/index.tsx#L39) |
| Advanced panel `offsetVariants.map(o => … key={o.value})`; one OffsetVariant per variant since WB-051. | [advanced-fitment-panel.tsx:95](../../../storefront/src/modules/product-detail/components/hero/advanced-fitment-panel.tsx#L95), [group-sizes.ts:44-96](../../../storefront/src/modules/product-detail/data/group-sizes.ts#L44) |

## 2. Goals / non-goals

**Goals**
- A cached fit answer is keyed to the exact vehicle (make + model + **year** + trim) — no cross-generation collision. *(B1)*
- The hub-bore hard-gate uses full precision, and existing saved vehicles are corrected. *(B2)*
- Quota exhaustion degrades to a 503 that is NOT cached as a durable "no fitment"; catalog reads count against quota, expire, validate, and degrade to 503; concurrent lookups don't 500. *(B3–B8)*
- Every "Fits your X" surface (band, chip, list, badge, fit-mode filter, PDP defaults) agrees, and each claims fit only when a single purchasable variant satisfies bolt + bore + diameter + width + offset. *(S1–S4, S6)*
- "No fitment data" is shown as **unknown**, never as "doesn't fit". *(S5)*
- Fitment copy states only what the data supports; no dead CTA; no duplicate/mislabeled chips or rows. *(S7–S9)*

**Non-goals (out of scope)**
- Real bench-verification / a fitment-submission backend (S7 makes the copy honest + wires or removes the CTA; it does not build the service).
- The garage-session-integrity cluster (provider lifecycle, merge/race, fire-and-forget writes) — the fitment-garage log's #3,4,5,13,14,15,16,17,24,25 — is a separate spec (G9 cluster 4).
- Plus-sizing / staggered fitment; multi-region fitment.

## 3. Chosen approach

One spec, two groups, **backend-first ordering** (the storefront verdict logic consumes the data the
backend corrects). Pure decision logic is extracted for unit tests (`test:fitment` backend, `vitest`
storefront). Decisions locked with the user (2026-07-06): **single comprehensive spec**; **B2 =
rescale migration + a re-resolve backfill script** for existing garage vehicles.

### Group A — Backend data integrity *(B1–B8)*

**A1 (B1+B3).** `buildFitmentCacheKey(p)` → `[make, model, year, modificationSlug ?? "", region].join("|")`
— year is always present. Update both construction sites ([service.ts:67,101](../../../backend/src/modules/wheel-size/service.ts#L67)) and the warm cron's `parseCacheKey` (the 5th slot is now trim; year is a stable slot, so trim-keyed rows can reconstruct the year and the warm refresh succeeds). *Deploy: the key format changes, so existing `wheel_size_fitment` rows are orphaned under the new key; the next lookup per vehicle misses → fetches fresh (soft re-warm; ~1 API call per active vehicle). Optionally truncate the table on deploy to force a clean re-warm.*

**A2 (B2, safety).** Migration `Migration<ts>_customer_vehicle_hub_bore_x100`: rename `hub_bore_mm` →
`hub_bore_mm_x100`, `UPDATE ... SET hub_bore_mm_x100 = hub_bore_mm * 100` (existing values are truncated
mm). Model DSL: `hub_bore_mm_x100 = model.number().nullable()`. Writers (`createForCustomer`, `[id]` route)
store `Math.round(hubBoreMm*100)`; readers/serialization (`MedusaGarage.fromWire` / the vehicle DTO)
divide by 100. Plus **`src/scripts/backfill-garage-bore.ts`** (guarded `--confirm-host`, idempotent):
for each garage vehicle with make/model/year, re-resolve fitment via the wheel-size service and write the
true `hub_bore_mm_x100` (recovers 106 → 106.1). Ops runs it; migration alone preserves the already-lossy mm.

**A3 (B4).** In the trim-retry + region-probe paths, on quota exhaustion **throw `QuotaOutageError`**
(uncached 503) instead of returning an empty body — a quota-out is not a no-match, so it must not persist a
`not_found`.

**A4 (B5).** `catalog()`/`list*` call `incrementAndCheckQuota()` before the billable client call; the four
`vehicle-catalog` routes validate `make`/`model`/`year` shape (bounded strings) and wrap the call in
`try { } catch (QuotaOutageError) { res.status(503) }` (mirroring `by-vehicle`).

**A5 (B6).** `catalog()` gains a staleness check: on a hit, if `isStale(row)` refresh (same TTL/SWR pattern
as `getFitment`), else return the payload — so dropdowns pick up new model years / makes.

**A6 (B7).** The `[id]` update route validates the body with a `VehicleUpdateSchema`
(`VehicleCreateSchema.partial()` or an explicit partial) before `updateCustomerVehicles`.

**A7 (B8).** Make the `refreshFitment` upsert atomic (`ON CONFLICT (cache_key) WHERE deleted_at IS NULL DO
UPDATE`, matching the quota table's pattern) or catch the unique violation and treat it as an update — pairs
with A3 (no `not_found` write on quota-out).

### Group B — Storefront verdict honesty *(S1–S9)*

**S1 (safety).** Rewrite `fitsVehicle` so a size/variant counts as fitting only under a **per-variant
conjunction** (bolt-pattern match AND bore clears AND diameter/width/offset in-window on the *same*
variant), scoped to the matching bolt pattern — reusing `variantFitsVehicle`'s correct logic rather than
three independent per-dimension checks. Remove the stale "so they can never disagree" comment.

**S2 (backend touch).** Thread the vehicle's diameter/width/offset windows into `buildReverseFitment`
+ the `by-product` route + the storefront loader (`getFitmentByProduct`), so a "confirmed model" requires a
fitting variant (same gate as the band), not just bolt+bore.

**S3.** `buildFitView.trim()` also trims each surviving size's `offsetVariants` to in-window (paired
with bore per S4); the hero's `defaultOffsetMm` picks a fitting offset when fit-mode is active.

**S4.** `buildFitView` pairs the checks per variant:
`offsets.some(o => inWin(o.value) && boreClears(o.centerBoreMm))`.

**S5.** Add an `unknown` state to the fit verdict (a vehicle with no `canonicalBoltPatterns` →
`unknown`, not `no-fit`). Thread it through `fitsVehicle`'s return + `fitment/index.tsx` (and the chip if it
consumes the same verdict) so the UI reads "We don't have fitment data for your vehicle yet" instead of a
false mismatch. (Same file as S1.)

**S6.** Gate `FitBadge` on the same per-variant fit signal the fit-mode filter uses
(`productHasFittingVariant`-style) — thread the needed variant fields onto the card, or render the badge
only in fit-mode. Storefront-only.

**S7.** Replace the "bench-verified for offset, hub bore, and brake clearance" copy with an honest
description of what's actually checked (bolt-pattern + hub-bore match against wheel-size.com data); make the
"Submit your build" CTA a real link or remove it (no `href="#"` promising 24h confirmation).

**S8.** Advanced panel: compound key (`${o.value}|${o.centerBoreMm}`) and correct the
`sel = o.value === selectedOffsetMm` styling so bore-branching sizes don't render duplicate/both-selected
chips (coordinate with the existing bore `SpecSelector`).

**S9.** `isActive` also compares year (and trim where present), so only the shopper's actual
generation is tagged "YOUR VEHICLE".

## 4. Interfaces & isolation

Pure, unit-tested:
- `buildFitmentCacheKey(params)` (backend, A1) — deterministic key incl. year.
- The quota-vs-not_found decision + catalog staleness predicate (backend, A3/A5) — extracted where possible.
- `fitsVehicle(specs, vehicle)` returning `{ status: "fits" | "no-fit" | "unknown"; reasons }` (storefront, S1/S5).
- `buildFitView(...)` per-variant pairing + offset trim (storefront, S3/S4).
- `reverseFitmentMatch(...)` with windows (backend, S2).

I/O / component (build + review): the migration + backfill (A2), routes/validation (A4/A6/A7), and the
components (`fitment/index.tsx`, `advanced-fitment-panel.tsx`, `fit-badge.tsx`, hero defaults).

## 5. Testing

- **Backend `test:fitment` / jest:** `buildFitmentCacheKey` (year always present; trim + year distinct);
  quota-out throws vs not_found persists; catalog staleness; `reverseFitmentMatch` window gate. Migration +
  backfill + routes via `medusa build` + review.
- **Storefront `vitest`:** `fitsVehicle` (per-variant conjunction; the "no single variant fits" repro from
  S1; the `unknown` state from S5); `buildFitView` (paired bore+offset; offset trim); reverse-window match.
  These lock the safety guarantees. There is a shared fitment golden fixture (`normalize-finish`); keep any
  cross-app logic in lockstep.
- **No live wheel-size API calls in tests** (pure/mocked). `build:next` (storefront bundle) deferred — needs
  a live backend; storefront rides on `tsc` + `vitest`.

## 6. Deploy notes

- **A1 cache re-key:** existing `wheel_size_fitment` rows are orphaned under the new key format; each vehicle
  re-fetches once on next lookup (soft re-warm, quota cost ≈ active vehicles). A one-line truncate of
  `wheel_size_fitment` on deploy forces a clean re-warm and avoids orphan rows lingering.
- **A2 migration** runs on `db:migrate` (rename + rescale). Then ops runs the guarded
  `backfill-garage-bore.ts` to recover true fractional bore for existing garage vehicles (quota cost ≈
  garage vehicle count). Until it runs, legacy rows use rescaled-truncated mm (no worse than today).
- **No new required env.** The wheel-size quota/API config is unchanged.

## 7. Risks & trade-offs

- **A2 is a schema migration on a live table** — mirror the proven `wheel_size_fitment` rename+backfill
  pattern exactly; the rescale is `*100` (integer mm → x100), the backfill re-resolves for precision.
- **S5 `unknown` is a type-shape change** to the fit verdict, touching every `fitsVehicle` consumer — bounded
  (one real consumer today) but must be threaded carefully so nothing silently coerces `unknown`→`fits`.
- **Cluster size (17 findings)** is the main execution risk — mitigated by the backend-first ordering and
  extracting the safety-critical logic (B1/B2 backend, S1/S5 storefront) into unit-tested pure functions.
- **Quota cost on deploy** (A1 re-warm + A2 backfill) is real but one-time and bounded by the active-vehicle
  count, which is small this early.
