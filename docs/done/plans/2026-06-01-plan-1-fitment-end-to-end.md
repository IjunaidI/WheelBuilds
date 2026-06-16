# Plan 1 — Fitment End-to-End Implementation Plan

> **✅ STATUS — DONE & merged to `main`** (prior session; fast-forward to `3ca3f04`, branch `fix/fitment-end-to-end` deleted). The response-envelope fix is live (`by-vehicle` returns `{ fitment }`, storefront unwraps via `unwrapFitment`); wheel-size store routes degrade to empty/503 instead of 500; `.env.template` documents the activation keys; the per-card FITS badge is live. Backend 178 + storefront 25 unit tests green.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "select a vehicle → the catalog filters to fitting wheels" actually work end-to-end, fix the deterministic response-envelope bug that currently kills it, stop the catalog routes from returning 500 when wheel-size is unconfigured, document the activation env vars, and light up the per-card FITS badge.

**Architecture:** The whole fitment chain (shared `canonicalBoltPatterns` join key, the Meilisearch `bolt_patterns_canonical` filter, the garage, the `?fit=` URL param) is already wired and unit-tested on `main`. It is starved at exactly one hop: `GET /store/fitment/by-vehicle` returns the fitment object **unwrapped** (`res.json(fitment)`) while the storefront reads `r.fitment`, which is `undefined`. We fix the envelope, harden the consumer against future drift with a pure unwrap helper, make the wheel-size route resolution graceful, and surface canonical patterns to the grid so the FITS badge can be computed client-side from the active vehicle.

**Tech Stack:** MedusaJS 2.13.6 (backend, Jest + @swc/jest), Next.js 15 / React 19 (storefront, Vitest 2.1.9), Meilisearch, wheel-size.com v2.

**Out of scope (deferred to future work):** populating the PDP "N CONFIRMED MODELS" list (`product.fitment`, hardcoded `[]` in `get-product.ts:159`) requires a reverse-fitment dataset we do not have cheaply; per-size badging on the PDP variant picker. The PDP active-vehicle status band already works and is untouched here.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `storefront/src/lib/data/fitment-unwrap.ts` | Pure helper: tolerate both `{ fitment }` and bare-object response shapes | Create |
| `storefront/src/lib/data/fitment-unwrap.test.ts` | Vitest for the unwrap helper | Create |
| `storefront/src/lib/data/fitment.ts` | Wire `getFitmentByVehicle` through the unwrap helper | Modify |
| `backend/src/api/store/fitment/by-vehicle/route.ts` | Return `{ fitment }` (envelope-consistent with sibling routes) | Modify |
| `backend/src/lib/resolve-optional.ts` | Pure helper: resolve a module or return `null` instead of throwing | Create |
| `backend/src/lib/__tests__/resolve-optional.test.ts` | Jest for the resolver | Create |
| `backend/src/api/store/vehicle-catalog/{makes,models,years,modifications}/route.ts` | Degrade to empty payload when wheel-size is unregistered | Modify |
| `backend/.env.template` | Document `WHEEL_SIZE_*` + the three subsystems needed for fitment | Modify |
| `storefront/src/modules/discovery/data/types.ts` | Add `boltPatternsCanonical` to `DiscoveryProduct` | Modify |
| `storefront/src/modules/discovery/data/get-products.ts` | Map `bolt_patterns_canonical` from the index hit | Modify |
| `storefront/src/lib/fitment/product-fits.ts` | Pure: does a product's bolt patterns intersect the vehicle's | Create |
| `storefront/src/lib/fitment/__tests__/product-fits.test.ts` | Vitest for the matcher | Create |
| `storefront/src/modules/discovery/components/grid/fit-badge.tsx` | Client island: render FITS chip from active vehicle | Create |
| `storefront/src/modules/discovery/components/grid/product-card.tsx` | Use `<FitBadge>` instead of the never-set static flag | Modify |

---

### Task 1: Fix the fitment response-envelope bug (the dead-on-arrival defect)

**Files:**
- Create: `storefront/src/lib/data/fitment-unwrap.ts`
- Test: `storefront/src/lib/data/fitment-unwrap.test.ts`
- Modify: `storefront/src/lib/data/fitment.ts`
- Modify: `backend/src/api/store/fitment/by-vehicle/route.ts:28`

- [ ] **Step 1: Write the failing test**

Create `storefront/src/lib/data/fitment-unwrap.test.ts`:

```ts
import { it, expect, describe } from "vitest"
import { unwrapFitment } from "./fitment-unwrap"

const sample = {
  status: "ok",
  canonicalBoltPatterns: ["5x114.3"],
  hubBoreMm: 67.1,
  diameterWindow: null,
  widthWindow: null,
  offsetWindow: null,
  source: { modificationSlug: "x", region: "usdm" },
}

describe("unwrapFitment", () => {
  it("reads the bare fitment object (legacy unwrapped response)", () => {
    expect(unwrapFitment(sample)?.canonicalBoltPatterns).toEqual(["5x114.3"])
  })
  it("reads the wrapped { fitment } envelope (current backend)", () => {
    expect(unwrapFitment({ fitment: sample })?.canonicalBoltPatterns).toEqual(["5x114.3"])
  })
  it("passes through a not_found fitment (has the contract keys)", () => {
    const nf = { ...sample, status: "not_found", canonicalBoltPatterns: [] }
    expect(unwrapFitment({ fitment: nf })?.status).toBe("not_found")
  })
  it("returns null for an unrelated/empty body", () => {
    expect(unwrapFitment(undefined)).toBeNull()
    expect(unwrapFitment({})).toBeNull()
    expect(unwrapFitment({ error: "unavailable" })).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `storefront/`): `npx vitest run src/lib/data/fitment-unwrap.test.ts`
Expected: FAIL — `Failed to resolve import "./fitment-unwrap"` (file does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `storefront/src/lib/data/fitment-unwrap.ts`:

```ts
import type { VehicleFitment } from "@lib/garage/types"

/**
 * The /store/fitment/by-vehicle route returns the fitment wrapped in
 * `{ fitment }` (consistent with the sibling /store/vehicle-catalog routes).
 * An earlier build returned the bare object, which silently starved the whole
 * fitment filter. Accept BOTH shapes so an envelope drift can never again
 * break fitment without a test catching it.
 */
export function unwrapFitment(body: unknown): VehicleFitment | null {
  if (!body || typeof body !== "object") return null
  const obj = body as Record<string, unknown>
  const candidate = ("fitment" in obj ? obj.fitment : obj) as Record<string, unknown> | null
  if (!candidate || typeof candidate !== "object") return null
  if (!("status" in candidate) || !("canonicalBoltPatterns" in candidate)) return null
  return candidate as unknown as VehicleFitment
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `storefront/`): `npx vitest run src/lib/data/fitment-unwrap.test.ts`
Expected: PASS — 4 passed.

- [ ] **Step 5: Wire `getFitmentByVehicle` through the helper**

Replace the body of `getFitmentByVehicle` in `storefront/src/lib/data/fitment.ts` (keep the four catalog fetchers above it unchanged). Add the import at the top and rewrite the function:

```ts
import { sdk } from "@lib/config"
import type { VehicleFitment } from "@lib/garage/types"
import { unwrapFitment } from "./fitment-unwrap"

export const getMakes = () => sdk.client.fetch<{ makes: any }>("/store/vehicle-catalog/makes")
export const getModels = (make: string) => sdk.client.fetch<{ models: any }>(`/store/vehicle-catalog/models?make=${make}`)
export const getYears = (make: string, model: string) => sdk.client.fetch<{ years: any }>(`/store/vehicle-catalog/years?make=${make}&model=${model}`)
export const getModifications = (make: string, model: string, year: string) =>
  sdk.client.fetch<{ modifications: any }>(`/store/vehicle-catalog/modifications?make=${make}&model=${model}&year=${year}`)

export async function getFitmentByVehicle(make: string, model: string, modification: string, region = "usdm"): Promise<VehicleFitment | { error: "unavailable" }> {
  try {
    const body = await sdk.client.fetch<unknown>(
      `/store/fitment/by-vehicle?make=${make}&model=${model}&modification=${encodeURIComponent(modification)}&region=${region}`)
    const fitment = unwrapFitment(body)
    if (!fitment) return { error: "unavailable" }
    return fitment
  } catch (e: any) {
    // Guard multiple error shapes: sdk.client.fetch may surface the status as e.status or e.response?.status.
    const status = e?.status ?? e?.response?.status
    if (status === 503) return { error: "unavailable" }
    throw e
  }
}
```

- [ ] **Step 6: Fix the backend route to emit the `{ fitment }` envelope**

In `backend/src/api/store/fitment/by-vehicle/route.ts`, change line 28 from:

```ts
    res.json(fitment)
```

to:

```ts
    res.json({ fitment })
```

