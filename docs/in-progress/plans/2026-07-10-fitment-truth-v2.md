# Fitment Truth v2 — Implementation Plan (WB-077)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the store rendering "doesn't fit" for wheels that physically fit — by (a) building the vehicle fitment windows from ALL trims and from stock+aftermarket rims, and (b) replacing the binary fits/no-fit verdict with a three-tier `fits` / `check` / `no-fit` / `unknown` verdict that treats out-of-window (but bolt+bore-passing) wheels as "aggressive — verify clearance" instead of disproven.

**Architecture:** Backend-first. `normalizeByModel` merges every `data[]` trim (pattern union, window min/max over stock+aftermarket rims, bore null-on-disagreement); a cache-key version bump orphans the stale single-trim rows so they re-warm. A shared `FitTier` type + a shared bore-clearance tolerance (golden-guarded across both apps) thread through the pure decision functions (`fitsVehicle`, `variantFitTier`, `buildFitView`), then through the four render surfaces (PDP band/chip, discovery fit-mode + badge, reverse "confirmed models" list, checkout card). Strict wrappers keep unconverted callers behaving exactly as today until each surface is deliberately switched.

**Tech Stack:** Backend MedusaJS 2.13.6 (jest via `@swc/jest`, `test:fitment`). Storefront Next.js 15 / React 19 (vitest `test:unit`). Shared golden fixtures at repo-root `fixtures/`.

## Global Constraints

- **Decision D1 = include + badge.** Discovery fit-mode SHOWS `check`-tier wheels with an aggressive badge; it drops only `no`-tier. Do NOT hide `check` behind a toggle.
- **Bore rule is unknown-passes, in FOUR lockstep places** — `backend reverse-fitment.ts`, storefront `fits-vehicle.ts`, `fit-view.ts`, `product-has-fitting-variant.ts`. A new `BORE_TOLERANCE_MM = 0.2` constant + `fixtures/bore-clearance-golden.json` pin all four. Change the golden + every copy together.
- **Bore unit convention:** hub bore is float-mm in code, integer `hub_bore_mm_x100` in the DB/cache row. Divide by 100 on read, `Math.round(x*100)` on write. Never change this split.
- **Windows** are `{min,max}` (inches for diameter/width, mm for offset). A `null` window means "can't check" → passes. Preserve this.
- **Strict wrappers stay.** `variantFitsVehicle` and `productHasFittingVariant` must keep their current `boolean` "strict = fits-tier-only" semantics as thin wrappers over the new tier functions, so unconverted callers (reverse list, badge) don't shift meaning silently.
- **Cache-key back-compat:** the warm cron's `parseCacheKey` must still parse pre-existing rows. New rows carry a version slot; old rows must not crash the parser.
- **`FitTier` string union:** `"fits" | "check" | "no-fit" | "unknown"`. `unknown` = vehicle has no pattern data OR product has no pattern data (F5). `check` = bolt ∩ AND bore clears but no variant fully in-window. `no-fit` = only physical impossibilities (bolt mismatch, or bore genuinely below hub beyond tolerance).
- Storefront build ignores TS/lint errors — rely on `test:unit` + `npx tsc --noEmit`, not the build, to catch drift.

---

## File Structure

**Backend**
- `backend/src/modules/wheel-size/normalize.ts` — MODIFY `normalizeByModel` + `windowFrom` (multi-trim merge, stock rims).
- `backend/src/modules/wheel-size/cache-key.ts` — MODIFY `buildFitmentCacheKey` (append `"v2"` slot).
- `backend/src/jobs/wheel-size-warm.ts` — MODIFY `parseCacheKey` (tolerate the new slot + old rows).
- `backend/src/modules/wheel-size/bore-clearance.ts` — CREATE `BORE_TOLERANCE_MM` + `boreClears`.
- `backend/src/modules/wheel-size/reverse-fitment.ts` — MODIFY `matchedPattern` to use `boreClears`.
- `backend/src/modules/wheel-size/__tests__/*` — normalize, cache-key, reverse-fitment, bore-clearance golden.

**Storefront**
- `storefront/src/lib/fitment/fit-tier.ts` — CREATE the shared `FitTier` type.
- `storefront/src/lib/fitment/bore-clearance.ts` — CREATE `BORE_TOLERANCE_MM` + `boreClears`.
- `storefront/src/lib/fitment/fits-vehicle.ts` — MODIFY `fitsVehicle` → returns `FitTier` + `check`/`unknown`.
- `storefront/src/lib/fitment/product-has-fitting-variant.ts` — ADD `variantFitTier` + `productFitTier`; keep boolean wrappers.
- `storefront/src/modules/product-detail/data/fit-view.ts` — MODIFY: sizes/offsets carry `tier`; `hasFit` → `bestTier`; keep `check` visible.
- `storefront/src/modules/product-detail/components/fitment/index.tsx` — MODIFY band: 4 states.
- `storefront/src/modules/product-detail/components/hero/purchase-panel.tsx` — MODIFY chip: FITS / CHECK FIT / DOESN'T FIT / UNKNOWN.
- `storefront/src/modules/discovery/data/get-products.ts` — MODIFY fit-mode post-filter: keep `check`, sort `fits` first.
- `storefront/src/modules/discovery/components/grid/fit-badge.tsx` — MODIFY: FITS vs CHECK FIT.
- `storefront/src/modules/checkout/components/fitment-verified-card/index.tsx` — MODIFY copy + gate on a real tier.
- `storefront/src/lib/fitment/__tests__/*` — verdict + bore golden.

**Shared**
- `fixtures/bore-clearance-golden.json` — CREATE.

---

## Task 1: Backend — multi-trim, stock-inclusive windows (F1, F2)

**Files:**
- Modify: `backend/src/modules/wheel-size/normalize.ts`
- Test: `backend/src/modules/wheel-size/__tests__/normalize.test.ts` (add cases)

**Interfaces:**
- Consumes: `RawByModel`, `RawWheelEntry`, `VehicleFitment`, `Window` from `./types`; `canonicalBoltPatterns` from vendor-sync.
- Produces: `normalizeByModel(raw, source): VehicleFitment` — unchanged signature; new merge behavior.

- [ ] **Step 1: Write failing tests for the multi-trim merge.** Add to `normalize.test.ts`:

