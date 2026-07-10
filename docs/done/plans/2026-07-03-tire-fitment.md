# Tire Fitment (WB-063) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** "Fits your car" for tires — a garage vehicle's factory (OEM) tire sizes drive a `/tires` fit filter, per-card FITS badges, and a tire-PDP fit chip, mirroring the wheel `?fit=` flow but joining on tire size.

**Architecture:** The wheel-size.com `by_model` response we already cache (`wheel_size_fitment.raw`) contains each vehicle's OEM tire sizes. Extract them on read (no new API calls, no migration), surface as `VehicleFitment.oemTireSizes`, carry them onto the garage vehicle, and match against the tire catalog's existing `tire_sizes` Meili facet. One pure `tireFitsVehicle` verdict + a drift-guarded `canonicalizeTireSize` golden keep the vehicle↔product match consistent.

**Tech Stack:** MedusaJS 2.13.6 (wheel-size module, Jest), Next.js 15 storefront (tire-discovery + tire PDP from WB-005, Vitest), Meilisearch.

## Global Constraints

- **No `wb-` prefix** on any identifier/dir/file. Commit trailer, own line at end of each commit body: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **OEM-only, forward-only, auto-apply like wheels, front+rear flattened** (spec decisions). No aftermarket/plus-size, no reverse "N vehicles", no `/upsteps/`, no new wheel-size API calls, no DB migration.
- **Canonical tire size** = uppercase + strip the `Z` speed modifier (matches SP1's `canonicalTireSize` output, e.g. `255/35ZR19` → `255/35R19`). Product `tire_sizes` are already canonical; only the VEHICLE side is canonicalized at read.
- **Golden drift-guard**: `fixtures/tire-size-canonical-golden.json` asserted by a test in EACH app (the `bolt-pattern-canonical-golden` / `finish-normalize-golden` precedent) — change the golden + both copies together.
- Backend from `cd backend/` via `npx -y pnpm@9.10.0 test:fitment` (the wheel-size jest suite) + `tsc`. Storefront from `cd storefront/` via `npx vitest run` + `npx tsc --noEmit` (no NEW errors beyond the documented baseline).
- **Do NOT change wheel behavior**: wheel fitment (`fits-vehicle.ts`, the wheel `FitmentSync`, `vehicle-constraint.ts`, the wheel card/PDP) stays byte-identical. Tire pieces are new/parallel; the only shared-type edits are additive (`VehicleFitment`/`Vehicle` gain an optional `oemTireSizes`).

## File structure

**Backend (create/modify):**
- Create `backend/src/modules/wheel-size/canonicalize-tire-size.ts` — `canonicalizeTireSize(s)` (pure).
- Create `backend/src/modules/wheel-size/oem-tire-sizes.ts` — `extractOemTireSizes(raw)` (pure).
- Modify `backend/src/modules/wheel-size/types.ts` — `VehicleFitment` + `RawWheelEntry`/rim types gain tire.
- Modify `backend/src/modules/wheel-size/service.ts` — `toFitment` populates `oemTireSizes` from `c.raw`.
- Create `fixtures/tire-size-canonical-golden.json`.
- Tests under `backend/src/modules/wheel-size/__tests__/`.

**Storefront (create/modify):**
- Create `storefront/src/lib/fitment/canonicalize-tire-size.ts` (golden twin) + `storefront/src/lib/fitment/tire-fits-vehicle.ts` (`tireFitsVehicle`).
- Modify `storefront/src/lib/garage/types.ts` — `Vehicle` + `VehicleFitment` gain `oemTireSizes`.
- Modify `storefront/src/modules/search/components/search-drawer/find-by-vehicle/ymm-pane.tsx` — write `oemTireSizes`.
- Modify `storefront/src/modules/tire-discovery/data/types.ts` — `TireDiscoveryProduct.sizes`, `TireDiscoveryQuery.vehicleTireSizes`, parse `fit`, tire fit-param encode/decode.
- Modify `storefront/src/modules/tire-discovery/data/get-tire-products.ts` — `buildTireFilters` fit clause + `hitToTireProduct` `sizes` + cache key.
- Create `storefront/src/modules/tire-discovery/components/fitment-sync/index.tsx` + `components/grid/tire-fit-badge.tsx`; modify the tire template + header + card + `use-tire-query`.
- Modify the tire PDP purchase panel/hero (`components/tire/hero/*`) for the fit chip + fit-aware default.
- Tests under `storefront/src/modules/tire-discovery/__tests__/` + `storefront/src/lib/fitment/__tests__/`.

---

## Task 1: Backend — canonicalizeTireSize + extractOemTireSizes + VehicleFitment.oemTireSizes

**Files:**
- Create: `backend/src/modules/wheel-size/canonicalize-tire-size.ts`, `.../oem-tire-sizes.ts`, `fixtures/tire-size-canonical-golden.json`
- Modify: `backend/src/modules/wheel-size/types.ts`, `.../service.ts`
- Test: `backend/src/modules/wheel-size/__tests__/{canonicalize-tire-size,oem-tire-sizes}.test.ts`

**Interfaces:**
- Produces: `canonicalizeTireSize(s: string): string`; `extractOemTireSizes(raw: unknown): string[]`; `VehicleFitment.oemTireSizes: string[]`.

- [ ] **Step 1: Write the golden fixture + failing tests**

`fixtures/tire-size-canonical-golden.json`:

```json
[
  { "input": "225/55R18", "output": "225/55R18" },
  { "input": "255/35ZR19", "output": "255/35R19" },
  { "input": "225/55r18", "output": "225/55R18" },
  { "input": "  305/45R22  ", "output": "305/45R22" },
  { "input": "225/55R18 97H", "output": "225/55R18" },
  { "input": "", "output": "" }
]
```

`backend/src/modules/wheel-size/__tests__/canonicalize-tire-size.test.ts`:

```ts
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { canonicalizeTireSize } from "../canonicalize-tire-size"

const golden = JSON.parse(
  readFileSync(join(__dirname, "../../../../../fixtures/tire-size-canonical-golden.json"), "utf8")
) as { input: string; output: string }[]

describe("canonicalizeTireSize golden", () => {
  for (const { input, output } of golden) {
    it(`${JSON.stringify(input)} -> ${JSON.stringify(output)}`, () => {
      expect(canonicalizeTireSize(input)).toBe(output)
    })
  }
})
```

`backend/src/modules/wheel-size/__tests__/oem-tire-sizes.test.ts`:

```ts
import { extractOemTireSizes } from "../oem-tire-sizes"

const raw = {
  data: [
    {
      wheels: [
        { is_stock: true,  front: { tire: "225/55R18" }, rear: { tire: "225/55R18" } },
        { is_stock: true,  front: { tire: "255/35ZR19" }, rear: { tire: "" } },
        { is_stock: false, front: { tire: "245/50R18" }, rear: { tire: "245/50R18" } }, // aftermarket → excluded
      ],
    },
  ],
}

describe("extractOemTireSizes", () => {
  it("returns canonical OEM front+rear sizes, deduped; excludes aftermarket", () => {
    expect(extractOemTireSizes(raw).sort()).toEqual(["225/55R18", "255/35R19"])
  })
  it("returns [] for missing/empty data", () => {
    expect(extractOemTireSizes(null)).toEqual([])
    expect(extractOemTireSizes({ data: [] })).toEqual([])
    expect(extractOemTireSizes({ data: [{ wheels: [] }] })).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx -y pnpm@9.10.0 test:fitment -- oem-tire-sizes canonicalize-tire-size`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `canonicalize-tire-size.ts`**

```ts
/**
 * Canonicalize a tire size string for the fitment join. Uppercase, strip a
 * trailing service description, and remove the "Z" speed modifier so
 * "255/35ZR19" == "255/35R19". Mirrors the vendor-sync canonical size output
 * (SP1) so the vehicle side matches the indexed `tire_sizes`. Pure.
 */
export function canonicalizeTireSize(s: string): string {
  const token = (s ?? "").trim().split(/\s+/)[0] ?? ""
  if (!token) return ""
  return token.toUpperCase().replace(/Z(?=[RBD]\d)/g, "")
}
```

- [ ] **Step 4: Implement `oem-tire-sizes.ts`**

```ts
import { canonicalizeTireSize } from "./canonicalize-tire-size"

/**
 * Pull the factory (is_stock) tire sizes out of a cached wheel-size `by_model`
 * body (`raw.data[].wheels[].front/rear.tire`). Front + rear are flattened into
 * one deduped, canonicalized set. Aftermarket (is_stock === false) is excluded.
 * Pure — reads the same cached `raw` reverse-fitment already consumes; no API calls.
 */
export function extractOemTireSizes(raw: unknown): string[] {
  const data = (raw as any)?.data
  if (!Array.isArray(data)) return []
  const out = new Set<string>()
  for (const entry of data) {
    for (const w of entry?.wheels ?? []) {
      if (w?.is_stock !== true) continue
      for (const side of [w.front, w.rear]) {
        const tire = typeof side?.tire === "string" ? side.tire : ""
        const canon = canonicalizeTireSize(tire)
        if (canon) out.add(canon)
      }
    }
  }
  return [...out]
}
```

- [ ] **Step 5: Add `oemTireSizes` to the type + `RawRim`/`RawWheelEntry`, and populate `toFitment`**

In `backend/src/modules/wheel-size/types.ts`, add to `VehicleFitment` (after `offsetWindow`):

```ts
  offsetWindow: Window
  /** Factory (is_stock) tire sizes for the vehicle, canonical (e.g. "225/55R18"). */
  oemTireSizes: string[]
  source: { modificationSlug: string; region: string }
```

and widen the raw read types so the extractor's field is declared (optional, non-breaking):

```ts
export type RawRim = { rim_diameter: number | null; rim_width: number | null; rim_offset: number | null; tire?: string | null }
```

In `backend/src/modules/wheel-size/service.ts`, add the import and populate `toFitment`:

```ts
import { extractOemTireSizes } from "./oem-tire-sizes"
```

In `toFitment` (the return object), add:

```ts
      offsetWindow: (c.offset_window as unknown as Window) ?? null,
      oemTireSizes: extractOemTireSizes(c.raw),
      source: { modificationSlug: modificationSlug ?? "", region: c.region ?? region },
```

Note: `refreshFitment` returns the `normalizeByModel` result (not via `toFitment`) — that path also needs `oemTireSizes`. `normalizeByModel` doesn't see `raw`... it does (it's called with `body`). Simplest: in `refreshFitment`, after computing `fitment`, set `fitment.oemTireSizes = extractOemTireSizes(body)` before returning, OR have `normalizeByModel` populate it. Add to `refreshFitment` return path: change `return fitment` to `return { ...fitment, oemTireSizes: extractOemTireSizes(body) }` AND ensure `normalizeByModel`'s returned object type includes `oemTireSizes` (add `oemTireSizes: []` to its return in `normalize.ts` so the `VehicleFitment` type is satisfied, then the refreshFitment spread overrides it). Open `normalize.ts` and add `oemTireSizes: []` to its returned object (both the ok and not_found branches) to satisfy the type; `refreshFitment` overrides with the real value.

