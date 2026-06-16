# wheel-size.com Fitment + Persistent Garage — Design Spec

**Date:** 2026-05-30
**Status:** Approved (pending written-spec review)
**Plan reference:** [`STOREFRONT_PHASE2_PLAN.md`](../plans/2026-05-23-storefront-phase2.md) §"Next — closing the discovery loop" (Spec 2). Inherits the safe-fit window from Spec 1 design [§D7](2026-05-28-fitment-ready-catalog-search-design.md).

This is **Spec 2 of 2**. Spec 1 ([fitment-ready catalog + faceted search](2026-05-28-fitment-ready-catalog-search-design.md)) shipped the substrate; this spec closes the discovery loop's final step — **fitment-match** — and adds a persistent, account-backed garage.

---

## 1. Goal

Close the discovery loop: **land → browse → filter → sort → add vehicle → see only wheels that fit.** Spec 1 delivered everything up to "add vehicle." This spec makes "add vehicle" pull the vehicle's wheel spec from wheel-size.com and filter Discovery (and answer "does this fit?" on PDP) against the canonical bolt-pattern join key Spec 1 already indexes — and persists the shopper's garage to their account once they log in.

### What "done" looks like

A shopper adds their vehicle (Year/Make/Model → trim/modification) in the search drawer. From that moment:
- **Discovery** (`/store`) shows only wheels whose canonical bolt pattern matches the vehicle (auto-applied; an explicit "Show all wheels" opt-out is always available).
- **PDP** shows whether *this* wheel fits *their* vehicle (a parametric comparison — no extra API call).
- The **garage** survives device changes once they log in (guest garage in `localStorage` copies up into the account on login).

### The fitment model (parametric spec-match, inherited from Spec 1 §D6/§D7)

wheel-size.com's `by_model` returns *the vehicle's* wheel spec. Spec 1 indexes the same dimensions on every wheel in the exact canonical form. So "does this wheel fit?" is a parametric comparison, not a lookup table:

```
vehicle (wheel-size.com)              wheel (our Meilisearch index / Medusa variant)
  bolt_pattern  "5x114.3"     ==      bolt_patterns_canonical    (exact — HARD gate, enforced in Discovery)
  centre_bore   64.1mm        <=      center_bore_mm             (wheel bore >= hub; HARD gate, enforced on PDP)
  rim_diameter  17-20" (OE+)  ⊇       wheel_diameter_in          (SOFT window — informational on PDP)
  rim_width     7-9"          ⊇       wheel_width_in             (SOFT window — informational on PDP)
  rim_offset    ET35 ± N      ~       offset_mm                  (SOFT window — informational on PDP)
```

**Terminology — two distinct "fitment" objects** (kept apart deliberately, since they collide in conversation):
- **`VehicleFitment`** — *the vehicle's* spec (bolt pattern, hub bore, windows), fetched from `by_model`. **Fully populated** this spec; it drives both the Discovery constraint and the PDP `fitsVehicle` check (including the soft windows).
- **`ProductDetail.fitment[]`** (`FitmentEntry[]`) — the "this wheel fits *these* vehicles" confirmed-models list, a `by_rim` artifact. **Stays empty this spec** (D7). The empty array is not "windows unused" — it is only the reverse-lookup list we defer.

---

## 2. Decisions

The seven open design decisions from the plan's §"Next", plus the parity strategy and scope, as resolved in brainstorming (2026-05-30):