```ts
it("F1: unions bolt patterns and widens windows across ALL trims, not data[0]", () => {
  const raw = { data: [
    { technical: { stud_holes: 5, pcd: 114.3, centre_bore: "60.1" },
      wheels: [{ is_stock: false, front: { rim_diameter: 17, rim_width: 7, rim_offset: 40 }, rear: null }] },
    { technical: { stud_holes: 6, pcd: 139.7, centre_bore: "78.1" },
      wheels: [{ is_stock: false, front: { rim_diameter: 22, rim_width: 10, rim_offset: -12 }, rear: null }] },
  ] } as any
  const f = normalizeByModel(raw, { modificationSlug: "", region: "usdm" })
  expect(f.canonicalBoltPatterns.sort()).toEqual(["5x114.3", "6x139.7"])
  expect(f.diameterWindow).toEqual({ min: 17, max: 22 })
  expect(f.offsetWindow).toEqual({ min: -12, max: 40 })
})

it("F1: verdict is order-independent (reversing data[] yields the same merge)", () => {
  const a = { data: [ { technical: { stud_holes: 5, pcd: 114.3 }, wheels: [{ is_stock: false, front: { rim_diameter: 17, rim_width: 7, rim_offset: 40 }, rear: null }] },
                       { technical: { stud_holes: 5, pcd: 114.3 }, wheels: [{ is_stock: false, front: { rim_diameter: 20, rim_width: 9, rim_offset: 18 }, rear: null }] } ] } as any
  const b = { data: [...a.data].reverse() } as any
  expect(normalizeByModel(a, { modificationSlug: "", region: "usdm" }).diameterWindow)
    .toEqual(normalizeByModel(b, { modificationSlug: "", region: "usdm" }).diameterWindow)
})

it("F2: windows include is_stock:true (factory) rims", () => {
  const raw = { data: [ { technical: { stud_holes: 6, pcd: 139.7, centre_bore: "78.1" },
    wheels: [
      { is_stock: true,  front: { rim_diameter: 17, rim_width: 7.5, rim_offset: 44 }, rear: null },
      { is_stock: false, front: { rim_diameter: 20, rim_width: 9,   rim_offset: 18 }, rear: null },
    ] } ] } as any
  const f = normalizeByModel(raw, { modificationSlug: "", region: "usdm" })
  expect(f.diameterWindow).toEqual({ min: 17, max: 20 })
  expect(f.offsetWindow).toEqual({ min: 18, max: 44 })
})

it("F1: hub bore is null when trims disagree beyond 0.05mm", () => {
  const raw = { data: [ { technical: { stud_holes: 5, pcd: 114.3, centre_bore: "60.1" }, wheels: [] },
                        { technical: { stud_holes: 5, pcd: 114.3, centre_bore: "66.1" }, wheels: [] } ] } as any
  expect(normalizeByModel(raw, { modificationSlug: "", region: "usdm" }).hubBoreMm).toBeNull()
})

it("F1: hub bore is the agreed value when trims agree within 0.05mm", () => {
  const raw = { data: [ { technical: { stud_holes: 5, pcd: 114.3, centre_bore: "60.10" }, wheels: [] },
                        { technical: { stud_holes: 5, pcd: 114.3, centre_bore: "60.13" }, wheels: [] } ] } as any
  expect(normalizeByModel(raw, { modificationSlug: "", region: "usdm" }).hubBoreMm).toBeCloseTo(60.1, 2)
})
```

- [ ] **Step 2: Run to verify they fail.**
Run: `cd backend && npx jest src/modules/wheel-size/__tests__/normalize.test.ts`
Expected: FAIL (current code reads `data[0]` only, excludes stock rims).

- [ ] **Step 3: Rewrite `normalizeByModel` to merge all trims.** Replace the body from `const entry = raw?.data?.[0]` through the `return`:

```ts
export function normalizeByModel(
  raw: RawByModel | null | undefined,
  source: { modificationSlug: string; region: string }
): VehicleFitment {
  const entries = raw?.data ?? []
  if (!entries.length) {
    return { status: "not_found", canonicalBoltPatterns: [], hubBoreMm: null,
      diameterWindow: null, widthWindow: null, offsetWindow: null, oemTireSizes: [], oemTires: [], source }
  }

  // Bolt patterns: union across every trim (deduped).
  const canonical = Array.from(new Set(
    entries.flatMap((entry) => {
      const tech = entry.technical ?? {}
      const studs = num(tech.stud_holes)
      const pcd = num(tech.pcd)
      return studs != null && pcd != null ? canonicalBoltPatterns(`${studs}x${pcd}`) : []
    })
  ))

  // Hub bore: agree within 0.05mm across trims → that value; disagree → null (uncheckable, not wrong).
  const bores = entries
    .map((entry) => numLoose(entry.technical?.centre_bore) ?? numLoose(entry.centre_bore))
    .filter((v): v is number => v != null)
  let hubBoreMm: number | null = null
  if (bores.length) {
    const min = Math.min(...bores), max = Math.max(...bores)
    if (max - min <= 0.05) hubBoreMm = bores[0]
    else console.warn("[wheel-size] trims disagree on centre_bore; bore axis uncheckable", { ...source, bores })
  } else {
    console.warn("[wheel-size] centre_bore absent on by_model response", source)
  }

  // Windows: min/max over EVERY trim's rims, stock AND aftermarket (F2 — drop the is_stock filter).
  const rims = entries.flatMap((entry) =>
    (entry.wheels ?? []).flatMap((w: RawWheelEntry) => [w.front, w.rear]).filter(Boolean)
  ) as { rim_diameter: number | null; rim_width: number | null; rim_offset: number | null }[]

  return {
    status: "ok",
    canonicalBoltPatterns: canonical,
    hubBoreMm,
    diameterWindow: windowFrom(rims.map((r) => r.rim_diameter)),
    widthWindow: windowFrom(rims.map((r) => r.rim_width)),
    offsetWindow: windowFrom(rims.map((r) => r.rim_offset)),
    oemTireSizes: [],
    oemTires: [],
    source,
  }
}
```

