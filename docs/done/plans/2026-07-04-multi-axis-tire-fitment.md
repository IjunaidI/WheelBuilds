# Multi-axis Tire Fitment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend tire fitment from size-only to size + load index + speed rating (meet-or-exceed), on every surface — card badge, PDP chip, PDP fit-mode filtering, reverse list, and the `/tires` browse filter — matching the wheel WB-060 fit pipeline.

**Architecture:** A shared `speedRatingRank` + a per-variant match rule (`size == oem AND load ≥ oem AND speedRank ≥ oem`, missing data passes). The backend extracts richer `OemTire` tuples from the cached wheel-size raw and indexes per-variant `fit_specs` in Meili; the storefront persists `oemTires` on the garage vehicle and a single multi-axis `tireFitsVehicle` drives every surface, with a `/tires` candidate post-filter over the Meili `fit_specs` (no Store-API round-trip).

**Tech Stack:** MedusaJS 2.13.6 backend (MikroORM, Jest, Meili plugin), Next.js 15 storefront (Vitest), the `wheel-size` + `vendor-sync/search` + `customer-vehicle` + `tire-discovery` + `product-detail` modules.

## Global Constraints

- No `wb-` prefix on any dir/file/export/class.
- **Match rule (verbatim):** a tire fits when it has a variant whose `canonicalSize` equals an OEM size AND `loadIndex ≥` that OEM load AND `speedRatingRank(rating) ≥ speedRatingRank(oemSpeed)`. **Missing load/speed on EITHER side passes that dimension** (never exclude on a data gap).
- **Speed order (ascending):** `L M N P Q R S T U H V W Y` (H between U and V); `Z`/`ZR` ranks ≥ W; unknown → a sentinel that makes the gate pass. Golden-guarded (`fixtures/speed-rating-rank-golden.json`) asserted in BOTH apps.
- **`OemTire` / `TireFitSpec` shape** (identical): `{ size: string; loadIndex: number | null; speedRating: string | null }`. `size` is canonical (bare, e.g. `"305/45R22"`); load is an integer; speed is the raw letter (e.g. `"H"`).
- Backend: no wheel-path change; the reverse route + Meili doc + customer_vehicle column are additive. Storefront build ignores TS/lint; gate = `tsc` no-new (storefront baseline 14) + named unit suites + `pnpm test:sync`/`test:fitment`.
- Additive nullable migrations only (`oem_tires` column); one Meili re-sync (backend restart) activates `fit_specs`.
- Commit trailer, own line at end: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Shared `speedRatingRank` + golden

**Files:**
- Create: `backend/src/modules/wheel-size/speed-rating-rank.ts`
- Create: `storefront/src/lib/fitment/speed-rating-rank.ts`
- Create: `fixtures/speed-rating-rank-golden.json`
- Test: `backend/src/modules/wheel-size/__tests__/speed-rating-rank.test.ts`, `storefront/src/lib/fitment/__tests__/speed-rating-rank.test.ts`

**Interfaces:**
- Produces: `speedRatingRank(rating: string | null | undefined): number` (higher = faster; unknown/missing → `-1` so a null OEM speed makes the gate pass and a null tire speed is compared as ≥ only when the OEM is also null). Identical in both apps.

- [ ] **Step 1: Write the golden fixture**

`fixtures/speed-rating-rank-golden.json` — the canonical order + edge cases (the pair is asserted in both apps):

Ranks are the 0-based index into `order` (so `indexOf` IS the rank), with `Z`/`ZR` mapped to `W`'s index and unknown/missing → `-1`:

```json
{
  "order": ["L", "M", "N", "P", "Q", "R", "S", "T", "U", "H", "V", "W", "Y"],
  "cases": [
    { "in": "S", "rank": 6 },
    { "in": "U", "rank": 8 },
    { "in": "H", "rank": 9 },
    { "in": "V", "rank": 10 },
    { "in": "h", "rank": 9 },
    { "in": "Z", "rank": 11 },
    { "in": "ZR", "rank": 11 },
    { "in": "(Y)", "rank": 12 },
    { "in": "", "rank": -1 },
    { "in": "??", "rank": -1 }
  ]
}
```