| # | Decision | Choice |
|---|---|---|
| D0 | **Scope** | **Full Spec 2** — fitment match **+** persistent garage. The fitment match closes the loop; the persistent garage is the "+ persistent garage" half. Both ship together. |
| D1 | **Bolt-pattern parity** (highest-risk unit) | **Re-derive through `canonicalBoltPatterns`.** Feed wheel-size.com's structured `(stud_holes, pcd)` into our existing backend `canonicalBoltPatterns` so query-side and index-side run the *same* algorithm. **Drift-proof for PCDs that snap to a standard; a residual risk remains for non-standard PCDs** (see §4 + the Task-1 gate). `by_model` runs server-side, so the function is imported directly (no new twin on the backend). |
| D2 | **Cache shape + retention** | **Two-tier, cache-everything-user-touched, never auto-evict.** Tier 1 = cataloging (makes/models/years/modifications) — **lazy read-through**, populated by user actions, cached indefinitely. Tier 2 = `by_model` fitment, raw JSON **+ denormalized projection**, keyed by `(modification slug, region)`. Retention: indefinite (fitment is static per modification); manual flush only. *(Cron-warming of cataloging is a pending-confirmation pre-launch item, not built by default — see §10.)* |
| D3 | **First-render UX (no vehicle)** | **Unchanged — soft prompt only.** Discovery renders unfiltered; the Vehicle band shows the existing "Pick a vehicle for fitment" prompt. No auto-open, no inline capture. *(Governs the no-vehicle render only; the with-vehicle behavior is D5.)* |
| D4 | **No-data / quota fallback** | **Distinct paths, counter-authoritative.** *Quota exhaustion* is an outage we own (own persisted daily counter vs the ceiling) → fitment endpoint `503` → **"fitment temporarily unavailable — contact support."** *Genuine no-data* (a `200` with empty fitment) → persist a `not_found` sentinel → **"fitment data unavailable for this vehicle"** + shop unfiltered. An empty body with a non-2xx status is **always** an outage, never `not_found`. |
| D5 | **Auto-apply vs toggle** | **Auto-apply whenever a vehicle is active. No *remembered preference* toggle** — auto-apply is the default; the `fit=0` "Show all wheels" off-switch is **transient URL state**, not a persisted setting. A client *fitment-sync island* materializes the active vehicle's clauses into the URL. |
| D6 | **Garage migration / architecture** | **Hybrid router + optimistic sync cache.** Guest → `LocalStorageGarage`; authed → `MedusaGarage`. On login, merge the guest garage into the account (dedup by `year+make+model+trim`), then the account is source of truth. `MedusaGarage` keeps the **synchronous** `GarageProvider` interface via an in-memory mirror + background persistence (client mints the id). Interface gains one additive `update(id, patch)`. |
| D7 | **PDP fitment data source** | **Parametric active-vehicle fit only.** "Does this wheel fit my {vehicle}?" computed from the active vehicle's cached `VehicleFitment` vs the wheel's canonical pattern + bore + size. **No `by_rim` call**, no per-wheel cache. `ProductDetail.fitment[]` (the confirmed-models list) stays empty/deferred. |
| D8 | **Safe-fit enforcement (Spec 1 §D7)** | **Hard gates split by surface.** Discovery `vehicleConstraint` enforces **only** the exact canonical bolt-pattern gate (clean array-`IN`). Hub-bore (`≤`) and the diameter/width/offset window are evaluated **per-variant on PDP**. The Discovery grid is therefore a **candidate superset** on the bolt-pattern gate; PDP is authoritative (see §9 for the grid-passes / PDP-bore-fails UX). |

---

## 3. Architecture & data flow

Two new backend modules, two new store route groups, one storefront garage swap, plus Discovery + PDP wiring. The substrate is mostly dormant rather than missing — **no re-index is required to activate the bolt-pattern join** (`bolt_patterns_canonical`, `center_bores`, `offsets` are already `filterableAttributes`, and [`get-products.ts:69`](../../../storefront/src/modules/discovery/data/get-products.ts) already AND-s `q.vehicleConstraint` into every query). **Caveat:** if Task 1 reveals non-standard PCDs that require extending `STANDARD_PCDS` (§4/§12), that *is* a one-time re-index/backfill.

```
                         wheel-size.com  (Basic tier, user_key, API v2)
        Cataloging (lazy read-through) │              │ Search (human-initiated only)
                                       ▼              ▼
backend/src/modules/wheel-size/  ── WheelSizeService ───────────────────────────────┐
  • client.ts    (params → raw JSON; surfaces status + empty-body for quota detect)  │
  • normalize.ts (raw by_model JSON → VehicleFitment;                                │  two-tier
                  imports canonicalBoltPatterns) ◄────── PARITY-CRITICAL             │  Postgres cache
  • models: wheel_size_catalog (T1), wheel_size_fitment (T2: raw + projection + status)
  • quota counter (persisted row/Redis — authoritative outage signal)
                                       │
              ┌────────────────────────┴───────────────────────┐
   /store/vehicle-catalog/*  (YMM dropdowns, cataloging)   /store/fitment/by-vehicle  (only by_model trigger)
              │                                                 │
              ▼                                                 ▼
   ymm-pane async dropdowns           MedusaGarage stores VehicleFitment projection + modification slug on the row
                                                                │
backend/src/modules/customer-vehicle/ ── CustomerVehicleService (CRUD, scoped to auth actor)
  • model: customer_vehicle (rows keyed by customer_id, client_id; + modification_slug + fitment projection)
  • /store/customer/vehicles/*  (list / create / [id] delete+update / [id]/activate — single-active invariant)
                                                                │
storefront/src/lib/garage/  ── index.ts router: guest→LocalStorageGarage, authed→MedusaGarage (merge-on-login)
  • medusa-garage.ts (NEW): optimistic sync cache; client-minted id; background persist
  • provider.ts: + update(id, patch)   • types.ts: Vehicle += canonicalBoltPatterns[], hubBoreMm, windows, modificationSlug
                          │                                       │
              Discovery (auto-apply)                          PDP (parametric)
   vehicleToConstraints(vehicle) → ['(bolt_patterns_canonical = "5x114.3" OR …)']
   fitment-sync island keeps ?fit ⇄ active vehicle        fitsVehicle(product, vehicle) replaces the
   parseQueryFromSearchParams → vehicleConstraint            make&&model heuristic in fitment/index.tsx
   get-products.ts:69 already consumes it
```

### Units (each independently testable, one clear job)

