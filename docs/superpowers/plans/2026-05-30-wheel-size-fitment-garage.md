# wheel-size.com Fitment + Persistent Garage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the discovery loop — adding a vehicle filters Discovery to only the wheels that fit it and tells each PDP whether it fits the active vehicle — and persist the shopper's garage to their account once logged in.

**Architecture:** Two new backend Medusa modules (`wheel-size`: API client + two-tier cache + quota counter; `customer-vehicle`: account-backed garage) expose store routes. The storefront swaps its garage singleton to a hybrid router (guest→localStorage, authed→optimistic-sync `MedusaGarage`), derives a canonical bolt-pattern Meilisearch clause from the active vehicle, materializes it into a `fit` URL param consumed by the already-live `vehicleConstraint` seam, and replaces the PDP make/model heuristic with a parametric `fitsVehicle` check. The bolt-pattern join reuses Spec 1's `canonicalBoltPatterns` on both sides.

**Tech Stack:** MedusaJS 2.13.6 (backend, Node 22 / pnpm 9.10, jest), Next.js 15 / React 19 (storefront, vitest added), Meilisearch (server-only, `^0.51.0`), wheel-size.com API v2 (Basic tier), MikroORM models.

**Spec:** [`docs/superpowers/specs/2026-05-30-wheel-size-fitment-garage-design.md`](../specs/2026-05-30-wheel-size-fitment-garage-design.md). **Branch:** `feat/wheel-size-fitment-garage`.

---

## Environment notes (read once)

- **`pnpm` may not be on Windows PATH.** Use `npx -y pnpm@9.10.0 <cmd>` for one-offs. Medusa CLI: `backend/node_modules/.bin/medusa.CMD`.
- **`.medusa/server` is a stale-config cache.** After editing `medusa-config.js` or env: `rm -rf backend/.medusa/server` before restart.
- **Migrations are not auto-run by `pnpm dev`.** Run `npx -y pnpm@9.10.0 exec medusa db:migrate` (from `backend/`) after adding/altering models.
- **`MedusaService` update takes a single object:** `service.updateXs({ id, ...fields })`, never `(selector, update)`.
- **Backend test gate:** `cd backend && pnpm test:sync` (existing, vendor-sync) plus the new `pnpm test:fitment` added in Task 6. **Storefront gate:** `cd storefront && npx tsc --noEmit` + `pnpm build:next` + the new `pnpm test:unit` (vitest) added in Task 11.
- **Price/units are not touched by this spec.** Do not introduce price math.
- **Shell:** all multi-step shell fences assume the **Bash tool** (POSIX — `&&`, `rm -rf` work). If running under PowerShell, use `Remove-Item -Recurse -Force` for `rm -rf` and `;`/`if ($?)` instead of `&&`. Where `pnpm` is invoked bare (`test:sync`, `test:fitment`, `build:next`, `test:unit`) and pnpm is not on PATH, prefix with `npx -y pnpm@9.10.0`.
- **Verified existing symbols** (do not rename): `getCustomer` (NOT `retrieveCustomer`) in `@lib/data/customer` returns the customer or `null`; `sdk` from `@lib/config` is a `Medusa` client already constructed with `baseUrl` + `publishableKey` (`NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`), so `sdk.client.fetch(path, opts)` auto-attaches both — pass NO manual headers; `LocalStorageGarage` uses **module-level free functions** `readVehicles()`/`writeVehicles(list)`/`writeActiveId(id)` (NOT `this.*`) over keys `VEHICLES_KEY="garage:vehicles"` / `ACTIVE_KEY="garage:active"`; `test:sync` is exactly `jest --passWithNoTests src/modules/vendor-sync` and the global `jest.config.js` `testMatch` is `<rootDir>/src/**/*.test.ts` (so `jest <path>` filters work).

---

## File Structure

**Backend — `wheel-size` module** (`backend/src/modules/wheel-size/`)
| File | Responsibility |
|---|---|
| `types.ts` | `VehicleFitment`, `Window`, raw-response interfaces |
| `normalize.ts` | pure `(rawByModel, {modificationSlug, region}) → VehicleFitment`; imports `canonicalBoltPatterns` |
| `client.ts` | `fetch` wrapper; returns `{ status, body }`; injects `user_key` |
| `service.ts` | `WheelSizeService` — cache read-through, quota counter, classifier |
| `index.ts` | module registration |
| `models/wheel-size-catalog.ts` | Tier-1 cataloging cache |
| `models/wheel-size-fitment.ts` | Tier-2 fitment cache (raw + projection + status) |
| `models/wheel-size-quota.ts` | persisted daily call counter |
| `migrations/*` + `.snapshot-wheel-size-module.json` | schema |
| `__tests__/normalize.test.ts`, `__tests__/service.test.ts`, `__tests__/__fixtures__/*.json` | tests |

**Backend — `customer-vehicle` module** (`backend/src/modules/customer-vehicle/`)
| File | Responsibility |
|---|---|
| `models/customer-vehicle.ts` | `customer_vehicle` table |
| `service.ts` | CRUD + single-active invariant |
| `index.ts` | module registration |
| `migrations/*` + `.snapshot-customer-vehicle-module.json` | schema |

**Backend — store routes** (`backend/src/api/store/`)
`vehicle-catalog/{makes,models,years,modifications}/route.ts`, `fitment/by-vehicle/route.ts`, `customer/vehicles/route.ts`, `customer/vehicles/[id]/route.ts`, `customer/vehicles/[id]/activate/route.ts`

**Backend — wiring:** `src/lib/constants.ts` (modify), `medusa-config.js` (modify), `package.json` (modify — `test:fitment`)

**Shared fixture:** `fixtures/bolt-pattern-canonical-golden.json` (repo root; read by both test suites)

**Storefront**
| File | Responsibility |
|---|---|
| `src/lib/fitment/canonical-bolt-pattern.ts` (create) | byte-equivalent twin of backend `canonicalBoltPatterns` |
| `src/lib/fitment/fits-vehicle.ts` (create) | pure `fitsVehicle(product, vehicle) → FitVerdict` |
| `src/lib/data/fitment.ts` (create) | catalog + by-vehicle fetchers |
| `src/lib/data/customer-vehicles.ts` (create) | garage CRUD fetchers |
| `src/lib/garage/provider.ts` (modify) | + `update()` |
| `src/lib/garage/types.ts` (modify) | `Vehicle` fitment fields |
| `src/lib/garage/local-storage-garage.ts` (modify) | implement `update()` |
| `src/lib/garage/medusa-garage.ts` (create) | optimistic sync provider |
| `src/lib/garage/index.ts` (modify) | hybrid router + merge-on-login |
| `src/modules/discovery/data/escape.ts` (create) | `lit()` escaper (leaf, no server-only) |
| `src/modules/discovery/data/vehicle-constraint.ts` (create) | `vehicleToConstraints()` |
| `src/modules/discovery/data/get-products.ts` (modify) | import `lit` from `escape.ts` |
| `src/modules/discovery/data/types.ts` (modify) | `parseQueryFromSearchParams` reads `fit` |
| `src/modules/discovery/components/fitment-sync/index.tsx` (create) | auto-apply island |
| `src/modules/discovery/templates/index.tsx` (modify) | mount the island |
| `src/modules/discovery/components/filter-rail/filter-sections.tsx` (modify) | "Show all" affordance |
| `src/modules/discovery/components/active-chips/index.tsx` (modify) | `Fits:` chip |
| `src/modules/search/.../find-by-vehicle/ymm-pane.tsx` (modify) | async dropdowns + fitment fetch + route tail |
| `src/modules/search/.../find-by-vehicle/garage-pane.tsx` (modify) | route tail |
| `src/modules/product-detail/data/get-product.ts` (modify) | `boltPatternsCanonical` |
| `src/modules/product-detail/data/types.ts` (modify) | `ProductDetail.boltPatternsCanonical` |
| `src/modules/product-detail/components/fitment/index.tsx` (modify) | `fitsVehicle` |
| `vitest.config.ts` + `src/lib/fitment/__tests__/*` + `package.json` (modify) | test infra |

---

## PHASE 0 — Validation gate (BLOCKING — no production code until this passes)

### Task 1: wheel-size.com Sandbox validation spike

**Files:**
- Create: `backend/scripts/wheel-size-validate.mjs` (throwaway spike script — deleted at end of task)
- Create: `backend/src/modules/wheel-size/__tests__/__fixtures__/by-model-*.json` (recorded real responses — kept as test fixtures)
- Create: `docs/superpowers/specs/2026-05-30-wheel-size-task1-findings.md` (the decision record)

- [ ] **Step 1: Obtain a Sandbox key.** Register at https://developer.wheel-size.com/ for a free Sandbox `user_key` (moderated, ~2–4h). Export it locally: PowerShell `$env:WHEEL_SIZE_API_KEY="..."`. Do NOT commit the key.

- [ ] **Step 2: Write the spike script.** Hit `by_model` (v2) for six vehicles spanning the risk surface.

```js
// backend/scripts/wheel-size-validate.mjs   (run: node backend/scripts/wheel-size-validate.mjs)
import { writeFileSync } from "node:fs"
const KEY = process.env.WHEEL_SIZE_API_KEY
const BASE = "https://api.wheel-size.com/v2"
// region usdm; resolve real make/model/year/modification slugs via the cataloging endpoints first if needed.
const VEHICLES = [
  { tag: "sedan-5x114_3", make: "honda",     model: "accord",   year: 2021 },
  { tag: "dual-drill",    make: "jeep",       model: "wrangler", year: 2018 },
  { tag: "hub-centric",   make: "ford",       model: "f-150",    year: 2021 },
  { tag: "everyday",      make: "mitsubishi", model: "outlander",year: 2016 },
  { tag: "nonstd-6x132",  make: "hummer",     model: "h3",       year: 2008 },  // non-standard PCD probe
  { tag: "nonstd-8x180",  make: "chevrolet",  model: "silverado-2500-hd", year: 2020 },
]
for (const v of VEHICLES) {
  const url = `${BASE}/search/by_model/?make=${v.make}&model=${v.model}&year=${v.year}&region=usdm&user_key=${KEY}`
  const res = await fetch(url)
  const text = await res.text()
  let body = null; try { body = JSON.parse(text) } catch {}
  console.log(v.tag, "status", res.status, "empty?", text.length === 0)
  writeFileSync(`backend/src/modules/wheel-size/__tests__/__fixtures__/by-model-${v.tag}.json`,
    JSON.stringify({ status: res.status, body }, null, 2))
}

// --- Validate the CATALOGING endpoint paths/param names AND the production by_model param contract ---
// The production code calls by_model keyed on a MODIFICATION SLUG (?modification=<slug>), not make/model/year.
// Confirm: (a) the cataloging chain returns slugs, (b) by_model accepts a modification slug and returns the
// same `technical` block. Record the exact endpoint paths + param names + which field is the modification slug.
async function dump(tag, url) {
  const res = await fetch(url); const text = await res.text()
  let body = null; try { body = JSON.parse(text) } catch {}
  console.log("catalog", tag, "status", res.status)
  writeFileSync(`backend/src/modules/wheel-size/__tests__/__fixtures__/catalog-${tag}.json`,
    JSON.stringify({ url: url.replace(KEY, "<key>"), status: res.status, body }, null, 2))
  return body
}
await dump("makes", `${BASE}/makes/?user_key=${KEY}`)
await dump("models", `${BASE}/models/?make=ford&user_key=${KEY}`)
await dump("years", `${BASE}/years/?make=ford&model=f-150&user_key=${KEY}`)
const mods = await dump("modifications", `${BASE}/modifications/?make=ford&model=f-150&year=2021&user_key=${KEY}`)
// Pull the first modification slug from the recorded modifications payload and call by_model by-slug:
const slug = mods?.data?.[0]?.slug ?? mods?.data?.[0]?.modification?.slug // adjust to the real field
await dump("by-model-by-modification", `${BASE}/search/by_model/?modification=${slug}&region=usdm&user_key=${KEY}`)
```

- [ ] **Step 3: Run it and record the five answers.** `node backend/scripts/wheel-size-validate.mjs`. For each vehicle open the saved fixture and record in the findings doc:
  1. **Parity:** the exact `bolt_pattern` string AND `stud_holes`/`pcd`. Compute `` `${stud_holes}x${pcd}` `` by hand and compare to what `canonicalBoltPatterns` would emit (e.g. `5x114.3`). **Specifically for the two `nonstd-*` trucks**, check whether the native-mm value (`6x132`, `8x180`) matches what an inch-sourced catalog wheel would produce (`6x132.1`, `8x180.3`).
  2. **JSON paths (v2):** the exact path to `bolt_pattern`, `pcd`, `stud_holes`, `centre_bore`, `wheels[].is_stock`, `wheels[].front/rear.{rim_diameter,rim_width,rim_offset}`. Confirm `centre_bore` is the **vehicle hub bore**.
  3. **Quota signal:** intentionally exhaust the sandbox hourly cap (loop the call) and record the exhaustion **HTTP status** (expected `403`) and whether the body is empty. Contrast with a genuine no-match (a nonsense make → expected `200` + empty data). Record whether Basic has a separate `by_model` sub-quota (check the docs / response headers). Record the daily reset boundary (00:00 GMT).
  4. **Window shape:** confirm `is_stock:true` = OEM, `is_stock:false` = aftermarket, and that rear rim values can be `null`.
  5. **Cataloging paths + by_model param contract (from the `catalog-*.json` fixtures):** record the EXACT v2 endpoint paths and param names for makes/models/years/modifications, **which response field is the modification slug**, and — critically — confirm **`by_model` accepts a `modification` slug param** (`?modification=<slug>`) and returns the same `technical` block as the make/model/year call. If `by_model` instead requires make+model+year (with or without the modification), record that: Tasks 4/6/9 and the `customer_vehicle` columns must then carry make/model/year (not just the slug), and `client.byModel` + the route param contract change accordingly. This reconciles the spike's call shape with the production call shape **before** Task 4.