- [ ] **Step 2: Write the failing tests (both apps, same assertions)**

`backend/src/modules/wheel-size/__tests__/speed-rating-rank.test.ts`:

```ts
import { speedRatingRank } from "../speed-rating-rank"
import golden from "../../../../../fixtures/speed-rating-rank-golden.json"

describe("speedRatingRank", () => {
  it("ranks the standard order ascending (H between U and V)", () => {
    const ranks = golden.order.map((s) => speedRatingRank(s))
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    expect(speedRatingRank("U")).toBeLessThan(speedRatingRank("H"))
    expect(speedRatingRank("H")).toBeLessThan(speedRatingRank("V"))
  })
  it("matches every golden case (case-insensitive; Z high; unknown/empty → -1)", () => {
    for (const c of golden.cases) expect(speedRatingRank(c.in)).toBe(c.rank)
  })
  it("treats null/undefined as unknown (-1)", () => {
    expect(speedRatingRank(null)).toBe(-1)
    expect(speedRatingRank(undefined)).toBe(-1)
  })
})
```

Create the storefront twin at `storefront/src/lib/fitment/__tests__/speed-rating-rank.test.ts` with the SAME body but `import golden from "../../../../../fixtures/speed-rating-rank-golden.json"` (verify the relative depth from that file resolves to the repo-root `fixtures/`; adjust the `../` count if tsc/vitest disagrees) and `import { speedRatingRank } from "../speed-rating-rank"`.

- [ ] **Step 3: Run to verify they fail**

Run: `cd backend && npx -y pnpm@9.10.0 test:fitment 2>&1 | grep -i speed-rating` → FAIL (module missing).

- [ ] **Step 4: Implement (identical in both files)**

Both `speed-rating-rank.ts`:

```ts
// Standard tire speed-rating order (ascending km/h). H is deliberately between U
// and V (H=210, U=200, V=240). The rank IS the 0-based index. Z/ZR (>240) map to
// W's index so a fast tire is never wrongly excluded; parens are stripped so
// "(Y)" ranks as Y; unknown/missing → -1 (the meet-or-exceed gate then passes
// whenever the OEM speed is also unknown, and never falsely excludes).
const ORDER = ["L", "M", "N", "P", "Q", "R", "S", "T", "U", "H", "V", "W", "Y"]

export function speedRatingRank(rating: string | null | undefined): number {
  if (!rating) return -1
  const r = rating.toUpperCase().replace(/[()]/g, "").trim()
  if (r === "Z" || r === "ZR") return ORDER.indexOf("W")
  return ORDER.indexOf(r) // -1 when not a known rating
}
```

This yields exactly the golden ranks (S=6, U=8, H=9, V=10, "(Y)"→"Y"=12, Z/ZR=11, unknown=-1) and the invariants (monotonic; H between U and V; Z ≥ W; unknown=-1).

- [ ] **Step 5: Run both suites → PASS**

Run: `cd backend && npx -y pnpm@9.10.0 test:fitment 2>&1 | grep -i speed-rating` → PASS.
Run: `cd storefront && npx vitest run src/lib/fitment/__tests__/speed-rating-rank` → PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/wheel-size/speed-rating-rank.ts backend/src/modules/wheel-size/__tests__/speed-rating-rank.test.ts storefront/src/lib/fitment/speed-rating-rank.ts storefront/src/lib/fitment/__tests__/speed-rating-rank.test.ts fixtures/speed-rating-rank-golden.json
git commit -m "feat(fitment): shared speedRatingRank + golden (WB-068)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Backend — `extractOemTires` + `VehicleFitment.oemTires`