| Unit | Type | Input → Output | Depends on |
|---|---|---|---|
| `client.ts` | backend | request params → raw wheel-size.com JSON + status | `fetch`, `WHEEL_SIZE_API_KEY` |
| `normalize.ts` | **pure** | raw `by_model` JSON → `VehicleFitment` | **imports `canonicalBoltPatterns`** (parity) |
| `WheelSizeService` | backend | orchestrates client + cache + quota counter (read → miss → call → write) | the 2 cache tables, counter store |
| `CustomerVehicleService` | backend | CRUD over `customer_vehicle`, scoped by `customer_id`, single-active | MedusaService |
| store route handlers | backend | thin; resolve service, `res.json` | the two services |
| `MedusaGarage` | storefront | optimistic sync `GarageProvider` | a `lib/data` wrapper → store routes |
| garage singleton router | storefront | guest vs authed selection + merge-on-login | both providers, auth probe |
| `vehicleToConstraints` | **pure** | `Vehicle` → Meilisearch clause `string[]` | the shared `lit()` escaper (leaf module) |
| fitment-sync island | storefront (client) | reconciles `?fit` ⇄ active vehicle on `/store` | `useGarage`, router |
| `fitsVehicle` matcher | **pure** | (product canonical patterns + bore + sizes, vehicle fitment) → verdict | storefront `canonicalBoltPatterns` twin |

---

## 4. Backend — `wheel-size` module

`backend/src/modules/wheel-size/`, conditionally loaded on `WHEEL_SIZE_API_KEY` presence — the Stripe/Resend truthiness idiom (not the `*_ENABLED === 'true'` idiom). Standalone module flavor (`Module(NAME, { service })`, `MedusaService` auto-CRUD), exactly like `vendor-sync`. **API version is pinned to v2** (where `by_model` returns the `technical` block with `bolt_pattern` + `pcd` + `centre_bore`); `WHEEL_SIZE_BASE_URL` defaults to the v2 base.

| File | Role |
|---|---|
| `index.ts` | `export const WHEEL_SIZE_MODULE = "wheelSizeModuleService"` + `export default Module(WHEEL_SIZE_MODULE, { service: WheelSizeService })` |
| `client.ts` | Thin `fetch` wrapper; injects `user_key`; maps the `by_model` + cataloging endpoints; **returns the HTTP status + whether the body was empty** so the service can classify quota-outage vs no-data |
| `normalize.ts` | **Pure, parity-critical.** `(raw by_model JSON) → VehicleFitment`. Imports `canonicalBoltPatterns` from `modules/vendor-sync/search/bolt-pattern-canonical` and feeds it `` `${stud_holes}x${pcd}` ``. Reads hub bore **defensively** (`technical.centre_bore`, falling back to a top-level `centre_bore`) and **logs/flags when absent** so a path change can't silently null the bore gate. Builds soft windows from `wheels[]`, skipping `null` rim values; the aftermarket window = min/max over `is_stock:false` entries (front+rear merged); window = `null` (not zero-width) when only OEM rows exist |
| `service.ts` | `class WheelSizeService extends MedusaService({ WheelSizeCatalog, WheelSizeFitment })`. Constructor `(container, options)` reads `options.apiKey / baseUrl / defaultRegion`. Cataloging methods read-through `wheel_size_catalog` (**lazy**, populated on demand); `getFitment(...)` reads-through `wheel_size_fitment`, miss → `client` → classify → `normalize` → write. Owns the **quota counter** |
| `models/wheel-size-catalog.ts` | Tier-1 cache: `model.define("wheel_size_catalog", { id, kind, key, payload: json, fetched_at }).indexes([{ on: ["kind","key"], unique: true }])`. `fetched_at` is for observability / manual-flush only — **no auto-TTL** |
| `models/wheel-size-fitment.ts` | Tier-2: `cache_key` (**`modification_slug + region`**, unique); `raw: json`; projection `canonical_bolt_patterns: json`, `hub_bore_mm: number nullable`, `diameter_window/width_window/offset_window: json nullable`; `status` (`ok`\|`not_found`); `fetched_at` (observability only) |
| `migrations/` | `Migration<ts>.ts` + tracked `.snapshot-wheel-size-module.json` |

```ts
// the normalized contract every storefront surface consumes
type VehicleFitment = {
  status: "ok" | "not_found"
  canonicalBoltPatterns: string[]        // ["5x114.3"] — canonicalBoltPatterns(`${stud_holes}x${pcd}`)
  hubBoreMm: number | null               // technical.centre_bore (defensive read; logged if absent)
  diameterWindow: { min: number; max: number } | null   // PDP soft window; null when OEM-only
  widthWindow:    { min: number; max: number } | null
  offsetWindow:   { min: number; max: number } | null
  source: { modificationSlug: string; region: string }  // modificationSlug REQUIRED — it is the cache key
}
```

### Parity mechanics and the non-standard-PCD risk

wheel-size.com returns both a `bolt_pattern` string (`"5x114.3"`) and structured `stud_holes` + `pcd` (float). We do **not** trust the string. `normalize.ts` builds `` `${stud_holes}x${pcd}` `` and passes it through the imported `canonicalBoltPatterns`, which re-snaps to the nearest standard PCD. For **standard** PCDs this is drift-proof: an OEM `114.0` the index snapped to `114.3` also snaps to `114.3` here.