- [ ] **Step 7: Re-run the storefront test (still green) and commit**

Run (from `storefront/`): `npx vitest run src/lib/data/fitment-unwrap.test.ts`
Expected: PASS.

```bash
git add storefront/src/lib/data/fitment-unwrap.ts storefront/src/lib/data/fitment-unwrap.test.ts storefront/src/lib/data/fitment.ts backend/src/api/store/fitment/by-vehicle/route.ts
git commit -m "fix(fitment): wrap by-vehicle response + tolerant unwrap so vehicle selection filters the catalog"
```

---

### Task 2: Degrade gracefully when wheel-size is unregistered (no more 500s)

**Files:**
- Create: `backend/src/lib/resolve-optional.ts`
- Test: `backend/src/lib/__tests__/resolve-optional.test.ts`
- Modify: `backend/src/api/store/vehicle-catalog/makes/route.ts`
- Modify: `backend/src/api/store/vehicle-catalog/models/route.ts`
- Modify: `backend/src/api/store/vehicle-catalog/years/route.ts`
- Modify: `backend/src/api/store/vehicle-catalog/modifications/route.ts`
- Modify: `backend/src/api/store/fitment/by-vehicle/route.ts`

**Why:** When `WHEEL_SIZE_API_KEY` is unset the wheel-size module is not registered (`medusa-config.js:167`), and `req.scope.resolve(WHEEL_SIZE_MODULE)` throws an unhandled `AwilixResolutionError` → HTTP 500. The storefront YMM pane only survives because it catches the failure and falls back to a static seed; the fitment lookup itself surfaces an error. Returning an empty list / 503 makes the degradation clean.

- [ ] **Step 1: Write the failing test**

Create `backend/src/lib/__tests__/resolve-optional.test.ts`:

```ts
import { resolveOptional } from "../resolve-optional"

describe("resolveOptional", () => {
  it("returns the service when resolve succeeds", () => {
    const scope = { resolve: () => ({ ok: 1 }) }
    expect(resolveOptional(scope, "anything")).toEqual({ ok: 1 })
  })
  it("returns null when resolve throws (module not registered)", () => {
    const scope = { resolve: () => { throw new Error("AwilixResolutionError: Could not resolve 'x'") } }
    expect(resolveOptional(scope, "x")).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `backend/`): `npx jest src/lib/__tests__/resolve-optional.test.ts`
Expected: FAIL — cannot find module `../resolve-optional`.

- [ ] **Step 3: Write the minimal implementation**

Create `backend/src/lib/resolve-optional.ts`:

```ts
/**
 * Resolve a module service from a request scope, returning null instead of
 * throwing when the module is not registered (e.g. wheel-size when
 * WHEEL_SIZE_API_KEY is unset). Lets the vehicle-catalog / fitment routes
 * degrade to an empty payload or 503 rather than a raw 500.
 */
