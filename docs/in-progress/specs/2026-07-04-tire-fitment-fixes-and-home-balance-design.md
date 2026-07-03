# Tire fitment fixes + home balance — Design

> Date: 2026-07-04. Status: in-progress. Pillar: Fitment + Garage + Home. Backlog: **WB-067** (authed-garage OEM tire sizes) + revisions to WB-064 (home tire content) and WB-066 (funnel).
> Live testing surfaced that tire fitment doesn't work for logged-in users, plus two UX decisions:
> the Wheels|Tires toggle should be removed (routing becomes page-aware), and the home page should
> show tires off in one bold band. This spec covers all three. The already-landed branch fixes
> (metadata → tire PDP renders; nav active state; hero CTA carries the fit) stay as-is.

## Context

Live-debugging root causes (all verified against the running backend):

- **Authed tire fitment is broken (WB-067).** The garage swaps to `MedusaGarage` (backend
  `customer_vehicle` table) when logged in. That model
  ([`customer-vehicle.ts`](../../../backend/src/modules/customer-vehicle/models/customer-vehicle.ts))
  stores `canonical_bolt_patterns`, `hub_bore_mm`, and the size windows — but has **no
  `oem_tire_sizes` column**. `medusa-garage.ts`'s `toWire`/`fromWire`/`update` serialize every
  fitment field **except `oemTireSizes`**. So a logged-in user's vehicle round-trips through the
  backend and returns without tire sizes: wheels fit (bolt patterns persist), tires never do
  (`TireFitmentSync` sees `active.oemTireSizes = []` and writes no `?fit=`, so `/tires` stays
  unfiltered — confirmed via the network trace: URL stays `/us/tires`, no `fit` param). WB-063 added
  `oemTireSizes` to the storefront types + the guest localStorage path, but never to the authed
  backend path. (Backend/data are otherwise correct: `by-vehicle` returns `oemTireSizes`, e.g.
  Accord → `225/50R17, 235/40R19, 235/45R18`, and the Meili tire index has products in those sizes.)
- **The Wheels|Tires toggle (WB-066).** It works but the owner wants it removed; instead the funnel
  should be **page-aware** — a car pick on a wheel surface fits wheels, on a tire surface fits tires.
  The `fitment-context` store (added while debugging) already tracks the surface; only the visible
  toggle needs to go, with the destination driven by the context automatically.
- **Home tire presence (WB-064).** Today only the standalone "Shop Tires" rail is tire content; the
  page reads wheels-only. The owner wants **one bold "TIRES" band** that shows tires off, wheels
  staying the dominant theme.

## Decisions (from brainstorming / live feedback)

- Fix authed tire fitment by persisting `oemTireSizes` end-to-end on the authed path (new nullable
  `oem_tire_sizes` column + serialization). One additive migration.
- **Remove the toggle; keep routing page-aware** (no manual choice): wheel surface → `/store?fit=…`,
  tire surface → `/tires?fit=…`, driven by the surface context.
- **One bold TIRES band** on the home page (dark/accent, mid-page), replacing the standalone rail.
- OEM-only tire match is unchanged (exact width+aspect+rim); no fitment-logic change.

## Architecture

### Part 1 — WB-067: authed garage persists OEM tire sizes

**Backend** (`modules/customer-vehicle/` + `api/store/customer/vehicles/`):
1. **Model** — add `oem_tire_sizes: model.json().nullable()` to
   [`models/customer-vehicle.ts`](../../../backend/src/modules/customer-vehicle/models/customer-vehicle.ts).
2. **Migration** — a hand-authored additive migration adding the nullable `oem_tire_sizes` jsonb
   column (mirrors the existing `canonical_bolt_patterns` json column). Additive/safe; runs on the
   prod DB.