**The residual risk (must be measured in Task 1).** `canonicalBoltPatterns`' `snap()` only snaps within `1.0mm` of an entry in `STANDARD_PCDS`; for a PCD farther than that, it passes the rounded value through unchanged. The two sides start from **different sources**: the index computes from `bolt_circle_in` (inches × 25.4), wheel-size supplies native `pcd` (mm). For a non-standard PCD they can round to different 0.1mm values with **no standard to snap them together** — a silent zero-result mismatch. Real examples in this catalog's truck scope, both **absent** from `STANDARD_PCDS`:

| Vehicle PCD | wheel-size `pcd` → canonical | vendor `bolt_circle_in` → canonical | Result |
|---|---|---|---|
| 6×132 (GM/Hummer) | `132` → `6x132` | `5.2"` → `132.08` → `6x132.1` | **mismatch** |
| 8×180 (GM 2500/3500 HD) | `180` → `8x180` | `7.1"` → `180.34` → `8x180.3` | **mismatch** |

**Remediation (decided by Task-1 data, not guessed now):** if Task 1 confirms the divergence on a non-standard-PCD truck, extend `STANDARD_PCDS` to cover the catalog's actual PCD vocabulary (132, 180, …) so both sides snap identically — **a one-time re-index** of `bolt_patterns_canonical`. (A coarser snap window or a numeric-tolerance join are fallbacks.) Until then, the spec does **not** claim parity for non-standard PCDs. Dual-drill vehicles yield multiple canonical entries, matched by Meilisearch array-`IN`.

---

## 5. Backend — `customer-vehicle` module

`backend/src/modules/customer-vehicle/`, **loaded unconditionally** (no external dependency; a bare `{ resolve }` entry in the `modules` array — a new but valid variation, since every current custom module is gated).

- `index.ts` — `CUSTOMER_VEHICLE_MODULE = "customerVehicleModuleService"` + `Module(...)`.
- `service.ts` — `class CustomerVehicleService extends MedusaService({ CustomerVehicle })` → auto `list/create/update/deleteCustomerVehicles`. **Use the single-object `update` shape** (`updateCustomerVehicles({ id, ...fields })`). `activate(id, customerId)` sets the target active **and clears `is_active` on the customer's other rows in the same transaction** (single-active invariant).
- `models/customer-vehicle.ts` — `model.define("customer_vehicle", { id, customer_id (text), client_id (text — the client-minted crypto.randomUUID so optimistic adds reconcile), year (number), make, model, trim (nullable), modification_slug (text nullable — so a saved vehicle can re-read/re-trigger its fitment cache row), is_active (boolean default false), canonical_bolt_patterns (json nullable), hub_bore_mm (number nullable), diameter_window/width_window/offset_window (json nullable), fitment_status (text nullable), notes (text nullable) }).indexes([{ on: ["customer_id"] }, { on: ["customer_id","client_id"], unique: true }])`. The fitment projection is **denormalized onto the row** so the garage carries its own fitment without a re-derive.
- `migrations/` + `.snapshot-customer-vehicle-module.json`.

---

## 6. Backend — store API routes

File-based routing under `src/api/store/`, public via `STORE_CORS`.

| Route | Method | Backs | Notes |
|---|---|---|---|
| `/store/vehicle-catalog/makes` | GET | YMM make dropdown | **Cataloging** — lazy read-through cache |
| `/store/vehicle-catalog/models?make=` | GET | model dropdown | cataloging |
| `/store/vehicle-catalog/years?make=&model=` | GET | year dropdown | cataloging |
| `/store/vehicle-catalog/modifications?make=&model=&year=` | GET | trim/modification dropdown → yields the **modification slug** | cataloging |
| `/store/fitment/by-vehicle?modification=&region=` | GET | the `VehicleFitment` lookup | **The only `by_model` trigger.** A store request = human-initiated by definition. `503` on quota outage |
| `/store/customer/vehicles` | GET / POST | garage list / add | **scoped to `auth_context.actor_id`** |
| `/store/customer/vehicles/[id]` | DELETE / POST | remove / update | scoped; `update` writes the fitment projection |
| `/store/customer/vehicles/[id]/activate` | POST | set-active | scoped; enforces single-active |

**Slug correctness.** Because the dropdowns are sourced from wheel-size's own cataloging, the user's selection carries the `modification` slug straight into `by_model`, into the cache key, and onto the saved `customer_vehicle.modification_slug` — eliminating name-resolution misses ("Chevrolet" vs "Chevy") entirely, and letting a saved vehicle re-resolve its fitment later. A retired/renamed slug is treated as a cache miss → re-fetch.

**Pre-build spike (alongside Task 1, see §12):** confirm Medusa's store customer-auth middleware populates `auth_context.actor_id` on these custom `/store/*` routes. This gates the **security and correctness** of the entire authed-garage half (the CRUD must never trust a client-supplied `customer_id`); a negative result reshapes the route design (explicit auth-middleware registration), so it is verified *before* committing to the route shape, not mid-build.