**Files:**
- Modify: `backend/src/modules/wheel-size/types.ts` (add `OemTire`; `RawRim` gains `load_index`/`speed_index`)
- Create: `backend/src/modules/wheel-size/oem-tires.ts`
- Modify: `backend/src/modules/wheel-size/oem-tire-sizes.ts` (derive from `extractOemTires`)
- Modify: `backend/src/modules/wheel-size/service.ts` + `normalize.ts` (populate `oemTires`)
- Test: `backend/src/modules/wheel-size/__tests__/oem-tires.test.ts`

**Interfaces:**
- Consumes: `canonicalizeTireSize` (`./canonicalize-tire-size`).
- Produces: `OemTire = { size: string; loadIndex: number | null; speedRating: string | null }`; `extractOemTires(raw): OemTire[]`; `VehicleFitment.oemTires: OemTire[]`.

- [ ] **Step 1: Types**

In `types.ts`: add `export type OemTire = { size: string; loadIndex: number | null; speedRating: string | null }`; add `oemTires: OemTire[]` to `VehicleFitment`; extend `RawRim` with `load_index?: number | null; speed_index?: string | null`.

- [ ] **Step 2: Write the failing test**

`__tests__/oem-tires.test.ts`:

```ts
import { extractOemTires } from "../oem-tires"

const raw = (rims: any[]) => ({ data: [{ wheels: rims }] })

describe("extractOemTires", () => {
  it("reads size+load+speed from is_stock front/rear, canonical size, deduped", () => {
    const out = extractOemTires(raw([
      { is_stock: true, front: { tire: "235/35ZR19", load_index: 91, speed_index: "Y" }, rear: { tire: "235/35ZR19", load_index: 91, speed_index: "Y" } },
      { is_stock: true, front: { tire: "225/55R18", load_index: 97, speed_index: "H" } },
      { is_stock: false, front: { tire: "255/40R20", load_index: 101, speed_index: "W" } }, // aftermarket → excluded
    ]))
    expect(out).toEqual([
      { size: "235/35R19", loadIndex: 91, speedRating: "Y" },
      { size: "225/55R18", loadIndex: 97, speedRating: "H" },
    ])
  })
  it("missing load/speed → null (never dropped)", () => {
    expect(extractOemTires(raw([{ is_stock: true, front: { tire: "205/55R16" } }])))
      .toEqual([{ size: "205/55R16", loadIndex: null, speedRating: null }])
  })
  it("no data → []", () => {
    expect(extractOemTires(undefined)).toEqual([])
    expect(extractOemTires({ data: [] })).toEqual([])
  })
})
```

- [ ] **Step 3: Run → FAIL.** `cd backend && npx -y pnpm@9.10.0 test:fitment 2>&1 | grep -i oem-tires`

- [ ] **Step 4: Implement `oem-tires.ts`**