- [ ] **Step 4: actor_id pre-build spike.** Start the dev backend (`cd backend && pnpm dev` after `pnpm ib` against a dev DB). Add a temporary route `backend/src/api/store/__authprobe/route.ts`:

```ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  res.json({ actor_id: (req as any).auth_context?.actor_id ?? null })
}
```

Log in as a storefront customer, then call `/store/__authprobe` with that customer's auth token + the publishable key. Record whether `actor_id` is populated. **Delete this probe route at the end of the task.** If `actor_id` is null, record the required middleware registration (Medusa `defineMiddlewares` with `authenticate("customer", ...)`) — Task 10 will need it.

- [ ] **Step 5: Write the findings + decision record.** In `docs/superpowers/specs/2026-05-30-wheel-size-task1-findings.md`, record all four answers plus a **GO / EXTEND-STANDARD-PCDS / BLOCK** decision:
  - **GO:** parity holds for standard PCDs and the non-standard trucks happen to match → no `STANDARD_PCDS` change.
  - **EXTEND-STANDARD-PCDS:** the non-standard trucks diverge → Task 2 extends `STANDARD_PCDS` (+ re-index) before any storefront fitment work.
  - **BLOCK:** standard PCDs diverge → stop; revisit `canonicalBoltPatterns`/`normalize` design before continuing.

- [ ] **Step 6: Clean up + commit.** Delete `backend/scripts/wheel-size-validate.mjs` and the `__authprobe` route. Keep the `__fixtures__/by-model-*.json` files (sanitized — they contain no key). Commit:

```bash
git add backend/src/modules/wheel-size/__tests__/__fixtures__ docs/superpowers/specs/2026-05-30-wheel-size-task1-findings.md
git commit -m "test(wheel-size): record Task-1 by_model fixtures + validation findings"
```

---

## PHASE 1 — Shared canonical fixture (+ conditional re-index)

### Task 2: Shared golden-vector fixture; conditional STANDARD_PCDS extension

**Files:**
- Create: `fixtures/bolt-pattern-canonical-golden.json`
- Modify (CONDITIONAL — only if Task 1 = EXTEND-STANDARD-PCDS): `backend/src/modules/vendor-sync/search/bolt-pattern-canonical.ts:17-20`

- [ ] **Step 1: Create the shared golden-vector fixture** from the existing backend test vectors plus the Task-1 reality.

```json
// fixtures/bolt-pattern-canonical-golden.json
[
  { "input": "5X120",       "output": ["5x120"] },
  { "input": "5X5.0",       "output": ["5x127"] },
  { "input": "5X114.3",     "output": ["5x114.3"] },
  { "input": "5X4.49",      "output": ["5x114.3"] },
  { "input": "6X135/5.5",   "output": ["6x135", "6x139.7"] },
  { "input": "6X155",       "output": ["6x155"] },
  { "input": "",            "output": [] },
  { "input": "N/A",         "output": [] }
]
```

- [ ] **Step 1b: Wire the BACKEND side of the shared fixture** (the spec §11 drift guarantee needs BOTH suites to read it; the existing `bolt-pattern-canonical.test.ts` uses hardcoded vectors and would not catch backend drift). Create `backend/src/modules/vendor-sync/__tests__/bolt-pattern-canonical-golden.test.ts` (it lives under `src/modules/vendor-sync`, so the existing `test:sync` glob picks it up):

```ts
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { canonicalBoltPatterns } from "../search/bolt-pattern-canonical"
// from backend/src/modules/vendor-sync/__tests__/ up to repo root: __tests__→vendor-sync→modules→src→backend→root = 5
const golden = JSON.parse(
  readFileSync(join(__dirname, "../../../../../fixtures/bolt-pattern-canonical-golden.json"), "utf8")
) as { input: string; output: string[] }[]
describe("canonicalBoltPatterns matches the shared golden vectors", () => {
  for (const { input, output } of golden) {
    it(`${JSON.stringify(input)} -> ${JSON.stringify(output)}`, () => {
      expect(canonicalBoltPatterns(input)).toEqual(output)
    })
  }
})
```

Run: `cd backend && npx jest src/modules/vendor-sync/__tests__/bolt-pattern-canonical-golden.test.ts` → PASS. (If the path depth is off, fix the relative path until it resolves — the file must read the SAME repo-root JSON the storefront vitest reads in Task 12.)

- [ ] **Step 2 (CONDITIONAL): if Task 1 = EXTEND-STANDARD-PCDS**, add the divergent PCDs to `STANDARD_PCDS` so both sides snap identically:

```ts
// backend/src/modules/vendor-sync/search/bolt-pattern-canonical.ts:17-20 — add 132 and 180 (sorted)
const STANDARD_PCDS = [
  98, 100, 105, 108, 110, 112, 114.3, 115, 118, 120, 120.65, 127, 130, 132, 135,
  139.7, 150, 160, 165.1, 170, 180, 205,
]
```

Then add the new vectors to the golden fixture (`{ "input": "6X5.2", "output": ["6x132"] }`, `{ "input": "8X7.1", "output": ["8x180"] }`) and update `backend/src/modules/vendor-sync/__tests__/bolt-pattern-canonical.test.ts` to assert them.

- [ ] **Step 3 (CONDITIONAL): re-index Meilisearch.** Because `bolt_patterns_canonical` is computed at index time, a `STANDARD_PCDS` change requires a backfill. Run the plugin reindex (or the one-shot used in Spec 1) against the dev index and confirm a known 6x132 wheel now carries `6x132`.

- [ ] **Step 4: Run the existing backend tests to confirm no regression.**