3. **Service** — `createForCustomer`
   ([`service.ts:34-50`](../../../backend/src/modules/customer-vehicle/service.ts#L34-L50)) maps
   `oem_tire_sizes: input.oemTireSizes ?? null`.
4. **Validator** — `VehicleCreateSchema`
   ([`validators.ts`](../../../backend/src/api/store/customer/vehicles/validators.ts)) gains
   `oemTireSizes: z.array(z.string()).nullish()` (flows into create + merge, which reuse the schema).
5. **Update route** — the `[id]` POST
   ([`[id]/route.ts:13-17`](../../../backend/src/api/store/customer/vehicles/[id]/route.ts#L13-L17))
   adds `oem_tire_sizes: b.oemTireSizes` to the `updateCustomerVehicles` call.

**Storefront** ([`medusa-garage.ts`](../../../storefront/src/lib/garage/medusa-garage.ts)):
6. `toWire(v)` adds `oemTireSizes: v.oemTireSizes`; `fromWire(r)` adds
   `oemTireSizes: r.oem_tire_sizes ?? undefined`; `update()`'s `api.updateVehicle` payload adds
   `oemTireSizes: updated.oemTireSizes`. (The `lib/data/customer-vehicles.ts` layer posts the wire
   payload as-is, so no change there beyond what `toWire` sends.)

Result: a logged-in user's `oemTireSizes` survives create/update/merge/list, so `TireFitmentSync`
and the tire-PDP chip work for authed users exactly as they do for guests.

### Part 2 — remove the toggle, page-aware routing (WB-066 revision)

- Delete `destination-toggle.tsx`. Keep `destination-url.ts` (`fitmentDestinationUrl`) and the
  `fitment-context` store + `FitmentContextSetter` (mounted on `/tires` + the tire PDP).
- In `ymm-pane.tsx` + `garage-pane.tsx`: drop the `<DestinationToggle>` render and the `setTarget`
  control; the destination `target` is read once from `getFitmentContext()` at drawer-open (captured
  in `useState(() => getFitmentContext())`, no setter). The submit/select routing already goes
  through `fitmentDestinationUrl({ target, boltPatterns, oemTireSizes })` — unchanged. So a car pick
  on a wheel surface → `/store?fit=<boltPatterns>`, on a tire surface → `/tires?fit=<oemTireSizes>`.
- Keep writing `oemTireSizes` onto the vehicle in both panes (unchanged) so the fit persists.

### Part 3 — bold TIRES band on the home page (WB-064 revision)

- Remove the standalone `<ShopTiresRow/>` from the home composition; replace with a new
  `<TiresBand/>` placed mid-page (after `FeaturedBlocks`, before `ShopByBrand`).
- `modules/home/components/tires-band/index.tsx` — a server component, visually distinct (dark
  `--ink`/graphite background, white text, orange accents, per DESIGN.md) so it stands out against
  the light wheel sections. Contents:
  - Header: eyebrow "NOW STOCKING" + an Antonio `Display` title ("Tires, built to match") + a
    "Shop all tires →" `MicroLink` to `/tires`.
  - The 6 newest tires via the existing `getHomeTires(6)` + `TireProductCard` (live FITS badges).
  - A tire-brands strip: `getHomeTireBrands()` → `BrandTile`s linking to `/tires?brands=<brand>`.
  - Degrades to `null` when there are no tires (throw-safe).
- New data helper `getHomeTireBrands(limit = 8)` — calls `getTireDiscoveryProducts` (throw-safe),
  returns the top tire brands from `facets.brands` (mirrors how `ShopByBrand` reads `getHomeCatalog`
  facets). Reuses the existing `getHomeTires`.

## Data flow

```
Authed add/update vehicle → toWire{…,oemTireSizes} → POST /store/customer/vehicles(/[id])
  → validator(oemTireSizes) / b.oemTireSizes → service → oem_tire_sizes column
  → list → fromWire{…,oemTireSizes} → active.oemTireSizes → TireFitmentSync ?fit= → tires filter
Home → <TiresBand> → getHomeTires(6) + getHomeTireBrands(8)  [throw-safe] → rail + brand tiles
```

## Error handling

- The migration is additive nullable — existing rows get `null`. Backend maps missing → `null`;
  storefront maps `null` → `undefined` (matches the other fitment fields).
- `getHomeTireBrands` returns `[]` on any failure (the tire adapter swallows Meili errors); the band
  degrades to `null` when there are no tires. No new failure surface.
- The toggle removal changes no routing logic — `fitmentDestinationUrl` is unchanged; only the source
  of `target` (context, not a control) changes.

## Testing

- **Backend:** extend the customer-vehicle service/validator tests to cover `oemTireSizes`
  round-tripping (create maps it; the schema accepts it). The existing `validators.test.ts` is the
  home for the schema case.
- **Storefront:** a `medusa-garage` `toWire`/`fromWire` round-trip unit test asserting `oemTireSizes`
  survives; `getHomeTireBrands` shape (top-N from facets). Gate: `tsc` + the named unit suites +
  `pnpm test:sync`/`test:fitment` where touched.
- **Live verification (the real proof):** after the migration, log in, add a vehicle, confirm
  `/tires` auto-applies `?fit=<oem sizes>` and filters (the network trace shows the `fit` param), and
  the tire PDP chip reads correctly.

## Out of scope

- Any change to the OEM-only match logic (exact size; unchanged).
- Guest (localStorage) path (already correct).
- Reworking the wheel funnel behavior beyond removing the toggle.
- A backfill of `oem_tire_sizes` for vehicles saved before this migration — users re-resolve on next
  vehicle add/select (the garage pane already re-resolves when data is missing); an explicit backfill
  is not built.

## References

- Root-cause files: `customer-vehicle` model/service/validators + `[id]` route; `medusa-garage.ts`;
  `TireFitmentSync`; `by-vehicle` route.
- Prior: WB-063 (forward tire fitment) added `oemTireSizes` to the storefront + guest path only;
  WB-064 (home rail) + WB-066 (toggle) are revised here.