```ts
import { canonicalizeTireSize } from "./canonicalize-tire-size"
import { OemTire } from "./types"

/** Factory (is_stock) tires with size + load + speed, front+rear flattened + deduped.
 *  Reads the same cached raw as extractOemTireSizes; superset of it. */
export function extractOemTires(raw: unknown): OemTire[] {
  const data = (raw as any)?.data
  if (!Array.isArray(data)) return []
  const seen = new Set<string>()
  const out: OemTire[] = []
  for (const entry of data) {
    for (const w of entry?.wheels ?? []) {
      if (w?.is_stock !== true) continue
      for (const side of [w.front, w.rear]) {
        const size = canonicalizeTireSize(typeof side?.tire === "string" ? side.tire : "")
        if (!size) continue
        const loadIndex = typeof side?.load_index === "number" ? side.load_index : null
        const speedRating = typeof side?.speed_index === "string" && side.speed_index ? side.speed_index : null
        const key = `${size}|${loadIndex ?? ""}|${speedRating ?? ""}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ size, loadIndex, speedRating })
      }
    }
  }
  return out
}
```

Rewrite `oem-tire-sizes.ts`'s `extractOemTireSizes` to derive: `return Array.from(new Set(extractOemTires(raw).map((t) => t.size)))`. Keep its export/signature.

- [ ] **Step 5: Populate `oemTires` in `service.ts` + `normalize.ts`**

In `service.ts`: import `extractOemTires`; in `toFitment` add `oemTires: extractOemTires(c.raw)` next to the existing `oemTireSizes`; in `refreshFitment`'s return add `oemTires: extractOemTires(body)`. In `normalize.ts` both return branches add `oemTires: []`.

- [ ] **Step 6: Run → PASS + tsc.**

`cd backend && npx -y pnpm@9.10.0 test:fitment 2>&1 | tail -5` → PASS (incl. oem-tires + the existing oem-tire-sizes still green).
`cd backend && npx tsc --noEmit 2>&1 | grep -iE "oem-tires|wheel-size/(types|service|normalize|oem-tire-sizes)" | grep "error TS" || echo none`

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/wheel-size/oem-tires.ts backend/src/modules/wheel-size/oem-tire-sizes.ts backend/src/modules/wheel-size/types.ts backend/src/modules/wheel-size/service.ts backend/src/modules/wheel-size/normalize.ts backend/src/modules/wheel-size/__tests__/oem-tires.test.ts
git commit -m "feat(wheel-size): extract OEM tires (size+load+speed) → VehicleFitment.oemTires (WB-068)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Backend — Meili tire doc `fit_specs`

**Files:**
- Modify: `backend/src/modules/vendor-sync/search/build-search-document.ts` (tire branch `buildTireDocument`)
- Modify: `backend/medusa-config.js` (products index `displayedAttributes`)
- Test: `backend/src/modules/vendor-sync/search/__tests__/build-search-document.test.ts`

**Interfaces:**
- Produces: each tire Meili doc gains `fit_specs: string[]` — one `"<canonical_size>|<load_index>|<speed_rating>"` per variant (load/speed empty string when absent), e.g. `"305/45R22|118|S"`.

- [ ] **Step 1: Add a failing assertion** to the tire branch of `build-search-document.test.ts`: given a tire product whose variants carry `metadata.canonical_size/load_index/speed_rating`, expect the doc's `fit_specs` to equal e.g. `["305/45R22|118|S", "305/50R20||"]` (second variant missing load+speed).

- [ ] **Step 2: Run → FAIL.** `cd backend && npx -y pnpm@9.10.0 test:sync 2>&1 | grep -i fit_specs`

- [ ] **Step 3: Implement** in `buildTireDocument`: build `fit_specs` from the variants array —

```ts
const fit_specs = variants.map((v) => {
  const m = (v.metadata ?? {}) as Record<string, any>
  const size = typeof m.canonical_size === "string" ? m.canonical_size : ""
  const load = m.load_index != null ? String(m.load_index) : ""
  const speed = typeof m.speed_rating === "string" ? m.speed_rating : ""
  return `${size}|${load}|${speed}`
}).filter((s) => s[0] !== "|") // drop entries with no size
```

Add `fit_specs` to the returned tire doc object (next to `tire_sizes`). Read the file to match its real variant iteration (it already maps variants for `tire_sizes`/`load_indexes`; reuse that loop rather than a second pass if cleaner).

- [ ] **Step 4: Register in `medusa-config.js`** — add `'fit_specs'` to the products index `displayedAttributes` array (so the storefront hit carries it). It is NOT added to `filterableAttributes` (the post-filter reads it from the hit, not a Meili filter).

- [ ] **Step 5: Run → PASS + build.** `cd backend && npx -y pnpm@9.10.0 test:sync 2>&1 | tail -5` → PASS. Note in the report: **a Meili re-sync / backend restart is required in prod for `fit_specs` to populate existing docs.**

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/vendor-sync/search/build-search-document.ts backend/medusa-config.js backend/src/modules/vendor-sync/search/__tests__/build-search-document.test.ts
git commit -m "feat(search): index per-variant tire fit_specs for multi-axis fitment (WB-068)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Backend — reverse tire fitment multi-axis

**Files:**
- Modify: `backend/src/modules/wheel-size/reverse-tire-fitment.ts` (richer product specs + gate)
- Modify: `backend/src/modules/wheel-size/service.ts` (`reverseTireFitment` signature)
- Modify: `backend/src/api/store/fitment/by-tire-product/route.ts` (accept `sizes`+`loads`+`speeds`)
- Modify: `backend/src/modules/wheel-size/__tests__/reverse-tire-fitment.test.ts`

**Interfaces:**
- Consumes: `extractOemTires` (Task 2), `speedRatingRank` (Task 1).
- Produces: `buildReverseTireFitment(rows, productSpecs: { size: string; loadIndex: number | null; speedRating: string | null }[], limit): ReverseTireFitmentVehicle[]`; route `GET /store/fitment/by-tire-product?sizes=<CSV>&loads=<CSV>&speeds=<CSV>` (aligned by index).

- [ ] **Step 1: Update the test** — change fixtures so cached vehicle rows have is_stock tires with load/speed (via the `extractOemTires` shape), and assert: a product spec that matches a size but has `loadIndex < oem` OR `speedRatingRank < oem` is EXCLUDED; a spec meeting-or-exceeding is INCLUDED; missing load/speed passes; empty specs → `[]`. (Mirror the existing dedupe/sort/cap cases with the new signature.)

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** — `buildReverseTireFitment` reads `extractOemTires(row.raw)` (not `extractOemTireSizes`), and a vehicle matches when SOME product spec satisfies SOME oemTire via the shared rule:

```ts
import { speedRatingRank } from "./speed-rating-rank"
import { extractOemTires } from "./oem-tires"
// TireFitSpec = { size, loadIndex, speedRating } (same shape as OemTire)
function specFitsOem(spec: OemTire, oem: OemTire): boolean {
  if (spec.size !== oem.size) return false
  if (oem.loadIndex != null && spec.loadIndex != null && spec.loadIndex < oem.loadIndex) return false
  if (oem.speedRating != null && spec.speedRating != null &&
      speedRatingRank(spec.speedRating) < speedRatingRank(oem.speedRating)) return false
  return true
}
// per row: const oemTires = extractOemTires(row.raw); match if productSpecs.some(s => oemTires.some(o => specFitsOem(s, o)))
// matched "size" for the result = the oemTire size that matched (first hit).
```

`service.reverseTireFitment({ productSpecs, limit })` delegates. The route parses three aligned CSVs into `productSpecs` (`sizes[i]`, `loads[i]` → number|null, `speeds[i]` → string|null); empty/absent → `{ vehicles: [] }`.

- [ ] **Step 4: Run → PASS + tsc.**

- [ ] **Step 5: Commit** (`feat(wheel-size): multi-axis reverse tire fitment (WB-068)`, trailer).

---

### Task 5: Backend — `customer_vehicle.oem_tires` column

**Files:**
- Modify: `backend/src/modules/customer-vehicle/models/customer-vehicle.ts`
- Create: `backend/src/modules/customer-vehicle/migrations/Migration20260704140000.ts`
- Modify: `backend/src/modules/customer-vehicle/migrations/.snapshot-customer-vehicle-module.json`
- Modify: `backend/src/modules/customer-vehicle/service.ts` (`createForCustomer`)
- Modify: `backend/src/api/store/customer/vehicles/validators.ts` (`VehicleCreateSchema`)
- Modify: `backend/src/api/store/customer/vehicles/[id]/route.ts` (update)

Mirror WB-067's `oem_tire_sizes` exactly, one column over: add `oem_tires: model.json().nullable()` to the model; a migration `alter table if exists "customer_vehicle" add column if not exists "oem_tires" jsonb null;` (down: drop column); the snapshot `oem_tires` block (copy the `oem_tire_sizes` block, rename); `createForCustomer` maps `oem_tires: input.oemTires ?? null`; the schema adds `oemTires: z.array(z.object({ size: z.string(), loadIndex: z.number().nullable(), speedRating: z.string().nullable() })).nullish()`; the `[id]` route adds `oem_tires: b.oemTires` to `updateCustomerVehicles`.

- [ ] Steps: edit the 6 files; `cd backend && npx tsc --noEmit 2>&1 | grep -iE "customer-vehicle|vehicles" | grep "error TS" || echo none`; commit (`fix(garage): persist oemTires for authed users (WB-068)`, trailer). The migration is run in Task 10's gate against prod (additive nullable).

---

### Task 6: Storefront — multi-axis `tireFitsVehicle` + garage types

**Files:**
- Modify: `storefront/src/lib/fitment/tire-fits-vehicle.ts` (new signature)
- Modify: `storefront/src/lib/garage/types.ts` (`OemTire`, `Vehicle.oemTires`, `VehicleFitment.oemTires`)
- Modify: `storefront/src/lib/fitment/__tests__/tire-fits-vehicle.test.ts`

**Interfaces:**
- Consumes: `speedRatingRank` (Task 1 twin).
- Produces: `OemTire = { size, loadIndex, speedRating }` (in garage/types.ts, exported); `type TireFitSpec = OemTire`; `tireFitsVehicle(productSpecs: TireFitSpec[], vehicleOemTires: OemTire[]): boolean`; `tireProductHasFittingVariant` is the same function (alias-export for the discovery post-filter's readability).

- [ ] **Step 1: Rewrite the test** — assert the matrix: exact size + load≥ + speed≥ → true; size match but load< → false; size match but speed< (ordinal, e.g. tire "S" vs oem "V") → false; missing load/speed either side → passes; empty either array → false. Import `OemTire` from `@lib/garage/types`.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**

```ts
import { speedRatingRank } from "./speed-rating-rank"
import type { OemTire } from "@lib/garage/types"

