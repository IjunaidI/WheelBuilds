# Account & garage (G7) — Design

> Date: 2026-06-26. Status: done (merged to `main` 2026-06-26). Pillar: Account/Garage. Work-group **G7**.
> Three changes to the authenticated account + garage surfaces. Backlog: **WB-032** (account
> Garage tab/route), **WB-022** (atomic guest→login garage merge), **WB-045** (remove the
> license-plate stub).

## Context

The garage feature works end-to-end (guest LocalStorage garage + authed MedusaGarage backed by the
`customer-vehicle` module + store routes from WB-002), but there is **no account home for it** and
the **guest→login merge can silently drop vehicles**.

Investigation:
- **Account routing** uses Next.js parallel routes: `account/layout.tsx` renders
  `<AccountLayout customer>{customer ? dashboard : login}</AccountLayout>`; dashboard sub-pages live
  under `account/@dashboard/<sub>/page.tsx` (profile, addresses, orders). The account section is
  **legacy Medusa-UI styled** (Tailwind utilities like `text-2xl-semi`, `@medusajs/ui` `clx`) — per
  [storefront/CLAUDE.md](../../../storefront/CLAUDE.md) we keep that styling here and do NOT mix in
  WB `.frame` classes.
- **Garage abstraction** (`storefront/src/lib/garage/`): `RoutingGarage` (the `garage` singleton)
  routes to `LocalStorageGarage` (guest) or `MedusaGarage` (authed). `useGarage()` exposes
  `{ vehicles, active, add, update, remove, setActive }`. On login, `syncAuth()` →
  `mergeLocalIntoRemote()` calls the pure, unit-tested `planMerge(local, remote, loadOk)` (YMM-dedup;
  returns `NewVehicle[]`) then does `for (const nv of toAdd) this.remote.add(nv)` — i.e. **N
  best-effort fire-and-forget POSTs** (`MedusaGarage.add` does `void api.createVehicle(...).catch(()=>{})`)
  — and then `this.local.clear()` **optimistically**. A failed POST drops that vehicle for good.
- **Backend** `customer-vehicle` module has `createForCustomer(customerId, input)` — **idempotent on
  `(customer_id, client_id)`** — plus list/create/[id]/[id]/activate store routes, all auth'd by
  `actor(req) = req.auth_context?.actor_id`.
- **License plate**: `search-drawer/find-by-vehicle/ymm-pane.tsx` renders a disabled
  "OR SEARCH BY LICENSE PLATE →" `<Label>` ("coming soon", `cursor:not-allowed`). No plate→YMM
  provider exists (real plate decode needs a paid commercial API + state).

**Principle** (same as G2/G3/G4): reuse the existing abstraction and the one canonical add-vehicle
flow; honest UI (no dead chrome); pure logic stays in tested helpers.

---

## Part 1 · Account Garage tab + route (WB-032)

### Route — `account/@dashboard/garage/page.tsx`
Mirror the existing `@dashboard/orders/page.tsx` structure exactly (server component): `await
getCustomer()`; `notFound()` if absent; render the standard account heading block (`<h1
className="text-2xl-semi">Garage</h1>` + a `text-base-regular` description) and `<GarageManager />`.
Metadata `{ title: "Garage", description: "..." }`.

### Component — `@modules/account/components/garage/index.tsx` (`"use client"`)
Reads `useGarage()`. Renders, in **legacy account styling** (match `address-book`'s card/border
look — `border border-gray-200 rounded-rounded p-5`, `text-base-semi`, `small:grid-cols-2` grid):
- One card per vehicle: `YEAR MAKE MODEL` (+ `Trim` when present); an **Active** badge when
  `vehicle.id === active?.id`, else a "Set as active" button (`setActive(id)`); a **Remove** button
  (`remove(id)`).