- [ ] **Step 6: Run tests + tsc**

Run: `cd backend && npx -y pnpm@9.10.0 test:fitment` → PASS (new + existing wheel-size tests).
Run: `cd backend && npx -y pnpm@9.10.0 exec tsc --noEmit -p tsconfig.json` → no new errors.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/wheel-size/canonicalize-tire-size.ts backend/src/modules/wheel-size/oem-tire-sizes.ts backend/src/modules/wheel-size/types.ts backend/src/modules/wheel-size/service.ts backend/src/modules/wheel-size/normalize.ts fixtures/tire-size-canonical-golden.json backend/src/modules/wheel-size/__tests__/
git commit -m "feat(wheel-size): extract OEM tire sizes from cached by_model → VehicleFitment.oemTireSizes (WB-063)"
```

> The `GET /store/fitment/by-vehicle` route already returns `{ fitment }` = the `getFitment` result, so `oemTireSizes` rides along with no route change.

---

## Task 2: Storefront — canonicalizeTireSize twin (golden) + tireFitsVehicle + garage types

**Files:**
- Create: `storefront/src/lib/fitment/canonicalize-tire-size.ts`, `.../tire-fits-vehicle.ts`
- Modify: `storefront/src/lib/garage/types.ts`
- Test: `storefront/src/lib/fitment/__tests__/{canonicalize-tire-size,tire-fits-vehicle}.test.ts`

**Interfaces:**
- Produces: `canonicalizeTireSize(s): string` (twin); `tireFitsVehicle(productSizes: string[], vehicleOemSizes: string[]): boolean`; `Vehicle.oemTireSizes?: string[]`, `VehicleFitment.oemTireSizes: string[]`.

- [ ] **Step 1: Write the failing tests**

`storefront/src/lib/fitment/__tests__/canonicalize-tire-size.test.ts`:

```ts
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it, expect } from "vitest"
import { canonicalizeTireSize } from "../canonicalize-tire-size"