Run: `cd backend && pnpm test:sync` (defined as `jest --passWithNoTests src/modules/vendor-sync`; this now also runs the new `bolt-pattern-canonical-golden.test.ts`).
Expected: all suites green (don't chase a specific assertion count).

- [ ] **Step 5: Commit.**

```bash
git add fixtures/bolt-pattern-canonical-golden.json backend/src/modules/vendor-sync
git commit -m "feat(fitment): shared bolt-pattern golden fixture (+ STANDARD_PCDS extension if needed)"
```

---

## PHASE 2 — Backend `wheel-size` module

### Task 3: VehicleFitment types + `normalize.ts` (the parity unit)

**Files:**
- Create: `backend/src/modules/wheel-size/types.ts`
- Create: `backend/src/modules/wheel-size/normalize.ts`
- Test: `backend/src/modules/wheel-size/__tests__/normalize.test.ts`

- [ ] **Step 1: Write the types.** Use the EXACT v2 JSON paths recorded in Task 1; the interface below assumes the documented v2 `technical` block — adjust field paths to match the findings doc if they differ.

```ts
// backend/src/modules/wheel-size/types.ts
export type Window = { min: number; max: number } | null

export type VehicleFitment = {
  status: "ok" | "not_found"
  canonicalBoltPatterns: string[]
  hubBoreMm: number | null
  diameterWindow: Window
  widthWindow: Window
  offsetWindow: Window
  source: { modificationSlug: string; region: string }
}

// Minimal shape of the v2 by_model response we read (see Task-1 findings for the authoritative paths).
export type RawRim = { rim_diameter: number | null; rim_width: number | null; rim_offset: number | null }
export type RawWheelEntry = { is_stock: boolean; front?: RawRim | null; rear?: RawRim | null }
export type RawTechnical = { bolt_pattern?: string; pcd?: number; stud_holes?: number; centre_bore?: number }
export type RawByModelEntry = { technical?: RawTechnical; centre_bore?: number; wheels?: RawWheelEntry[] }
export type RawByModel = { data?: RawByModelEntry[] }
```

- [ ] **Step 2: Write the failing test** seeded from the Task-1 fixtures.

```ts
// backend/src/modules/wheel-size/__tests__/normalize.test.ts
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { normalizeByModel } from "../normalize"

const fx = (tag: string) =>
  JSON.parse(readFileSync(join(__dirname, "__fixtures__", `by-model-${tag}.json`), "utf8")).body

describe("normalizeByModel", () => {
  it("derives canonical bolt patterns via canonicalBoltPatterns (5x114.3 sedan)", () => {
    const f = normalizeByModel(fx("sedan-5x114_3"), { modificationSlug: "accord-2021", region: "usdm" })
    expect(f.status).toBe("ok")
    expect(f.canonicalBoltPatterns).toContain("5x114.3")
    expect(f.hubBoreMm).toBeGreaterThan(0)
    expect(f.source).toEqual({ modificationSlug: "accord-2021", region: "usdm" })
  })

  it("returns not_found for an empty data array", () => {
    const f = normalizeByModel({ data: [] }, { modificationSlug: "x", region: "usdm" })
    expect(f.status).toBe("not_found")
    expect(f.canonicalBoltPatterns).toEqual([])
  })

  it("skips null rear rim values when building windows", () => {
    const raw = { data: [{ technical: { stud_holes: 5, pcd: 114.3, centre_bore: 64.1 },
      wheels: [{ is_stock: true, front: { rim_diameter: 17, rim_width: 7, rim_offset: 45 }, rear: { rim_diameter: null, rim_width: null, rim_offset: null } },
               { is_stock: false, front: { rim_diameter: 19, rim_width: 8.5, rim_offset: 35 }, rear: null }] }] }
    const f = normalizeByModel(raw as any, { modificationSlug: "x", region: "usdm" })
    expect(f.diameterWindow).toEqual({ min: 19, max: 19 }) // only is_stock:false entries form the aftermarket window
    expect(f.widthWindow).toEqual({ min: 8.5, max: 8.5 })
    expect(f.offsetWindow).toEqual({ min: 35, max: 35 })
  })

  it("returns null windows when only OEM rows exist", () => {
    const raw = { data: [{ technical: { stud_holes: 5, pcd: 120, centre_bore: 72.6 },
      wheels: [{ is_stock: true, front: { rim_diameter: 18, rim_width: 8, rim_offset: 30 }, rear: null }] }] }
    const f = normalizeByModel(raw as any, { modificationSlug: "x", region: "usdm" })
    expect(f.diameterWindow).toBeNull()
  })
})
```

- [ ] **Step 3: Run it to confirm it fails.**

Run: `cd backend && npx jest src/modules/wheel-size/__tests__/normalize.test.ts`
Expected: FAIL — "Cannot find module '../normalize'".

- [ ] **Step 4: Implement `normalize.ts`.**

```ts
// backend/src/modules/wheel-size/normalize.ts
import { canonicalBoltPatterns } from "../vendor-sync/search/bolt-pattern-canonical"
import { RawByModel, RawWheelEntry, VehicleFitment, Window } from "./types"

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null

function windowFrom(values: (number | null)[]): Window {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v))
  if (!nums.length) return null
  return { min: Math.min(...nums), max: Math.max(...nums) }
}

export function normalizeByModel(
  raw: RawByModel | null | undefined,
  source: { modificationSlug: string; region: string }
): VehicleFitment {
  const entry = raw?.data?.[0]
  if (!entry) {
    return { status: "not_found", canonicalBoltPatterns: [], hubBoreMm: null,
      diameterWindow: null, widthWindow: null, offsetWindow: null, source }
  }

  const tech = entry.technical ?? {}
  const studs = num(tech.stud_holes)
  const pcd = num(tech.pcd)
  const canonical = studs != null && pcd != null
    ? Array.from(new Set(canonicalBoltPatterns(`${studs}x${pcd}`)))
    : []

  // Defensive hub-bore read: technical.centre_bore, falling back to a top-level centre_bore.
  const hubBoreMm = num(tech.centre_bore) ?? num(entry.centre_bore)
  if (hubBoreMm == null) {
    // eslint-disable-next-line no-console
    console.warn("[wheel-size] centre_bore absent on by_model response", source)
  }

  // Aftermarket window = is_stock:false entries (front+rear merged), null rims skipped.
  const opt = (entry.wheels ?? []).filter((w: RawWheelEntry) => w.is_stock === false)
  const rims = opt.flatMap((w) => [w.front, w.rear]).filter(Boolean) as { rim_diameter: number | null; rim_width: number | null; rim_offset: number | null }[]

  return {
    status: "ok",
    canonicalBoltPatterns: canonical,
    hubBoreMm,
    diameterWindow: windowFrom(rims.map((r) => r.rim_diameter)),
    widthWindow: windowFrom(rims.map((r) => r.rim_width)),
    offsetWindow: windowFrom(rims.map((r) => r.rim_offset)),
    source,
  }
}
```

- [ ] **Step 5: Run the tests to confirm they pass.**

Run: `cd backend && npx jest src/modules/wheel-size/__tests__/normalize.test.ts`
Expected: PASS. (If the sedan fixture's real canonical differs from `5x114.3`, fix the fixture's expectation to the recorded reality, not the code.)

- [ ] **Step 6: Commit.**

```bash
git add backend/src/modules/wheel-size/types.ts backend/src/modules/wheel-size/normalize.ts backend/src/modules/wheel-size/__tests__/normalize.test.ts
git commit -m "feat(wheel-size): VehicleFitment normalize() with canonicalBoltPatterns parity"
```

### Task 4: `client.ts` (HTTP wrapper that exposes status + empty-body)

**Files:**
- Create: `backend/src/modules/wheel-size/client.ts`
- Test: `backend/src/modules/wheel-size/__tests__/client.test.ts`

- [ ] **Step 1: Write the failing test** (uses a stubbed `fetch`).

```ts
// backend/src/modules/wheel-size/__tests__/client.test.ts
import { WheelSizeClient } from "../client"

describe("WheelSizeClient", () => {
  it("reports status and empty-body for a quota-exhausted (403 empty) response", async () => {
    const fakeFetch = async () => ({ status: 403, text: async () => "" }) as any
    const c = new WheelSizeClient({ apiKey: "k", baseUrl: "https://api.wheel-size.com/v2", fetchImpl: fakeFetch })
    const r = await c.byModel({ modification: "accord-2021", region: "usdm" })
    expect(r.status).toBe(403)
    expect(r.empty).toBe(true)
    expect(r.body).toBeNull()
  })

  it("parses a 200 body", async () => {
    const fakeFetch = async () => ({ status: 200, text: async () => JSON.stringify({ data: [{ technical: { pcd: 114.3, stud_holes: 5 } }] }) }) as any
    const c = new WheelSizeClient({ apiKey: "k", baseUrl: "https://api.wheel-size.com/v2", fetchImpl: fakeFetch })
    const r = await c.byModel({ modification: "accord-2021", region: "usdm" })
    expect(r.status).toBe(200)
    expect(r.empty).toBe(false)
    expect(r.body?.data?.[0]?.technical?.pcd).toBe(114.3)
  })
})
```

- [ ] **Step 2: Run it, confirm FAIL** (`npx jest src/modules/wheel-size/__tests__/client.test.ts`) — "Cannot find module '../client'".

- [ ] **Step 3: Implement `client.ts`.**

```ts
// backend/src/modules/wheel-size/client.ts
type FetchImpl = (url: string) => Promise<{ status: number; text: () => Promise<string> }>
export type ClientResult = { status: number; empty: boolean; body: any | null }

export class WheelSizeClient {
  private apiKey: string
  private baseUrl: string
  private fetchImpl: FetchImpl
  constructor(opts: { apiKey: string; baseUrl: string; fetchImpl?: FetchImpl }) {
    this.apiKey = opts.apiKey
    this.baseUrl = opts.baseUrl.replace(/\/$/, "")
    this.fetchImpl = opts.fetchImpl ?? ((url) => fetch(url) as any)
  }
  private async get(path: string, params: Record<string, string>): Promise<ClientResult> {
    const qs = new URLSearchParams({ ...params, user_key: this.apiKey }).toString()
    const res = await this.fetchImpl(`${this.baseUrl}${path}?${qs}`)
    const text = await res.text()
    const empty = text.length === 0
    let body: any = null
    if (!empty) { try { body = JSON.parse(text) } catch { body = null } }
    return { status: res.status, empty, body }
  }
  byModel(p: { modification: string; region: string }): Promise<ClientResult> {
    return this.get("/search/by_model/", { modification: p.modification, region: p.region })
  }
  // Cataloging (lazy). Slugs per Task-1 findings.
  makes(): Promise<ClientResult> { return this.get("/makes/", {}) }
  models(make: string): Promise<ClientResult> { return this.get("/models/", { make }) }
  years(make: string, model: string): Promise<ClientResult> { return this.get("/years/", { make, model }) }
  modifications(make: string, model: string, year: string): Promise<ClientResult> {
    return this.get("/modifications/", { make, model, year })
  }
}
```

- [ ] **Step 4: Run, confirm PASS.** `cd backend && npx jest src/modules/wheel-size/__tests__/client.test.ts` → PASS.

- [ ] **Step 5: Commit.**

```bash
git add backend/src/modules/wheel-size/client.ts backend/src/modules/wheel-size/__tests__/client.test.ts
git commit -m "feat(wheel-size): HTTP client exposing status + empty-body for quota detection"
```

### Task 5: Models + migration

**Files:**
- Create: `backend/src/modules/wheel-size/models/wheel-size-catalog.ts`, `models/wheel-size-fitment.ts`, `models/wheel-size-quota.ts`

- [ ] **Step 1: Write the three models.**

```ts
// backend/src/modules/wheel-size/models/wheel-size-catalog.ts
import { model } from "@medusajs/framework/utils"
const WheelSizeCatalog = model.define("wheel_size_catalog", {
  id: model.id().primaryKey(),
  kind: model.text(),          // "makes" | "models" | "years" | "modifications"
  key: model.text(),           // the query signature, e.g. "ford|f-150|2021"
  payload: model.json(),
  fetched_at: model.dateTime(),
}).indexes([{ on: ["kind", "key"], unique: true }])
export default WheelSizeCatalog
```

```ts
// backend/src/modules/wheel-size/models/wheel-size-fitment.ts
import { model } from "@medusajs/framework/utils"
const WheelSizeFitment = model.define("wheel_size_fitment", {
  id: model.id().primaryKey(),
  cache_key: model.text(),     // `${modificationSlug}|${region}`
  region: model.text(),
  raw: model.json().nullable(),
  canonical_bolt_patterns: model.json(),
  hub_bore_mm: model.number().nullable(),
  diameter_window: model.json().nullable(),
  width_window: model.json().nullable(),
  offset_window: model.json().nullable(),
  status: model.text(),        // "ok" | "not_found"
  fetched_at: model.dateTime(),
}).indexes([{ on: ["cache_key"], unique: true }])
export default WheelSizeFitment
```

```ts
// backend/src/modules/wheel-size/models/wheel-size-quota.ts
import { model } from "@medusajs/framework/utils"
const WheelSizeQuota = model.define("wheel_size_quota", {
  id: model.id().primaryKey(),
  day: model.text(),           // "YYYY-MM-DD" in GMT (the wheel-size reset boundary)
  count: model.number().default(0),
}).indexes([{ on: ["day"], unique: true }])
export default WheelSizeQuota
```

- [ ] **Step 2: Models only — do NOT generate the migration here.** `db:generate` resolves the module by its registered name and needs `service.ts` + the `medusa-config.js` registration, which land in Task 6. The migration + snapshot are generated **once**, after registration, in **Task 6 Step 9**. (This task creates only the three model files.)

- [ ] **Step 3: Commit.**

```bash
git add backend/src/modules/wheel-size/models
git commit -m "feat(wheel-size): cache + quota models"
```

### Task 6: `WheelSizeService` + module registration + config wiring

**Files:**
- Create: `backend/src/modules/wheel-size/service.ts`, `backend/src/modules/wheel-size/index.ts`
- Modify: `backend/src/lib/constants.ts`, `backend/medusa-config.js`, `backend/package.json`
- Test: `backend/src/modules/wheel-size/__tests__/service.test.ts`

- [ ] **Step 1: Write `index.ts`.**

```ts
// backend/src/modules/wheel-size/index.ts
import { Module } from "@medusajs/framework/utils"
import WheelSizeService from "./service"
export const WHEEL_SIZE_MODULE = "wheelSizeModuleService"
export default Module(WHEEL_SIZE_MODULE, { service: WheelSizeService })
```

- [ ] **Step 2: Write the failing service test** (covers the classifier + cache, with a stub client + stubbed model methods).

```ts
// backend/src/modules/wheel-size/__tests__/service.test.ts
import WheelSizeService from "../service"

function makeService(clientResults: any[], opts: any = {}) {
  let i = 0
  const client = { byModel: async () => clientResults[i++] }
  const store: any = { fitment: new Map(), quota: { day: "", count: 0 } }
  const svc = new (WheelSizeService as any)({ logger: { warn() {}, error() {} } }, { apiKey: "k", baseUrl: "b", defaultRegion: "usdm", ...opts })
  svc.client_ = client
  // stub the MedusaService-generated methods used by getFitment
  svc.listWheelSizeFitments = async ({ cache_key }: any) => { const v = store.fitment.get(cache_key); return v ? [v] : [] }
  svc.createWheelSizeFitments = async (row: any) => { store.fitment.set(row.cache_key, row); return row }
  svc._quotaCount = 0
  svc.incrementAndCheckQuota = async () => { svc._quotaCount++; return svc._quotaCount <= (opts.ceiling ?? 5000) }
  return { svc, store }
}

describe("WheelSizeService.getFitment", () => {
  it("classifies non-2xx empty body as an outage (throws QuotaOutageError)", async () => {
    const { svc } = makeService([{ status: 403, empty: true, body: null }])
    await expect(svc.getFitment({ modificationSlug: "m", region: "usdm" })).rejects.toThrow(/outage/i)
  })

  it("classifies 200 + empty data as not_found and caches the sentinel", async () => {
    const { svc, store } = makeService([{ status: 200, empty: false, body: { data: [] } }])
    const f = await svc.getFitment({ modificationSlug: "m", region: "usdm" })
    expect(f.status).toBe("not_found")
    expect(store.fitment.get("m|usdm").status).toBe("not_found")
  })

  it("returns the cached row on the second call without hitting the client", async () => {
    const { svc } = makeService([{ status: 200, empty: false, body: { data: [{ technical: { stud_holes: 5, pcd: 114.3, centre_bore: 64.1 }, wheels: [] } ] } }])
    const a = await svc.getFitment({ modificationSlug: "m", region: "usdm" })
    const b = await svc.getFitment({ modificationSlug: "m", region: "usdm" }) // client would throw (no 2nd result) if called
    expect(a.canonicalBoltPatterns).toEqual(b.canonicalBoltPatterns)
  })
})
```

- [ ] **Step 3: Run it, confirm FAIL** (`npx jest src/modules/wheel-size/__tests__/service.test.ts`).

- [ ] **Step 4: Implement `service.ts`.** Quota counter persisted via the `WheelSizeQuota` model (GMT day key). `QuotaOutageError` is what the route maps to `503`.

```ts
// backend/src/modules/wheel-size/service.ts
import { MedusaService } from "@medusajs/framework/utils"
import WheelSizeCatalog from "./models/wheel-size-catalog"
import WheelSizeFitment from "./models/wheel-size-fitment"
import WheelSizeQuota from "./models/wheel-size-quota"
import { WheelSizeClient } from "./client"
import { normalizeByModel } from "./normalize"
import { VehicleFitment } from "./types"

export class QuotaOutageError extends Error {
  constructor() { super("wheel-size quota outage") ; this.name = "QuotaOutageError" }
}

type Options = { apiKey: string; baseUrl?: string; defaultRegion?: string; dailyCeiling?: number }

class WheelSizeService extends MedusaService({ WheelSizeCatalog, WheelSizeFitment, WheelSizeQuota }) {
  protected logger_: any
  protected options_: Options
  protected client_: WheelSizeClient
  protected ceiling_: number

  constructor(container: any, options: Options) {
    super(...arguments as any)
    this.logger_ = container?.logger ?? console
    this.options_ = options ?? ({} as Options)
    this.ceiling_ = options?.dailyCeiling ?? 5000
    this.client_ = new WheelSizeClient({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl ?? "https://api.wheel-size.com/v2",
    })
  }

  private gmtDay(): string {
    // GMT calendar day, no Date.now() in test paths — uses new Date() at runtime only.
    return new Date().toISOString().slice(0, 10)
  }

  async incrementAndCheckQuota(): Promise<boolean> {
    const day = this.gmtDay()
    const rows = await this.listWheelSizeQuotas({ day })
    const current = rows[0]
    if (!current) { await this.createWheelSizeQuotas({ day, count: 1 }); return 1 <= this.ceiling_ }
    const next = (current.count ?? 0) + 1
    await this.updateWheelSizeQuotas({ id: current.id, count: next })
    return next <= this.ceiling_
  }

  async getFitment(p: { modificationSlug: string; region?: string }): Promise<VehicleFitment> {
    const region = p.region ?? this.options_.defaultRegion ?? "usdm"
    const cache_key = `${p.modificationSlug}|${region}`

    const cached = await this.listWheelSizeFitments({ cache_key })
    if (cached[0]) {
      const c = cached[0]
      return { status: c.status, canonicalBoltPatterns: c.canonical_bolt_patterns ?? [],
        hubBoreMm: c.hub_bore_mm ?? null, diameterWindow: c.diameter_window ?? null,
        widthWindow: c.width_window ?? null, offsetWindow: c.offset_window ?? null,
        source: { modificationSlug: p.modificationSlug, region } }
    }

    const underQuota = await this.incrementAndCheckQuota()
    if (!underQuota) throw new QuotaOutageError()

    const res = await this.client_.byModel({ modification: p.modificationSlug, region })
    // Classification (spec §10): any non-2xx => outage (this build folds wheel-size 5xx/network
    // into the same user-facing "fitment unavailable" 503; the storefront data layer retries first).
    // A 200 with empty `data` is genuine no-data => not_found (handled by normalizeByModel below).
    if (res.status >= 300) throw new QuotaOutageError()

    const fitment = normalizeByModel(res.body, { modificationSlug: p.modificationSlug, region })
    await this.createWheelSizeFitments({
      cache_key, region, raw: res.body, canonical_bolt_patterns: fitment.canonicalBoltPatterns,
      hub_bore_mm: fitment.hubBoreMm, diameter_window: fitment.diameterWindow,
      width_window: fitment.widthWindow, offset_window: fitment.offsetWindow,
      status: fitment.status, fetched_at: new Date(),
    })
    return fitment
  }

  // Cataloging (lazy read-through). Same read→miss→write→cache shape; payload stored verbatim.
  private async catalog(kind: string, key: string, fetcher: () => Promise<any>): Promise<any> {
    const hit = await this.listWheelSizeCatalogs({ kind, key })
    if (hit[0]) return hit[0].payload
    const res = await fetcher()
    if (res.status >= 300) throw new QuotaOutageError()
    await this.createWheelSizeCatalogs({ kind, key, payload: res.body, fetched_at: new Date() })
    return res.body
  }
  listMakes() { return this.catalog("makes", "all", () => this.client_.makes()) }
  listModels(make: string) { return this.catalog("models", make, () => this.client_.models(make)) }
  listYears(make: string, model: string) { return this.catalog("years", `${make}|${model}`, () => this.client_.years(make, model)) }
  listModifications(make: string, model: string, year: string) {
    return this.catalog("modifications", `${make}|${model}|${year}`, () => this.client_.modifications(make, model, year))
  }
}
export default WheelSizeService
```

- [ ] **Step 5: Run the service test, confirm PASS.** `cd backend && npx jest src/modules/wheel-size/__tests__/service.test.ts` → PASS.

- [ ] **Step 6: Add env constants.** Append to `backend/src/lib/constants.ts` (bare `process.env`, NO `assertValue`):

```ts
export const WHEEL_SIZE_API_KEY = process.env.WHEEL_SIZE_API_KEY
export const WHEEL_SIZE_BASE_URL = process.env.WHEEL_SIZE_BASE_URL
export const WHEEL_SIZE_REGION = process.env.WHEEL_SIZE_REGION
```

- [ ] **Step 7: Wire the module in `medusa-config.js`.** Add the three names to the destructured `lib/constants` import, then add this entry to the `modules` array (after the vendor-sync block):

```js
    ...(WHEEL_SIZE_API_KEY ? [{
      resolve: './src/modules/wheel-size',
      options: {
        apiKey: WHEEL_SIZE_API_KEY,
        baseUrl: WHEEL_SIZE_BASE_URL ?? 'https://api.wheel-size.com/v2',
        defaultRegion: WHEEL_SIZE_REGION ?? 'usdm',
        dailyCeiling: 5000,
      },
    }] : []),
```

- [ ] **Step 8: Add the test script.** In `backend/package.json` scripts add:

```json
"test:fitment": "jest src/modules/wheel-size src/modules/customer-vehicle",
```

- [ ] **Step 9: Generate the migration (sole point), clear cache, migrate, run tests.** The module is now registered (Step 7) and `service.ts` exists (Step 4), so `db:generate` can resolve it. From `backend/`:

```bash
cd backend
npx -y pnpm@9.10.0 exec medusa db:generate wheelSizeModuleService   # creates migrations/Migration<ts>.ts + .snapshot-wheel-size-module.json
rm -rf .medusa/server
npx -y pnpm@9.10.0 exec medusa db:migrate
pnpm test:fitment
```
Expected: snapshot + migration created and applied; `test:fitment` PASS.

- [ ] **Step 10: Commit.**

```bash
git add backend/src/modules/wheel-size backend/src/lib/constants.ts backend/medusa-config.js backend/package.json
git commit -m "feat(wheel-size): WheelSizeService (cache + quota + classifier) wired into medusa-config"
```

---

## PHASE 3 — Backend `customer-vehicle` module

### Task 7: `customer_vehicle` model + service + registration

**Files:**
- Create: `backend/src/modules/customer-vehicle/models/customer-vehicle.ts`, `service.ts`, `index.ts`
- Modify: `backend/medusa-config.js`
- Test: `backend/src/modules/customer-vehicle/__tests__/service.test.ts`

- [ ] **Step 1: Write the model.**

```ts
// backend/src/modules/customer-vehicle/models/customer-vehicle.ts
import { model } from "@medusajs/framework/utils"
const CustomerVehicle = model.define("customer_vehicle", {
  id: model.id().primaryKey(),
  customer_id: model.text(),
  client_id: model.text(),
  year: model.number(),
  make: model.text(),
  model: model.text(),
  trim: model.text().nullable(),
  modification_slug: model.text().nullable(),
  is_active: model.boolean().default(false),
  canonical_bolt_patterns: model.json().nullable(),
  hub_bore_mm: model.number().nullable(),
  diameter_window: model.json().nullable(),
  width_window: model.json().nullable(),
  offset_window: model.json().nullable(),
  fitment_status: model.text().nullable(),
  notes: model.text().nullable(),
}).indexes([
  { on: ["customer_id"] },
  { on: ["customer_id", "client_id"], unique: true },
])
export default CustomerVehicle
```

- [ ] **Step 2: Write `index.ts`.**

```ts
// backend/src/modules/customer-vehicle/index.ts
import { Module } from "@medusajs/framework/utils"
import CustomerVehicleService from "./service"
export const CUSTOMER_VEHICLE_MODULE = "customerVehicleModuleService"
export default Module(CUSTOMER_VEHICLE_MODULE, { service: CustomerVehicleService })
```

- [ ] **Step 3: Write the failing test for the single-active invariant.**

```ts
// backend/src/modules/customer-vehicle/__tests__/service.test.ts
import CustomerVehicleService from "../service"

function makeService() {
  const rows: any[] = []
  const svc = new (CustomerVehicleService as any)({})
  svc.listCustomerVehicles = async (f: any) => rows.filter(r => r.customer_id === f.customer_id && (f.is_active === undefined || r.is_active === f.is_active))
  svc.updateCustomerVehicles = async (u: any) => { const r = rows.find(x => x.id === u.id); Object.assign(r, u); return r }
  svc._rows = rows
  return { svc, rows }
}

describe("activate enforces single-active", () => {
  it("clears is_active on the customer's other vehicles", async () => {
    const { svc, rows } = makeService()
    rows.push({ id: "a", customer_id: "c1", is_active: true }, { id: "b", customer_id: "c1", is_active: false }, { id: "z", customer_id: "c2", is_active: true })
    await svc.activate("b", "c1")
    expect(rows.find(r => r.id === "a").is_active).toBe(false)
    expect(rows.find(r => r.id === "b").is_active).toBe(true)
    expect(rows.find(r => r.id === "z").is_active).toBe(true) // other customer untouched
  })
})
```

- [ ] **Step 4: Run, confirm FAIL.** `cd backend && npx jest src/modules/customer-vehicle/__tests__/service.test.ts`.

- [ ] **Step 5: Implement `service.ts`.**

```ts
// backend/src/modules/customer-vehicle/service.ts
import { MedusaService } from "@medusajs/framework/utils"
import CustomerVehicle from "./models/customer-vehicle"

class CustomerVehicleService extends MedusaService({ CustomerVehicle }) {
  async activate(id: string, customerId: string): Promise<void> {
    const active = await this.listCustomerVehicles({ customer_id: customerId, is_active: true })
    for (const v of active) {
      if (v.id !== id) await this.updateCustomerVehicles({ id: v.id, is_active: false })
    }
    await this.updateCustomerVehicles({ id, is_active: true })
  }
}
export default CustomerVehicleService
```

- [ ] **Step 6: Run, confirm PASS.**

- [ ] **Step 7: Register unconditionally in `medusa-config.js`** — add to the `modules` array (bare object, no env gate):

```js
    { resolve: './src/modules/customer-vehicle' },
```

- [ ] **Step 8: Generate migration, clear cache, migrate, test.**

```bash
cd backend
npx -y pnpm@9.10.0 exec medusa db:generate customerVehicleModuleService
rm -rf .medusa/server
npx -y pnpm@9.10.0 exec medusa db:migrate
pnpm test:fitment
```
Expected: migration applied; PASS.

- [ ] **Step 9: Commit.**

```bash
git add backend/src/modules/customer-vehicle backend/medusa-config.js
git commit -m "feat(customer-vehicle): garage module with single-active invariant"
```

---

## PHASE 4 — Backend store routes

### Task 8: vehicle-catalog routes (YMM dropdowns)

**Files:**
- Create: `backend/src/api/store/vehicle-catalog/makes/route.ts`, `models/route.ts`, `years/route.ts`, `modifications/route.ts`

- [ ] **Step 1: Write the four routes.** Each resolves the wheel-size service and returns its cataloging payload. Example for makes (the other three follow the same shape with their params):

```ts
// backend/src/api/store/vehicle-catalog/makes/route.ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { WHEEL_SIZE_MODULE } from "../../../../modules/wheel-size"
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const svc = req.scope.resolve(WHEEL_SIZE_MODULE) as any
  res.json({ makes: await svc.listMakes() })
}
```

```ts
// backend/src/api/store/vehicle-catalog/models/route.ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { WHEEL_SIZE_MODULE } from "../../../../modules/wheel-size"
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const { make } = req.query as Record<string, string>
  const svc = req.scope.resolve(WHEEL_SIZE_MODULE) as any
  res.json({ models: await svc.listModels(make) })
}
```

```ts
// backend/src/api/store/vehicle-catalog/years/route.ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { WHEEL_SIZE_MODULE } from "../../../../modules/wheel-size"
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const { make, model } = req.query as Record<string, string>
  const svc = req.scope.resolve(WHEEL_SIZE_MODULE) as any
  res.json({ years: await svc.listYears(make, model) })
}
```

```ts
// backend/src/api/store/vehicle-catalog/modifications/route.ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { WHEEL_SIZE_MODULE } from "../../../../modules/wheel-size"
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const { make, model, year } = req.query as Record<string, string>
  const svc = req.scope.resolve(WHEEL_SIZE_MODULE) as any
  res.json({ modifications: await svc.listModifications(make, model, year) })
}
```

- [ ] **Step 2: Manual verification.** With the dev backend running and `WHEEL_SIZE_API_KEY` set: `curl "http://localhost:9000/store/vehicle-catalog/makes" -H "x-publishable-api-key: <pk>"` returns a non-empty `makes` payload (and a second call is served from cache — confirm via DB row in `wheel_size_catalog`).

- [ ] **Step 3: Commit.**

```bash
git add backend/src/api/store/vehicle-catalog
git commit -m "feat(api): store vehicle-catalog routes (lazy-cached YMM dropdowns)"
```

### Task 9: fitment/by-vehicle route (the only by_model trigger)

**Files:**
- Create: `backend/src/api/store/fitment/by-vehicle/route.ts`

- [ ] **Step 1: Write the route**, mapping `QuotaOutageError` → `503`.

```ts
// backend/src/api/store/fitment/by-vehicle/route.ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { WHEEL_SIZE_MODULE } from "../../../../modules/wheel-size"
import { QuotaOutageError } from "../../../../modules/wheel-size/service"
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const { modification, region } = req.query as Record<string, string>
  if (!modification) { res.status(400).json({ error: "modification is required" }); return }
  const svc = req.scope.resolve(WHEEL_SIZE_MODULE) as any
  try {
    const fitment = await svc.getFitment({ modificationSlug: modification, region })
    res.json({ fitment })
  } catch (e) {
    if (e instanceof QuotaOutageError) {
      res.status(503).json({ error: "fitment_unavailable", message: "Fitment temporarily unavailable. Please contact support." })
      return
    }
    throw e
  }
}
```

- [ ] **Step 2: Manual verification (also catches MedusaService generated-method-name mistakes).** `curl "http://localhost:9000/store/fitment/by-vehicle?modification=<slug-from-catalog>&region=usdm" -H "x-publishable-api-key: <pk>"` returns `{ fitment: { status:"ok", canonicalBoltPatterns:[...] , ... } }`. Then confirm against the dev DB that a `wheel_size_fitment` row and a `wheel_size_quota` row were actually written (the unit tests stub the generated `create*/update*/list*` methods, so this is the first real exercise of the generated names + the single-object `update` shape). A second call is cache-served — confirm the `wheel_size_quota.count` did **not** increment twice (cache hit, no new `by_model`).

- [ ] **Step 3: Commit.**

```bash
git add backend/src/api/store/fitment
git commit -m "feat(api): store fitment/by-vehicle route (503 on quota outage)"
```

### Task 10: customer/vehicles CRUD + activate (scoped to actor_id)

**Files:**
- Create: `backend/src/api/store/customer/vehicles/route.ts`, `[id]/route.ts`, `[id]/activate/route.ts`
- Create (CONDITIONAL — only if Task-1 spike showed `actor_id` is null on store routes): `backend/src/api/middlewares.ts`

- [ ] **Step 1 (CONDITIONAL): register customer auth** if Task 1 found `actor_id` unpopulated:

```ts
// backend/src/api/middlewares.ts
import { defineMiddlewares, authenticate } from "@medusajs/framework/http"
export default defineMiddlewares({
  routes: [{ matcher: "/store/customer/vehicles*", middlewares: [authenticate("customer", ["session", "bearer"])] }],
})
```

- [ ] **Step 2: Write the list/create route.** A helper reads the actor; 401 when absent.

```ts
// backend/src/api/store/customer/vehicles/route.ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { CUSTOMER_VEHICLE_MODULE } from "../../../../modules/customer-vehicle"
const actor = (req: MedusaRequest) => (req as any).auth_context?.actor_id as string | undefined
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const customerId = actor(req); if (!customerId) { res.status(401).json({ error: "unauthorized" }); return }
  const svc = req.scope.resolve(CUSTOMER_VEHICLE_MODULE) as any
  res.json({ vehicles: await svc.listCustomerVehicles({ customer_id: customerId }) })
}
export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const customerId = actor(req); if (!customerId) { res.status(401).json({ error: "unauthorized" }); return }
  const b = req.body as any
  const svc = req.scope.resolve(CUSTOMER_VEHICLE_MODULE) as any
  const existing = await svc.listCustomerVehicles({ customer_id: customerId, client_id: b.client_id })
  if (existing[0]) { res.json({ vehicle: existing[0] }); return } // idempotent on (customer_id, client_id)
  const vehicle = await svc.createCustomerVehicles({
    customer_id: customerId, client_id: b.client_id, year: b.year, make: b.make, model: b.model,
    trim: b.trim ?? null, modification_slug: b.modificationSlug ?? null, is_active: !!b.is_active,
    canonical_bolt_patterns: b.canonicalBoltPatterns ?? null, hub_bore_mm: b.hubBoreMm ?? null,
    diameter_window: b.diameterWindow ?? null, width_window: b.widthWindow ?? null,
    offset_window: b.offsetWindow ?? null, fitment_status: b.fitmentStatus ?? null, notes: b.notes ?? null,
  })
  res.status(201).json({ vehicle })
}
```

- [ ] **Step 3: Write the `[id]` update/delete route** (scope every write to the actor).

```ts
// backend/src/api/store/customer/vehicles/[id]/route.ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { CUSTOMER_VEHICLE_MODULE } from "../../../../../modules/customer-vehicle"
const actor = (req: MedusaRequest) => (req as any).auth_context?.actor_id as string | undefined
async function owned(svc: any, id: string, customerId: string) {
  const rows = await svc.listCustomerVehicles({ id, customer_id: customerId }); return rows[0]
}
export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const customerId = actor(req); if (!customerId) { res.status(401).json({ error: "unauthorized" }); return }
  const { id } = req.params; const b = req.body as any
  const svc = req.scope.resolve(CUSTOMER_VEHICLE_MODULE) as any
  if (!(await owned(svc, id, customerId))) { res.status(404).json({ error: "not_found" }); return }
  const vehicle = await svc.updateCustomerVehicles({
    id, modification_slug: b.modificationSlug, canonical_bolt_patterns: b.canonicalBoltPatterns,
    hub_bore_mm: b.hubBoreMm, diameter_window: b.diameterWindow, width_window: b.widthWindow,
    offset_window: b.offsetWindow, fitment_status: b.fitmentStatus, trim: b.trim, notes: b.notes,
  })
  res.json({ vehicle })
}
export async function DELETE(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const customerId = actor(req); if (!customerId) { res.status(401).json({ error: "unauthorized" }); return }
  const { id } = req.params
  const svc = req.scope.resolve(CUSTOMER_VEHICLE_MODULE) as any
  if (!(await owned(svc, id, customerId))) { res.status(404).json({ error: "not_found" }); return }
  await svc.deleteCustomerVehicles(id)
  res.status(200).json({ id, deleted: true })
}
```

- [ ] **Step 4: Write the `[id]/activate` route.**

```ts
// backend/src/api/store/customer/vehicles/[id]/activate/route.ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { CUSTOMER_VEHICLE_MODULE } from "../../../../../../modules/customer-vehicle"
const actor = (req: MedusaRequest) => (req as any).auth_context?.actor_id as string | undefined
export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const customerId = actor(req); if (!customerId) { res.status(401).json({ error: "unauthorized" }); return }
  const { id } = req.params
  const svc = req.scope.resolve(CUSTOMER_VEHICLE_MODULE) as any
  const rows = await svc.listCustomerVehicles({ id, customer_id: customerId })
  if (!rows[0]) { res.status(404).json({ error: "not_found" }); return }
  await svc.activate(id, customerId)
  res.json({ id, active: true })
}
```

- [ ] **Step 5: Manual verification** with a logged-in storefront customer token: POST a vehicle → GET lists it → POST `/activate` → GET shows exactly one `is_active:true` → re-POST the same `client_id` returns the existing row (no duplicate) → DELETE removes it. Confirm a different customer's token cannot see or mutate it (404).

- [ ] **Step 6: Commit.**

```bash
git add backend/src/api/store/customer backend/src/api/middlewares.ts
git commit -m "feat(api): customer garage CRUD + activate, scoped to auth actor"
```

---

## PHASE 5 — Storefront pure units + test infra

### Task 11: Add vitest to the storefront

**Files:**
- Create: `storefront/vitest.config.ts`
- Modify: `storefront/package.json`

- [ ] **Step 1: Install vitest** (pnpm-on-Windows workaround): `cd storefront && npx -y pnpm@9.10.0 add -D vitest@^2.1.9`. **Pin to v2 (^2.1.9), not v4** — vitest 4 requires `vite@^6||^7||^8` as a peer, which pnpm refuses to resolve in this React-19 repo (`Conflicting peer dependencies: vite`), and `vitest run` then crashes with `Cannot find package 'vite'`. v2.1.9 bundles its own `vite@5.4.x` and installs cleanly. *(Confirmed during Batch-1 implementation — commit `ae40f41`.)*

- [ ] **Step 2: Add config.**

```ts
// storefront/vitest.config.ts
import { defineConfig } from "vitest/config"
export default defineConfig({
  test: { include: ["src/**/*.test.ts"], environment: "node" },
})
```

- [ ] **Step 3: Add script** to `storefront/package.json`: `"test:unit": "vitest run",`

- [ ] **Step 4: Sanity test.** Create `storefront/src/lib/fitment/__tests__/smoke.test.ts` with `import { it, expect } from "vitest"; it("runs", () => expect(1).toBe(1))`. Run `cd storefront && pnpm test:unit` → PASS. Delete the smoke file.

- [ ] **Step 5: Commit.**

```bash
git add storefront/vitest.config.ts storefront/package.json storefront/pnpm-lock.yaml
git commit -m "test(storefront): add vitest for pure fitment units"
```

### Task 12: `canonicalBoltPatterns` storefront twin

**Files:**
- Create: `storefront/src/lib/fitment/canonical-bolt-pattern.ts`
- Test: `storefront/src/lib/fitment/__tests__/canonical-bolt-pattern.test.ts`

- [ ] **Step 1: Write the failing shared-fixture test.**

```ts
// storefront/src/lib/fitment/__tests__/canonical-bolt-pattern.test.ts
import { it, expect, describe } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { canonicalBoltPatterns } from "../canonical-bolt-pattern"

const golden = JSON.parse(
  readFileSync(join(__dirname, "../../../../../fixtures/bolt-pattern-canonical-golden.json"), "utf8")
) as { input: string; output: string[] }[]

describe("canonicalBoltPatterns twin matches the shared golden vectors", () => {
  for (const { input, output } of golden) {
    it(`${JSON.stringify(input)} -> ${JSON.stringify(output)}`, () => {
      expect(canonicalBoltPatterns(input)).toEqual(output)
    })
  }
})
```

- [ ] **Step 2: Run, confirm FAIL** (`cd storefront && pnpm test:unit`) — module not found.

- [ ] **Step 3: Implement the twin** — a byte-equivalent copy of `backend/src/modules/vendor-sync/search/bolt-pattern-canonical.ts` (copy `STANDARD_PCDS` exactly, including any Task-2 additions).

```ts
// storefront/src/lib/fitment/canonical-bolt-pattern.ts
// LOCKSTEP TWIN of backend/src/modules/vendor-sync/search/bolt-pattern-canonical.ts.
// The shared golden-vector test (fixtures/bolt-pattern-canonical-golden.json) guards drift. Keep in sync.
const STANDARD_PCDS = [
  98, 100, 105, 108, 110, 112, 114.3, 115, 118, 120, 120.65, 127, 130, 135,
  139.7, 150, 160, 165.1, 170, 205,
] // NOTE: if Task 2 extended this on the backend, add the same entries here.
const toMillimetres = (raw: number): number => (raw < 20 ? raw * 25.4 : raw)
function snap(mm: number): number {
  const rounded = Math.round(mm * 10) / 10
  let best = rounded, bestDelta = Infinity
  for (const std of STANDARD_PCDS) {
    const delta = Math.abs(std - rounded)
    if (delta < bestDelta) { bestDelta = delta; best = std }
  }
  return bestDelta <= 1.0 ? best : rounded
}
const format = (count: number, mm: number): string => `${count}x${mm}`
export function canonicalBoltPatterns(input: string): string[] {
  const cleaned = (input ?? "").trim().toUpperCase()
  const match = cleaned.match(/^(\d+)\s*X\s*(.+)$/)
  if (!match) return []
  const count = parseInt(match[1], 10)
  if (!Number.isFinite(count) || count <= 0) return []
  const out: string[] = []
  for (const part of match[2].split("/")) {
    const c = parseFloat(part.trim())
    if (Number.isFinite(c) && c > 0) out.push(format(count, snap(toMillimetres(c))))
  }
  return out
}
```

- [ ] **Step 4: Run, confirm PASS.** `cd storefront && pnpm test:unit` → all golden vectors PASS.

- [ ] **Step 5: Document the twin** — append a bullet to `storefront/CLAUDE.md` under the existing twin note: "`lib/fitment/canonical-bolt-pattern.ts` is a lockstep twin of the backend `canonicalBoltPatterns`; the shared `fixtures/bolt-pattern-canonical-golden.json` test guards drift."

- [ ] **Step 6: Commit.**

```bash
git add storefront/src/lib/fitment/canonical-bolt-pattern.ts storefront/src/lib/fitment/__tests__ storefront/CLAUDE.md
git commit -m "feat(storefront): canonicalBoltPatterns twin guarded by shared golden fixture"
```

### Task 13: Extract `lit()` to a leaf module (server-only safety)

**Files:**
- Create: `storefront/src/modules/discovery/data/escape.ts`
- Modify: `storefront/src/modules/discovery/data/get-products.ts:42-44`

- [ ] **Step 1: Create the leaf escaper** (no `server-only` import — safe for client bundles).

```ts
// storefront/src/modules/discovery/data/escape.ts
/** Escape a value for a Meilisearch filter string literal. */
export const lit = (v: string | number): string =>
  typeof v === "number" ? String(v) : `"${String(v).replace(/"/g, '\\"')}"`
