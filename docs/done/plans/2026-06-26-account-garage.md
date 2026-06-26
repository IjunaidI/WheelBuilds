# Account & Garage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the account section a Garage tab to manage saved vehicles, make the guest→login garage merge atomic (no silently-dropped vehicles), and remove the dead license-plate stub.

**Architecture:** A new `@dashboard/garage` parallel-route page renders a client `GarageManager` over the existing `useGarage()` hook (legacy account styling; "Add a vehicle" reuses the YMM search drawer). The guest→login merge becomes one idempotent `POST /store/customer/vehicles/merge` request; the storefront clears local only on success. The license-plate "coming soon" affordance is deleted.

**Tech Stack:** MedusaJS 2.13.6 (`customer-vehicle` module + store route, jest, zod), Next.js 15 / React 19 storefront (parallel routes, `useGarage` / `useSyncExternalStore`, `@medusajs/js-sdk`), legacy Medusa-UI Tailwind.

## Global Constraints

- **Account section uses legacy Medusa-UI Tailwind** (`text-2xl-semi`, `border-ui-border-base`, `@medusajs/ui`) — do NOT introduce WB `.frame` design-system classes here.
- **No `wb-`/`WB`/`wheelbuilds-` prefix** on dirs, files, exports, or CSS classes.
- **`MedusaService` create/update take a SINGLE object**, never `(selector, update)`.
- **Storefront server components by default**; `GarageManager`, `account-nav`, and the icon are client; the route page is a server component.
- **Store-route TS narrowing:** use `if (parsed.ok === false)` (NOT `if (!parsed.ok)`, which trips TS 5.9.3 discriminated-union narrowing).
- **Merge route import depth:** `src/api/store/customer/vehicles/merge/route.ts` → the module is `../../../../../modules/customer-vehicle` (FIVE `../`), the validators are `../validators`.
- **No data loss invariant:** never clear the local garage unless the merge request succeeded AND the remote account had loaded; the merge endpoint is idempotent so a retry never duplicates.
- **Commit trailer (every commit):** `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Branch: `feat/account-garage` (already created; spec committed there).
- Storefront tsc gate: **0 new errors** vs the 14 pre-existing on `main`. Backend tsc: the merge files must be clean.
- Windows: use `npx jest` / `npx vitest` / `npx tsc` directly; `pnpm` may not be on PATH. Quote the account route git path: `git add storefront/src/app/"[countryCode]"/"(main)"/account/@dashboard/garage/page.tsx`.

---

## File Structure

**Backend:**
- `backend/src/modules/customer-vehicle/service.ts` — add `mergeForCustomer`.
- `backend/src/api/store/customer/vehicles/validators.ts` — add `parseVehicleMerge`.
- `backend/src/api/store/customer/vehicles/merge/route.ts` — new `POST` handler.
- `backend/src/modules/customer-vehicle/__tests__/service.test.ts` — add `mergeForCustomer` tests.

**Storefront:**
- `storefront/src/lib/data/customer-vehicles.ts` — add `mergeVehicles`.
- `storefront/src/lib/garage/medusa-garage.ts` — add `mergeFrom`.
- `storefront/src/lib/garage/index.ts` — `mergeLocalIntoRemote` clear-on-success.
- `storefront/src/modules/common/icons/car.tsx` — new Car icon.
- `storefront/src/modules/account/components/garage/index.tsx` — new `GarageManager`.
- `storefront/src/app/[countryCode]/(main)/account/@dashboard/garage/page.tsx` — new route.
- `storefront/src/modules/account/components/account-nav/index.tsx` — add Garage link.
- `storefront/src/modules/search/components/search-drawer/find-by-vehicle/ymm-pane.tsx` — remove stub.

---

## Task 1: Backend garage merge (service + route + validator)

**Files:**
- Modify: `backend/src/modules/customer-vehicle/service.ts`
- Modify: `backend/src/api/store/customer/vehicles/validators.ts`
- Create: `backend/src/api/store/customer/vehicles/merge/route.ts`
- Test: `backend/src/modules/customer-vehicle/__tests__/service.test.ts`

**Interfaces:**
- Consumes: existing `CustomerVehicleService.createForCustomer(customerId, input)` (idempotent on `(customer_id, client_id)`); existing `VehicleCreateSchema` + `parseVehicleCreate` in `validators.ts`; `CUSTOMER_VEHICLE_MODULE`.
- Produces: `CustomerVehicleService.mergeForCustomer(customerId: string, vehicles: VehicleCreateInput[]): Promise<any[]>`; `parseVehicleMerge(body): { ok: true; data: { vehicles: VehicleCreateInput[] } } | { ok: false; error: string }`; `POST /store/customer/vehicles/merge` → `200 { vehicles }` | `401` | `400 { error: "invalid_merge" }`.

- [ ] **Step 1: Write the failing `mergeForCustomer` tests**

Append to `backend/src/modules/customer-vehicle/__tests__/service.test.ts`:
```ts
describe("mergeForCustomer batches idempotently", () => {
  function makeMergeService() {
    const rows: any[] = []
    const svc = new (CustomerVehicleService as any)({})
    svc.listCustomerVehicles = async (f: any) =>
      rows.filter(r => r.customer_id === f.customer_id && (f.client_id === undefined || r.client_id === f.client_id))
    svc.createCustomerVehicles = async (data: any) => { const row = { id: `id_${rows.length}`, ...data }; rows.push(row); return row }
    return { svc, rows }
  }

  it("creates all missing vehicles and returns the customer's full list", async () => {
    const { svc, rows } = makeMergeService()
    const out = await svc.mergeForCustomer("c1", [
      { client_id: "k1", year: 2021, make: "Ford", model: "F-150" },
      { client_id: "k2", year: 2020, make: "Honda", model: "Civic" },
    ])
    expect(rows.length).toBe(2)
    expect(out.length).toBe(2)
  })

  it("is idempotent — re-merging the same batch adds no duplicate rows", async () => {
    const { svc, rows } = makeMergeService()
    const batch = [{ client_id: "k1", year: 2021, make: "Ford", model: "F-150" }]
    await svc.mergeForCustomer("c1", batch)
    await svc.mergeForCustomer("c1", batch)
    expect(rows.length).toBe(1)
  })

  it("returns only the target customer's vehicles (cross-tenant isolation)", async () => {
    const { svc, rows } = makeMergeService()
    rows.push({ id: "x", customer_id: "c2", client_id: "z1" })
    const out = await svc.mergeForCustomer("c1", [{ client_id: "k1", year: 2021, make: "Ford", model: "F-150" }])
    expect(out.every((v: any) => v.customer_id === "c1")).toBe(true)
    expect(out.length).toBe(1)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx jest src/modules/customer-vehicle/__tests__/service.test.ts`
Expected: FAIL — `svc.mergeForCustomer is not a function`.

- [ ] **Step 3: Implement `mergeForCustomer`**

In `backend/src/modules/customer-vehicle/service.ts`, add this method inside the `CustomerVehicleService` class (after `createForCustomer`):
```ts
  /**
   * Idempotently merge a batch of vehicles into a customer's garage in one call.
   * Each is upserted via createForCustomer (idempotent on (customer_id, client_id)),
   * so re-merging the same batch adds no duplicates. Returns the customer's full list.
   */
  async mergeForCustomer(customerId: string, vehicles: any[]): Promise<any[]> {
    for (const v of vehicles) {
      await this.createForCustomer(customerId, v)
    }
    return this.listCustomerVehicles({ customer_id: customerId })
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest src/modules/customer-vehicle/__tests__/service.test.ts`
Expected: PASS (the 3 new cases + the existing activate/create/resolve cases).

- [ ] **Step 5: Add the merge validator**

In `backend/src/api/store/customer/vehicles/validators.ts`, append (it already imports `z` and defines `VehicleCreateSchema`):
```ts
export const VehicleMergeSchema = z.object({
  vehicles: z.array(VehicleCreateSchema),
})

export type VehicleMergeInput = z.infer<typeof VehicleMergeSchema>

export type MergeParseResult =
  | { ok: true; data: VehicleMergeInput }
  | { ok: false; error: string }

export function parseVehicleMerge(body: unknown): MergeParseResult {
  const r = VehicleMergeSchema.safeParse(body)
  if (!r.success) return { ok: false, error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }
  return { ok: true, data: r.data }
}
```

- [ ] **Step 6: Create the merge route**

`backend/src/api/store/customer/vehicles/merge/route.ts` (note the FIVE-level import depth and the `parsed.ok === false` narrowing):
```ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { CUSTOMER_VEHICLE_MODULE } from "../../../../../modules/customer-vehicle"
import { parseVehicleMerge } from "../validators"

const actor = (req: MedusaRequest) => (req as any).auth_context?.actor_id as string | undefined

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const customerId = actor(req)
  if (!customerId) { res.status(401).json({ error: "unauthorized" }); return }

  const parsed = parseVehicleMerge(req.body)
  if (parsed.ok === false) { res.status(400).json({ error: "invalid_merge", details: parsed.error }); return }

  const svc = req.scope.resolve(CUSTOMER_VEHICLE_MODULE) as any
  const vehicles = await svc.mergeForCustomer(customerId, parsed.data.vehicles)
  res.status(200).json({ vehicles })
}
```

- [ ] **Step 7: Typecheck + re-run module tests**

Run: `cd backend && npx tsc --noEmit`
Expected: no new errors from the merge route/validator/service (pre-existing backend errors elsewhere are out of scope).
Run: `cd backend && npx jest src/modules/customer-vehicle`
Expected: PASS (all customer-vehicle suites).

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/customer-vehicle backend/src/api/store/customer/vehicles
git commit -m "feat(garage): idempotent POST /store/customer/vehicles/merge + mergeForCustomer (WB-022)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

**Note (deferred live smoke):** with the backend running, `POST /store/customer/vehicles/merge` with `{ vehicles: [...] }` from an authed session returns 200 with the full list; a second identical POST adds no duplicate rows; an unauthenticated POST 401s.

---

## Task 2: Storefront atomic merge wiring

**Files:**
- Modify: `storefront/src/lib/data/customer-vehicles.ts`
- Modify: `storefront/src/lib/garage/medusa-garage.ts`
- Modify: `storefront/src/lib/garage/index.ts`

**Interfaces:**
- Consumes: `POST /store/customer/vehicles/merge` (Task 1); existing `planMerge(local, remote, loadOk): NewVehicle[]`; the module-private `genId`, `toWire`, `fromWire` in `medusa-garage.ts`.
- Produces: `mergeVehicles(vehicles: Wire[]): Promise<{ vehicles: any[] }>`; `MedusaGarage.mergeFrom(newVehicles: NewVehicle[]): Promise<boolean>`; `RoutingGarage.mergeLocalIntoRemote(): Promise<boolean>`.

- [ ] **Step 1: Add the merge data function**

In `storefront/src/lib/data/customer-vehicles.ts`, append (the file already defines the `Wire` type and imports `sdk`):
```ts
export const mergeVehicles = (vehicles: Wire[]) => sdk.client.fetch<{ vehicles: any[] }>("/store/customer/vehicles/merge", { method: "POST", body: { vehicles }, credentials: "include" })
```

- [ ] **Step 2: Add `mergeFrom` to MedusaGarage**

In `storefront/src/lib/garage/medusa-garage.ts`, add this method to the `MedusaGarage` class (e.g. after `add`):
```ts
  /**
   * Merge a batch of local vehicles into the account in ONE request. Mints a
   * client_id per vehicle, posts the batch, and only adopts the result on
   * success. Returns false (leaving state untouched) on failure so the caller
   * keeps the local garage and retries on the next auth sync. Empty input → true.
   */
  async mergeFrom(newVehicles: NewVehicle[]): Promise<boolean> {
    if (!newVehicles.length) return true
    const wire = newVehicles.map((nv) => toWire({ ...nv, id: genId(), savedAt: new Date().toISOString() }))
    try {
      const { vehicles } = await api.mergeVehicles(wire)
      this.vehicles = vehicles.map(fromWire)
      const active = vehicles.find((v: any) => v.is_active)
      this.activeId = active ? (active.client_id ?? active.id) : (this.vehicles[0]?.id ?? null)
      this.emit()
      return true
    } catch {
      return false
    }
  }
```

- [ ] **Step 3: Make `mergeLocalIntoRemote` clear-on-success**

In `storefront/src/lib/garage/index.ts`, replace the existing `mergeLocalIntoRemote` method:
```ts
  private async mergeLocalIntoRemote() {
    if (!this.remote) return
    const toAdd = planMerge(this.local.list(), this.remote.list(), this.remote.isLoaded())
    for (const nv of toAdd) this.remote.add(nv) // re-add through remote (mints client_id; idempotent server-side)
    if (this.remote.isLoaded()) this.local.clear() // only drop local once we know the account state
  }
```
with:
```ts
  private async mergeLocalIntoRemote(): Promise<boolean> {
    if (!this.remote) return false
    const toAdd = planMerge(this.local.list(), this.remote.list(), this.remote.isLoaded())
    const ok = await this.remote.mergeFrom(toAdd) // ONE idempotent request; false on failure
    if (ok) this.local.clear()                    // drop local ONLY after the merge persisted
    return ok
  }
```

- [ ] **Step 4: Gate `this.merged` on merge success**

In `storefront/src/lib/garage/index.ts`, inside `syncAuth`, replace:
```ts
      if (!this.merged && this.remote.isLoaded()) {
        await this.mergeLocalIntoRemote()
        this.merged = true
      }
```
with:
```ts
      if (!this.merged && this.remote.isLoaded()) {
        this.merged = await this.mergeLocalIntoRemote() // retry on a later syncAuth if the merge failed
      }
```

- [ ] **Step 5: Typecheck + unit run (no regression)**

Run: `cd storefront && npx tsc --noEmit`
Expected: 0 new errors vs the 14 pre-existing on `main`.
Run: `cd storefront && npx vitest run src/lib/garage/merge.test.ts`
Expected: PASS (the pure `planMerge` tests are unchanged).

- [ ] **Step 6: Commit**

```bash
git add storefront/src/lib/data/customer-vehicles.ts storefront/src/lib/garage/medusa-garage.ts storefront/src/lib/garage/index.ts
git commit -m "feat(garage): atomic guest→login merge — one request, clear local only on success (WB-022)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

**Note (deferred live smoke):** a guest with 3 vehicles who logs in ends up with all 3 in the account; a forced merge failure (e.g. offline) retains the local garage and re-merges (no duplicates) on the next auth sync.

---

## Task 3: GarageManager component + Car icon

**Files:**
- Create: `storefront/src/modules/common/icons/car.tsx`
- Create: `storefront/src/modules/account/components/garage/index.tsx`

**Interfaces:**
- Consumes: `useGarage()` (`{ vehicles, active, setActive, remove }`); `openSearch` (`@lib/stores/search-store`); `IconProps` (`types/icon`); `Plus` (`@medusajs/icons`).
- Produces: default export `GarageManager` (client component); default export `Car` icon.

- [ ] **Step 1: Create the Car icon**

`storefront/src/modules/common/icons/car.tsx` (mirrors `package.tsx`'s `IconProps` SVG-wrapper shape):
```tsx
import React from "react"

import { IconProps } from "types/icon"

const Car: React.FC<IconProps> = ({
  size = "20",
  color = "currentColor",
  ...attributes
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...attributes}
    >
      <path
        d="M3 11L4.2 7.6A2 2 0 0 1 6.1 6.3H13.9A2 2 0 0 1 15.8 7.6L17 11"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 11H17V14.2A0.5 0.5 0 0 1 16.5 14.7H15A1 1 0 0 1 14 13.7V13.2H6V13.7A1 1 0 0 1 5 14.7H3.5A0.5 0.5 0 0 1 3 14.2V11Z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="6.5" cy="13" r="0.7" fill={color} />
      <circle cx="13.5" cy="13" r="0.7" fill={color} />
    </svg>
  )
}

export default Car
```

- [ ] **Step 2: Create the GarageManager**

`storefront/src/modules/account/components/garage/index.tsx`:
```tsx
"use client"

import { Plus } from "@medusajs/icons"
import { useGarage } from "@lib/garage/use-garage"
import { openSearch } from "@lib/stores/search-store"

const GarageManager = () => {
  const { vehicles, active, setActive, remove } = useGarage()

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 mt-4">
        <button
          className="border border-ui-border-base rounded-rounded p-5 min-h-[140px] h-full w-full flex flex-col justify-between"
          onClick={openSearch}
          data-testid="add-vehicle-button"
        >
          <span className="text-base-semi">Add a vehicle</span>
          <Plus />
        </button>

        {vehicles.map((v) => {
          const isActive = v.id === active?.id
          return (
            <div
              key={v.id}
              className="border border-ui-border-base rounded-rounded p-5 min-h-[140px] h-full w-full flex flex-col justify-between"
              data-testid="vehicle-card"
            >
              <div className="flex flex-col gap-y-1">
                <span className="text-base-semi">
                  {v.year} {v.make} {v.model}
                </span>
                {v.trim && (
                  <span className="text-base-regular text-ui-fg-subtle">{v.trim}</span>
                )}
                {isActive && (
                  <span className="text-small-regular text-ui-fg-interactive">Active</span>
                )}
              </div>
              <div className="flex items-center gap-x-4 mt-4">
                {!isActive && (
                  <button
                    className="text-small-regular text-ui-fg-subtle hover:text-ui-fg-base"
                    onClick={() => setActive(v.id)}
                    data-testid="set-active-button"
                  >
                    Set as active
                  </button>
                )}
                <button
                  className="text-small-regular text-rose-500 hover:text-rose-700"
                  onClick={() => remove(v.id)}
                  data-testid="remove-vehicle-button"
                >
                  Remove
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {vehicles.length === 0 && (
        <p className="text-base-regular text-ui-fg-subtle mt-4">
          No vehicles saved yet — add one to see only the wheels that fit.
        </p>
      )}
    </div>
  )
}

export default GarageManager
```

- [ ] **Step 3: Typecheck**

Run: `cd storefront && npx tsc --noEmit`
Expected: 0 new errors. (The route that renders `GarageManager` lands in Task 4; the component compiles standalone.)

- [ ] **Step 4: Commit**

```bash
git add storefront/src/modules/common/icons/car.tsx storefront/src/modules/account/components/garage
git commit -m "feat(account): GarageManager component + car icon (WB-032)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Garage route + account-nav link

**Files:**
- Create: `storefront/src/app/[countryCode]/(main)/account/@dashboard/garage/page.tsx`
- Modify: `storefront/src/modules/account/components/account-nav/index.tsx`

**Interfaces:**
- Consumes: `GarageManager` (Task 3); `Car` icon (Task 3); `getCustomer` (`@lib/data/customer`); existing `AccountNavLink`, `LocalizedClientLink`, `ChevronDown`.

- [ ] **Step 1: Create the garage route page**

`storefront/src/app/[countryCode]/(main)/account/@dashboard/garage/page.tsx` (mirrors `@dashboard/orders/page.tsx` — server component, auth-guarded):
```tsx
import { Metadata } from "next"
import { notFound } from "next/navigation"

import GarageManager from "@modules/account/components/garage"
import { getCustomer } from "@lib/data/customer"

export const metadata: Metadata = {
  title: "Garage",
  description: "Manage your saved vehicles.",
}

export default async function Garage() {
  const customer = await getCustomer()

  if (!customer) {
    notFound()
  }

  return (
    <div className="w-full" data-testid="garage-page-wrapper">
      <div className="mb-8 flex flex-col gap-y-4">
        <h1 className="text-2xl-semi">Garage</h1>
        <p className="text-base-regular">
          Your saved vehicles. Set one active to see only the wheels confirmed to fit it.
        </p>
      </div>
      <GarageManager />
    </div>
  )
}
```

- [ ] **Step 2: Add the Car import to account-nav**

In `storefront/src/modules/account/components/account-nav/index.tsx`, add after the `Package` import (line 10):
```ts
import Car from "@modules/common/icons/car"
```

- [ ] **Step 3: Add the mobile Garage `<li>`**

In `account-nav/index.tsx`, in the MOBILE list (`data-testid="mobile-account-nav"`), insert this `<li>` between the Addresses `<li>` and the Orders `<li>`:
```tsx
                <li>
                  <LocalizedClientLink
                    href="/account/garage"
                    className="flex items-center justify-between py-4 border-b border-gray-200 px-8"
                    data-testid="garage-link"
                  >
                    <>
                      <div className="flex items-center gap-x-2">
                        <Car size={20} />
                        <span>Garage</span>
                      </div>
                      <ChevronDown className="transform -rotate-90" />
                    </>
                  </LocalizedClientLink>
                </li>
```

- [ ] **Step 4: Add the desktop Garage `<li>`**

In `account-nav/index.tsx`, in the DESKTOP list (`data-testid="account-nav"`), insert this `<li>` between the Addresses `<li>` and the Orders `<li>`:
```tsx
              <li>
                <AccountNavLink
                  href="/account/garage"
                  route={route!}
                  data-testid="garage-link"
                >
                  Garage
                </AccountNavLink>
              </li>
```

- [ ] **Step 5: Typecheck**

Run: `cd storefront && npx tsc --noEmit`
Expected: 0 new errors.

- [ ] **Step 6: Commit**

```bash
git add storefront/src/app/"[countryCode]"/"(main)"/account/@dashboard/garage/page.tsx storefront/src/modules/account/components/account-nav/index.tsx
git commit -m "feat(account): /account/garage route + Garage nav link (WB-032)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

**Note (deferred live smoke):** a logged-in user sees "Garage" in the account nav (desktop + mobile), navigates to `/account/garage`, manages vehicles, and "Add a vehicle" opens the YMM drawer; a logged-out user hitting `/account/garage` gets the login slot.

---

## Task 5: Remove the license-plate stub (WB-045)

**Files:**
- Modify: `storefront/src/modules/search/components/search-drawer/find-by-vehicle/ymm-pane.tsx`

- [ ] **Step 1: Delete the disabled license-plate block**

In `storefront/src/modules/search/components/search-drawer/find-by-vehicle/ymm-pane.tsx`, delete the entire `<Label>` block that renders the disabled license-plate affordance (it sits directly after the submit `<Button>` and before the form's closing `</form>`):
```tsx
      <Label
        tone="muted"
        style={{
          marginTop: 10,
          display: "block",
          textAlign: "center",
          letterSpacing: "0.06em",
        }}
      >
        OR{" "}
        <span
          aria-disabled
          title="License-plate lookup coming soon"
          style={{
            color: "var(--orange)",
            fontWeight: 600,
            opacity: 0.6,
            cursor: "not-allowed",
          }}
        >
          SEARCH BY LICENSE PLATE →
        </span>
      </Label>
```

- [ ] **Step 2: Remove a now-unused `Label` import if it is no longer referenced**

Check whether `Label` is still used elsewhere in `ymm-pane.tsx` (grep the file for `<Label`). If there are no other `<Label` usages, remove the `Label` import line; if there are, leave the import. (Do not remove imports still in use.)

- [ ] **Step 3: Typecheck**

Run: `cd storefront && npx tsc --noEmit`
Expected: 0 new errors (and no "unused import" — handled in Step 2; tsc doesn't fail on unused, but keep it clean).

- [ ] **Step 4: Commit**

```bash
git add storefront/src/modules/search/components/search-drawer/find-by-vehicle/ymm-pane.tsx
git commit -m "fix(garage): remove non-functional license-plate stub (WB-045)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

- [ ] `cd backend && npx jest src/modules/customer-vehicle` — green (merge + existing).
- [ ] `cd backend && npx tsc --noEmit` — no new errors from the merge files.
- [ ] `cd storefront && npx vitest run` — existing 100 pass (`planMerge` unchanged).
- [ ] `cd storefront && npx tsc --noEmit` — 0 new errors vs the 14 pre-existing on `main`.
- [ ] Grep `SEARCH BY LICENSE PLATE` storefront-wide → no matches.
- [ ] **Deferred to pre-deploy (live backend):** merge endpoint persists + idempotent + 401; guest→login merges all vehicles and survives a forced failure (retry, no dup); Garage tab lists/activates/removes and "Add a vehicle" opens the drawer; `/account/garage` 404s logged-out; no license-plate affordance renders.

## Self-review notes
- **Spec coverage:** WB-032 = Tasks 3+4 (component, icon, route, nav); WB-022 = Tasks 1+2 (backend merge + storefront clear-on-success); WB-045 = Task 5. All covered.
- **Type consistency:** `mergeForCustomer(customerId, vehicles[])` (backend) ↔ route posts `parsed.data.vehicles` ↔ storefront `mergeVehicles(wire[])` posts `{ vehicles }` ↔ `MedusaGarage.mergeFrom(NewVehicle[])` builds `wire` via `toWire`. `mergeLocalIntoRemote` now returns `Promise<boolean>`; `syncAuth` assigns it to `this.merged`.
- **No-data-loss:** local cleared only when `mergeFrom` returns true; `mergeFrom` returns true on empty input or a persisted batch, false on any throw; `planMerge` still returns `[]` against an unread account, so nothing is cleared before the account is known.