export type TireFitSpec = OemTire

function fits(spec: TireFitSpec, oem: OemTire): boolean {
  if (spec.size !== oem.size) return false
  if (oem.loadIndex != null && spec.loadIndex != null && spec.loadIndex < oem.loadIndex) return false
  if (oem.speedRating != null && spec.speedRating != null &&
      speedRatingRank(spec.speedRating) < speedRatingRank(oem.speedRating)) return false
  return true
}

/** True when the tire offers a variant that fits some OEM tire (size + load + speed,
 *  meet-or-exceed; missing data passes). Single verdict for badge/PDP/reverse/filter. */
export function tireFitsVehicle(productSpecs: TireFitSpec[], vehicleOemTires: OemTire[]): boolean {
  if (!productSpecs?.length || !vehicleOemTires?.length) return false
  return productSpecs.some((s) => vehicleOemTires.some((o) => fits(s, o)))
}
export const tireProductHasFittingVariant = tireFitsVehicle
```

In `garage/types.ts`: add `export type OemTire = { size: string; loadIndex: number | null; speedRating: string | null }`; `Vehicle.oemTires?: OemTire[]`; `VehicleFitment.oemTires: OemTire[]`. Keep `oemTireSizes`.

- [ ] **Step 4: Run → PASS.** (This changes `tireFitsVehicle`'s signature — Tasks 8/9 update every caller. tsc will show caller errors until those land; that is expected — this task's gate is the unit test + no NEW error IN `tire-fits-vehicle.ts`/`garage/types.ts` themselves.)

- [ ] **Step 5: Commit** (`feat(fitment): multi-axis tireFitsVehicle + garage OemTire type (WB-068)`, trailer).

---

### Task 7: Storefront — garage persists `oemTires` + panes write it

**Files:**
- Modify: `storefront/src/lib/garage/medusa-garage.ts` (`toWire`/`fromWire`/`update`)
- Modify: `storefront/src/lib/data/fitment.ts` (unwrapFitment already casts through — verify `oemTires` flows; no change expected)
- Modify: `storefront/src/modules/search/components/search-drawer/find-by-vehicle/ymm-pane.tsx` + `garage-pane.tsx` (write `oemTires`; extend the garage-pane re-resolve guard)

Mirror WB-067's `oemTireSizes` serialization: `toWire` adds `oemTires: v.oemTires`; `fromWire` adds `oemTires: r.oem_tires ?? undefined`; `update`'s `api.updateVehicle` payload adds `oemTires: updated.oemTires`. The YMM `update(...)` and garage `update(...)` calls add `oemTires: fitment.oemTires`. Extend the garage-pane `needsResolve` guard to also re-resolve when `(v.oemTires?.length ?? 0) === 0`.

- [ ] Steps: edit; `cd storefront && npx tsc --noEmit 2>&1 | grep -iE "medusa-garage|ymm-pane|garage-pane" | grep "error TS" || echo none`; commit (`fix(garage): serialize oemTires end-to-end (WB-068)`, trailer).

---

### Task 8: Storefront — discovery `fit_specs` + `?fit/fitl/fits` + post-filter

**Files:**
- Modify: `storefront/src/modules/tire-discovery/data/types.ts` (`fitSpecs`, `vehicleOemTires`, fit param encode/decode)
- Modify: `storefront/src/modules/tire-discovery/data/get-tire-products.ts` (hit `fit_specs` → `fitSpecs`; post-filter + facet recompute)
- Modify: `storefront/src/modules/tire-discovery/data/cache-key.ts`
- Modify: `storefront/src/modules/tire-discovery/components/fitment-sync/index.tsx` (write `fit`+`fitl`+`fits`)
- Test: `storefront/src/modules/tire-discovery/__tests__/fit.test.ts`

This mirrors the wheel WB-060 fit-mode in `discovery/data/get-products.ts` (READ IT), with tires' lighter twist: the post-filter reads `fit_specs` FROM THE MEILI HIT (no Store-API round-trip). Steps:
1. `TireDiscoveryProduct.fitSpecs: TireFitSpec[]`; `hitToTireProduct` parses `h.fit_specs` (`"size|load|speed"` → `{ size, loadIndex: load?Number:null, speedRating: speed||null }`).
2. `TireDiscoveryQuery.vehicleOemTires?: OemTire[]`; `parseTireQueryFromSearchParams` reads `fit` (sizes) + `fitl` (loads) + `fits` (speeds) aligned by index → `vehicleOemTires`; encode helpers `oemTiresToFitParams(oemTires) → { fit, fitl, fits }` + the inverse.
3. `getTireDiscoveryProducts`: when `vehicleOemTires?.length`, the coarse Meili clause stays `tire_sizes IN [sizes]` (retrieve `fit_specs`); after fetching the size-matched candidate set (cap ~200, like wheels), drop any product where `!tireProductHasFittingVariant(product.fitSpecs, vehicleOemTires)`, then paginate + recompute the tire facet counts in memory over the fitting set (mirror wheels' `facetsFromProducts`). Degrade to the coarse result if a candidate has empty `fitSpecs` (pre-re-sync docs) — treat empty `fitSpecs` as "passes" so nothing vanishes before the re-sync.
4. `FitmentSync` writes `fit`+`fitl`+`fits` from `active.oemTires` (was `active.oemTireSizes`); guards unchanged.
5. `cache-key` includes the sorted `fitl`/`fits` too.

- [ ] Steps: TDD the encode/decode + `fitSpecs` parse + `tireProductHasFittingVariant` gate in `fit.test.ts`; implement; `cd storefront && npx vitest run src/modules/tire-discovery` → PASS; tsc no-new; commit (`feat(tire-discovery): multi-axis fit filter via fit_specs post-filter (WB-068)`, trailer).

---

### Task 9: Storefront — card badge + PDP consumers use the new verdict

**Files:**
- Modify: `storefront/src/modules/tire-discovery/components/grid/tire-fit-badge.tsx` (props `sizes` → `fitSpecs`; read `active.oemTires`)
- Modify: `storefront/src/modules/tire-discovery/components/grid/tire-product-card.tsx` (pass `product.fitSpecs`)
- Modify: `storefront/src/modules/product-detail/components/tire/hero/index.tsx` (fit-mode filter + productSpecs) + `purchase-panel.tsx` (fit chip)
- Modify: `storefront/src/modules/product-detail/components/tire/fitment.tsx` (verdict) + `data/tire/tire-size-options.ts` (ensure `TireSizeOption` carries `loadIndex`/`speedRating` — it already reads `load_index`/`speed_rating`; expose them if not)

Update every `tireFitsVehicle(...)` caller to the new `(productSpecs: TireFitSpec[], oemTires)` signature:
- **Badge**: `<TireFitBadge fitSpecs={product.fitSpecs} />` → `tireFitsVehicle(fitSpecs, active.oemTires)`.
- **PDP hero**: `productSpecs = sizeOptions.map(o => ({ size: o.canonicalSize, loadIndex: o.loadIndex ?? null, speedRating: o.speedRating ?? null }))`; the fit-mode "fitting" test per size = `tireFitsVehicle([spec], active.oemTires)`; the chip = `tireFitsVehicle(productSpecs, active.oemTires)`.
- **Reverse section** (`fitment.tsx`): the active-vehicle band verdict uses `tireFitsVehicle(productSpecs, active.oemTires)` (productSpecs from `product.sizeOptions`).

- [ ] Steps: edit; `cd storefront && npx tsc --noEmit 2>&1 | grep -c "error TS"` back to baseline 14; `npx vitest run` all green; `npx next build` compiles (collections/categories env-block is pre-existing). Commit (`feat(tire-fitment): multi-axis badge + PDP chip + fit-mode filter (WB-068)`, trailer).

---

### Task 10: Migration + Meili re-sync + docs + full gate

- [ ] **Run the `oem_tires` migration on prod:** `cd backend && npx medusa db:migrate 2>&1 | grep -iE "Migration20260704140000|Migrated|error"` → migrated.
- [ ] **Re-sync Meili / restart backend** so `fit_specs` populates existing tire docs (note: the storefront post-filter treats empty `fit_specs` as "passes", so nothing breaks pre-re-sync — but the multi-axis gate only bites after the re-sync).
- [ ] **Full gates:** backend `test:fitment` + `test:sync` PASS (record counts); storefront `npx vitest run` + `npx tsc --noEmit | grep -c error` == 14.
- [ ] **Live proof:** a logged-in vehicle whose OEM speed exceeds a low-rated tire drops that tire from `/tires ?fit`, its card loses the FITS badge, and its PDP reads "MAY NOT FIT".
- [ ] **Docs:** add WB-068 to `docs/future/BACKLOG.md` (done) + note it in `docs/STATUS.md` (Fitment pillar: tires now multi-axis size+load+speed) + "Last verified" 2026-07-04; move this spec+plan to `docs/done/`. Run `/doc-review`; commit (`docs: WB-068 multi-axis tire fitment landed`, trailer).

---

## Self-review notes (for the executor)

- **Spec coverage:** shared `speedRatingRank`+golden → T1; `extractOemTires`+`oemTires` → T2; Meili `fit_specs` → T3; reverse multi-axis → T4; garage `oem_tires` backend → T5; storefront verdict+types → T6; garage serialization+panes → T7; discovery post-filter+params → T8; badge+PDP consumers → T9; migration+re-sync+docs → T10.
- **Type consistency:** `OemTire`/`TireFitSpec` = `{ size, loadIndex, speedRating }` everywhere (backend types.ts, storefront garage/types.ts); `tireFitsVehicle(productSpecs, oemTires)`; `fit_specs` string form `"size|load|speed"`; `?fit`+`?fitl`+`?fits` aligned CSVs. `speedRatingRank` identical + golden-guarded.
- **Missing-data-passes** is asserted in T1, T2, T4, T6 tests — the one rule most likely to be got wrong.
- **Ordering:** T1 → T2/T3/T4/T5 (backend, independent) → T6 (verdict, needs T1 twin) → T7 (needs T5 + T2 response) → T8 (needs T3 fit_specs + T6) → T9 (needs T6 + T8 fitSpecs) → T10.
- **Reconcile the T1 golden ranks with the `indexOf` impl before writing the impl** (0-based vs 1-based) — the invariants (monotonic, H between U/V, Z≥W, unknown=-1) are what matter.