**Wiring.** Add `WHEEL_SIZE_API_KEY` (+ `WHEEL_SIZE_BASE_URL`, `WHEEL_SIZE_REGION`) to [`src/lib/constants.ts`](../../../backend/src/lib/constants.ts) as bare `process.env` (no `assertValue` — optional/conditional). Import into [`medusa-config.js`](../../../backend/medusa-config.js); add the wheel-size conditional block + the customer-vehicle unconditional entry to the `modules` array. After the change: `rm -rf backend/.medusa/server`; run migrations (`medusa db:migrate` — not auto on `dev`). Note: `medusa-config.js` logs the resolved config on load, so `WHEEL_SIZE_API_KEY` prints to startup logs (acceptable; flagged).

---

## 7. Storefront — persistent garage

### Provider interface (additive change)

```ts
// provider.ts — one new method; interface stays synchronous
export interface GarageProvider {
  list(): Vehicle[]
  add(v: NewVehicle): Vehicle
  update(id: string, patch: Partial<NewVehicle>): Vehicle   // NEW — write fitment projection back
  remove(id: string): void
  setActive(id: string | null): void
  getActive(): Vehicle | null
  subscribe(listener: () => void): () => void
}
```

**Atomic type migration.** `Vehicle` ([`types.ts`](../../../storefront/src/lib/garage/types.ts)) **replaces** the placeholder `boltPattern?: string`/`hubBore?: string` with structured fitment fields: `canonicalBoltPatterns?: string[]`, `hubBoreMm?: number`, `diameterWindow?/widthWindow?/offsetWindow?`, `fitmentStatus?: "ok"|"not_found"`, `modificationSlug?: string`. A grep confirms **no current consumer reads `boltPattern`/`hubBore`** (the PDP heuristic keys off `make`/`model` strings), so removal is safe — but the `types.ts` field replacement, the `provider.ts` widening, `LocalStorageGarage`+`MedusaGarage` implementing `update()`, and the §9 `fitsVehicle` swap must land **as one atomic change-set** so the old heuristic and new fields never coexist.

### `MedusaGarage` (NEW — `medusa-garage.ts`)