```

- [ ] **Step 2: Refactor `get-products.ts`** — delete the local `lit` definition (~lines 42-44) and import it: add `import { lit } from "./escape"` near the top. Leave all call sites unchanged.

- [ ] **Step 3: Verify nothing else broke.** `cd storefront && npx tsc --noEmit` (expect no NEW errors beyond the pre-existing `lib/data/*` drift) and `pnpm build:next` compiles.

- [ ] **Step 4: Commit.**

```bash
git add storefront/src/modules/discovery/data/escape.ts storefront/src/modules/discovery/data/get-products.ts
git commit -m "refactor(discovery): extract lit() to a server-only-free leaf module"
```

### Task 14: `vehicleToConstraints`

**Files:**
- Create: `storefront/src/modules/discovery/data/vehicle-constraint.ts`
- Test: `storefront/src/modules/discovery/data/vehicle-constraint.test.ts`

Note: `vehicleToConstraints` reads `Vehicle.canonicalBoltPatterns` — defined on the `Vehicle` type in Task 17. To keep this task self-contained and testable now, it accepts the minimal shape `{ canonicalBoltPatterns?: string[] }`.

- [ ] **Step 1: Write the failing test.**

```ts
// storefront/src/modules/discovery/data/vehicle-constraint.test.ts
import { it, expect, describe } from "vitest"
import { vehicleToConstraints } from "./vehicle-constraint"

describe("vehicleToConstraints", () => {
  it("builds a single parenthesized-OR clause over bolt_patterns_canonical", () => {
    expect(vehicleToConstraints({ canonicalBoltPatterns: ["5x114.3", "5x120"] }))
      .toEqual(['(bolt_patterns_canonical = "5x114.3" OR bolt_patterns_canonical = "5x120")'])
  })
  it("returns [] (fail-open) when there are no patterns", () => {
    expect(vehicleToConstraints({ canonicalBoltPatterns: [] })).toEqual([])
    expect(vehicleToConstraints({})).toEqual([])
  })
})
```

- [ ] **Step 2: Run, confirm FAIL.**

- [ ] **Step 3: Implement.**

```ts
// storefront/src/modules/discovery/data/vehicle-constraint.ts
import { lit } from "./escape"

export function vehicleToConstraints(v: { canonicalBoltPatterns?: string[] }): string[] {
  const patterns = v.canonicalBoltPatterns ?? []
  if (!patterns.length) return []
  const ors = patterns.map((p) => `bolt_patterns_canonical = ${lit(p)}`).join(" OR ")
  return [`(${ors})`]
}

/** Serialize patterns for the `fit` URL param; parse mirrors this. */
export const patternsToFitParam = (patterns: string[]): string => patterns.join(",")
export const fitParamToPatterns = (raw: string): string[] =>
  raw.split(",").map((s) => s.trim()).filter(Boolean)