export function resolveOptional<T = any>(
  scope: { resolve: (key: string) => T },
  key: string
): T | null {
  try {
    return scope.resolve(key)
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `backend/`): `npx jest src/lib/__tests__/resolve-optional.test.ts`
Expected: PASS — 2 passed.

- [ ] **Step 5: Apply the guard to the four catalog routes**

Replace the full contents of each file.

`backend/src/api/store/vehicle-catalog/makes/route.ts`:

```ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { WHEEL_SIZE_MODULE } from "../../../../modules/wheel-size"
import { resolveOptional } from "../../../../lib/resolve-optional"
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const svc = resolveOptional(req.scope, WHEEL_SIZE_MODULE)
  if (!svc) { res.json({ makes: [] }); return }
  res.json({ makes: await svc.listMakes() })
}
```

`backend/src/api/store/vehicle-catalog/models/route.ts`:

```ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { WHEEL_SIZE_MODULE } from "../../../../modules/wheel-size"
import { resolveOptional } from "../../../../lib/resolve-optional"
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const { make } = req.query as Record<string, string>
  const svc = resolveOptional(req.scope, WHEEL_SIZE_MODULE)
  if (!svc) { res.json({ models: [] }); return }
  res.json({ models: await svc.listModels(make) })
}
```

`backend/src/api/store/vehicle-catalog/years/route.ts` (full replacement — verified against the current file):

```ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { WHEEL_SIZE_MODULE } from "../../../../modules/wheel-size"
import { resolveOptional } from "../../../../lib/resolve-optional"
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const { make, model } = req.query as Record<string, string>
  const svc = resolveOptional(req.scope, WHEEL_SIZE_MODULE)
  if (!svc) { res.json({ years: [] }); return }
  res.json({ years: await svc.listYears(make, model) })
}
```

`backend/src/api/store/vehicle-catalog/modifications/route.ts`:

```ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { WHEEL_SIZE_MODULE } from "../../../../modules/wheel-size"
import { resolveOptional } from "../../../../lib/resolve-optional"
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const { make, model, year } = req.query as Record<string, string>
  const svc = resolveOptional(req.scope, WHEEL_SIZE_MODULE)
  if (!svc) { res.json({ modifications: [] }); return }
  res.json({ modifications: await svc.listModifications(make, model, year) })
}
```

- [ ] **Step 6: Apply the guard to the fitment route**

In `backend/src/api/store/fitment/by-vehicle/route.ts`, add the import and replace the `req.scope.resolve` line with the guarded form:

```ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { WHEEL_SIZE_MODULE } from "../../../../modules/wheel-size"
import { QuotaOutageError } from "../../../../modules/wheel-size/service"
import { resolveOptional } from "../../../../lib/resolve-optional"

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const svc = resolveOptional(req.scope, WHEEL_SIZE_MODULE)
  const { make, model, modification, year, region } = req.query as Record<string, string>

  if (!svc) { res.status(503).json({ error: "fitment unavailable" }); return }
  if (!make || !model) {
    res.status(400).json({ error: "make and model are required" })
    return
  }

  try {
    const fitment = await svc.getFitment({ make, model, modificationSlug: modification, year, region })
    res.json({ fitment })
  } catch (err) {
    if (err instanceof QuotaOutageError) {
      res.status(503).json({ error: "fitment unavailable" })
      return
    }
    throw err
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/lib/resolve-optional.ts backend/src/lib/__tests__/resolve-optional.test.ts backend/src/api/store/vehicle-catalog backend/src/api/store/fitment/by-vehicle/route.ts
git commit -m "fix(store): degrade vehicle-catalog + fitment routes to empty/503 when wheel-size is unregistered"
```

---

### Task 3: Document the activation env vars in `.env.template`

**Files:**
- Modify: `backend/.env.template`

**Why:** A by-the-book deploy ships with no `WHEEL_SIZE_API_KEY` (it is absent from the template), so the wheel-size module never registers and the entire fitment feature silently degrades to a 12-make static seed. The three subsystems fitment depends on (Meilisearch, vendor-sync, wheel-size) are all commented/absent with no operator signal.

- [ ] **Step 1: Append the fitment activation block**

In `backend/.env.template`, replace the existing `# --- Vendor Sync ...` block and the Meilisearch block guidance by inserting the following after the Meilisearch section (line 28). Keep existing lines; add this:

```bash
# --- Vehicle fitment (wheel-size.com) — REQUIRED for the garage + fitment filter ---
# Without WHEEL_SIZE_API_KEY the wheel-size module does NOT register: the
# /store/vehicle-catalog/* routes return empty lists and /store/fitment/by-vehicle
# returns 503, so selecting a vehicle filters nothing. Get a key at https://wheel-size.com/api/
# WHEEL_SIZE_API_KEY=your-wheel-size-api-key
# WHEEL_SIZE_BASE_URL=https://api.wheel-size.com/v2   # optional override
# WHEEL_SIZE_REGION=usdm                              # optional default region

# --- Three subsystems must ALL be on for "pick a vehicle -> filtered catalog" to work ---
#   1. MEILISEARCH_HOST + MEILISEARCH_ADMIN_KEY  (above) — indexes wheel docs the filter queries
#   2. VENDOR_WHEELPROS_WHEELS_ENABLED=true      (below) + a vendor-sync apply — populates the catalog
#   3. WHEEL_SIZE_API_KEY                         (above) — resolves a vehicle to bolt patterns
```

- [ ] **Step 2: Commit**

```bash
git add backend/.env.template
git commit -m "docs(env): document WHEEL_SIZE_API_KEY + the three subsystems fitment requires"
```

---

### Task 4: Light up the per-card FITS badge from the active vehicle

**Files:**
- Modify: `storefront/src/modules/discovery/data/types.ts`
- Modify: `storefront/src/modules/discovery/data/get-products.ts`
- Create: `storefront/src/lib/fitment/product-fits.ts`
- Test: `storefront/src/lib/fitment/__tests__/product-fits.test.ts`
- Create: `storefront/src/modules/discovery/components/grid/fit-badge.tsx`
- Modify: `storefront/src/modules/discovery/components/grid/product-card.tsx`

**Why:** `product-card.tsx:44` renders the FITS chip only when `product.fitsActiveVehicle` is true, but `hitToProduct` never sets it and the grid is a server component with no active-vehicle awareness — so the badge is dead. The index already exposes `bolt_patterns_canonical` (it is in `displayedAttributes`), so we surface it on the product and compute fit in a small client island from `useGarage()`.

- [ ] **Step 1: Write the failing test for the pure matcher**

Create `storefront/src/lib/fitment/__tests__/product-fits.test.ts`:

```ts
import { it, expect, describe } from "vitest"
import { productFitsVehicle } from "../product-fits"

describe("productFitsVehicle", () => {
  it("is true when any canonical pattern intersects", () => {
    expect(productFitsVehicle(["5x114.3", "5x120"], ["5x114.3"])).toBe(true)
  })
  it("is false when there is no intersection", () => {
    expect(productFitsVehicle(["6x139.7"], ["5x114.3"])).toBe(false)
  })
  it("is false when either side is empty/undefined", () => {
    expect(productFitsVehicle([], ["5x114.3"])).toBe(false)
    expect(productFitsVehicle(["5x114.3"], [])).toBe(false)
    expect(productFitsVehicle(undefined, undefined)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `storefront/`): `npx vitest run src/lib/fitment/__tests__/product-fits.test.ts`
Expected: FAIL — cannot resolve `../product-fits`.

- [ ] **Step 3: Write the matcher**

Create `storefront/src/lib/fitment/product-fits.ts`:

```ts
/**
 * True when any of the product's canonical bolt patterns matches one of the
 * active vehicle's. Both sides are already canonicalized ("{count}x{pcd_mm}")
 * by the shared canonicalBoltPatterns util, so a set intersection is exact.
 */
export function productFitsVehicle(
  productPatterns: string[] | undefined,
  vehiclePatterns: string[] | undefined
): boolean {
  if (!productPatterns?.length || !vehiclePatterns?.length) return false
  const vehicle = new Set(vehiclePatterns)
  return productPatterns.some((p) => vehicle.has(p))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `storefront/`): `npx vitest run src/lib/fitment/__tests__/product-fits.test.ts`
Expected: PASS — 3 passed.

- [ ] **Step 5: Surface `boltPatternsCanonical` on `DiscoveryProduct`**

In `storefront/src/modules/discovery/data/types.ts`, add the field to the `DiscoveryProduct` type, immediately after the `boltPattern: string` line (around line 30):

```ts
  boltPattern: string
  /** Canonical bolt patterns ("{count}x{pcd_mm}") used to badge fit vs the active vehicle. */
  boltPatternsCanonical: string[]
```

- [ ] **Step 6: Map it from the Meilisearch hit**

In `storefront/src/modules/discovery/data/get-products.ts`, add the field to the `Hit` type (after `bolt_patterns: string[]`, around line 96):

```ts
  bolt_patterns: string[]
  bolt_patterns_canonical: string[]
```

and set it in `hitToProduct` (after `boltPattern: h.bolt_patterns?.[0] ?? ""`, around line 113):

```ts
    boltPattern: h.bolt_patterns?.[0] ?? "",
    boltPatternsCanonical: h.bolt_patterns_canonical ?? [],
```

- [ ] **Step 7: Create the FitBadge client island**

Create `storefront/src/modules/discovery/components/grid/fit-badge.tsx`:

```tsx
"use client"

import { useGarage } from "@lib/garage/use-garage"
import Chip from "@modules/common/components/chip"
import { productFitsVehicle } from "@lib/fitment/product-fits"

/**
 * Renders the FITS chip on a discovery card when the active garage vehicle's
 * bolt patterns intersect the product's. Client-only because the active
 * vehicle lives in the garage store; the card itself stays a server component.
 */
export default function FitBadge({ patterns }: { patterns: string[] }) {
  const { active } = useGarage()
  if (!active || !productFitsVehicle(patterns, active.canonicalBoltPatterns)) return null
  return (
    <div className="absolute top-2.5 right-2.5">
      <Chip variant="accent" size="sm" dot>
        FITS
      </Chip>
    </div>
  )
}
```

- [ ] **Step 8: Use FitBadge in the product card**

In `storefront/src/modules/discovery/components/grid/product-card.tsx`, add the import near the other imports:

```ts
import FitBadge from "./fit-badge"
```

and replace the static block (lines 44–50):

```tsx
      {product.fitsActiveVehicle && (
        <div className="absolute top-2.5 right-2.5">
          <Chip variant="accent" size="sm" dot>
            FITS
          </Chip>
        </div>
      )}
```

with:

```tsx
      <FitBadge patterns={product.boltPatternsCanonical} />
```

- [ ] **Step 9: Type-check, then commit**

Run (from `storefront/`): `npx tsc --noEmit`
Expected: no NEW errors in the files touched here (pre-existing errors listed in `storefront/CLAUDE.md` are unrelated and acceptable).

```bash
git add storefront/src/modules/discovery/data/types.ts storefront/src/modules/discovery/data/get-products.ts storefront/src/lib/fitment/product-fits.ts storefront/src/lib/fitment/__tests__/product-fits.test.ts storefront/src/modules/discovery/components/grid/fit-badge.tsx storefront/src/modules/discovery/components/grid/product-card.tsx
git commit -m "feat(discovery): per-card FITS badge computed from the active garage vehicle"
```

---

### Task 5: End-to-end manual smoke verification

This task has no automated test — a full browser e2e needs a seeded backend (wheels imported), Meilisearch, and a real wheel-size key, which is environment-dependent. Run it once locally after Tasks 1–4 to confirm the chain is alive.

- [ ] **Step 1: Bring up the stack with all three subsystems on**

In `backend/.env`, set: `MEILISEARCH_HOST`, `MEILISEARCH_ADMIN_KEY`, `WHEEL_SIZE_API_KEY`, `VENDOR_WHEELPROS_WHEELS_ENABLED=true`. Then (from `backend/`):

```bash
rm -rf .medusa/server   # clear the stale-config trap (see root CLAUDE.md)
npx -y pnpm@9.10.0 run ib
npx -y pnpm@9.10.0 run vendor-sync:apply -- $(npx -y pnpm@9.10.0 run vendor-sync:dry-run wheelpros-wheels | grep -o 'run id: .*')
npx -y pnpm@9.10.0 run dev
```

(If the dry-run/apply id capture is awkward on Windows PowerShell, run `vendor-sync:dry-run wheelpros-wheels`, copy the printed run id, then `vendor-sync:apply <run-id>`.)

- [ ] **Step 2: Confirm the index has canonical patterns**

Query Meilisearch for one wheel doc and confirm `bolt_patterns_canonical` is a non-empty array (e.g. `["5x114.3"]`). If empty, the apply/index step did not populate fitment fields — stop and fix that before continuing.

- [ ] **Step 3: Confirm the backend route returns the wrapped envelope**

```bash
curl "http://localhost:9000/store/fitment/by-vehicle?make=toyota&model=camry&modification=<a-real-slug>" -H "x-publishable-api-key: <pk>"
```

Expected: a JSON body shaped `{ "fitment": { "status": "ok", "canonicalBoltPatterns": ["5x114.3"], ... } }` (note the top-level `fitment` key — this is the Task 1 fix).

- [ ] **Step 4: Drive the storefront**

From `storefront/` run `npx -y pnpm@9.10.0 run dev`. Open the store, open the search drawer → Find by vehicle → pick a Year/Make/Model/Trim and submit. Confirm:
  - the URL becomes `/<cc>/store?fit=5x114.3` (a non-empty `fit` param — this proves the save wrote `canonicalBoltPatterns`),
  - the grid shows fewer results than the unfiltered catalog,
  - cards matching the vehicle show the FITS badge (toggle `?fit=0` to see all and confirm only fitting cards are badged).

- [ ] **Step 5: Record the result**

Note pass/fail in the PR description with the observed `fit` param and result counts. No commit (verification only).

---

## Self-Review Notes

- **Spec coverage:** envelope fix (Task 1), graceful routes (Task 2), env docs (Task 3), FITS badge (Task 4), end-to-end proof (Task 5) — all four audit priorities for fitment plus a smoke gate.
- **Type consistency:** `unwrapFitment` returns `VehicleFitment | null` (matches `@lib/garage/types`); `productFitsVehicle(string[]|undefined, string[]|undefined): boolean`; `DiscoveryProduct.boltPatternsCanonical: string[]` is set in `hitToProduct` and read by `FitBadge`. `useGarage()` returns `{ active }` where `active.canonicalBoltPatterns?: string[]`.
- **Deferred (not gaps):** PDP confirmed-models list and per-size badging are explicitly out of scope (need reverse-fitment data).