Note: `windowFrom`, `num`, `numLoose` are unchanged. `oemTireSizes`/`oemTires` stay `[]` here (filled in `service.ts` — do not touch). When a trim IS selected the API already narrows `data` to that trim, so the same code path is correct (no branch needed).

- [ ] **Step 4: Run to verify pass + no regression.**
Run: `cd backend && npx jest src/modules/wheel-size/__tests__/normalize.test.ts`
Expected: PASS (new + pre-existing cases).

- [ ] **Step 5: Commit.**
```bash
git add backend/src/modules/wheel-size/normalize.ts backend/src/modules/wheel-size/__tests__/normalize.test.ts
git commit -m "feat(wb-077): normalizeByModel merges all trims + stock rims (F1,F2)"
```

---

## Task 2: Backend — cache-key v2 re-warm

**Files:**
- Modify: `backend/src/modules/wheel-size/cache-key.ts`
- Modify: `backend/src/jobs/wheel-size-warm.ts` (`parseCacheKey`)
- Test: `backend/src/modules/wheel-size/__tests__/cache-key.test.ts`, `backend/src/jobs/__tests__/wheel-size-warm.test.ts`

**Interfaces:**
- Produces: `buildFitmentCacheKey(p): string` — now 6 slots ending in `"v2"`. `parseCacheKey(key): {...} | null` — parses 6-slot v2 keys AND legacy 5-slot keys.

- [ ] **Step 1: Write failing tests.** In `cache-key.test.ts`:
```ts
it("appends a v2 version slot so v1 rows are orphaned", () => {
  expect(buildFitmentCacheKey({ make: "bmw", model: "3-series", year: "2020", modificationSlug: "330i", region: "usdm" }))
    .toBe("bmw|3-series|2020|330i|usdm|v2")
})
```
In `wheel-size-warm.test.ts`:
```ts
it("parses a v2 6-slot key", () => {
  expect(parseCacheKey("bmw|3-series|2020||usdm|v2"))
    .toEqual({ make: "bmw", model: "3-series", year: "2020", modificationSlug: undefined, region: "usdm" })
})
it("still parses a legacy 5-slot key (no version)", () => {
  expect(parseCacheKey("bmw|3-series|2020||usdm"))
    .toEqual({ make: "bmw", model: "3-series", year: "2020", modificationSlug: undefined, region: "usdm" })
})
```

- [ ] **Step 2: Run to verify fail.**
Run: `cd backend && npx jest src/modules/wheel-size/__tests__/cache-key.test.ts src/jobs/__tests__/wheel-size-warm.test.ts`
Expected: FAIL.

- [ ] **Step 3: Bump the key.** In `cache-key.ts`, change the return:
```ts
  return [p.make, p.model, p.year ?? "", p.modificationSlug ?? "", p.region, "v2"].join("|")
```

- [ ] **Step 4: Make `parseCacheKey` tolerate both.** In `wheel-size-warm.ts`, replace the body:
```ts
export function parseCacheKey(
  key: string
): { make: string; model: string; modificationSlug?: string; year?: string; region: string } | null {
  const parts = String(key).split("|")
  if (parts.length < 5) return null // pre-B1 4-slot keys
  const [make, model, year, modificationSlug, region] = parts // ignore parts[5] ("v2") if present
  return {
    make, model,
    year: year || undefined,
    modificationSlug: modificationSlug || undefined,
    region,
  }
}
```
The destructuring reads the first 5 slots; the trailing `v2` (index 5) is ignored, so both key shapes parse. `refreshFitment` rebuilds via `buildFitmentCacheKey`, so re-warmed rows carry the v2 key.

- [ ] **Step 5: Run to verify pass.**
Run: `cd backend && npx jest src/modules/wheel-size/__tests__/cache-key.test.ts src/jobs/__tests__/wheel-size-warm.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit.**
```bash
git add backend/src/modules/wheel-size/cache-key.ts backend/src/jobs/wheel-size-warm.ts backend/src/modules/wheel-size/__tests__/cache-key.test.ts backend/src/jobs/__tests__/wheel-size-warm.test.ts
git commit -m "feat(wb-077): cache-key v2 orphans stale single-trim rows for re-warm"
```

---

## Task 3: Shared bore-clearance tolerance + golden (F4) — backend side

**Files:**
- Create: `fixtures/bore-clearance-golden.json`
- Create: `backend/src/modules/wheel-size/bore-clearance.ts`
- Create: `backend/src/modules/wheel-size/__tests__/bore-clearance-golden.test.ts`
- Modify: `backend/src/modules/wheel-size/reverse-fitment.ts` (`matchedPattern`)

**Interfaces:**
- Produces: `BORE_TOLERANCE_MM = 0.2`; `boreClears(bore: number | null, hub: number | null): boolean`.

- [ ] **Step 1: Create the shared golden.** `fixtures/bore-clearance-golden.json`:
```json
[
  { "bore": 78.0, "hub": 78.1, "clears": true },
  { "bore": 78.1, "hub": 78.1, "clears": true },
  { "bore": 66.1, "hub": 78.1, "clears": false },
  { "bore": 77.9, "hub": 78.1, "clears": false },
  { "bore": null, "hub": 78.1, "clears": true },
  { "bore": 78.0, "hub": null, "clears": true },
  { "bore": null, "hub": null, "clears": true }
]
```
Rationale: `77.9` vs `78.1` = 0.2mm gap → `78.1 - 0.2 = 77.9`, `77.9 >= 77.9` is true, so pick a value clearly beyond tolerance (`77.9` is the boundary — keep it as `false`? No: `77.9 >= 77.9` is TRUE). Use `77.8` for the fail case instead:
```json
  { "bore": 77.8, "hub": 78.1, "clears": false },
```
Replace the `77.9` row above with `77.8`.

- [ ] **Step 2: Write the failing golden test.** `backend/src/modules/wheel-size/__tests__/bore-clearance-golden.test.ts`:
```ts
import { readFileSync } from "fs"
import { join } from "path"
import { boreClears } from "../bore-clearance"

const golden = JSON.parse(readFileSync(join(__dirname, "../../../../../fixtures/bore-clearance-golden.json"), "utf8"))