```

- [ ] **Step 4: Run, confirm PASS.** `cd storefront && pnpm test:unit`.

- [ ] **Step 5: Commit.**

```bash
git add storefront/src/modules/discovery/data/vehicle-constraint.ts storefront/src/modules/discovery/data/vehicle-constraint.test.ts
git commit -m "feat(discovery): vehicleToConstraints + fit-param (de)serializers"
```

### Task 15: `fitsVehicle` matcher

**Files:**
- Create: `storefront/src/lib/fitment/fits-vehicle.ts`
- Test: `storefront/src/lib/fitment/__tests__/fits-vehicle.test.ts`

Note: accepts minimal product/vehicle shapes so it is testable before the full types land.

- [ ] **Step 1: Write the failing test.**

```ts
// storefront/src/lib/fitment/__tests__/fits-vehicle.test.ts
import { it, expect, describe } from "vitest"
import { fitsVehicle } from "../fits-vehicle"

const product = { boltPatternsCanonical: ["5x114.3"], specs: { centerBoreMm: 70.5 },
  sizeOptions: [{ diameter: 19, width: 8.5, offsetMm: 35 }] }

describe("fitsVehicle", () => {
  it("fits when bolt pattern intersects and wheel bore >= hub bore", () => {
    const v = { canonicalBoltPatterns: ["5x114.3"], hubBoreMm: 64.1,
      diameterWindow: { min: 17, max: 20 }, widthWindow: { min: 7, max: 9 }, offsetWindow: { min: 30, max: 45 } }
    const r = fitsVehicle(product, v)
    expect(r.hardGatesPass).toBe(true); expect(r.fits).toBe(true); expect(r.withinWindow).toBe(true)
  })
  it("does not fit when wheel bore < hub bore", () => {
    const r = fitsVehicle({ ...product, specs: { centerBoreMm: 60 } }, { canonicalBoltPatterns: ["5x114.3"], hubBoreMm: 64.1 })
    expect(r.hardGatesPass).toBe(false); expect(r.fits).toBe(false)
    expect(r.reasons.join(" ")).toMatch(/hub/i)
  })
  it("does not fit when bolt pattern differs", () => {
    const r = fitsVehicle(product, { canonicalBoltPatterns: ["6x139.7"], hubBoreMm: 78 })
    expect(r.hardGatesPass).toBe(false); expect(r.fits).toBe(false)
  })
})
```

- [ ] **Step 2: Run, confirm FAIL.**

- [ ] **Step 3: Implement.**

```ts
// storefront/src/lib/fitment/fits-vehicle.ts
type Win = { min: number; max: number } | null | undefined
type ProductLike = {
  boltPatternsCanonical?: string[]
  specs?: { centerBoreMm?: number }
  sizeOptions?: { diameter: number; width: number; offsetMm: number; offsetVariants?: { value: number }[] }[]
}
type VehicleLike = {
  canonicalBoltPatterns?: string[]
  hubBoreMm?: number | null
  diameterWindow?: Win; widthWindow?: Win; offsetWindow?: Win
}
export type FitVerdict = { fits: boolean; hardGatesPass: boolean; withinWindow: boolean; reasons: string[] }