const golden = JSON.parse(
  readFileSync(join(__dirname, "../../../../../fixtures/tire-size-canonical-golden.json"), "utf8")
) as { input: string; output: string }[]

describe("canonicalizeTireSize golden (storefront twin)", () => {
  for (const { input, output } of golden) {
    it(`${JSON.stringify(input)} -> ${JSON.stringify(output)}`, () => {
      expect(canonicalizeTireSize(input)).toBe(output)
    })
  }
})
```

`storefront/src/lib/fitment/__tests__/tire-fits-vehicle.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { tireFitsVehicle } from "../tire-fits-vehicle"

describe("tireFitsVehicle", () => {
  it("fits when a product size matches a vehicle OEM size (canonical)", () => {
    expect(tireFitsVehicle(["305/45R22", "255/35ZR19"], ["255/35R19"])).toBe(true)
  })
  it("does not fit when no size intersects", () => {
    expect(tireFitsVehicle(["305/45R22"], ["225/55R18"])).toBe(false)
  })
  it("false for empty product or empty vehicle sizes", () => {
    expect(tireFitsVehicle([], ["225/55R18"])).toBe(false)
    expect(tireFitsVehicle(["225/55R18"], [])).toBe(false)
  })
  it("canonicalizes both sides before matching", () => {
    expect(tireFitsVehicle(["255/35zr19"], ["255/35R19 96Y"])).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd storefront && npx vitest run src/lib/fitment/__tests__/canonicalize-tire-size src/lib/fitment/__tests__/tire-fits-vehicle`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `canonicalize-tire-size.ts`** (byte-identical logic to the backend twin)

```ts
/**
 * Canonicalize a tire size for the fitment join — twin of the backend
 * wheel-size/canonicalize-tire-size.ts, guarded by the shared golden
 * fixtures/tire-size-canonical-golden.json. Pure.
 */
export function canonicalizeTireSize(s: string): string {
  const token = (s ?? "").trim().split(/\s+/)[0] ?? ""
  if (!token) return ""
  return token.toUpperCase().replace(/Z(?=[RBD]\d)/g, "")
}
```

- [ ] **Step 4: Implement `tire-fits-vehicle.ts`**

```ts
import { canonicalizeTireSize } from "./canonicalize-tire-size"

/**
 * A tire fits the vehicle when any of its (canonical) sizes matches one of the
 * vehicle's OEM tire sizes. Product `tire_sizes` are already canonical; the
 * vehicle set is canonicalized here to be safe. Single source of truth for the
 * tire card badge, the discovery fit gate, and the tire-PDP chip. Pure.
 */
export function tireFitsVehicle(productSizes: string[], vehicleOemSizes: string[]): boolean {
  if (!productSizes.length || !vehicleOemSizes.length) return false
  const vset = new Set(vehicleOemSizes.map(canonicalizeTireSize).filter(Boolean))
  return productSizes.map(canonicalizeTireSize).some((s) => s && vset.has(s))
}
```

- [ ] **Step 5: Add `oemTireSizes` to the garage types**

In `storefront/src/lib/garage/types.ts`, add to BOTH `VehicleFitment` (after `offsetWindow`) and `Vehicle` (after `offsetWindow`):

```ts
// in VehicleFitment:
  diameterWindow: FitWindow; widthWindow: FitWindow; offsetWindow: FitWindow
  oemTireSizes: string[]
  source: { modificationSlug: string; region: string }
```
```ts
// in Vehicle:
  diameterWindow?: FitWindow; widthWindow?: FitWindow; offsetWindow?: FitWindow
  oemTireSizes?: string[]
  fitmentStatus?: "ok" | "not_found"
```

- [ ] **Step 6: Run tests + tsc**

Run: `cd storefront && npx vitest run src/lib/fitment` → PASS.
Run: `cd storefront && npx tsc --noEmit 2>&1 | grep -iE "fitment|garage" | grep -v "resolve-variant" || echo "no new errors"` → no new errors. (The storefront `VehicleFitment` now requires `oemTireSizes`; if a fixture/consumer constructs it, add `oemTireSizes: []` there — report any such spot; the wheel `getFitmentByVehicle` returns the backend object which now includes it.)

- [ ] **Step 7: Commit**

```bash
git add storefront/src/lib/fitment/canonicalize-tire-size.ts storefront/src/lib/fitment/tire-fits-vehicle.ts storefront/src/lib/garage/types.ts storefront/src/lib/fitment/__tests__/
git commit -m "feat(fitment): tireFitsVehicle + canonical-size golden twin + garage oemTireSizes (WB-063)"
```

---

## Task 3: Storefront — YMM pane writes the vehicle's OEM tire sizes

**Files:**
- Modify: `storefront/src/modules/search/components/search-drawer/find-by-vehicle/ymm-pane.tsx`

**Interfaces:**
- Consumes: `Vehicle.oemTireSizes` (Task 2); the `getFitmentByVehicle` result now carries `oemTireSizes`.

- [ ] **Step 1: Add `oemTireSizes` to the `update()` call**

Open `ymm-pane.tsx`, find the `update(vehicle.id, { ... })` call inside the `submit` handler (after `getFitmentByVehicle` resolves; it writes `canonicalBoltPatterns`, `hubBoreMm`, the windows, `fitmentStatus`). Add one field:

```ts
  update(vehicle.id, {
    canonicalBoltPatterns: fitment.canonicalBoltPatterns,
    hubBoreMm: fitment.hubBoreMm ?? undefined,
    diameterWindow: fitment.diameterWindow,
    widthWindow: fitment.widthWindow,
    offsetWindow: fitment.offsetWindow,
    oemTireSizes: fitment.oemTireSizes,
    fitmentStatus: fitment.status,
  })
```

(Match the exact existing field set; ONLY add the `oemTireSizes: fitment.oemTireSizes` line. The storefront `getFitmentByVehicle` returns the backend `VehicleFitment`, which now includes `oemTireSizes` — Task 1 — and the storefront `VehicleFitment`/`Vehicle` types include it — Task 2.)

- [ ] **Step 2: Type-check**

Run: `cd storefront && npx tsc --noEmit 2>&1 | grep -i "ymm-pane" || echo "no ymm-pane errors"` → none.

- [ ] **Step 3: Commit**

```bash
git add storefront/src/modules/search/components/search-drawer/find-by-vehicle/ymm-pane.tsx
git commit -m "feat(fitment): write a vehicle's OEM tire sizes onto the garage vehicle (WB-063)"
```

---

## Task 4: Storefront — tire discovery fit query (param + Meili clause + product sizes)

**Files:**
- Modify: `storefront/src/modules/tire-discovery/data/types.ts`, `.../data/get-tire-products.ts`, `.../data/cache-key.ts`
- Test: `storefront/src/modules/tire-discovery/__tests__/fit.test.ts`

**Interfaces:**
- Produces: `TireDiscoveryProduct.sizes: string[]`; `TireDiscoveryQuery.vehicleTireSizes?: string[]`; `parseTireQueryFromSearchParams` reads `fit`; `tireSizesToFitParam`/`fitParamToTireSizes`; `buildTireFilters` adds a `tire_sizes IN […]` fit clause.

- [ ] **Step 1: Write the failing tests**

`storefront/src/modules/tire-discovery/__tests__/fit.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { parseTireQueryFromSearchParams, tireSizesToFitParam, fitParamToTireSizes, EMPTY_TIRE_FILTERS } from "../data/types"
import { buildTireFilters, hitToTireProduct } from "../data/get-tire-products"

describe("tire fit param", () => {
  it("round-trips sizes through the fit param", () => {
    expect(fitParamToTireSizes(tireSizesToFitParam(["225/55R18", "255/35R19"]))).toEqual(["225/55R18", "255/35R19"])
  })
  it("parses ?fit into vehicleTireSizes; fit=0 → none", () => {
    expect(parseTireQueryFromSearchParams({ fit: "225/55R18,255/35R19" }).vehicleTireSizes).toEqual(["225/55R18", "255/35R19"])
    expect(parseTireQueryFromSearchParams({ fit: "0" }).vehicleTireSizes).toBeUndefined()
    expect(parseTireQueryFromSearchParams({}).vehicleTireSizes).toBeUndefined()
  })
})

describe("buildTireFilters fit clause", () => {
  it("adds a tire_sizes IN clause for the vehicle sizes", () => {
    const c = buildTireFilters(EMPTY_TIRE_FILTERS, undefined, ["225/55R18", "255/35R19"])
    expect(c.some((x) => x.startsWith("tire_sizes IN"))).toBe(true)
  })
  it("no fit clause when no vehicle sizes", () => {
    const c = buildTireFilters(EMPTY_TIRE_FILTERS)
    expect(c.some((x) => x.startsWith("tire_sizes IN") && !x.includes("skip"))).toBe(true) // product_type only
  })
})

describe("hitToTireProduct sizes", () => {
  it("carries the canonical tire_sizes onto the product", () => {
    const p = hitToTireProduct({ id: "t", handle: "h", title: "t", brand: "B", price_min: 0, tire_sizes: ["305/45R22", "305/50R20"] } as any)
    expect(p.sizes).toEqual(["305/45R22", "305/50R20"])
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd storefront && npx vitest run src/modules/tire-discovery/__tests__/fit`
Expected: FAIL.

- [ ] **Step 3: Add the fit param + `vehicleTireSizes` + `sizes` to `data/types.ts`**

Add the encode/decode + `sizes` field + `vehicleTireSizes` + parse:

```ts
// TireDiscoveryProduct: add the canonical sizes array (for the FITS badge)
export type TireDiscoveryProduct = {
  id: string; handle: string; brand: string; name: string
  priceCents: number; thumbnail: string | null
  sizeCount: number; rimDiameters: number[]; tireType: TireType
  /** Canonical tire sizes this product offers (for the fit badge). */
  sizes: string[]
  isNew?: boolean
}

// TireDiscoveryQuery: add the fit seam
export type TireDiscoveryQuery = {
  filters: TireDiscoveryFilters
  sort: SortOption
  page: number
  q?: string
  /** OEM tire sizes of the active vehicle (from ?fit=); constrains tire_sizes. */
  vehicleTireSizes?: string[]
}

/** Serialize/parse the tire `fit` param (CSV of canonical sizes). fit="0" = off. */
export const tireSizesToFitParam = (sizes: string[]): string => sizes.join(",")
export const fitParamToTireSizes = (raw: string): string[] =>
  raw.split(",").map((s) => s.trim()).filter(Boolean)
```

In `parseTireQueryFromSearchParams`, after computing `sort`, add the `fit` read and spread `vehicleTireSizes` onto the return (only when present + not "0"):

```ts
  const fitRaw = typeof sp.fit === "string" ? sp.fit : Array.isArray(sp.fit) ? sp.fit[0] : undefined
  const vehicleTireSizes = fitRaw && fitRaw !== "0" ? fitParamToTireSizes(fitRaw) : undefined

  return {
    filters: { /* …unchanged… */ },
    sort,
    page: Math.max(1, num("page") ?? 1),
    q: (Array.isArray(sp.q) ? sp.q[0] : sp.q) || undefined,
    ...(vehicleTireSizes?.length ? { vehicleTireSizes } : {}),
  }
```

- [ ] **Step 4: Add the fit clause to `buildTireFilters` + `sizes` to `hitToTireProduct` in `get-tire-products.ts`**

Change `buildTireFilters`'s signature to accept the vehicle sizes and append the clause (uses the existing `lit` + the existing `tire_sizes` facet):

```ts
export function buildTireFilters(
  f: TireDiscoveryFilters,
  skip?: keyof TireDiscoveryFilters,
  vehicleTireSizes?: string[]
): string[] {
  const clauses: string[] = ['product_type = "tire"']
  // …existing facet clauses unchanged…
  if (f.priceMaxCents != null) clauses.push(`price_min <= ${f.priceMaxCents}`)
  if (vehicleTireSizes?.length) clauses.push(`tire_sizes IN [${vehicleTireSizes.map(lit).join(", ")}]`)
  return clauses
}
```

Thread `query.vehicleTireSizes` into the calls inside `fetchTireDiscoveryProducts`: the hits query + each facet query pass `buildTireFilters(query.filters, <skip>, query.vehicleTireSizes)` (the fit clause is a base filter, applied to every query including facet queries — like the wheel `vehicleConstraint`).

In `hitToTireProduct`, add `sizes` from the hit (the `tire_sizes` field is already indexed + displayed):

```ts
type TireHit = { /* …existing… */ tire_sizes?: string[] /* … */ }

export function hitToTireProduct(h: TireHit): TireDiscoveryProduct {
  // …existing…
  return {
    // …existing fields…
    sizes: Array.isArray(h.tire_sizes) ? h.tire_sizes : [],
    isNew: /* …unchanged… */,
  }
}
```

- [ ] **Step 5: Add `vehicleTireSizes` to the cache key**

In `data/cache-key.ts`, add to the `tireDiscoveryCacheKey` object (so a fit query caches distinctly):

```ts
    q: query.q ?? "",
    fit: query.vehicleTireSizes ? [...query.vehicleTireSizes].sort().join(",") : "",
```

- [ ] **Step 6: Run tests + tsc**

Run: `cd storefront && npx vitest run src/modules/tire-discovery` → PASS.
Run: `cd storefront && npx tsc --noEmit 2>&1 | grep -i "tire-discovery" || echo "no new tire-discovery errors"` → none. (Adding `sizes` to `TireDiscoveryProduct` may surface a spot where a product is hand-built — the SP2 tests/tire card. If the tire card test builds a `TireDiscoveryProduct`, add `sizes: []`; report it.)

- [ ] **Step 7: Commit**

```bash
git add storefront/src/modules/tire-discovery/data/types.ts storefront/src/modules/tire-discovery/data/get-tire-products.ts storefront/src/modules/tire-discovery/data/cache-key.ts storefront/src/modules/tire-discovery/__tests__/fit.test.ts
git commit -m "feat(tire-discovery): ?fit tire-size filter + product sizes for the fit badge (WB-063)"
```

---

## Task 5: Storefront — tire FitmentSync + header chip + Show-all escape on /tires

**Files:**
- Create: `storefront/src/modules/tire-discovery/components/fitment-sync/index.tsx`
- Modify: `storefront/src/modules/tire-discovery/templates/index.tsx`, `.../components/header/index.tsx`, `.../use-tire-query.ts` (+ active-chips for the Fits chip)

**Interfaces:**
- Consumes: `useGarage().active.oemTireSizes`; `tireSizesToFitParam` (Task 4).

- [ ] **Step 1: Implement the tire `FitmentSync`** (copy + transform the wheel one at `modules/discovery/components/fitment-sync/index.tsx` — READ it)

Create `storefront/src/modules/tire-discovery/components/fitment-sync/index.tsx`, mirroring the wheel `FitmentSync` with these transforms:
- Import `tireSizesToFitParam` from `../../data/types` (not the wheel `patternsToFitParam`/`winToParam`).
- The desired sync is ONLY the `fit` param (tires have no `fitb/fitd/fitw/fito` windows): `const desiredFit = (active?.oemTireSizes ?? []).length ? tireSizesToFitParam(active!.oemTireSizes!) : null`.
- Keep the wheel guards verbatim: `sp.get("fit") === "0"` early-return (opt-out authoritative); `if (!desiredFit) return` (never auto-strip); `inSync` check on just `fit`; `next.delete("page")`; `router.replace` via `@bprogress/next/app`.
- The effect deps key on `active?.id` + `active?.oemTireSizes?.join(",")` + `sp` + `pathname` + `router`.
- Renders `null`.

- [ ] **Step 2: Mount it in the tire template + add the header chip + Show-all escape**

- In `templates/index.tsx` (tire), add `<TireFitmentSync />` at the top of the composed output (mirror where the wheel template renders `<FitmentSync/>`). Import from `../components/fitment-sync`.
- In `components/header/index.tsx` (tire), add a "FITS YOUR CAR" chip shown ONLY when a real fit is applied (a `fit` param present AND `!== "0"` AND the active vehicle has `oemTireSizes`), else "Select a vehicle" — mirror the wheel header garage chip's logic (read `useGarage().active` + `useSearchParams().get("fit")`). This is a client component already (SP2 header has the sort dropdown).
- The "Show all" escape = a removable "Fits: [car]" chip that sets `fit=0` (mirror the wheel active-chips `Fits:` chip). Add it to the tire `active-chips`: when `useSearchParams().get("fit")` is a real fit, render a chip whose remove action pushes `fit=0` (reuse `use-tire-query`; add a `clearFit()` that sets `fit=0` and resets page, mirroring how the wheel active-chips clears fit).

- [ ] **Step 3: Type-check**

Run: `cd storefront && npx tsc --noEmit 2>&1 | grep -iE "tire-discovery" || echo "no new tire-discovery errors"` → none.

- [ ] **Step 4: Commit**

```bash
git add storefront/src/modules/tire-discovery/components/fitment-sync/ storefront/src/modules/tire-discovery/templates/index.tsx storefront/src/modules/tire-discovery/components/header/ storefront/src/modules/tire-discovery/components/active-chips/ storefront/src/modules/tire-discovery/use-tire-query.ts
git commit -m "feat(tire-discovery): auto-apply OEM-size fit on /tires + FITS chip + Show-all escape (WB-063)"
```

---

## Task 6: Storefront — FITS badge on the tire card

**Files:**
- Create: `storefront/src/modules/tire-discovery/components/grid/tire-fit-badge.tsx`
- Modify: `storefront/src/modules/tire-discovery/components/grid/tire-product-card.tsx`

**Interfaces:**
- Consumes: `TireDiscoveryProduct.sizes` (Task 4); `tireFitsVehicle` (Task 2); `useGarage().active.oemTireSizes`.

- [ ] **Step 1: Implement `tire-fit-badge.tsx`** (copy + transform the wheel `fit-badge.tsx` — READ `modules/discovery/components/grid/fit-badge.tsx`)

Create the client island: reads `useGarage().active`; when the active vehicle has `oemTireSizes` and `tireFitsVehicle(sizes, active.oemTireSizes)` is true, renders the "FITS" chip (same visual as the wheel badge). Props: `{ sizes: string[] }`. Import `tireFitsVehicle` from `@lib/fitment/tire-fits-vehicle`.

- [ ] **Step 2: Render it in the tire card**

In `tire-product-card.tsx`, add `<TireFitBadge sizes={product.sizes} />` in the image corner (mirror where the wheel card renders `<FitBadge patterns={product.boltPatternsCanonical} />`).

- [ ] **Step 3: Type-check**

Run: `cd storefront && npx tsc --noEmit 2>&1 | grep -i "tire-discovery/components/grid" || echo "no new errors"` → none.

- [ ] **Step 4: Commit**

```bash
git add storefront/src/modules/tire-discovery/components/grid/tire-fit-badge.tsx storefront/src/modules/tire-discovery/components/grid/tire-product-card.tsx
git commit -m "feat(tire-discovery): FITS badge on tire cards (WB-063)"
```

---

## Task 7: Storefront — tire PDP fit chip + fit-aware default size

**Files:**
- Modify: `storefront/src/modules/product-detail/components/tire/hero/{index,purchase-panel,size-picker}.tsx`

**Interfaces:**
- Consumes: `tireFitsVehicle` (Task 2); `useGarage().active.oemTireSizes`; the tire PDP `product.sizeOptions` (SP3, each with `canonicalSize`).

- [ ] **Step 1: Add the fit chip to the tire purchase panel**

In `components/tire/hero/purchase-panel.tsx` (client), read `useGarage().active`. Compute the product's canonical sizes from `product.sizeOptions.map(s => s.canonicalSize)` (SP3's `TireSizeOption.canonicalSize`) — thread the product's sizes into the panel, or compute in `hero/index.tsx` and pass a `productSizes: string[]` prop. Show a chip: "FITS YOUR {make}" when `active?.oemTireSizes?.length && tireFitsVehicle(productSizes, active.oemTireSizes)`, else "MAY NOT FIT" when a vehicle is active but no match, else nothing. Mirror the wheel purchase-panel chip (WB-056 honesty — only claim a fit when true).

- [ ] **Step 2: Fit-aware default size (WB-060 analog)**

In `hero/index.tsx` (tire), when the URL has `?fit=1` (read `useSearchParams().get("fit") === "1"`) AND a vehicle is active with `oemTireSizes`, set the default `selectedSizeLabel` to a size whose `canonicalSize` is in the vehicle's OEM set (pick the first fitting `sizeOptions` entry, via `tireFitsVehicle([o.canonicalSize], active.oemTireSizes)`), falling back to `pickDefaultTireSize` when none fits. The rim chip re-snaps to that size's rim. Keep the full picker visible (no "Show all" gating needed for tires — OEM sizes are few; just default to the fitting one). The discovery `TireProductCard` link already threads `?fit=1` only in fit mode (add that: in the tire card link, append `?fit=1` when a `fit` prop is set, mirroring `DiscoveryProductCard`; pass `fit` from the grid/template when a real fit is active — small addition, or reuse the SP2 card which currently links plainly).

Note: if threading `?fit=1` from the tire grid is more than a trivial add, keep the fit chip (Step 1) and make the fit-aware default read the ACTIVE vehicle directly (no `?fit=1` needed) — i.e. default to the fitting size whenever a vehicle is active. Choose the simpler wiring; the chip is the required deliverable, the auto-default is the enhancement.

- [ ] **Step 3: Type-check + full gate**

Run: `cd storefront && npx tsc --noEmit 2>&1 | grep -i "components/tire" || echo "no new errors"` → none.

- [ ] **Step 4: Commit**

```bash
git add storefront/src/modules/product-detail/components/tire/
git commit -m "feat(tire-pdp): fits-your-car chip + fit-aware default size (WB-063)"
```

---

## Task 8: Full gate + docs

**Files:**
- Modify: `docs/future/BACKLOG.md` (add WB-063 done), `docs/STATUS.md` (Fitment/Discovery/PDP pillars), `CLAUDE.md`/`storefront/CLAUDE.md` if a fitment note needs it.

- [ ] **Step 1: Full gates**

Run: `cd backend && npx -y pnpm@9.10.0 test:fitment` → PASS (record count).
Run: `cd storefront && npx vitest run` → PASS (record count); `npx tsc --noEmit 2>&1 | grep -c error` → confirm no new beyond baseline.
Run: `cd storefront && npx -y pnpm@9.10.0 build:next` → `/tires` + PDP compile (full build env-block on collections/categories is pre-existing — A/B if needed).

- [ ] **Step 2: Docs**

Add **WB-063** to `docs/future/BACKLOG.md` as `done` (forward tire fitment: OEM-size join off the cached by_model; `/tires` filter + FITS badges + PDP chip; no new API/migration). Update `docs/STATUS.md` — Fitment pillar (tires now have forward fitment), Discovery + PDP pillar notes, "Last verified" 2026-07-03. Note in the tire-store parity that fitment is now partially closed (forward done; reverse "N vehicles" still deferred).

- [ ] **Step 3: doc-review + commit**

Run the doc-review skill; fix drift. Then:

```bash
git add docs/future/BACKLOG.md docs/STATUS.md
git commit -m "docs: WB-063 tire fitment (forward) landed"
```

---

## Self-review notes (for the executor)

- **Spec coverage:** Task 1 = backend extract + VehicleFitment.oemTireSizes (spec §Backend); Task 2 = tireFitsVehicle + canonical golden + garage types (spec §Shared canonicalization, §garage); Task 3 = ymm write (spec §garage); Task 4 = fit param + Meili clause + product sizes (spec §discovery); Task 5 = tire FitmentSync + header chip + escape (spec §discovery auto-apply); Task 6 = card FITS badge (spec §discovery); Task 7 = PDP chip + fit-aware default (spec §PDP); Task 8 = gate + docs.
- **Deferred (spec out-of-scope):** reverse "N vehicles", aftermarket/plus-size, `/upsteps/`, staggered front/rear.
- **Wheel-unchanged:** the only shared edits are additive optional `oemTireSizes` on `VehicleFitment`/`Vehicle` and the wheel `getFitmentByVehicle` return (now carries it) — no wheel runtime path changes. Verify the wheel fitment tests still pass in Task 1/2.
- **Type consistency:** `canonicalizeTireSize`, `tireFitsVehicle`, `oemTireSizes`, `vehicleTireSizes`, `TireDiscoveryProduct.sizes`, `tireSizesToFitParam`/`fitParamToTireSizes`, and the `tire_sizes IN […]` Meili clause names are used identically across tasks; the golden `fixtures/tire-size-canonical-golden.json` is asserted in both apps.
