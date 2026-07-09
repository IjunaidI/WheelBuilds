# Retire the Garage — single cached vehicle (WB-076)

**Date:** 2026-07-09 · **Status:** approved (user, in-session) · **Branch:** `feat/retire-garage-cached-vehicle`

## Decision

The client reports the account-backed Garage is effectively never used — shoppers pick their car
as guests and go. Direction (user-approved):

- **No more garage, logged in or not.** No saved-vehicles list, no account Garage page, no DB sync.
- **One active vehicle per browser**, stored only in the localStorage cache. The Year/Make/Model
  picker sets/replaces it; all fitment filtering (Discovery `?fit=`, tire discovery, PDP fit view,
  checkout fit card) keeps reading that cached vehicle.
- **Comment out — don't delete** — the garage machinery, with greppable `GARAGE-DISABLED` markers,
  so the feature can be restored later. The last working state was committed first (`fd6b450`:
  activate() transaction fix, authed vehicle-write headers, same-page fit-nav deadlock fix).

## Architecture

### What stays live

- `GarageProvider` seam, `Vehicle`/`NewVehicle` types, `useGarage()` hook, `LocalStorageGarage`
  (untouched), `vehicle-data.ts`, fitment resolve/strip-fit logic — every fitment consumer reads
  only `active` from `useGarage()` and keeps compiling untouched.
- Storage keys `garage:vehicles` / `garage:active` stay the same, so existing visitors keep their
  currently-active vehicle across the deploy.

### New: `SingleVehicleGarage` (`storefront/src/lib/garage/single-vehicle-garage.ts`)

Small subclass of `LocalStorageGarage` enforcing "the cache holds at most one vehicle":

- `add(v)` → adds the new vehicle, removes every previously-stored vehicle, sets the new one
  active. First `add()` after deploy naturally collapses any legacy multi-vehicle list to one.
- Everything else (`update`, `remove`, `setActive`, `getActive`, `list`, `subscribe`,
  `isLoaded`=true) inherits unchanged.
- The singleton in `lib/garage/index.ts` becomes `new SingleVehicleGarage()`.

### Commented out (`GARAGE-DISABLED` markers at every seam)

Storefront:
- `lib/garage/index.ts` — `RoutingGarage` class + `MedusaGarage`/`merge`/`getCustomer` imports.
- `lib/garage/medusa-garage.ts`, `lib/garage/merge.ts`, `lib/garage/garage-auth-sync.tsx`,
  `lib/data/customer-vehicles.ts` — whole-file comment-out.
- `(main)/layout.tsx` — `GarageAuthSync` mount + its `getCustomer()` call.
- `use-garage.ts` — the `onGarageError` toast wiring (its source module is disabled).
- Search drawer: `find-by-vehicle/garage-pane.tsx` whole-file; `find-by-vehicle/index.tsx` loses
  the From-My-Garage/YMM tab pair (YMM renders directly, plus a "Current: <vehicle> · Clear" row
  when a vehicle is set — `remove(active.id)` clears the cache).
- Account: `@dashboard/garage/page.tsx` route disabled (404; original body commented),
  `components/garage/index.tsx` (GarageManager) whole-file, both `account-nav` Garage links.
- Tests for mothballed code: `medusa-garage.test.ts`, `routing-identity.test.ts` whole-file
  commented (they import the disabled classes). `local-storage-garage.test.ts` stays; a new
  `single-vehicle-garage.test.ts` covers the replace-on-add contract.
- Any Playwright e2e specs touching `/account/garage` or `data-testid="garage-link"`.

Backend (module source, migrations, unit tests all stay intact — `test:fitment` stays green):
- `medusa-config.js` — `{ resolve: './src/modules/customer-vehicle' }` commented out.
- `src/api/store/customer/vehicles/**/route.ts` (list/create, [id], [id]/activate, merge) —
  contents commented out; any `middlewares.ts` entries for those paths likewise. Verified the
  backend still boots/builds with export-less route files (fallback if not: minimal 410 handler
  above the commented original).
- `src/scripts/backfill-garage-bore.ts` — header note only (manual script; requires the module
  re-registered to run).

### De-garage wording (user-facing strings)

- Nav pill: "Vehicle · 2023 Ford Bronco" / "Vehicle · Select a vehicle" (component keeps its
  file name; label + aria text change).
- Home hero: "USE MY GARAGE (N SAVED)" / "BUILD YOUR GARAGE" → "CHANGE VEHICLE" / "SELECT
  VEHICLE"; `vehicles` no longer destructured.
- Checkout empty-cart: "Open my Garage" → "Select your vehicle".
- Order-completed "Add to your Garage" tile → vehicle-cache framing (or dropped if it makes no
  sense without an account).
- Drawer header keeps "Find by Vehicle". Internal code comments referencing the garage store are
  left alone; only user-visible copy changes.

## Error handling

localStorage is synchronous: `isLoaded()` is always true, `loadError()` always null, so the
loading/error branches in consumers (pill, FitmentSync strip guard) become dormant but stay
correct. No network writes remain, so the toast error channel is disabled with MedusaGarage.

## Testing & verification

1. New vitest: `SingleVehicleGarage.add()` replaces, keeps exactly one vehicle, new one active;
   legacy multi-vehicle localStorage collapses on first add.
2. Full suites: storefront `pnpm test:unit`, backend `pnpm test:fitment` (+ other jest scripts),
   `npx tsc --noEmit` (5-error baseline), `pnpm build:next`.
3. Backend boots with the module unregistered and routes commented (dev boot or `medusa build`).
4. Live smoke: pick vehicle via YMM → `/store?fit=…` filters; switch vehicle (replaces); Clear
   vehicle; `/account` shows no Garage entry; `/account/garage` 404s; `/store/customer/vehicles`
   no longer routes.

## Restoration recipe (kept in this spec on purpose)

Grep `GARAGE-DISABLED`, uncomment every marked seam, re-register the backend module, swap the
singleton back to `RoutingGarage`, restore the drawer tabs/account links, un-comment the tests.
DB tables were never dropped; migrations never removed.

## Out of scope

Deleting the customer-vehicle tables or data; renaming the `lib/garage` directory or the
`garage:*` storage keys (cheap continuity, invisible to users); redesigning the YMM pane.