const inWin = (vals: number[], w: Win): boolean =>
  !w ? true : vals.some((v) => v >= w.min && v <= w.max)

export function fitsVehicle(product: ProductLike, vehicle: VehicleLike): FitVerdict {
  const reasons: string[] = []
  const pPats = product.boltPatternsCanonical ?? []
  const vPats = vehicle.canonicalBoltPatterns ?? []
  const boltOk = vPats.length > 0 && pPats.some((p) => vPats.includes(p))
  if (!boltOk) reasons.push("Bolt pattern does not match your vehicle.")

  const hub = vehicle.hubBoreMm ?? null
  const wheelBore = product.specs?.centerBoreMm ?? null
  const boreOk = hub == null || wheelBore == null ? boltOk : wheelBore >= hub
  if (boltOk && !boreOk) reasons.push("Wheel bore is smaller than your vehicle's hub.")

  const hardGatesPass = boltOk && boreOk

  const sizes = product.sizeOptions ?? []
  // Offsets: include every selectable ET (sibling offsetVariants), not just the default offsetMm.
  const offsets = sizes.flatMap((s) => (s.offsetVariants?.length ? s.offsetVariants.map((o) => o.value) : [s.offsetMm]))
  const withinWindow = hardGatesPass &&
    inWin(sizes.map((s) => s.diameter), vehicle.diameterWindow) &&
    inWin(sizes.map((s) => s.width), vehicle.widthWindow) &&
    inWin(offsets, vehicle.offsetWindow)

  return { fits: hardGatesPass, hardGatesPass, withinWindow, reasons }
}
```

- [ ] **Step 4: Run, confirm PASS.** `cd storefront && pnpm test:unit`.

- [ ] **Step 5: Commit.**

```bash
git add storefront/src/lib/fitment/fits-vehicle.ts storefront/src/lib/fitment/__tests__/fits-vehicle.test.ts
git commit -m "feat(fitment): pure fitsVehicle matcher (bolt+bore hard gates, soft window)"
```

---

## PHASE 6 — Storefront data layer

### Task 16: data-layer fetchers

**Files:**
- Create: `storefront/src/lib/data/fitment.ts`, `storefront/src/lib/data/customer-vehicles.ts`

- [ ] **Step 1: Write the catalog + fitment fetchers** (follow the existing `lib/data/*` style — `sdk`/`fetch` with the publishable key + credentials).

Note: the typed `sdk.store.*` resources don't cover these custom `/store/*` routes, so `sdk.client.fetch` is the correct escape hatch. The `sdk` singleton (`@lib/config`) is already built with `baseUrl` + `publishableKey`, so it attaches both automatically — pass **no** manual headers. (`VehicleFitment` is added to `@lib/garage/types` in Task 17 — do Task 17 first.)

```ts
// storefront/src/lib/data/fitment.ts
import { sdk } from "@lib/config"
import type { VehicleFitment } from "@lib/garage/types"

export const getMakes = () => sdk.client.fetch<{ makes: any }>("/store/vehicle-catalog/makes")
export const getModels = (make: string) => sdk.client.fetch<{ models: any }>(`/store/vehicle-catalog/models?make=${make}`)
export const getYears = (make: string, model: string) => sdk.client.fetch<{ years: any }>(`/store/vehicle-catalog/years?make=${make}&model=${model}`)
export const getModifications = (make: string, model: string, year: string) =>
  sdk.client.fetch<{ modifications: any }>(`/store/vehicle-catalog/modifications?make=${make}&model=${model}&year=${year}`)

export async function getFitmentByVehicle(modificationSlug: string, region = "usdm"): Promise<VehicleFitment | { error: "unavailable" }> {
  try {
    const r = await sdk.client.fetch<{ fitment: VehicleFitment }>(
      `/store/fitment/by-vehicle?modification=${encodeURIComponent(modificationSlug)}&region=${region}`)
    return r.fitment
  } catch (e: any) {
    // Guard multiple error shapes: sdk.client.fetch may surface the status as e.status or e.response?.status.
    const status = e?.status ?? e?.response?.status
    if (status === 503) return { error: "unavailable" }
    throw e
  }
}
```

- [ ] **Step 2: Write the garage CRUD fetchers** (authed). These hit the actor-scoped routes from Task 10, so the request must carry the customer's auth. The Medusa SDK attaches the stored customer token automatically on `sdk.client.fetch`; `credentials: "include"` additionally covers session-cookie auth. Confirm against the Task-1 `actor_id` spike result which auth mode the routes expect (session vs bearer) and that `sdk.client.fetch` sends it — if the spike required explicit middleware (`authenticate("customer", ["session","bearer"])`), both modes are covered.

```ts
// storefront/src/lib/data/customer-vehicles.ts
import { sdk } from "@lib/config"
import type { Vehicle, NewVehicle } from "@lib/garage/types"

type Wire = Partial<Vehicle> & { client_id: string; modificationSlug?: string }

export const listVehicles = () => sdk.client.fetch<{ vehicles: any[] }>("/store/customer/vehicles", { method: "GET", credentials: "include" })
export const createVehicle = (v: Wire) => sdk.client.fetch<{ vehicle: any }>("/store/customer/vehicles", { method: "POST", body: v, credentials: "include" })
export const updateVehicle = (id: string, patch: Partial<Wire>) => sdk.client.fetch<{ vehicle: any }>(`/store/customer/vehicles/${id}`, { method: "POST", body: patch, credentials: "include" })
export const deleteVehicle = (id: string) => sdk.client.fetch<{ deleted: boolean }>(`/store/customer/vehicles/${id}`, { method: "DELETE", credentials: "include" })
export const activateVehicle = (id: string) => sdk.client.fetch<{ active: boolean }>(`/store/customer/vehicles/${id}/activate`, { method: "POST", credentials: "include" })
```

- [ ] **Step 3: Verify it type-checks.** `cd storefront && npx tsc --noEmit` (no NEW errors). (`Vehicle`/`NewVehicle`/`VehicleFitment` land in Task 17; if doing tasks out of order, stub the imports.)

- [ ] **Step 4: Commit.**

```bash
git add storefront/src/lib/data/fitment.ts storefront/src/lib/data/customer-vehicles.ts
git commit -m "feat(storefront): data-layer fetchers for catalog, fitment, and garage CRUD"
```

---

## PHASE 7 — Storefront garage swap

### Task 17: Provider interface + Vehicle type + LocalStorageGarage.update()

**Files:**
- Modify: `storefront/src/lib/garage/provider.ts`, `storefront/src/lib/garage/types.ts`, `storefront/src/lib/garage/local-storage-garage.ts`

- [ ] **Step 1: Add `update()` to the interface** (`provider.ts`) — insert after `add`:

```ts
  update(id: string, patch: Partial<NewVehicle>): Vehicle
```

- [ ] **Step 2: Replace the placeholder fitment fields on `Vehicle`** (`types.ts`). Remove `boltPattern?: string` and `hubBore?: string`; add the structured set and re-export `VehicleFitment`'s window type for reuse:

```ts
// storefront/src/lib/garage/types.ts (Vehicle additions)
export type FitWindow = { min: number; max: number } | null
export type VehicleFitment = {
  status: "ok" | "not_found"
  canonicalBoltPatterns: string[]
  hubBoreMm: number | null
  diameterWindow: FitWindow; widthWindow: FitWindow; offsetWindow: FitWindow
  source: { modificationSlug: string; region: string }
}
export type Vehicle = {
  id: string
  year: number
  make: string
  model: string
  trim?: string
  modificationSlug?: string
  canonicalBoltPatterns?: string[]
  hubBoreMm?: number
  diameterWindow?: FitWindow; widthWindow?: FitWindow; offsetWindow?: FitWindow
  fitmentStatus?: "ok" | "not_found"
  notes?: string
  savedAt: string
}
export type NewVehicle = Omit<Vehicle, "id" | "savedAt">
```

- [ ] **Step 3: Implement `update()` in `LocalStorageGarage`** (`local-storage-garage.ts`) — read the list, replace the matching vehicle with `{ ...existing, ...patch }`, write the list back (a NEW array), `emit()`, and return the updated vehicle. Match the existing read/write/emit helpers in the file.

```ts
  update(id: string, patch: Partial<NewVehicle>): Vehicle {
    const list = this.list()
    const idx = list.findIndex((v) => v.id === id)
    if (idx === -1) throw new Error(`vehicle ${id} not found`)
    const updated = { ...list[idx], ...patch }
    const next = [...list.slice(0, idx), updated, ...list.slice(idx + 1)]
    writeVehicles(next) // module-level free function (NOT this.writeVehicles) — the same one add()/remove() call
    this.emit()
    return updated
  }
```

(`this.list()` and `this.emit()` ARE class methods; `writeVehicles`/`readVehicles`/`writeActiveId` are module-level free functions in this file — call them without `this.`.)

- [ ] **Step 4: Fix the live consumer `garage-pane.tsx` (MANDATORY).** Removing `boltPattern`/`hubBore` breaks `garage-pane.tsx`, which reads them in `formatSpecs()` and copies them in the undo-restore `NewVehicle`. Grep to confirm the only consumer: `grep -rn "\.boltPattern\|\.hubBore" storefront/src` (expect just `find-by-vehicle/garage-pane.tsx`). In that file, change `formatSpecs` to read the new fields — e.g. `if (v.canonicalBoltPatterns?.length) parts.push(v.canonicalBoltPatterns[0]); if (v.hubBoreMm) parts.push(\`${v.hubBoreMm} hub\`)` — and drop `boltPattern`/`hubBore` from the undo-restore object (the restore can carry `canonicalBoltPatterns`, `hubBoreMm`, `modificationSlug`, and the window fields instead, or omit them since they re-derive on re-add).

- [ ] **Step 5: Verify.** `cd storefront && npx tsc --noEmit` (no NEW errors; the `.boltPattern`/`.hubBore` grep now returns nothing) and `pnpm build:next`.

- [ ] **Step 6: Commit.**

```bash
git add storefront/src/lib/garage/provider.ts storefront/src/lib/garage/types.ts storefront/src/lib/garage/local-storage-garage.ts storefront/src/modules/search/components/search-drawer/find-by-vehicle/garage-pane.tsx
git commit -m "feat(garage): add update() + structured Vehicle fitment fields"
```

### Task 18: `MedusaGarage` (optimistic sync provider)

**Files:**
- Create: `storefront/src/lib/garage/medusa-garage.ts`

- [ ] **Step 1: Implement the optimistic sync provider.** Mirror is in-memory; mutations replace the array + `emit()`; persistence is background; ids are client-minted.

```ts
// storefront/src/lib/garage/medusa-garage.ts
import type { GarageProvider } from "./provider"
import type { Vehicle, NewVehicle } from "./types"
import * as api from "@lib/data/customer-vehicles"

const genId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `v_${Math.random().toString(36).slice(2)}`

function toWire(v: Vehicle) {
  return { client_id: v.id, year: v.year, make: v.make, model: v.model, trim: v.trim,
    modificationSlug: v.modificationSlug, canonicalBoltPatterns: v.canonicalBoltPatterns,
    hubBoreMm: v.hubBoreMm, diameterWindow: v.diameterWindow, widthWindow: v.widthWindow,
    offsetWindow: v.offsetWindow, fitmentStatus: v.fitmentStatus, notes: v.notes, is_active: false }
}
function fromWire(r: any): Vehicle {
  return { id: r.client_id ?? r.id, year: r.year, make: r.make, model: r.model, trim: r.trim ?? undefined,
    modificationSlug: r.modification_slug ?? undefined, canonicalBoltPatterns: r.canonical_bolt_patterns ?? undefined,
    hubBoreMm: r.hub_bore_mm ?? undefined, diameterWindow: r.diameter_window ?? undefined,
    widthWindow: r.width_window ?? undefined, offsetWindow: r.offset_window ?? undefined,
    fitmentStatus: r.fitment_status ?? undefined, notes: r.notes ?? undefined, savedAt: r.created_at ?? new Date().toISOString() }
}

export class MedusaGarage implements GarageProvider {
  private vehicles: Vehicle[] = []
  private activeId: string | null = null
  private listeners = new Set<() => void>()

  constructor() { if (typeof window !== "undefined") void this.load() }

  private emit() { this.listeners.forEach((l) => l()) }
  private async load() {
    try {
      const { vehicles } = await api.listVehicles()
      this.vehicles = vehicles.map(fromWire)
      const active = vehicles.find((v: any) => v.is_active)
      this.activeId = active ? (active.client_id ?? active.id) : (this.vehicles[0]?.id ?? null)
      this.emit()
    } catch { /* stay empty on failure; toast handled by callers */ }
  }

  list(): Vehicle[] { return this.vehicles }
  getActive(): Vehicle | null { return this.vehicles.find((v) => v.id === this.activeId) ?? null }

  add(v: NewVehicle): Vehicle {
    const vehicle: Vehicle = { ...v, id: genId(), savedAt: new Date().toISOString() }
    this.vehicles = [...this.vehicles, vehicle]
    if (this.activeId == null) this.activeId = vehicle.id // mirror LocalStorageGarage auto-active
    this.emit()
    void api.createVehicle(toWire(vehicle)).catch(() => {/* retry/toast */})
    return vehicle
  }
  update(id: string, patch: Partial<NewVehicle>): Vehicle {
    const idx = this.vehicles.findIndex((v) => v.id === id)
    if (idx === -1) throw new Error(`vehicle ${id} not found`)
    const updated = { ...this.vehicles[idx], ...patch }
    this.vehicles = [...this.vehicles.slice(0, idx), updated, ...this.vehicles.slice(idx + 1)]
    this.emit()
    void api.updateVehicle(id, { modificationSlug: updated.modificationSlug, canonicalBoltPatterns: updated.canonicalBoltPatterns,
      hubBoreMm: updated.hubBoreMm, diameterWindow: updated.diameterWindow, widthWindow: updated.widthWindow,
      offsetWindow: updated.offsetWindow, fitmentStatus: updated.fitmentStatus, trim: updated.trim, notes: updated.notes } as any).catch(() => {})
    return updated
  }
  remove(id: string): void {
    this.vehicles = this.vehicles.filter((v) => v.id !== id)
    if (this.activeId === id) this.activeId = this.vehicles[0]?.id ?? null
    this.emit()
    void api.deleteVehicle(id).catch(() => {})
  }
  setActive(id: string | null): void {
    this.activeId = id
    this.emit()
    if (id) void api.activateVehicle(id).catch(() => {})
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener) }
}
```

- [ ] **Step 2: Verify.** `cd storefront && npx tsc --noEmit` (no NEW errors) and `pnpm build:next`.

- [ ] **Step 3: Commit.**

```bash
git add storefront/src/lib/garage/medusa-garage.ts
git commit -m "feat(garage): MedusaGarage optimistic sync provider"
```

### Task 19: Hybrid router singleton + merge-on-login

**Files:**
- Modify: `storefront/src/lib/garage/index.ts`

- [ ] **Step 0: Extract the merge dedup as a pure, tested helper.** Write the failing test first:

```ts
// storefront/src/lib/garage/merge.test.ts
import { it, expect, describe } from "vitest"
import { vehiclesToMerge } from "./merge"
const v = (year: number, make: string, model: string, trim?: string) =>
  ({ id: `${make}-${model}`, year, make, model, trim, savedAt: "t" }) as any