describe("bore-clearance golden", () => {
  for (const { bore, hub, clears } of golden) {
    it(`bore=${bore} hub=${hub} → ${clears}`, () => {
      expect(boreClears(bore, hub)).toBe(clears)
    })
  }
})
```
(Path depth: `wheel-size/__tests__` is 5 `../` from repo root, same as the finish/bolt goldens — runs under `test:fitment`.)

- [ ] **Step 3: Run to verify fail.**
Run: `cd backend && npx jest src/modules/wheel-size/__tests__/bore-clearance-golden.test.ts`
Expected: FAIL ("Cannot find module '../bore-clearance'").

- [ ] **Step 4: Create `bore-clearance.ts`.**
```ts
// Shared bore-clearance tolerance (WB-077 F4). 0.1mm gaps between the vendor feed
// and wheel-size.com are inside both sources' rounding error — treat as clearing.
// Unknown (either side null) passes: the axis is uncheckable, not disproven.
// Twin: storefront/src/lib/fitment/bore-clearance.ts — golden-guarded lockstep.
export const BORE_TOLERANCE_MM = 0.2

export function boreClears(bore: number | null, hub: number | null): boolean {
  return bore == null || hub == null || bore >= hub - BORE_TOLERANCE_MM
}
```

- [ ] **Step 5: Use it in `matchedPattern`.** In `reverse-fitment.ts`, import and replace the bore compare:
```ts
import { boreClears } from "./bore-clearance"
// ...inside matchedPattern, replace line ~78:
  const boreOk = boreClears(wheelBoreMm, hub)
  return boreOk ? hit : null
```

- [ ] **Step 6: Run to verify pass + reverse-fitment tests still green.**
Run: `cd backend && npx jest src/modules/wheel-size/__tests__/bore-clearance-golden.test.ts src/modules/wheel-size/__tests__/reverse-fitment.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit.**
```bash
git add fixtures/bore-clearance-golden.json backend/src/modules/wheel-size/bore-clearance.ts backend/src/modules/wheel-size/__tests__/bore-clearance-golden.test.ts backend/src/modules/wheel-size/reverse-fitment.ts
git commit -m "feat(wb-077): shared bore tolerance 0.2mm + golden; reverse list adopts it (F4)"
```

---

## Task 4: Storefront — `FitTier` type + bore-clearance twin + golden

**Files:**
- Create: `storefront/src/lib/fitment/fit-tier.ts`
- Create: `storefront/src/lib/fitment/bore-clearance.ts`
- Create: `storefront/src/lib/fitment/__tests__/bore-clearance-golden.test.ts`

**Interfaces:**
- Produces: `type FitTier = "fits" | "check" | "no-fit" | "unknown"`; `BORE_TOLERANCE_MM`; `boreClears(bore, hub)`.

- [ ] **Step 1: Create the shared tier type.** `fit-tier.ts`:
```ts
// WB-077: the three-tier fitment verdict, threaded through every fit surface.
// fits  — bolt ∩ AND bore clears AND ≥1 variant fully in-window
// check — bolt ∩ AND bore clears, but no variant is fully in-window (aggressive; verify clearance)
// no-fit — physical impossibility: bolt mismatch, or bore genuinely below hub beyond tolerance
// unknown — vehicle has no pattern data OR product has no pattern data
export type FitTier = "fits" | "check" | "no-fit" | "unknown"
```

- [ ] **Step 2: Create the bore-clearance twin.** `storefront/src/lib/fitment/bore-clearance.ts` (byte-identical logic to backend):
```ts
// Twin of backend/src/modules/wheel-size/bore-clearance.ts (WB-077 F4).
// Golden-guarded lockstep via fixtures/bore-clearance-golden.json.
export const BORE_TOLERANCE_MM = 0.2

export function boreClears(bore: number | null, hub: number | null): boolean {
  return bore == null || hub == null || bore >= hub - BORE_TOLERANCE_MM
}
```

- [ ] **Step 3: Write the failing golden test.** `storefront/src/lib/fitment/__tests__/bore-clearance-golden.test.ts`:
```ts
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { boreClears } from "../bore-clearance"

const golden = JSON.parse(readFileSync(join(__dirname, "../../../../../fixtures/bore-clearance-golden.json"), "utf8"))

describe("bore-clearance golden (storefront twin)", () => {
  for (const { bore, hub, clears } of golden) {
    it(`bore=${bore} hub=${hub} → ${clears}`, () => {
      expect(boreClears(bore, hub)).toBe(clears)
    })
  }
})
```

- [ ] **Step 4: Run to verify pass** (this file passes immediately since both copies + golden ship together — that's fine; the test's job is drift-guarding).
Run: `cd storefront && npx vitest run src/lib/fitment/__tests__/bore-clearance-golden.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add storefront/src/lib/fitment/fit-tier.ts storefront/src/lib/fitment/bore-clearance.ts storefront/src/lib/fitment/__tests__/bore-clearance-golden.test.ts
git commit -m "feat(wb-077): storefront FitTier type + bore-clearance twin + golden"
```

---

## Task 5: Storefront — `fitsVehicle` returns the three-tier verdict (F3, F5)

**Files:**
- Modify: `storefront/src/lib/fitment/fits-vehicle.ts`
- Test: `storefront/src/lib/fitment/__tests__/fits-vehicle.test.ts` (extend; do not rewrite)

**Interfaces:**
- Consumes: `FitTier` (Task 4), `boreClears` (Task 4).
- Produces: `FitVerdict = { status: FitTier; fits: boolean; hardGatesPass: boolean; withinWindow: boolean; reasons: string[] }` — `status` widened to `FitTier`; `fits === (status === "fits")`.

