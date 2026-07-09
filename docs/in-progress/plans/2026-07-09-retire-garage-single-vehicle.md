# Retire Garage → Single Cached Vehicle (WB-076) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Disable the account/DB garage everywhere (restorable via `GARAGE-DISABLED` seams); the storefront keeps exactly one active vehicle in the localStorage cache and all fitment filtering reads it.

**Architecture:** Swap the `garage` singleton from `RoutingGarage` (localStorage + Medusa account sync) to a new `SingleVehicleGarage` (localStorage, max one vehicle). The mothballed classes (`RoutingGarage`, `MedusaGarage`, `merge`) stay compiled and unit-tested but leave the app import graph; every app-graph seam is a literal commented-out line with a `GARAGE-DISABLED (WB-076)` marker. Backend: module unregistered, routes become 410 stubs with originals commented in place.

**Tech Stack:** Next.js 15 / React 19 storefront (vitest), MedusaJS 2.13.6 backend (jest).

## Global Constraints

- No `wb-` prefixes on identifiers (repo rule).
- Every disabled seam carries the exact marker string `GARAGE-DISABLED (WB-076)` so `grep GARAGE-DISABLED` finds the restoration points.
- localStorage keys stay `garage:vehicles` / `garage:active` (existing visitors keep their active vehicle).
- No user-visible string may say "Garage"/"garage" after Task 3 (code comments exempt).
- Storefront tsc baseline is 5 pre-existing errors — do not add to it.
- Backend `pnpm test:fitment` must stay green (module unit tests keep running).

---

### Task 1: `SingleVehicleGarage` (TDD)

**Files:**
- Create: `storefront/src/lib/garage/single-vehicle-garage.ts`
- Test: `storefront/src/lib/garage/single-vehicle-garage.test.ts`

**Interfaces:**
- Consumes: `LocalStorageGarage` (unchanged), `NewVehicle`/`Vehicle` from `./types`.
- Produces: `class SingleVehicleGarage extends LocalStorageGarage` with `add(v: NewVehicle): Vehicle` overridden to replace-and-activate. Task 2 instantiates it as the singleton.

- [ ] **Step 1: Write the failing test** — mirror `installFakeWindow` from `local-storage-garage.test.ts` (vitest runs `environment: "node"`):

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { SingleVehicleGarage } from "./single-vehicle-garage"
import { LocalStorageGarage } from "./local-storage-garage"
import type { NewVehicle } from "./types"

function installFakeWindow(): { uninstall: () => void } {
  const store = new Map<string, string>()
  const fakeWindow = {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
    },
    crypto: { randomUUID: () => `id_${store.size}_${Math.random().toString(36).slice(2, 10)}` },
    addEventListener: () => {},
  }
  ;(globalThis as any).window = fakeWindow
  return { uninstall: () => { delete (globalThis as any).window } }
}

const vehicle = (over: Partial<NewVehicle> = {}): NewVehicle =>
  ({ year: 2022, make: "Ford", model: "F-150", savedAt: "t", ...over }) as any

let fake: { uninstall: () => void }
beforeEach(() => { fake = installFakeWindow() })
afterEach(() => { fake.uninstall() })