describe("vehiclesToMerge", () => {
  it("skips local vehicles already present in the account (year+make+model+trim, case-insensitive)", () => {
    const local = [v(2021, "Ford", "F-150", "XLT"), v(2018, "Jeep", "Wrangler")]
    const remote = [v(2021, "ford", "f-150", "xlt")]
    const out = vehiclesToMerge(local, remote)
    expect(out.map((x) => x.model)).toEqual(["Wrangler"]) // only the non-duplicate
    expect((out[0] as any).id).toBeUndefined()            // returns NewVehicle (no id/savedAt)
  })
  it("returns [] when local is empty", () => { expect(vehiclesToMerge([], [v(2020,"a","b")])).toEqual([]) })
})
```

Run `cd storefront && pnpm test:unit` → FAIL, then implement:

```ts
// storefront/src/lib/garage/merge.ts
import type { Vehicle, NewVehicle } from "./types"
const key = (v: { year: number; make: string; model: string; trim?: string }) =>
  `${v.year}|${v.make}|${v.model}|${v.trim ?? ""}`.toLowerCase()
/** The local vehicles NOT already in the account, as NewVehicle (id/savedAt stripped). */
export function vehiclesToMerge(local: Vehicle[], remote: Vehicle[]): NewVehicle[] {
  if (!local.length) return []
  const seen = new Set(remote.map(key))
  return local.filter((v) => !seen.has(key(v))).map(({ id, savedAt, ...nv }) => nv as NewVehicle)
}
```

Run `pnpm test:unit` → PASS.

- [ ] **Step 1: Implement the routing singleton.** It delegates to a current provider, probes auth on boot, exposes a `syncAuth()` the login flow calls, and merges guest→account via the `vehiclesToMerge` helper from Step 0.

```ts
// storefront/src/lib/garage/index.ts
import type { GarageProvider } from "./provider"
import type { Vehicle, NewVehicle } from "./types"
import { LocalStorageGarage } from "./local-storage-garage"
import { MedusaGarage } from "./medusa-garage"
import { getCustomer } from "@lib/data/customer" // returns the customer or null (NOT "retrieveCustomer")
import { vehiclesToMerge } from "./merge"

class RoutingGarage implements GarageProvider {
  private local = new LocalStorageGarage()
  private remote: MedusaGarage | null = null
  private current: GarageProvider = this.local
  private listeners = new Set<() => void>()
  private merged = false

  constructor() { if (typeof window !== "undefined") void this.syncAuth() }

  private emit() { this.listeners.forEach((l) => l()) }

  /** Called on boot and after the login/logout Server Actions complete. */
  async syncAuth(): Promise<void> {
    let authed = false
    try { authed = !!(await getCustomer()) } catch { authed = false }
    if (authed) {
      if (!this.remote) this.remote = new MedusaGarage()
      if (!this.merged) { await this.mergeLocalIntoRemote(); this.merged = true }
      this.current = this.remote
    } else {
      this.current = this.local
      this.merged = false
    }
    this.emit()
  }

  private async mergeLocalIntoRemote() {
    if (!this.remote) return
    const toAdd = vehiclesToMerge(this.local.list(), this.remote.list()) // pure, unit-tested (Task 19 Step 0)
    for (const nv of toAdd) this.remote.add(nv) // re-add through remote (mints client_id; idempotent server-side)
    this.local.clear() // clear() added to LocalStorageGarage in Step 2
  }

  list() { return this.current.list() }
  add(v: NewVehicle) { return this.current.add(v) }
  update(id: string, patch: Partial<NewVehicle>) { return this.current.update(id, patch) }
  remove(id: string) { return this.current.remove(id) }
  setActive(id: string | null) { return this.current.setActive(id) }
  getActive() { return this.current.getActive() }
  subscribe(l: () => void) {
    const offCur = this.current.subscribe(l)
    this.listeners.add(l)
    return () => { offCur(); this.listeners.delete(l) }
  }
}

export const garage: GarageProvider & { syncAuth?: () => Promise<void> } = new RoutingGarage()
```

- [ ] **Step 2: Add a `clear()` method to `LocalStorageGarage` (it does NOT exist today — author it).** It removes both storage keys and notifies. Use the file's module-level constants `VEHICLES_KEY` (`"garage:vehicles"`) and `ACTIVE_KEY` (`"garage:active"`) and the existing `emit()` method:

```ts
  clear(): void {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(VEHICLES_KEY)
      window.localStorage.removeItem(ACTIVE_KEY)
    }
    this.emit()
  }
```

Do **not** add `clear()` to the `GarageProvider` interface — it is called only on the concrete `this.local` inside `RoutingGarage`, so widening the interface (and forcing `MedusaGarage` to implement it) is unnecessary. (`RoutingGarage` references `this.local` as a concrete `LocalStorageGarage`, not as `GarageProvider`, so `clear()` resolves.)

- [ ] **Step 3: Drive `syncAuth()` from a client island keyed on the customer id (login is a Server Action — the client garage can't be called from it directly).** The server `(main)` layout knows the auth state via `getCustomer()`; pass it to a tiny client component that calls `garage.syncAuth()` whenever it changes (login: `null→id`; logout: `id→null`).

```tsx
// storefront/src/lib/garage/garage-auth-sync.tsx
"use client"
import { useEffect } from "react"
import { garage } from "./index"
export default function GarageAuthSync({ customerId }: { customerId: string | null }) {
  useEffect(() => { void (garage as any).syncAuth?.() }, [customerId])
  return null
}
```

Mount it once in `storefront/src/app/[countryCode]/(main)/layout.tsx` (a server component) by passing the current customer id:

```tsx
import { getCustomer } from "@lib/data/customer"
import GarageAuthSync from "@lib/garage/garage-auth-sync"
// inside the layout's async body, before returning:
const customer = await getCustomer()
// in the returned JSX, inside <.frame>:
<GarageAuthSync customerId={customer?.id ?? null} />
```

`getCustomer` is `React.cache`'d, so this adds no extra round-trip. The effect fires on first mount (boot) and on every login/logout transition — the single call site per transition the design wants.

- [ ] **Step 4: Verify.** `cd storefront && pnpm test:unit` (merge test green) + `npx tsc --noEmit` + `pnpm build:next`. Manual: as a guest add 2 vehicles → log in → both appear server-side with no duplicates; re-login is a no-op; log out → guest localStorage path resumes.

- [ ] **Step 5: Commit.**

```bash
git add storefront/src/lib/garage/index.ts storefront/src/lib/garage/local-storage-garage.ts storefront/src/lib/garage/merge.ts storefront/src/lib/garage/merge.test.ts storefront/src/lib/garage/garage-auth-sync.tsx "storefront/src/app/[countryCode]/(main)/layout.tsx"
git commit -m "feat(garage): hybrid guest/authed router with merge-on-login"
```

---

## PHASE 8 — Discovery auto-apply

### Task 20: `parseQueryFromSearchParams` reads `fit`

**Files:**
- Modify: `storefront/src/modules/discovery/data/types.ts`
- Test: `storefront/src/modules/discovery/data/parse-fit.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
// storefront/src/modules/discovery/data/parse-fit.test.ts
import { it, expect, describe } from "vitest"
import { parseQueryFromSearchParams } from "./types"