- [ ] **Step 1: Write failing tests.** Add to `fits-vehicle.test.ts`:
```ts
it("F3: hard gates pass but out-of-window → check (not no-fit)", () => {
  const v = fitsVehicle(
    { boltPatternsCanonical: ["6x139.7"], specs: { centerBoreMm: 78.1 },
      sizeOptions: [{ diameter: 20, width: 10, offsetMm: -19 }] },
    { canonicalBoltPatterns: ["6x139.7"], hubBoreMm: 78.1,
      diameterWindow: { min: 17, max: 20 }, widthWindow: { min: 8, max: 9 }, offsetWindow: { min: 0, max: 31 } })
  expect(v.status).toBe("check")
  expect(v.hardGatesPass).toBe(true)
  expect(v.withinWindow).toBe(false)
})

it("F5: empty product bolt patterns → unknown (not a false mismatch)", () => {
  const v = fitsVehicle(
    { boltPatternsCanonical: [], specs: {}, sizeOptions: [{ diameter: 20, width: 9, offsetMm: 18 }] },
    { canonicalBoltPatterns: ["6x139.7"], hubBoreMm: null, diameterWindow: null, widthWindow: null, offsetWindow: null })
  expect(v.status).toBe("unknown")
  expect(v.reasons).not.toContain("Bolt pattern does not match your vehicle.")
})

it("in-window control still reads fits", () => {
  const v = fitsVehicle(
    { boltPatternsCanonical: ["6x139.7"], specs: { centerBoreMm: 78.1 },
      sizeOptions: [{ diameter: 18, width: 9, offsetMm: 18 }] },
    { canonicalBoltPatterns: ["6x139.7"], hubBoreMm: 78.1,
      diameterWindow: { min: 17, max: 20 }, widthWindow: { min: 8, max: 9 }, offsetWindow: { min: 0, max: 31 } })
  expect(v.status).toBe("fits")
})
```

- [ ] **Step 2: Run to verify fail.**
Run: `cd storefront && npx vitest run src/lib/fitment/__tests__/fits-vehicle.test.ts`
Expected: FAIL (current status logic never yields `"check"`; empty product patterns yield `"no-fit"`).

- [ ] **Step 3: Update `fits-vehicle.ts`.** Import the tier + bore helper; widen the type; add the empty-product-pattern `unknown` gate; use `boreClears`; change the final status:
```ts
import { FitTier } from "./fit-tier"
import { boreClears } from "./bore-clearance"

export type FitVerdict = {
  status: FitTier
  fits: boolean
  hardGatesPass: boolean
  withinWindow: boolean
  reasons: string[]
}
```
Inside `fitsVehicle`, after reading `pPats`/`vPats`, add the symmetric F5 gate BELOW the existing empty-vehicle-patterns `unknown` block:
```ts
  // F5: product has no parseable bolt pattern → unknown, not a false mismatch.
  if (pPats.length === 0) {
    return { status: "unknown", fits: false, hardGatesPass: false, withinWindow: false,
      reasons: ["We don't have fitment data for this wheel yet."] }
  }
```
Replace the bore compare (`const boreOk = ...`) with:
```ts
  const boreOk = boltOk && boreClears(wheelBore, hub)
```
Replace the final status line with the three-tier decision:
```ts
  const status: FitTier = !hardGatesPass ? "no-fit" : withinWindow ? "fits" : "check"
  const fits = status === "fits"
```
Update the window-miss reason copy (the `check` explanation):
```ts
  if (hardGatesPass && !withinWindow)
    reasons.push("Aggressive fitment — outside the typical range for your vehicle. Verify clearance before ordering.")
```

- [ ] **Step 4: Run to verify pass + S1/S5/bore regressions green.**
Run: `cd storefront && npx vitest run src/lib/fitment/__tests__/fits-vehicle.test.ts`
Expected: PASS (new + all pre-existing).

- [ ] **Step 5: Commit.**
```bash
git add storefront/src/lib/fitment/fits-vehicle.ts storefront/src/lib/fitment/__tests__/fits-vehicle.test.ts
git commit -m "feat(wb-077): fitsVehicle returns three-tier FitTier (check/unknown) (F3,F5)"
```

---

## Task 6: Storefront — `variantFitTier` / `productFitTier` + strict wrappers

**Files:**
- Modify: `storefront/src/lib/fitment/product-has-fitting-variant.ts`
- Test: `storefront/src/lib/fitment/__tests__/product-has-fitting-variant.test.ts` (extend)