describe("SingleVehicleGarage — the cache holds at most one vehicle", () => {
  it("add() on an empty cache stores one vehicle and makes it active", () => {
    const g = new SingleVehicleGarage()
    const v = g.add(vehicle())
    expect(g.list()).toHaveLength(1)
    expect(g.getActive()?.id).toBe(v.id)
  })

  it("add() replaces the existing vehicle — exactly one remains, the new one, active", () => {
    const g = new SingleVehicleGarage()
    g.add(vehicle({ make: "Ford" }))
    const jeep = g.add(vehicle({ make: "Jeep", model: "Wrangler" }))
    expect(g.list()).toHaveLength(1)
    expect(g.list()[0].make).toBe("Jeep")
    expect(g.getActive()?.id).toBe(jeep.id)
  })

  it("collapses a legacy multi-vehicle localStorage list on the first add()", () => {
    const legacy = new LocalStorageGarage()
    legacy.add(vehicle({ make: "A" })); legacy.add(vehicle({ make: "B" })); legacy.add(vehicle({ make: "C" }))
    const g = new SingleVehicleGarage()
    const v = g.add(vehicle({ make: "New" }))
    expect(g.list()).toHaveLength(1)
    expect(g.getActive()?.id).toBe(v.id)
  })

  it("inherited remove() clears the cache and the active pointer", () => {
    const g = new SingleVehicleGarage()
    const v = g.add(vehicle())
    g.remove(v.id)
    expect(g.list()).toHaveLength(0)
    expect(g.getActive()).toBeNull()
  })

  it("inherited update() patches the single vehicle in place", () => {
    const g = new SingleVehicleGarage()
    const v = g.add(vehicle())
    g.update(v.id, { trim: "Raptor" } as any)
    expect(g.getActive()?.trim).toBe("Raptor")
    expect(g.list()).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run to verify failure** — `cd storefront; pnpm test:unit -- single-vehicle-garage` → FAIL (module not found).
- [ ] **Step 3: Minimal implementation:**

```ts
import { LocalStorageGarage } from "./local-storage-garage"
import type { NewVehicle, Vehicle } from "./types"

/**
 * GARAGE-DISABLED (WB-076): the garage (multi-vehicle list + account sync)
 * is retired. This provider enforces the replacement contract — the
 * localStorage cache holds AT MOST ONE vehicle, always the active one.
 * add() replaces whatever was stored (the first add after deploy collapses
 * any legacy multi-vehicle list). Same storage keys as LocalStorageGarage,
 * so pre-existing active vehicles survive. To restore the garage, see the
 * GARAGE-DISABLED seams listed in
 * docs/in-progress/specs/2026-07-09-retire-garage-single-vehicle-design.md.
 */
export class SingleVehicleGarage extends LocalStorageGarage {
  add(v: NewVehicle): Vehicle {
    const previousIds = this.list().map((p) => p.id)
    const vehicle = super.add(v)
    previousIds.forEach((id) => this.remove(id))
    this.setActive(vehicle.id)
    return vehicle
  }
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm test:unit -- single-vehicle-garage` → 5 passed.
- [ ] **Step 5: Commit** — `feat(wb-076): SingleVehicleGarage — cache holds at most one vehicle`

---

### Task 2: Singleton swap + take the account layer out of the app graph

**Files:**
- Create: `storefront/src/lib/garage/routing-garage.ts` (the `RoutingGarage` class + its docblocks moved VERBATIM out of `index.ts`, with its imports: `GarageProvider`, types, `LocalStorageGarage`, `MedusaGarage`, `getCustomer`, `planMerge`; exports `RoutingGarage` and the `RemoteGarage` type)
- Modify: `storefront/src/lib/garage/index.ts` (becomes ~20 lines, below)
- Modify: `storefront/src/lib/garage/__tests__/routing-identity.test.ts:10` — `import { RoutingGarage } from "../index"` → `from "../routing-garage"`
- Modify: `storefront/src/lib/garage/use-garage.ts:6,18-20` — comment out the `onGarageError` import and the toast wiring block with the marker
- Modify: `storefront/src/app/[countryCode]/(main)/layout.tsx` — comment out `GarageAuthSync` import, `getCustomer` import+call, and the mount line
- Modify: `storefront/src/lib/garage/garage-auth-sync.tsx` — stays compiled but unmounted; if it calls `garage.syncAuth()` unconditionally, change to `(garage as { syncAuth?: () => Promise<void> }).syncAuth?.()` so it typechecks against the new singleton

**Interfaces:**
- Produces: `export const garage: GarageProvider = new SingleVehicleGarage()` from `lib/garage/index.ts`; type re-exports unchanged (`Vehicle`, `NewVehicle`, `GarageProvider`). `useGarage()` shape unchanged.

- [ ] **Step 1: New `index.ts`:**

```ts
import type { GarageProvider } from "./provider"
import { SingleVehicleGarage } from "./single-vehicle-garage"

// GARAGE-DISABLED (WB-076, 2026-07-09): the account-backed garage is retired.
// The singleton was `new RoutingGarage()` (localStorage + Medusa account sync
// + login merge — see ./routing-garage.ts, kept compiled and unit-tested).
// Today the cache holds exactly one vehicle, guest or logged in. To restore:
// swap the export back and re-enable every GARAGE-DISABLED seam (grep it).
// export const garage: GarageProvider & { syncAuth?: () => Promise<void> } = new RoutingGarage()
export const garage: GarageProvider = new SingleVehicleGarage()

export type { Vehicle, NewVehicle } from "./types"
export type { GarageProvider } from "./provider"
```

- [ ] **Step 2: Move `RoutingGarage` to `routing-garage.ts`** — copy class + `RemoteGarage` type + all explanatory comments verbatim; header comment: `// GARAGE-DISABLED (WB-076): out of the app import graph — only routing-identity.test.ts imports this. Kept compiled + tested for restoration.`
- [ ] **Step 3: use-garage.ts** — comment out lines 6 and 18–20 (`onGarageError` import + `if (typeof window …) { onGarageError(...) }`) with the marker; MedusaGarage's toast channel has no live writer now.
- [ ] **Step 4: layout.tsx** — result:

```tsx
import { Metadata } from "next"

import Footer from "@modules/layout/templates/footer"
import Nav from "@modules/layout/templates/nav"
import SearchMount from "@modules/search/components/search-mount"
import { getBaseURL } from "@lib/util/env"
// GARAGE-DISABLED (WB-076): account garage sync unmounted — the active
// vehicle lives only in the browser cache now.
// import { getCustomer } from "@lib/data/customer"
// import GarageAuthSync from "@lib/garage/garage-auth-sync"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"

export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
}

export default async function PageLayout(props: { children: React.ReactNode }) {
  // GARAGE-DISABLED (WB-076): const customer = await getCustomer()
  return (
    <TooltipProvider delayDuration={150} skipDelayDuration={300}>
      <div className="frame">
        {/* GARAGE-DISABLED (WB-076): <GarageAuthSync customerId={customer?.id ?? null} /> */}
        <Nav />
        {props.children}
        <Footer />
        <SearchMount />
      </div>
      <Toaster position="bottom-right" richColors closeButton />
    </TooltipProvider>
  )
}
```

- [ ] **Step 5: Verify** — `pnpm test:unit` all green (routing-identity + medusa-garage suites still run, now against `routing-garage.ts`); `npx tsc --noEmit` shows only the 5 baseline errors.
- [ ] **Step 6: Commit** — `feat(wb-076): singleton -> SingleVehicleGarage; account garage layer out of the app graph`

---

### Task 3: De-garage the UI

**Files:**
- Modify: `storefront/src/modules/search/components/search-drawer/find-by-vehicle/index.tsx` (full replacement below)
- Leave intact (unimported after this task): `find-by-vehicle/garage-pane.tsx`, `find-by-vehicle/tab.tsx`, `modules/account/components/garage/index.tsx`
- Modify: `storefront/src/modules/layout/components/garage-pill/index.tsx` (labels)
- Modify: `storefront/src/modules/home/components/hero/index.tsx:15-22,141` (drop `vehicles`, new CTA labels)
- Modify: `storefront/src/modules/checkout/templates/empty-cart/index.tsx` (client component, `openSearch`)
- Modify: `storefront/src/modules/order/templates/order-completed-template.tsx:124-127` (tile copy)
- Modify: `storefront/src/modules/account/components/account-nav/index.tsx:79-92,160-168` (comment out both Garage links)
- Modify: `storefront/src/app/[countryCode]/(main)/account/@dashboard/garage/page.tsx` (404 stub, original commented)

**Interfaces:**
- Consumes: `useGarage()` (`active`, `remove`), `openSearch` from `@lib/stores/search-store`.

- [ ] **Step 1: `find-by-vehicle/index.tsx` full new content:**

```tsx
"use client"

// GARAGE-DISABLED (WB-076): the saved-vehicles garage is retired. The pane
// pair (From My Garage / YMM tabs via ./tab and ./garage-pane — both files
// kept intact for restoration) collapsed to the YMM picker plus a
// current-vehicle row. One vehicle lives in the browser cache; picking a new
// one replaces it.
import YmmPane from "./ymm-pane"
import { useGarage } from "@lib/garage/use-garage"

type FindByVehicleProps = {
  onClose: () => void
}

const FindByVehicle = ({ onClose }: FindByVehicleProps) => {
  const { active, remove } = useGarage()

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
        <span className="label" style={{ color: "var(--ink)" }}>Find by Vehicle</span>
        <span style={{ fontSize: 11, color: "var(--ink-soft)", fontFamily: "var(--mono)", letterSpacing: "0.04em" }}>
          Fitment guaranteed
        </span>
      </div>

      {active && (
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 10, marginBottom: 14, padding: "10px 12px",
            border: "1px solid var(--hairline)", borderRadius: 8, background: "var(--soft)",
          }}
        >
          <span style={{ fontSize: 12, color: "var(--graphite)" }}>
            Current vehicle:{" "}
            <strong style={{ color: "var(--ink)" }}>
              {active.year} {active.make} {active.model}{active.trim ? ` ${active.trim}` : ""}
            </strong>
          </span>
          <button
            type="button"
            onClick={() => remove(active.id)}
            style={{ fontSize: 11, fontFamily: "var(--mono)", letterSpacing: "0.04em", color: "var(--ink-soft)", textDecoration: "underline" }}
            aria-label="Clear the current vehicle"
          >
            CLEAR
          </button>
        </div>
      )}

      <YmmPane onClose={onClose} />
    </div>
  )
}

export default FindByVehicle
```

- [ ] **Step 2: `garage-pill` labels** — `"Garage · …"` → `"Vehicle · …"`; `"Garage · <car>"` → `"Vehicle · <car>"`; `"Garage · Select a vehicle"` → `"Vehicle · Select one"`; aria: `"Loading your garage"` → `"Loading your vehicle"`, `"Switch garage vehicle …"` → `"Switch vehicle …"`.
- [ ] **Step 3: hero** — destructure only `{ active }`; replace `garageCountLabel` with `const vehicleCtaLabel = active ? "CHANGE VEHICLE" : "SELECT VEHICLE"`; swap its usage at the outline button (line ~141).
- [ ] **Step 4: empty-cart** — add `"use client"`, import `openSearch` from `@lib/stores/search-store`, replace the `/account` link button with `<Button variant="outline" size="lg" onClick={openSearch}>Select your vehicle</Button>` (drop `asChild` + `LocalizedClientLink` for that button only).
- [ ] **Step 5: order-completed tile** — `{ i: "garage", h: "Add to your Garage", s: "Track this build, get install tips" }` → `{ i: "garage", h: "Shop for your vehicle", s: "Wheels and tires matched to your ride" }`.
- [ ] **Step 6: account-nav** — comment out both `/account/garage` `<li>…</li>` blocks (mobile ~79–92, desktop ~160–168) with `{/* GARAGE-DISABLED (WB-076): … */}`.
- [ ] **Step 7: garage page stub** — full new content (original body in a comment block below it):

```tsx
import { notFound } from "next/navigation"

// GARAGE-DISABLED (WB-076): the account garage is retired — the active
// vehicle lives only in the browser cache. Original page below; the
// GarageManager component (@modules/account/components/garage) is kept
// intact for restoration.
export default function Garage() {
  notFound()
}
```

- [ ] **Step 8: Verify** — `pnpm test:unit` green; `npx tsc --noEmit` 5-error baseline; `grep -ri "garage" src/modules src/app` shows no user-visible strings (code comments/identifiers fine).
- [ ] **Step 9: Commit** — `feat(wb-076): de-garage the UI — YMM-only drawer, vehicle pill, no account garage`

---

### Task 4: Backend — unregister module, 410 the routes

**Files:**
- Modify: `backend/medusa-config.js:232`
- Modify: `backend/src/api/store/customer/vehicles/route.ts` (GET+POST), `[id]/route.ts` (POST+DELETE), `[id]/activate/route.ts` (POST), `merge/route.ts` (POST)
- Modify: `backend/src/scripts/backfill-garage-bore.ts` (header note only)
- Leave intact: `src/modules/customer-vehicle/**` (models, service, migrations, tests), `vehicles/validators.ts` + its tests

- [ ] **Step 1: medusa-config.js** — `{ resolve: './src/modules/customer-vehicle' },` → `// GARAGE-DISABLED (WB-076): { resolve: './src/modules/customer-vehicle' },` (module tables stay in the DB; migrations untouched).
- [ ] **Step 2: routes** — in each route file, comment out the entire original contents (line-prefix `//`), then add at top:

```ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework"

// GARAGE-DISABLED (WB-076): the customer-vehicle module is unregistered in
// medusa-config.js, so the original handlers below would crash at
// req.scope.resolve(). Deliberate 410 stubs keep the loader + any stale
// clients well-behaved. Restore by deleting the stubs and uncommenting.
const gone = (_req: MedusaRequest, res: MedusaResponse): void => {
  res.status(410).json({ error: "garage_retired" })
}
export const GET = gone   // only in files whose original exported GET
export const POST = gone  // match the original verbs per file
export const DELETE = gone
```

- [ ] **Step 3: backfill script** — prepend `// GARAGE-DISABLED (WB-076): requires the customer-vehicle module re-registered in medusa-config.js to run.`
- [ ] **Step 4: Verify** — `cd backend; pnpm test:fitment` green (module tests still run); confirm `.env` `DATABASE_URL` host BEFORE any boot; if it is local, boot `pnpm dev` and hit `GET /store/customer/vehicles` → 410; if it points at prod (`trolley.proxy.rlwy.net`), do NOT boot — run `npx tsc --noEmit -p .` (or `medusa build`) for compile safety instead.
- [ ] **Step 5: Commit** — `feat(wb-076): unregister customer-vehicle module; vehicle routes 410`

---

### Task 5: Full verification

- [ ] Storefront: `pnpm test:unit` (all suites incl. mothballed-lib tests), `npx tsc --noEmit` (5-error baseline), `pnpm build:next` completes.
- [ ] Backend: `pnpm test:fitment` + `pnpm test:config` + `pnpm test:sync` green.
- [ ] Live smoke (verify skill; storefront `pnpm dev` needs the backend up): open drawer → YMM pick → lands on `/store?fit=…` filtered; pick a second vehicle → replaces (pill shows the new one, cache has one entry); CLEAR → pill shows "Vehicle · Select one"; `/account` has no Garage nav; `/us/account/garage` 404s.
- [ ] Commit any fixes found.

---

### Task 6: Docs + merge

- [ ] `docs/future/BACKLOG.md`: add `### WB-076 · retire-garage — single cached vehicle (client decision)` with status `done`, evidence file:lines.
- [ ] `docs/STATUS.md`: update "Last verified", account/garage pillar rows.
- [ ] `storefront/CLAUDE.md`: rewrite "Garage abstraction" section (SingleVehicleGarage, GARAGE-DISABLED seams), fix Search-drawer + account references.
- [ ] Amend spec §"Commented out": note the executed variant — seams commented, library files disconnected-but-tested (vitest can't run empty files), routes = 410 stubs.
- [ ] Run `/doc-review`; fix drift it flags.
- [ ] Commit docs; then superpowers:finishing-a-development-branch → merge `feat/retire-garage-cached-vehicle` into `main`; move spec+plan `docs/in-progress/` → `docs/done/`.