- An **"Add a vehicle"** action (a bordered add-tile button, like address-book's "New address"):
  `onClick={openSearch}` (from `@lib/stores/search-store`) — opens the existing YMM search drawer,
  the single canonical add-vehicle path (it also runs the wheel-size fitment lookup). The drawer is
  already mounted on `(main)` (which includes account), so no extra wiring.
- Empty state when `vehicles.length === 0`: a short prompt ("No vehicles saved yet — add one to see
  only the wheels that fit.") above the add-tile.

`GarageManager` is presentational over `useGarage()` — no new data layer. (`update` is available on
the hook but the tab does not expose rename/notes editing this round — YAGNI; add/remove/activate
cover the need.)

### Nav — `@modules/account/components/account-nav/index.tsx`
Add a "Garage" entry to BOTH lists, between Addresses and Orders:
- Desktop `<ul>`: an `<AccountNavLink href="/account/garage" ...>Garage</AccountNavLink>`.
- Mobile `<li>`: the icon+label+chevron row pattern, using a new **Car** icon.
- New icon `@modules/common/icons/car.tsx` mirroring the existing `package.tsx` wrapper (`IconProps`
  from `types/icon`, simple stroke SVG).

---

## Part 2 · Atomic guest→login garage merge (WB-022)

Replace the N-fire-and-forget merge with one request that the storefront only commits to (clears
local) on success.

### Backend
- **`CustomerVehicleService.mergeForCustomer(customerId, vehicles[])`**: loop the existing idempotent
  `createForCustomer` over each input vehicle, then `return this.listCustomerVehicles({ customer_id:
  customerId })`. Idempotent end-to-end (re-merging the same batch adds no duplicate rows — the
  `(customer_id, client_id)` guard short-circuits). Vehicles are created **inactive** (unchanged
  invariant; the merge never changes the active selection).
- **Route `POST /store/customer/vehicles/merge`** (`backend/src/api/store/customer/vehicles/merge/route.ts`):
  `actor(req)` → 401 if absent; parse `{ vehicles: VehicleCreateSchema[] }` via a new
  `parseVehicleMerge` added to the existing `validators.ts`; `400 { error: "invalid_merge" }` on a
  bad body; `svc.mergeForCustomer(customerId, parsed.data.vehicles)` → `200 { vehicles }`.
- **Test** (`customer-vehicle/__tests__/service.test.ts`): `mergeForCustomer` creates all missing,
  is idempotent (second identical merge → same row count), and returns the full customer list. (Mock
  list/create like the existing `createForCustomer` tests.)

Why not a DB transaction / workflow: createForCustomer's idempotency + clear-local-only-on-success
(below) already guarantee **no vehicle is ever dropped** — a partial failure leaves local intact and
the next `syncAuth` retries the whole batch, skipping the already-created rows. True single-transaction
atomicity is a possible future hardening, not needed to fix the silent-drop bug (noted as a follow-up).

### Storefront
- **`lib/data/customer-vehicles.ts`**: add `mergeVehicles(vehicles: Wire[])` →
  `sdk.client.fetch<{ vehicles: any[] }>("/store/customer/vehicles/merge", { method: "POST", body: {
  vehicles }, credentials: "include" })`.
- **`MedusaGarage.mergeFrom(newVehicles: NewVehicle[]): Promise<boolean>`**: if empty, return `true`
  (nothing to do). Otherwise mint a `client_id` per vehicle (reuse the existing `genId` + `toWire`
  shape), `await api.mergeVehicles(wire)`; on success replace `this.vehicles` from the response via
  `fromWire` + `emit()` + return `true`; on any throw return `false` (leave state untouched).
- **`RoutingGarage.mergeLocalIntoRemote`**: compute `toAdd = planMerge(this.local.list(),
  this.remote.list(), this.remote.isLoaded())`; `const ok = await this.remote.mergeFrom(toAdd)`;
  **`if (ok) this.local.clear()`** (was: clear unconditionally after firing N adds). On `!ok`, local
  is retained; the next `syncAuth` retries. `this.merged` is set only when the merge path runs to
  success (so a failed merge can retry on a later `syncAuth`).

The pure `planMerge` / `vehiclesToMerge` (already unit-tested) are unchanged — the only behavior
change is the transport (one request) and the clear-on-success guard.

---

## Part 3 · Remove the license-plate stub (WB-045)

Delete the disabled "OR SEARCH BY LICENSE PLATE →" `<Label>` block from `ymm-pane.tsx` (the `OR …
SEARCH BY LICENSE PLATE` element after the submit button). No other change to the pane. Honest — no
non-functional "coming soon" chrome (same stance as WB-035's hidden express-pay buttons). File
**WB-058** (real plate→YMM provider) as a deferred follow-up.

---

## Units (subagent tasks, ≈5)
1. **Backend merge** — `mergeForCustomer` + `parseVehicleMerge` + `POST .../vehicles/merge` route +
   jest test.
2. **Storefront merge wiring** — `mergeVehicles` data fn + `MedusaGarage.mergeFrom` +
   `RoutingGarage` clear-on-success.
3. **GarageManager** component + `car.tsx` icon.
4. **Garage route + nav** — `@dashboard/garage/page.tsx` + account-nav Garage link (desktop+mobile).
5. **Remove license-plate stub** (WB-045).

Ordering: 1→2 (route before storefront transport); 3→4 (component before the route that renders it);
5 independent.

## Out of scope (explicit)
- A real plate→YMM lookup provider (→ WB-058).
- A "Your Garage" summary card on the account Overview dashboard.
- Rename/notes editing of saved vehicles from the account tab.
- True single-DB-transaction merge atomicity (idempotent-retry already prevents data loss).
- Restyling the account section into the WB design system.

## Verification
- Backend: `cd backend && npx jest src/modules/customer-vehicle` (new `mergeForCustomer` cases green;
  existing pass) + `npx tsc --noEmit` (merge files clean).
- Storefront: `cd storefront && npx vitest run` (existing 100 pass; `planMerge` unchanged) +
  `npx tsc --noEmit` (0 new errors vs the 14 pre-existing on `main`).
- **Deferred to pre-deploy (live backend):** a guest with 3 saved vehicles logs in → all 3 appear in
  the account and survive reload; a forced merge-request failure retains local and re-merges on the
  next auth sync with no duplicates; the Garage tab lists vehicles, sets active, and removes; "Add a
  vehicle" opens the YMM drawer and the new vehicle appears; `/account/garage` 404s for a logged-out
  user (login slot); no license-plate affordance renders in the drawer.

## File inventory
**New**
- `backend/src/api/store/customer/vehicles/merge/route.ts`
- `storefront/src/modules/account/components/garage/index.tsx`
- `storefront/src/app/[countryCode]/(main)/account/@dashboard/garage/page.tsx`
- `storefront/src/modules/common/icons/car.tsx`

**Modified**
- `backend/src/modules/customer-vehicle/service.ts` (`mergeForCustomer`)
- `backend/src/api/store/customer/vehicles/validators.ts` (`parseVehicleMerge`)
- `backend/src/modules/customer-vehicle/__tests__/service.test.ts` (merge tests)
- `storefront/src/lib/data/customer-vehicles.ts` (`mergeVehicles`)
- `storefront/src/lib/garage/medusa-garage.ts` (`mergeFrom`)
- `storefront/src/lib/garage/index.ts` (`mergeLocalIntoRemote` clear-on-success)
- `storefront/src/modules/account/components/account-nav/index.tsx` (Garage link)
- `storefront/src/modules/search/components/search-drawer/find-by-vehicle/ymm-pane.tsx` (remove stub)