describe("parseQueryFromSearchParams — fit param", () => {
  it("builds vehicleConstraint from fit=<patterns>", () => {
    const q = parseQueryFromSearchParams({ fit: "5x114.3,5x120" })
    expect(q.vehicleConstraint).toEqual(['(bolt_patterns_canonical = "5x114.3" OR bolt_patterns_canonical = "5x120")'])
  })
  it("omits vehicleConstraint for fit=0 (explicit off)", () => {
    expect(parseQueryFromSearchParams({ fit: "0" }).vehicleConstraint).toBeUndefined()
  })
  it("omits vehicleConstraint when fit is absent", () => {
    expect(parseQueryFromSearchParams({}).vehicleConstraint).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run, confirm FAIL.**

- [ ] **Step 3: Implement.** In `types.ts`, import the helpers and set `vehicleConstraint` in the returned `DiscoveryQuery`. Add near the top: `import { vehicleToConstraints, fitParamToPatterns } from "./vehicle-constraint"`. In `parseQueryFromSearchParams`, before the return, read the `fit` param (using the same `arr`/scalar accessor the function already uses for other params):

```ts
  // fit: absent => no constraint; "0" => explicit off; else CSV of canonical patterns.
  const fitRaw = typeof sp.fit === "string" ? sp.fit : Array.isArray(sp.fit) ? sp.fit[0] : undefined
  const vehicleConstraint =
    fitRaw && fitRaw !== "0"
      ? vehicleToConstraints({ canonicalBoltPatterns: fitParamToPatterns(fitRaw) })
      : undefined
```

Then include `vehicleConstraint` in the returned object (only when truthy/non-empty: `...(vehicleConstraint?.length ? { vehicleConstraint } : {})`).

- [ ] **Step 4: Run, confirm PASS.** `cd storefront && pnpm test:unit`.

- [ ] **Step 5: Verify the adapter path** still type-checks (`npx tsc --noEmit`). `get-products.ts:69` already consumes `vehicleConstraint`; no change there.

- [ ] **Step 6: Commit.**

```bash
git add storefront/src/modules/discovery/data/types.ts storefront/src/modules/discovery/data/parse-fit.test.ts
git commit -m "feat(discovery): parse fit URL param into vehicleConstraint"
```

### Task 21: fitment-sync island

**Files:**
- Create: `storefront/src/modules/discovery/components/fitment-sync/index.tsx`
- Modify: `storefront/src/modules/discovery/templates/index.tsx`

- [ ] **Step 1: Implement the island** with the three reconcile cases and `fit=0` precedence.

```tsx
// storefront/src/modules/discovery/components/fitment-sync/index.tsx
"use client"
import { useEffect } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useGarage } from "@lib/garage/use-garage"
import { patternsToFitParam } from "@modules/discovery/data/vehicle-constraint"

export default function FitmentSync() {
  const { active } = useGarage()
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  useEffect(() => {
    const fit = sp.get("fit")
    if (fit === "0") return // explicit opt-out is authoritative — never overwrite

    const activePatterns = active?.canonicalBoltPatterns ?? []
    const desired = activePatterns.length ? patternsToFitParam(activePatterns) : null

    if (!desired && fit) { replace(null); return }            // case 2: no active vehicle → strip
    if (desired && fit !== desired) { replace(desired); return } // case 1 & 3: set / replace stale

    function replace(value: string | null) {
      const next = new URLSearchParams(Array.from(sp.entries()))
      if (value) next.set("fit", value); else next.delete("fit")
      next.delete("page") // reset pagination on filter change (mirrors useDiscoveryQuery)
      router.replace(`${pathname}?${next.toString()}`)
    }
  }, [active?.id, active?.canonicalBoltPatterns?.join(","), sp, pathname, router])

  return null
}
```

- [ ] **Step 2: Mount it in the Discovery template** (`templates/index.tsx`) — it renders nothing, so mount it once near the top of the returned tree: `<FitmentSync />` (import default from `@modules/discovery/components/fitment-sync`).

- [ ] **Step 3: Verify.** `cd storefront && npx tsc --noEmit` + `pnpm build:next`. Manual: with an active vehicle, navigating to `/store` injects `?fit=<patterns>` and narrows the grid; deleting the active vehicle strips the param; `fit=0` survives a garage reconcile.

- [ ] **Step 4: Commit.**

```bash
git add storefront/src/modules/discovery/components/fitment-sync storefront/src/modules/discovery/templates/index.tsx
git commit -m "feat(discovery): fitment-sync island auto-applies the active vehicle"
```

### Task 22: "Show all" off-switch + Fits chip

**Files:**
- Modify: `storefront/src/modules/discovery/components/filter-rail/filter-sections.tsx` (~L123-140)
- Modify: `storefront/src/modules/discovery/components/active-chips/index.tsx`

- [ ] **Step 1: Replace the L138 toggle TODO** in the Vehicle band. When a vehicle is active, render the label "Showing wheels that fit {year make model}" and a "Show all" control that writes `?fit=0`; when none, keep the existing "Pick a vehicle for fitment" prompt + `openSearch`. Use `useRouter`/`useSearchParams` to write the param:

```tsx
// inside the Vehicle band, replacing the TODO comment block
{active && sp.get("fit") !== "0" ? (
  <button type="button" className="mt-2 text-[12px] text-[var(--ink-soft)] underline"
    onClick={() => { const n = new URLSearchParams(Array.from(sp.entries())); n.set("fit", "0"); n.delete("page"); router.replace(`${pathname}?${n.toString()}`) }}>
    Show all wheels
  </button>
) : null}
```

- [ ] **Step 2: Add a removable `Fits: {vehicle}` chip** to `active-chips` when `fit` is present and not `0`. The existing chips in this component are a `<button onClick={onRemove}>` with a label + an `x` icon — follow that markup: render `Fits: {active.year} {active.make} {active.model}` whose `onClick` sets `fit=0` (the same URL writer as the Vehicle-band "Show all" in Step 1; reuse it). The active vehicle label comes from `useGarage().active`.

- [ ] **Step 3: Verify.** `npx tsc --noEmit` + `pnpm build:next`. Manual: chip appears when filtered; clicking it or "Show all" shows the full catalog while the vehicle stays active; the island does not re-apply (because `fit=0`).

- [ ] **Step 4: Commit.**

```bash
git add storefront/src/modules/discovery/components/filter-rail/filter-sections.tsx storefront/src/modules/discovery/components/active-chips/index.tsx
git commit -m "feat(discovery): Show-all off-switch + removable Fits chip"
```

### Task 23: YMM pane async dropdowns + fitment fetch + route tails

**Files:**
- Modify: `storefront/src/modules/search/components/search-drawer/find-by-vehicle/ymm-pane.tsx`
- Modify: `storefront/src/modules/search/components/search-drawer/find-by-vehicle/garage-pane.tsx`

- [ ] **Step 1: Swap the static dropdowns for async fetches.** Replace the `vehicle-data.ts` imports with state populated from `@lib/data/fitment` (`getMakes`/`getModels`/`getYears`/`getModifications`), cascading with loading states. Keep `vehicle-data.ts` only as a fallback seed if a fetch fails. The modification select's value is the **modification slug**; its label is the human trim name.

- [ ] **Step 2: On submit, fetch fitment then update the vehicle, then route with the fit tail.** Replace the submit body:

```tsx
const vehicle = add({ year: Number(year), make, model, trim: trimLabel || undefined, modificationSlug })
setActive(vehicle.id)
// fire the (human-initiated) fitment lookup, then write it back
const fitment = await getFitmentByVehicle(modificationSlug, "usdm")
let fitParam = ""
if (fitment && !("error" in fitment)) {
  update(vehicle.id, {
    canonicalBoltPatterns: fitment.canonicalBoltPatterns, hubBoreMm: fitment.hubBoreMm ?? undefined,
    diameterWindow: fitment.diameterWindow, widthWindow: fitment.widthWindow, offsetWindow: fitment.offsetWindow,
    fitmentStatus: fitment.status,
  })
  if (fitment.status === "ok" && fitment.canonicalBoltPatterns.length) fitParam = `?fit=${fitment.canonicalBoltPatterns.join(",")}`
} else if (fitment && "error" in fitment) {
  toast.error("Fitment temporarily unavailable", { description: "Please contact support." })
}
onClose()
router.push(`/${countryCode}/store${fitParam}`)
```

(Get `update` from `useGarage()` — add it to the destructure: `const { add, setActive, update } = useGarage()`. Add `update` to the hook's returned object in `use-garage.ts`: `update: (id, patch) => garage.update(id, patch)`.)

- [ ] **Step 2b: Expose `update` on the hook.** In `storefront/src/lib/garage/use-garage.ts`, add to the returned object: `update: (id: string, patch: Partial<NewVehicle>) => garage.update(id, patch),`.

- [ ] **Step 3: Garage-pane route tail.** In `garage-pane.tsx`'s `selectVehicle`, build the fit tail from the selected vehicle's stored `canonicalBoltPatterns` and push `/${countryCode}/store${fitParam}` (mirror the YMM tail; the vehicle already carries its fitment from when it was added).

- [ ] **Step 4: Verify.** `npx tsc --noEmit` + `pnpm build:next`. Manual: pick a vehicle in the drawer → lands on `/store?fit=...` already filtered; the saved vehicle carries `canonicalBoltPatterns`; selecting it later from the garage pane re-applies fitment. **Fallback path:** block the `/store/vehicle-catalog/*` route (stop the backend or 500 it) and confirm the dropdowns fall back to the static `vehicle-data.ts` seed (not an empty list); confirm the fitment-fetch failure surfaces the "Fitment temporarily unavailable" toast rather than throwing.

- [ ] **Step 5: Commit.**

```bash
git add storefront/src/modules/search/components/search-drawer/find-by-vehicle storefront/src/lib/garage/use-garage.ts
git commit -m "feat(search): async YMM dropdowns + fitment fetch + fit route tails"
```

---

## PHASE 9 — PDP parametric fit

### Task 24: `boltPatternsCanonical` on PDP + `fitsVehicle` swap

**Files:**
- Modify: `storefront/src/modules/product-detail/data/types.ts`, `storefront/src/modules/product-detail/data/get-product.ts`
- Modify: `storefront/src/modules/product-detail/components/fitment/index.tsx`

- [ ] **Step 1: Add `boltPatternsCanonical: string[]` to `ProductDetail`** in `product-detail/data/types.ts`.

- [ ] **Step 2: Populate it in `get-product.ts`** via the storefront twin. Add `import { canonicalBoltPatterns } from "@lib/fitment/canonical-bolt-pattern"`. In `mapToDetail`, compute from the distinct raw bolt patterns already gathered (`boltPatternOptions`): `boltPatternsCanonical: Array.from(new Set(boltPatternOptions.flatMap((raw) => canonicalBoltPatterns(raw))))`. Leave `fitment: []` unchanged (D7).

- [ ] **Step 3: Swap the heuristic in `fitment/index.tsx`.** Replace the `make&&model` equality (lines ~30-36 and the row-highlight at ~127-130) with `fitsVehicle`:

```tsx
import { fitsVehicle } from "@lib/fitment/fits-vehicle"
// ...
const verdict = active ? fitsVehicle(product, active) : null
const activeFits = verdict?.fits ?? null
// Branches: no active vehicle → "Pick a vehicle"; verdict.fits → "Fits your {year make model}";
// !verdict.fits → "Doesn't fit your {vehicle}" + verdict.reasons[0] (e.g. the hub-bore message).
```

Render `verdict.reasons[0]` in the does-not-fit branch, and (when `verdict.fits && !verdict.withinWindow`) a soft note like "outside the typical size window for your vehicle." The eyebrow `FITMENT · N CONFIRMED MODELS` stays driven by `product.fitment.length` (0 today — unchanged copy, or hide the count when empty).

- [ ] **Step 4: Verify.** `npx tsc --noEmit` + `pnpm build:next`. Manual: with an active vehicle, a matching wheel's PDP reads "Fits your {vehicle}"; a wheel with a smaller bore reads "Doesn't fit … wheel bore is smaller than your hub"; with no active vehicle, the "Pick a vehicle" branch shows.

- [ ] **Step 5: Commit.**

```bash
git add storefront/src/modules/product-detail
git commit -m "feat(pdp): parametric fitsVehicle replaces the make/model heuristic"
```

---

## PHASE 10 — End-to-end verification

### Task 25: Live verification against dev DB + Meilisearch

**Files:** none (verification only)

- [ ] **Step 1: Backend gates.** `cd backend && pnpm test:sync && pnpm test:fitment` → both PASS.
- [ ] **Step 2: Storefront gates.** `cd storefront && pnpm test:unit && npx tsc --noEmit && pnpm build:next` → unit PASS; no NEW type errors; build compiles.
- [ ] **Step 3: Add a vehicle → filtered grid.** In the running app, add a vehicle whose bolt pattern matches synced wheels; `/store` shows only matching wheels; disjunctive facet counts reflect the fitment scope.
- [ ] **Step 4: Off-switch.** "Show all wheels" / the `Fits:` chip clears the filter (`fit=0`) without un-setting the active vehicle; deleting the active vehicle strips the stale `fit` param.
- [ ] **Step 5: PDP.** A matching wheel reads "Fits your {vehicle}"; a deliberate bore-fail reads "Doesn't fit … hub"; no-vehicle shows "Pick a vehicle".
- [ ] **Step 6: Garage persistence.** Guest adds vehicles → log in → merged with no duplicates; second login no-ops; log out → localStorage path resumes; second device shows the account garage.
- [ ] **Step 7: Quota outage.** Temporarily set `dailyCeiling: 0` in `medusa-config.js` (or force the counter) → fitment endpoint returns `503` → drawer shows "contact support"; the catalog still browses. Revert.
- [ ] **Step 8: No-data.** Add an obscure vehicle wheel-size has no spec for → `200`-empty → `not_found` → "fitment data unavailable" notice + unfiltered shopping.
- [ ] **Step 9: Final commit / branch ready for review.**

```bash
git add -A && git commit -m "test(fitment): live verification checklist complete"
```

---

## Parked work

✅ **Task 1 — DONE (GO).** Validated against the live v2 API on 2026-06-01; findings + decision in [`docs/superpowers/specs/2026-05-30-wheel-size-task1-findings.md`](../specs/2026-05-30-wheel-size-task1-findings.md). Parity holds (incl. the non-standard-PCD truck `8x180`) → **no `STANDARD_PCDS` change, no re-index**. Real fixtures recorded.
✅ **Provisional-code reconciliation — DONE.** `by_model` now takes `make+model+modification` (the API rejects modification alone with a 400); `centre_bore` parsed as a string; synthetic fixtures replaced with real recordings.

Still open (need a **dev DB / running backend** — NOT the key):

- **`actor_id` spike** — confirm Medusa's store customer-auth middleware populates `auth_context.actor_id` on the custom `/store/*` routes (needs the dev backend + a customer login). If null, register `defineMiddlewares` per Task 10 Step 1.
- **Both modules' migrations** — run once, after both `wheel-size` and `customer-vehicle` are registered: `medusa db:generate wheelSizeModuleService`, `medusa db:generate customerVehicleModuleService`, then `db:migrate`. (Task 5/6/7's migration steps were deferred.)
- **Manual/runtime verification** of every store route (Tasks 8–10) and the storefront garage/Discovery/PDP wiring — needs the backend running + synced wheels in Meilisearch.
- **Task 25** end-to-end verification.

## Notes for the executor

- **Task 1 is a hard gate.** Do not start Phase 2+ until the findings doc records a GO or EXTEND decision. If BLOCK, stop and escalate.
- **Out of order tasks:** several storefront tasks reference types defined in Task 17 (`Vehicle`, `NewVehicle`, `VehicleFitment`). If executing non-linearly, do Task 17 before Tasks 16/18/19/23.
- **Adjust JSON paths** in `normalize.ts` / `types.ts` to the *actual* v2 shape recorded in Task 1 if it differs from the documented `technical` block; the tests are seeded from real fixtures, so they are the source of truth.
- **No price math** is introduced anywhere; the dollars-in-Medusa / cents-in-index convention is untouched.