**Interfaces:**
- Consumes: `FitTier`, `boreClears`, `canonicalBoltPatterns`.
- Produces:
  - `variantFitTier(v: VariantFitInput, vehicle: FitVehicle): "fits" | "check" | "no"` — per-variant tier (no `unknown` here; that's a surface concern).
  - `productFitTier(variants, vehicle): "fits" | "check" | "no"` — best tier across variants.
  - `variantFitsVehicle(v, vehicle): boolean` = `variantFitTier(...) === "fits"` (STRICT wrapper — unchanged semantics for existing callers).
  - `productHasFittingVariant(variants, vehicle): boolean` = `productFitTier(...) === "fits"` (STRICT wrapper).

- [ ] **Step 1: Write failing tests.**
```ts
it("variantFitTier: bolt+bore pass, out of window → check", () => {
  expect(variantFitTier(
    { boltPatternRaw: "6x139.7", centerBoreMm: 78.1, diameterIn: 20, widthIn: 10, offsetMm: -19 },
    { canonicalBoltPatterns: ["6x139.7"], hubBoreMm: 78.1, diameterWindow: { min: 17, max: 20 }, widthWindow: { min: 8, max: 9 }, offsetWindow: { min: 0, max: 31 } }
  )).toBe("check")
})
it("variantFitTier: bolt mismatch → no", () => {
  expect(variantFitTier(
    { boltPatternRaw: "5x114.3", centerBoreMm: 66, diameterIn: 18, widthIn: 8, offsetMm: 35 },
    { canonicalBoltPatterns: ["6x139.7"], hubBoreMm: null, diameterWindow: null, widthWindow: null, offsetWindow: null }
  )).toBe("no")
})
it("variantFitsVehicle strict wrapper is fits-only", () => {
  const check = { boltPatternRaw: "6x139.7", centerBoreMm: 78.1, diameterIn: 20, widthIn: 10, offsetMm: -19 }
  const vehicle = { canonicalBoltPatterns: ["6x139.7"], hubBoreMm: 78.1, diameterWindow: { min: 17, max: 20 }, widthWindow: { min: 8, max: 9 }, offsetWindow: { min: 0, max: 31 } }
  expect(variantFitsVehicle(check, vehicle)).toBe(false) // check-tier is NOT strict-fits
})
```

- [ ] **Step 2: Run to verify fail.**
Run: `cd storefront && npx vitest run src/lib/fitment/__tests__/product-has-fitting-variant.test.ts`
Expected: FAIL (`variantFitTier` undefined).

- [ ] **Step 3: Add the tier functions; convert the booleans to wrappers.** Replace `variantFitsVehicle`:
```ts
import { boreClears } from "./bore-clearance"

export function variantFitTier(v: VariantFitInput, vehicle: FitVehicle): "fits" | "check" | "no" {
  const vPats = vehicle.canonicalBoltPatterns ?? []
  if (!vPats.length) return "no" // surfaces map empty-vehicle to unknown; strict callers want "no"
  const boltOk = canonicalBoltPatterns(String(v.boltPatternRaw ?? "")).some((p) => vPats.includes(p))
  if (!boltOk) return "no"
  const hub = vehicle.hubBoreMm ?? null
  const bore = num(v.centerBoreMm)
  if (!boreClears(bore, hub)) return "no"
  const inWindow =
    inWin(num(v.diameterIn), vehicle.diameterWindow) &&
    inWin(num(v.widthIn), vehicle.widthWindow) &&
    inWin(num(v.offsetMm), vehicle.offsetWindow)
  return inWindow ? "fits" : "check"
}

export function variantFitsVehicle(v: VariantFitInput, vehicle: FitVehicle): boolean {
  return variantFitTier(v, vehicle) === "fits"
}
```
Replace `productHasFittingVariant` with a best-tier function + strict wrapper:
```ts
const TIER_RANK = { fits: 2, check: 1, no: 0 } as const

export function productFitTier(
  variants: { metadata?: Record<string, unknown> | null }[] | undefined,
  vehicle: FitVehicle
): "fits" | "check" | "no" {
  if (!variants?.length) return "no"
  let best: "fits" | "check" | "no" = "no"
  for (const variant of variants) {
    const m = variant.metadata ?? {}
    const t = variantFitTier(
      { boltPatternRaw: m.bolt_pattern_raw, centerBoreMm: m.center_bore_mm,
        diameterIn: m.wheel_diameter_in, widthIn: m.wheel_width_in, offsetMm: m.offset_mm },
      vehicle)
    if (TIER_RANK[t] > TIER_RANK[best]) best = t
    if (best === "fits") break
  }
  return best
}

export function productHasFittingVariant(
  variants: { metadata?: Record<string, unknown> | null }[] | undefined,
  vehicle: FitVehicle
): boolean {
  return productFitTier(variants, vehicle) === "fits"
}
```

- [ ] **Step 4: Run to verify pass + regressions.**
Run: `cd storefront && npx vitest run src/lib/fitment/__tests__/product-has-fitting-variant.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add storefront/src/lib/fitment/product-has-fitting-variant.ts storefront/src/lib/fitment/__tests__/product-has-fitting-variant.test.ts
git commit -m "feat(wb-077): variantFitTier/productFitTier + strict boolean wrappers"
```

---

## Task 7: Storefront — `buildFitView` carries tiers, keeps `check` visible

**Files:**
- Modify: `storefront/src/modules/product-detail/data/fit-view.ts`
- Test: `storefront/src/modules/product-detail/data/__tests__/fit-view.test.ts` (extend or create)

**Interfaces:**
- Consumes: `boreClears` (Task 4).
- Produces: `FitView = { bestTier: "fits" | "check" | "no"; hasFit: boolean; boltPatterns: string[]; finishOptions: FinishOption[] }` where each surviving `SizeOption` carries `tier: "fits" | "check"` and its `offsetVariants` carry a per-offset `tier`. `hasFit === (bestTier !== "no")` (fits OR check are both "has a fit-mode-visible option"). Keep a strict view for callers that need fits-only.

- [ ] **Step 1: Write failing test** asserting `check` sizes survive with `tier: "check"`, and `bestTier` reflects the best:
```ts
import { describe, it, expect } from "vitest"
import { buildFitView } from "../fit-view"

const product = { boltPatternOptions: ["6x139.7"], finishOptions: [{ raw: "black", sizeOptions: [
  { boltPattern: "6x139.7", diameter: 20, width: 10, offsetMm: -19, offsetVariants: [{ value: -19, centerBoreMm: 78.1 }] },
] }] } as any

it("keeps out-of-window sizes as check-tier and sets bestTier", () => {
  const vehicle = { canonicalBoltPatterns: ["6x139.7"], hubBoreMm: 78.1, diameterWindow: { min: 17, max: 20 }, widthWindow: { min: 8, max: 9 }, offsetWindow: { min: 0, max: 31 } } as any
  const view = buildFitView(product, vehicle)
  expect(view.bestTier).toBe("check")
  expect(view.hasFit).toBe(true)
  expect(view.finishOptions[0].sizeOptions[0].tier).toBe("check")
})
```

- [ ] **Step 2: Run to verify fail.**
Run: `cd storefront && npx vitest run src/modules/product-detail/data/__tests__/fit-view.test.ts`
Expected: FAIL.

- [ ] **Step 3: Rework `fit-view.ts`.** Replace `boreClearsHub` with the shared import and rework `sizeFits` → `sizeTier` and `trim` to keep `check`:
```ts
import { boreClears } from "@lib/fitment/bore-clearance"

const offsetTier = (o: OffsetVariant, vehicle: FitVehicle): "fits" | "check" | "no" => {
  if (!boreClears(o.centerBoreMm, vehicle.hubBoreMm ?? null)) return "no"
  return inWin(o.value, vehicle.offsetWindow) ? "fits" : "check"
}

function sizeTier(size: SizeOption, vehicle: FitVehicle): "fits" | "check" | "no" {
  const vPats = vehicle.canonicalBoltPatterns ?? []
  const boltOk = vPats.length > 0 && canonicalBoltPatterns(size.boltPattern).some((p) => vPats.includes(p))
  if (!boltOk) return "no"
  const dw = inWin(size.diameter, vehicle.diameterWindow)
  const ww = inWin(size.width, vehicle.widthWindow)
  const offsets = size.offsetVariants ?? []
  if (offsets.length === 0) {
    if (!boreClears(null, vehicle.hubBoreMm ?? null)) return "no"
    return dw && ww && inWin(size.offsetMm, vehicle.offsetWindow) ? "fits" : "check"
  }
  const tiers = offsets.map((o) => offsetTier(o, vehicle))
  if (tiers.every((t) => t === "no")) return "no"      // no offset even clears bore → not shown
  const anyFits = dw && ww && tiers.includes("fits")
  return anyFits ? "fits" : "check"
}
```
Update `trim` to attach `tier` to each surviving size and to keep `check` offsets visible (only drop `no` offsets):
```ts
function trim(finishOptions: FinishOption[], vehicle: FitVehicle): FinishOption[] {
  return finishOptions
    .map((f) => ({
      ...f,
      sizeOptions: f.sizeOptions
        .map((s) => ({ s, tier: sizeTier(s, vehicle) }))
        .filter(({ tier }) => tier !== "no")
        .map(({ s, tier }) => ({
          ...s, tier,
          offsetVariants: (s.offsetVariants ?? []).filter((o) => offsetTier(o, vehicle) !== "no"),
        })),
    }))
    .filter((f) => f.sizeOptions.length > 0)
}
```
Rework `buildFitView` to compute `bestTier` + keep `hasFit`:
```ts
export function buildFitView(product: ProductDetail, vehicle: FitVehicle): FitView {
  const noFit: FitView = { bestTier: "no", hasFit: false, boltPatterns: product.boltPatternOptions, finishOptions: product.finishOptions }
  if (!(vehicle.canonicalBoltPatterns && vehicle.canonicalBoltPatterns.length)) return noFit
  const finishOptions = trim(product.finishOptions, vehicle)
  if (finishOptions.length === 0) return noFit
  const anyFits = finishOptions.some((f) => f.sizeOptions.some((s: any) => s.tier === "fits"))
  const bestTier = anyFits ? "fits" : "check"
  const boltPatterns = Array.from(new Set(finishOptions.flatMap((f) => f.sizeOptions.map((s) => s.boltPattern))))
    .filter((p) => product.boltPatternOptions.includes(p))
  return { bestTier, hasFit: true, boltPatterns: boltPatterns.length ? boltPatterns : product.boltPatternOptions, finishOptions }
}
```
Update the `FitView` and `SizeOption` types accordingly (add `bestTier`; `tier?` on `SizeOption` used by the view). Keep the existing `FinishOption` shape otherwise intact.

- [ ] **Step 4: Run to verify pass + WB-072 S3/S4 regressions.**
Run: `cd storefront && npx vitest run src/modules/product-detail/data/__tests__/fit-view.test.ts`
Expected: PASS. Note: WB-072 S3 previously trimmed out-of-window sizes entirely; those regression tests must be updated to expect `check` survival (they now assert `tier`, not absence). Update them in the same commit.

- [ ] **Step 5: Commit.**
```bash
git add storefront/src/modules/product-detail/data/fit-view.ts storefront/src/modules/product-detail/data/__tests__/fit-view.test.ts
git commit -m "feat(wb-077): buildFitView carries per-size tiers, keeps check visible; bestTier"
```

---

## Task 8: Storefront — PDP surfaces (band + purchase chip)

**Files:**
- Modify: `storefront/src/modules/product-detail/components/fitment/index.tsx`
- Modify: `storefront/src/modules/product-detail/components/hero/purchase-panel.tsx`

**Interfaces:**
- Consumes: `fitsVehicle` (`FitVerdict.status: FitTier`), `buildFitView` (`bestTier`), `variantFitTier`.

- [ ] **Step 1: Band — four visual states.** In `fitment/index.tsx`, replace the `activeFits`/`activeNoFit` derivation (lines ~48-49) with a tier read off `buildFitView().bestTier`, reconciled with `verdict.status`:
```ts
const fitView = active && verdict && verdict.status !== "unknown" ? buildFitView(product, active) : null
const tier: FitTier = activeUnknown ? "unknown" : fitView ? (fitView.bestTier === "no" ? "no-fit" : fitView.bestTier) : "no-fit"
```
Then render four branches in the band:
- `tier === "fits"` → orange "Fits your {year} {make} {model}".
- `tier === "check"` → amber "CHECK FIT — aggressive fitment for your {year} {make} {model}. Verify clearance before ordering." (reuse `verdict.reasons[0]` for the *what* is outside).
- `tier === "no-fit"` → "Doesn't fit" + `verdict?.reasons[0]` (only bolt/bore reasons remain in this tier now).
- `tier === "unknown"` → informational "We don't have fitment data … yet. This isn't a mismatch."

Add an amber token class alongside the existing orange for the `check` state (match `DESIGN.md` accent conventions; reuse the existing amber used elsewhere if present, else a `--wb-amber` utility).

- [ ] **Step 2: Purchase chip — reflect the selected variant's tier.** In `purchase-panel.tsx`, replace the boolean `fits` with `variantFitTier`:
```ts
const tier = active
  ? variantFitTier(
      { boltPatternRaw: selectedSize.boltPattern, centerBoreMm: selectedVariant?.centerBoreMm,
        diameterIn: selectedSize.diameter, widthIn: selectedSize.width,
        offsetMm: selectedVariant?.value ?? selectedSize.offsetMm },
      active)
  : null
```
Chip render:
- `tier === "fits"` → accent "FITS YOUR {year} {make} {model}".
- `tier === "check"` → amber "CHECK FIT · verify clearance".
- `tier === "no"` → outline "DOESN'T FIT · {make} {model}".
- no active vehicle → outline "Pick a vehicle to confirm fit" (unchanged).
(Note: an empty-pattern vehicle makes `variantFitTier` return `"no"`; if a distinct "unknown" chip is desired, gate on `active.canonicalBoltPatterns.length === 0` first — optional, keep scope tight.)

- [ ] **Step 3: Verify via the app** (no unit harness for these client components).
Run: `cd storefront && npx tsc --noEmit` (expect no NEW errors beyond the 5-baseline), then drive the PDP (Task 10 verify).

- [ ] **Step 4: Commit.**
```bash
git add storefront/src/modules/product-detail/components/fitment/index.tsx storefront/src/modules/product-detail/components/hero/purchase-panel.tsx
git commit -m "feat(wb-077): PDP band + purchase chip render four fit tiers"
```

---

## Task 9: Storefront — discovery fit-mode keeps `check`, badges it

**Files:**
- Modify: `storefront/src/modules/discovery/data/get-products.ts`
- Modify: `storefront/src/modules/discovery/components/grid/fit-badge.tsx`

**Interfaces:**
- Consumes: `productFitTier` (Task 6).

- [ ] **Step 1: Keep `fits` + `check`, sort fits first, drop only `no`.** In `get-products.ts`, replace the fit filter (lines ~274-277):
```ts
const candidates = hits.map((hit) => ({ hit, product: hitToProduct(hit) }))
  .map((c) => ({ ...c, tier: productFitTier(variantsById[c.product.id], vf) }))
  .filter((c) => c.tier !== "no")          // D1: keep fits AND check
  .sort((a, b) => (a.tier === b.tier ? 0 : a.tier === "fits" ? -1 : 1)) // fits first
const fitting = candidates
```
Thread each product's `tier` onto the `DiscoveryProduct` (add a `fitTier?: "fits" | "check"` field) so the card badge can pick copy. `totalCount`/`isCapped` semantics unchanged (count `fitting.length` as before).

- [ ] **Step 2: Badge — FITS vs CHECK FIT.** In `fit-badge.tsx`, accept the tier and branch copy:
```ts
export default function FitBadge({ patterns, fit, tier }: { patterns: string[]; fit?: boolean; tier?: "fits" | "check" }) {
  const { active } = useGarage()
  if (!fit || !active || !productFitsVehicle(patterns, active.canonicalBoltPatterns)) return null
  return (
    <div className="absolute top-2.5 right-2.5">
      {tier === "check"
        ? <Chip variant="outline" size="sm" dot>CHECK FIT</Chip>
        : <Chip variant="accent" size="sm" dot>FITS</Chip>}
    </div>
  )
}
```
Pass `tier` from the card (`DiscoveryProductCard`) using the new `fitTier` field.

- [ ] **Step 3: Verify** — `cd storefront && npx tsc --noEmit`; drive fit-mode discovery (Task 10).

- [ ] **Step 4: Commit.**
```bash
git add storefront/src/modules/discovery/data/get-products.ts storefront/src/modules/discovery/components/grid/fit-badge.tsx storefront/src/modules/discovery/components/grid/*card*
git commit -m "feat(wb-077): discovery fit-mode keeps check-tier + CHECK FIT badge (D1)"
```

---

## Task 10: Checkout `FitmentVerifiedCard` honesty (B12) + full verify

**Files:**
- Modify: `storefront/src/modules/checkout/components/fitment-verified-card/index.tsx`
- Modify: its caller(s) (`checkout-summary/index.tsx`) to pass cart items.

**Interfaces:**
- Consumes: `useGarage().active`, cart line items with variant metadata, `productFitTier`.

- [ ] **Step 1: Gate the card on a real tier + reword.** The card currently claims "Confirmed by our team" for ANY active vehicle with no fit check. Thread the cart items in and render only when at least one cart item is `fits`/`check` for the active vehicle:
```ts
// caller passes: items = cart.items with variant.metadata
const anyFitOrCheck = active
  ? items.some((i) => productFitTier([{ metadata: i.variant?.metadata }], active) !== "no")
  : false
if (!active || !anyFitOrCheck) return null
```
Replace the copy line with what the data supports:
```
FITMENT CHECKED · Checked against wheel-size.com specs for your {year} {make} {model}.
```
Drop "Confirmed by our team."

- [ ] **Step 2: Verify** — `cd storefront && npx tsc --noEmit`.

- [ ] **Step 3: Add the 9 regression scenarios** as a consolidated test (mirror audit §1.3) across `fits-vehicle.test.ts` / `product-has-fitting-variant.test.ts` / backend `normalize.test.ts` — confirm each asserts FIXED behavior (multi-trim union; OE-replica → fits; 20x10 ET-19 → check; bore 78.0-vs-78.1 → clears; empty product patterns → unknown; order-independence; in-window control → fits). Most are already added in Tasks 1/5/6 — this step audits coverage and fills any gap.

- [ ] **Step 4: Full suite.**
Run: `cd backend && npx jest src/modules/wheel-size src/jobs/__tests__/wheel-size-warm.test.ts` → PASS.
Run: `cd storefront && npx vitest run` → PASS. `npx tsc --noEmit` → no new errors beyond baseline.

- [ ] **Step 5: Live verify** (the acceptance test): on a Silverado-class vehicle with "Any trim":
  - a 20x10 ET-19 wheel PDP shows **CHECK FIT** and appears in fit-mode discovery with the CHECK FIT badge;
  - an OE-size wheel shows **FITS**;
  - a 5x114.3-only wheel still shows **DOESN'T FIT**;
  - checkout card reads "Checked against wheel-size.com specs", not "Confirmed by our team".

- [ ] **Step 6: Commit.**
```bash
git add storefront/src/modules/checkout/components/fitment-verified-card/index.tsx storefront/src/modules/checkout/components/checkout-summary/index.tsx
git commit -m "feat(wb-077): checkout fitment card gated on real tier + honest copy (B12)"
```

---

## Deploy (ops — after merge)

1. **Backend first** (normalize + cache-key v2 + reverse tolerance). Redeploy the backend service.
2. Optional: truncate `wheel_size_fitment` for cleanliness (cached v1 rows are already orphaned by the v2 key and re-warm on next lookup; the daily warm cron also refreshes). No migration.
3. **Storefront rebuild** (verdict + surfaces). No Meili change — windows travel via `fitb/fitd/fitw/fito` URL params, unchanged.
4. Quota note: one wheel-size API call per active vehicle on next lookup (bounded; daily ceiling 5000 dwarfs it).

## Self-review checklist (author, before handoff)

- F1 multi-trim union — Task 1 ✅  · F2 stock rims — Task 1 ✅ · F3 check tier — Tasks 5/7/8/9 ✅ · F4 bore tolerance — Tasks 3/4 ✅ · F5 empty-product unknown — Task 5 ✅
- Bore rule lockstep across 4 files — reverse-fitment (T3), fits-vehicle (T5), product-has-fitting-variant (T6), fit-view (T7) all import/mirror `boreClears`; golden guards both apps.
- Strict wrappers retained — `variantFitsVehicle`, `productHasFittingVariant` (T6). Reverse list + badge unchanged in meaning.
- D1 include+badge — T9.