Keeps the **synchronous** interface via an in-memory mirror:
- `list()/getActive()` read the mirror synchronously (so `useSyncExternalStore`'s sync `getSnapshot` is satisfied).
- `add()` mints the id client-side (`crypto.randomUUID`), updates the mirror, and **returns the `Vehicle` synchronously** (so `ymm-pane`'s next-line `setActive(vehicle.id)` works), then POSTs to `/store/customer/vehicles` in the background and `emit()`s on reconcile.
- `update()/remove()/setActive()` are optimistic + background-persisted. Because the server keys rows by the client-minted `client_id` (unique per customer), an `update`/`remove` that arrives before the create POST resolves is **order-independent** server-side — no create-before-update sequencing needed.
- Every mutation **replaces the vehicles array** (new identity) so the hook's reference-equality cache re-renders.
- **Durability:** SPA navigations within the app keep the module-level singleton (and its mirror) alive, so optimistic state survives client-side navigation. The one gap is a **hard reload before a POST resolves** — accepted; mitigated because `ymm-pane` awaits nothing user-blocking and the POST is fast. Init-load is SSR-guarded: the mirror starts empty (matching `getServerSnapshot`'s `EMPTY_SNAPSHOT`), loads on client boot, and `emit()`s.

### Singleton router + merge-on-login ([`index.ts`](../../../storefront/src/lib/garage/index.ts))

The `garage` export becomes a delegating router that selects `LocalStorageGarage` (guest) or `MedusaGarage` (authed).
- **Auth detection:** on client boot the router probes the existing customer data-layer (`retrieveCustomer()` from `lib/data/customer`); a non-null customer → `MedusaGarage`.
- **Login transition (not just boot):** because login happens *after* boot, the router also re-checks after the storefront's login Server Action completes (the login flow notifies the singleton, e.g. via the existing customer mutation path / a small event), switching the delegate and running merge.
- **Merge-on-login (idempotent, dedup'd):** for each guest vehicle, **skip** if an account vehicle with the same `year+make+model+trim` already exists; otherwise POST it (the guest `client_id` is reused as the row's `client_id`; a `(customer_id, client_id)` conflict is treated as "already merged" → ignore). After a successful merge, **clear the local garage** (so a second login is a no-op). The account is then source of truth.
- The `garage` export stays stable — **no changes to the (nine) `useGarage()` call sites**, including `checkout/components/fitment-verified-card`. `LocalStorageGarage` is retained as the anonymous path and offline fallback.

### YMM pane ([`ymm-pane.tsx`](../../../storefront/src/modules/search/components/search-drawer/find-by-vehicle/ymm-pane.tsx)) — intentionally rewired

Dropdowns swap from static [`vehicle-data.ts`](../../../storefront/src/lib/garage/vehicle-data.ts) to async `/store/vehicle-catalog/*` (cascading, with loading states). On submit: `add()` the vehicle, then fetch `/store/fitment/by-vehicle` (with the modification slug) and `update()` the vehicle with the projection + `modificationSlug`, then route to `/store` with the fit param appended (§8 URL contract). `vehicle-data.ts` is kept only as a small offline fallback seed. `garage-pane.tsx` appends the same fit param on its route-out (consistency). *(This is the "does change" surface; it is unrelated to D3, which governs the no-vehicle first render, and to the "no consumer changes" claim, which is scoped to the `useGarage()` call sites.)*

---

## 8. Storefront — Discovery auto-apply

### URL contract (the single source of truth for fitment filter state)

| Key | Value | Meaning |
|---|---|---|
| `fit` | **absent** | no fitment constraint |
| `fit` | canonical patterns, CSV — e.g. `fit=5x114.3,5x120` | fitment ON; these patterns build the constraint |
| `fit` | `0` (reserved sentinel) | fitment explicitly OFF ("Show all wheels") |

Carrying the patterns themselves (not a flag, not a vehicle id) keeps `parseQueryFromSearchParams` **pure** — it has everything it needs to build the clause from the URL alone, with no garage or meili access.

- **`vehicleToConstraints(vehicle): string[]`** — pure. Reads `vehicle.canonicalBoltPatterns` → returns a **single parenthesized-OR element** so `buildFilters` AND-s it correctly: `['(bolt_patterns_canonical = "5x114.3" OR bolt_patterns_canonical = "5x120")']`. **Bolt-pattern only** (D8). Empty patterns → `[]` (fail-open). It lives in a **client-safe location** (`storefront/src/modules/discovery/data/vehicle-constraint.ts`) and uses a `lit()` escaper that is **moved out of `get-products.ts` into a leaf module** (`discovery/data/escape.ts`, no `server-only` deps) and imported by *both* `get-products.ts` and this helper — so the client bundle never transitively pulls the `server-only` meili client.
- **`parseQueryFromSearchParams`** ([`types.ts`](../../../storefront/src/modules/discovery/data/types.ts)) reads `fit`: `0` or absent → no `vehicleConstraint`; otherwise split the CSV → build the OR clause. Stays pure. [`get-products.ts:69`](../../../storefront/src/modules/discovery/data/get-products.ts) already consumes `vehicleConstraint`.
- **Fitment-sync island** — a small `"use client"` component in the Discovery template, the auto-apply mechanism (the server can't read `localStorage`). On mount and on active-vehicle change it reconciles the URL against the active vehicle in **three cases**:
  1. active vehicle **&&** `fit` absent **&&** `fit !== "0"` → `router.replace` adding `fit=<active patterns>`.
  2. **no** active vehicle **&&** `fit` present → remove `fit`.
  3. active vehicle **&&** `fit` present **but its patterns ≠ the active vehicle's** (e.g. the active vehicle was deleted/edited and another auto-activated) → `router.replace` with the active vehicle's patterns.
  **Precedence:** `fit=0` is authoritative — the island never overwrites it (case 1's `fit !== "0"` guard). A bare background-reconcile `emit()` that doesn't change *which* vehicle is active produces no URL change (the reconcile is idempotent / no-op when patterns already match), so repeated emits don't thrash `router.replace`. `remove(active)`/`update(active)` re-run this reconcile, so the URL never filters by a deleted or stale vehicle.
- **Off-switch** — `fit=0`, surfaced as a removable **`Fits: {year make model}`** chip in `active-chips` and a **"Show all wheels"** link in the Vehicle band (replacing the [`filter-sections.tsx:138`](../../../storefront/src/modules/discovery/components/filter-rail/filter-sections.tsx) toggle TODO; the band shows "Showing wheels that fit {vehicle} · Show all" when active, the existing soft prompt when not). Picking a *new* vehicle (route-out tail) sets `fit=<patterns>`, intentionally clearing a prior `fit=0`.
- **Accepted trade-off (flash):** because SSR renders an empty garage, *direct* navigation to `/store` with a *pre-existing* active vehicle shows a brief unfiltered render before the island filters. This is a **superset → subset narrowing** (it shows *more* wheels, then narrows — never *wrong* wheels), so it is cosmetic, not a fitment-correctness hole. The route-out tails cover the common "pick → /store" path (no flash). A server-readable cookie was considered and rejected — it breaks this codebase's "URL is the source of truth for filter state" convention and shareable URLs.

---

## 9. Storefront — PDP parametric fit

- **`fitsVehicle(product, vehicle): FitVerdict`** — pure. **Hard gates:** the active vehicle's `canonicalBoltPatterns` intersect the product's canonical patterns; `vehicle.hubBoreMm ≤ product.specs.centerBoreMm`. **Soft window (informational):** the product's diameters/widths/offsets fall within the vehicle's windows. Returns `{ fits, hardGatesPass, withinWindow, reasons }`.
- **`get-product.ts`** adds `boltPatternsCanonical: string[]` to `ProductDetail`, computed via the storefront `canonicalBoltPatterns` **twin** (a byte-equivalent copy of the backend function, kept in lockstep — see §11). `fitment: []` **stays empty** (D7 — parametric-only; no `by_rim` list this spec).
- **`fitment/index.tsx`** swaps its make&&model equality ([`fitment/index.tsx:30-36`](../../../storefront/src/modules/product-detail/components/fitment/index.tsx)) for `fitsVehicle(product, active)`, enriching the three existing branches with the reason and the soft-window notes.
- **The Discovery-passes / PDP-bore-fails case (made explicit):** because Discovery gates on bolt-pattern only and PDP additionally applies the bore hard-gate, a wheel can appear in the fit-filtered grid yet read **"doesn't fit your {vehicle}"** on PDP. This is **intended** — the grid is a candidate set; PDP is authoritative. A wheel bore *smaller* than the hub bore is a genuine no-fit (the wheel won't seat), so PDP states "doesn't fit — wheel bore is smaller than your vehicle's hub" rather than a soft caveat. `DiscoveryProduct.fitsActiveVehicle` stays unset on grid cards (the filter itself is the bolt-pattern signal).

---

## 10. Error handling, resilience, and TOS

### Failure modes (each distinct, each with its own user signal)

| Condition | Detection | User sees |
|---|---|---|
| **Quota exhausted** (an outage we own) | Our **own persisted daily counter** vs the ceiling (authoritative) **plus** any empty-body-with-non-2xx response (observed `403`; rate-limit headers are **not** guaranteed). Daily exhaustion returns an empty body — so the counter + status, not the body alone, is the signal | Fitment endpoint `503` + code; storefront shows **"fitment temporarily unavailable — contact support."** Catalog still browses; the fit layer is visibly errored (never silently "everything fits") |
| **Genuine no-data** (vehicle absent / no spec for trim) | A **`200` with empty fitment** (distinct from the empty-body-non-2xx outage) | Persist `status:"not_found"` sentinel (don't re-call); **"fitment data unavailable for this vehicle"** + shop unfiltered |
| **wheel-size 5xx / network** | client retry w/ backoff, then give up | transient "try again" (distinct from the two above) |
| **Meilisearch failure / malformed clause** | existing swallow → `emptyResult` | empty grid; mitigated — `vehicleToConstraints` builds clauses via the shared `lit()` escaper (unit-tested); empty-state copy distinguishes "no wheels fit your vehicle" from a generic miss |
| **Garage background-persist fails** | `MedusaGarage` keeps optimistic local state + retries | subtle "couldn't sync garage" toast; the vehicle is never lost |

**Classification rule (resolves the empty-body ambiguity):** `200` + empty fitment → `not_found`; **empty body + non-2xx → outage** (`503`), regardless of which 4xx; counter-exhausted → outage even if a response looks like a no-match. We never classify an empty body as `not_found`.

**The quota counter** is load-bearing, so it is specified, not hand-waved: stored in a **Postgres row (or Redis)** — never in-process (would be wrong under `WORKER_MODE`/multi-instance); **atomically incremented** on every billable wheel-size call (`by_model` + any cataloging miss); reset at wheel-size's quota boundary (**00:00 GMT**, confirmed in Task 1); and capped at `MIN(overall ceiling, by_model sub-cap)` — because higher tiers impose a separate `by_model` sub-quota and Basic's is **unconfirmed** (Task 1 item).

### TOS, structural not promissory

- **Cataloging** (makes/models/years/modifications) — **lazy read-through, populated by user actions**, cached indefinitely. This matches the agreed stance: *what a user's action touches is ours to cache.* **Cron-warming cataloging is NOT built by default** — the TOS only explicitly carves the human-initiation requirement for *Search*, and its "no automated scripts" clause is broad; warming is demoted to a **pending-written-confirmation pre-launch item**. Lazy cataloging fully closes the loop without it.
- **Search** (`by_model`) — the **only** trigger is `/store/fitment/by-vehicle`, hit from a real user session. **No scheduled job calls `by_model`.** (`by_rim` is not built this spec.)
- One-time legal items (Russia governing law, $100 liability cap, AS-IS data disclaimer, **+ cataloging-warming confirmation**) are a **pre-launch checklist note**, not code — flagged, not blocking the build.

---

## 11. Units, isolation, and testing

Within the repo's actual gates: backend jest (`pnpm test:sync`), storefront `tsc`/`lint`/`build:next` (no storefront unit runner today — this spec adds a minimal one for the pure fitment units).

### Backend jest (extends the existing search triad)
- **`normalize.ts`** — the parity unit. Golden fixtures from the Task-1 vehicles → expected `VehicleFitment` with exact canonical strings (**including the non-standard-PCD truck**). Cross-checked against the existing `canonicalBoltPatterns` golden vectors.
- `WheelSizeService` cache (read-through, miss→write, `not_found` sentinel persistence) and the **quota/no-data classifier** (200-empty vs non-2xx-empty vs counter-exhausted).
- `client.ts` against recorded fixtures (no live calls in tests).

### Storefront vitest (NEW, minimal — pure units only)
- **`vehicleToConstraints`** (vehicle → exact clause string), **`fitsVehicle`** (verdict), and the **`canonicalBoltPatterns` twin**.
- **The "third twin" risk is resolved by test:** a **shared golden-vector fixture** (`canonicalBoltPatterns` inputs→outputs, including any newly-added non-standard PCDs) that *both* the backend jest **and** the storefront vitest assert against. The day the twin drifts, a test goes red. (Same discipline as the existing `normalize-finish` twin.)

### Live verification (Spec 1 §9 style, against the dev DB + Meilisearch)
1. **Task 1 gate** passes (see §12).
2. Add a vehicle → `/store` shows only matching wheels; disjunctive facet counts reflect the fitment scope.
3. "Show all wheels" (`fit=0`) clears the filter without un-setting the active vehicle; deleting the active vehicle removes the stale filter (island case 2/3).
4. PDP shows the correct "fits / doesn't fit your {vehicle}" with reason, including a deliberate bore-fail case.
5. Login merges the guest garage with **no duplicates**; a second login is a no-op; logout falls back to `localStorage`; a second device shows the account garage.
6. Forced quota (counter override) → contact-support `503`; catalog still browses.
7. Obscure vehicle → `200`-empty → `not_found` path → "fitment unavailable" + unfiltered.

---

## 12. Task 1 — the validation gate (highest-risk-first)

**Before any other Spec 2 work.** With a free Sandbox key (moderated ~2–4h to issue), a throwaway script hits `by_model` (v2) for **~6 known vehicles** — a `5x114.3` sedan, a dual-drill case, a hub-centric truck, two everyday models (e.g. 2021 Ford F-150, 2016 Mitsubishi Outlander), **and a non-standard-PCD truck (6×132 or 8×180)** — and records:

1. Their `bolt_pattern` **and** `` canonicalBoltPatterns(`${stud_holes}x${pcd}`) `` vs the value indexed for a known matching wheel — **including the non-standard-PCD truck**, to measure the §4 divergence and decide whether to extend `STANDARD_PCDS` (one-time re-index).
2. The **exact JSON paths** (for v2) of `centre_bore`, `stud_holes`, `pcd`, `bolt_pattern`, and `wheels[].is_stock` — and confirm `centre_bore` is the **vehicle hub bore** (not the OEM wheel bore).
3. The OEM-vs-aftermarket window structure in `wheels[]` (`is_stock` flags; null-rear handling).
4. **The exact quota-exhaustion signal** (HTTP status — expected `403` — + empty body) **vs a genuine no-match** (`200` + empty fitment); **whether Basic has a separate `by_model` sub-quota** and at what number; and the quota reset boundary/timezone.
5. **(Pre-build spike, §6)** that Medusa's store customer-auth middleware populates `auth_context.actor_id` on a custom `/store/*` route against the running dev backend.

Outputs (recorded fixtures + the confirmed signals) become the backend test fixtures. **If parity fails for standard PCDs, fix `canonicalBoltPatterns`/`normalize` before building anything else.** If it fails only for non-standard PCDs, extend `STANDARD_PCDS` + re-index as the first build step. The whole spec rides on this join.

---

## 13. Explicitly out of scope

Tires and the tire grouping rule; TPMS; the `by_rim` "fits these vehicles" confirmed-models list; MAP enforcement; shipping / checkout / tax / drop-ship / RMA; brand landing pages; the category facet; the Discovery price-range `<Slider>`; real product photography; set-of-4 quick-add; and the entire Tier 1 / 3 / 4 / 5 deferred backlog. Audience remains **B2C consumers**; the B2B portal is out of scope.

---

## 14. Risks / notes

- **Bolt-pattern format drift is the single highest risk** — mitigated by re-deriving through `canonicalBoltPatterns` (same algorithm both sides) for standard PCDs, the shared golden-vector fixture test, and the Task-1 live validation. **Non-standard PCDs (6×132, 8×180) are a known residual gap** — re-deriving does *not* reconcile them because the inch-sourced index value and native-mm `pcd` can round apart with no standard to snap to. Task 1 measures it; remediation is extending `STANDARD_PCDS` + a one-time re-index. A silent mismatch returns zero rows with no error, so this stays a *guarded, tested, measured* join.
- **API version is v2** (the `technical` block with `bolt_pattern`/`pcd`/`centre_bore` is a v2 feature). `normalize.ts` reads `centre_bore` defensively and logs when absent so a v1/v2 path difference can't silently disable the bore gate.
- **The `canonicalBoltPatterns` storefront twin** (for the PDP check) is a third lockstep copy alongside the `normalize-finish` twin. The shared golden-vector test is the guard; document it next to the existing twin note in `storefront/CLAUDE.md`.
- **Quota is our responsibility to prevent** — the persisted daily counter (`MIN(overall, by_model sub-cap)`) + monitoring is load-bearing, not decorative. The app is "useless without fitment," so exhaustion is treated as an outage, not a soft fallback.
- **`auth_context.actor_id` on `/store/*`** is a **pre-build spike**, not a mid-build discovery — a negative result reshapes the customer-vehicle route design.
- **Cataloging cron-warming** is deferred to a pre-launch legal confirmation; the build ships lazy read-through, which both closes the loop and matches the agreed "user-initiated → ours to cache" stance.
- **`.medusa/server` stale-config trap** — after editing `medusa-config.js`, clear `backend/.medusa/server` before restart or the new module blocks won't load.
- **SSR flash** on direct `/store` nav with a pre-existing active vehicle is a superset→subset narrowing (never wrong wheels) — accepted to keep URL-as-truth; mitigated by route-out tails on the common path.
