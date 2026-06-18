# WB-009 · PDP reverse fitment ("N confirmed models") — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate the PDP "N CONFIRMED MODELS" list by reverse-matching the product's bolt patterns + center bore against the cached `wheel_size_fitment` rows, reading vehicle identity from the stored `raw` body.

**Architecture:** A pure backend module (`reverse-fitment.ts`) holds the match + identity-extraction logic; a `WheelSizeService.reverseFitment` method loads cached `status="ok"` rows and delegates to it; a new `GET /store/fitment/by-product` route exposes it (pure cache read, no wheel-size API calls). The storefront data layer fetches it and the server-side PDP loader merges it into `ProductDetail.fitment`, replacing the hardcoded `[]`. No schema/migration.

**Tech Stack:** MedusaJS 2.x (`MedusaService`), TypeScript, Jest (hand-mocked, no DB), Next.js 15 storefront, Vitest, Medusa Store API.

**Spec:** [docs/in-progress/specs/2026-06-18-pdp-reverse-fitment-design.md](../specs/2026-06-18-pdp-reverse-fitment-design.md)

## Global Constraints

- Backend commands run from `backend/`; storefront commands from `storefront/`.
- `pnpm` may not be on PATH (Windows) — run jest/vitest directly with `npx`.
- Backend Jest hand-mocks the service over in-memory arrays (no DB). The repo has no route-level unit harness — routes are verified by the live check.
- Storefront tests are Vitest pure units only (no RTL/jsdom). `next.config.js` ignores type/lint at build — check `npx tsc --noEmit` separately; pre-existing errors in `lib/data/*` and some `modules/*` are not ours.
- Match gate = bolt-pattern intersection AND wheel bore ≥ vehicle hub bore; unknown bore values pass (mirror `fits-vehicle.ts`).
- The reverse route makes NO wheel-size API calls (no quota impact) and never 503s — it returns `{ vehicles: [] }` on missing module / empty input.
- Commit trailer required on every commit: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Pure reverse-fitment module + type

**Files:**
- Modify: `backend/src/modules/wheel-size/types.ts` (add `ReverseFitmentVehicle`)
- Create: `backend/src/modules/wheel-size/reverse-fitment.ts`
- Create: `backend/src/modules/wheel-size/__tests__/reverse-fitment.test.ts`

**Interfaces:**
- Produces (consumed by Task 2):
  - `ReverseFitmentVehicle = { year: string; make: string; model: string; trim?: string; boltPattern: string }`
  - `extractVehicleIdentity(raw): { make: string; model: string; trim?: string; yearLabel: string } | null`
  - `matchedPattern(row, productPatterns: string[], wheelBoreMm: number | null): string | null`
  - `buildReverseFitment(rows, productPatterns: string[], wheelBoreMm: number | null, limit: number): ReverseFitmentVehicle[]`

- [ ] **Step 1: Add the `ReverseFitmentVehicle` type**

Append to `backend/src/modules/wheel-size/types.ts`:

```ts
export type ReverseFitmentVehicle = {
  year: string
  make: string
  model: string
  trim?: string
  boltPattern: string
}
```

- [ ] **Step 2: Write the failing tests**

Create `backend/src/modules/wheel-size/__tests__/reverse-fitment.test.ts`:

```ts
import { extractVehicleIdentity, matchedPattern, buildReverseFitment } from "../reverse-fitment"

const rawOf = (
  make: string | null,
  model: string | null,
  trim: string | undefined,
  start: number | null,
  end: number | null
) => ({
  data: [{
    make: make ? { name: make } : undefined,
    model: model ? { name: model } : undefined,
    trim, start_year: start, end_year: end,
  }],
})

describe("extractVehicleIdentity", () => {
  it("reads make/model/trim and a year range", () => {
    expect(extractVehicleIdentity(rawOf("Mitsubishi", "Outlander", "3.0i", 2014, 2020))).toEqual({
      make: "Mitsubishi", model: "Outlander", trim: "3.0i", yearLabel: "2014–2020",
    })
  })
  it("collapses an equal start/end year to a single year", () => {
    expect(extractVehicleIdentity(rawOf("Honda", "Accord", undefined, 2021, 2021))?.yearLabel).toBe("2021")
  })
  it("yields an empty year label when years are absent", () => {
    expect(extractVehicleIdentity(rawOf("Ford", "F-150", undefined, null, null))?.yearLabel).toBe("")
  })
  it("returns null when make or model is missing, or raw is empty", () => {
    expect(extractVehicleIdentity(rawOf(null, "X", undefined, 2020, 2020))).toBeNull()
    expect(extractVehicleIdentity(null)).toBeNull()
  })
})

describe("matchedPattern", () => {
  const row = { canonical_bolt_patterns: ["5x114.3"], hub_bore_mm: 67.1 }
  it("returns the intersecting pattern when bolt + bore both pass", () => {
    expect(matchedPattern(row, ["5x120", "5x114.3"], 70)).toBe("5x114.3")
  })
  it("returns null when no bolt pattern intersects", () => {
    expect(matchedPattern(row, ["5x120"], 70)).toBeNull()
  })
  it("returns null when the wheel bore is smaller than the hub", () => {
    expect(matchedPattern(row, ["5x114.3"], 60)).toBeNull()
  })
  it("passes the bore gate when either value is unknown", () => {
    expect(matchedPattern({ canonical_bolt_patterns: ["5x114.3"], hub_bore_mm: null }, ["5x114.3"], 60)).toBe("5x114.3")
    expect(matchedPattern(row, ["5x114.3"], null)).toBe("5x114.3")
  })
})

describe("buildReverseFitment", () => {
  const ok = (make: string, model: string, trim: string | undefined, start: number, end: number, pats: string[], hub: number | null) =>
    ({ status: "ok", canonical_bolt_patterns: pats, hub_bore_mm: hub, raw: rawOf(make, model, trim, start, end) })

  it("returns deduped, sorted, capped matches", () => {
    const rows = [
      ok("Toyota", "Tacoma", undefined, 2016, 2023, ["6x139.7"], 67),
      ok("Honda", "Accord", "Sport", 2018, 2022, ["5x114.3"], 64.1),
      ok("Honda", "Accord", "Sport", 2018, 2022, ["5x114.3"], 64.1), // duplicate
    ]
    const out = buildReverseFitment(rows, ["5x114.3", "6x139.7"], 70, 24)
    expect(out.map((v) => `${v.make} ${v.model}`)).toEqual(["Honda Accord", "Toyota Tacoma"]) // sorted, deduped
    expect(out[0]).toMatchObject({ year: "2018–2022", trim: "Sport", boltPattern: "5x114.3" })
  })
  it("skips non-ok rows and bore failures", () => {
    const rows = [
      { status: "not_found", canonical_bolt_patterns: ["5x114.3"], hub_bore_mm: 64, raw: rawOf("A", "B", undefined, 2020, 2020) },
      ok("C", "D", undefined, 2020, 2020, ["5x114.3"], 80), // hub 80 > wheel bore 70 → bore fail
    ]
    expect(buildReverseFitment(rows, ["5x114.3"], 70, 24)).toEqual([])
  })
  it("caps at the limit", () => {
    const rows = Array.from({ length: 5 }, (_, i) => ok(`Make${i}`, "M", undefined, 2020, 2020, ["5x114.3"], 60))
    expect(buildReverseFitment(rows, ["5x114.3"], 70, 3)).toHaveLength(3)
  })
  it("returns empty when the product has no patterns", () => {
    expect(buildReverseFitment([ok("A", "B", undefined, 2020, 2020, ["5x114.3"], 60)], [], 70, 24)).toEqual([])
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx jest src/modules/wheel-size/__tests__/reverse-fitment.test.ts`
Expected: FAIL — cannot resolve `../reverse-fitment`.

- [ ] **Step 4: Implement the pure module**

Create `backend/src/modules/wheel-size/reverse-fitment.ts`:

```ts
import { ReverseFitmentVehicle } from "./types"

type FitmentRow = {
  raw?: any
  canonical_bolt_patterns?: string[] | null
  hub_bore_mm?: number | null
  status?: string
}

/**
 * Pull a display-ready vehicle identity out of a cached wheel-size `by_model`
 * body (`raw.data[0]`): make.name, model.name, trim, and a year label from
 * start_year/end_year. Returns null when make or model is missing.
 */
export function extractVehicleIdentity(
  raw: any
): { make: string; model: string; trim?: string; yearLabel: string } | null {
  const d = raw?.data?.[0]
  const make = d?.make?.name
  const model = d?.model?.name
  if (typeof make !== "string" || !make || typeof model !== "string" || !model) return null
  const trim = typeof d?.trim === "string" && d.trim ? d.trim : undefined
  const start = typeof d?.start_year === "number" ? d.start_year : null
  const end = typeof d?.end_year === "number" ? d.end_year : null
  const yearLabel =
    start != null && end != null
      ? start === end ? `${start}` : `${start}–${end}`
      : start != null ? `${start}` : ""
  return { make, model, trim, yearLabel }
}

/**
 * Hard-gate match: bolt-pattern intersection AND wheel bore clears the
 * vehicle hub (unknown values pass — never exclude on missing data). Mirrors
 * the storefront fits-vehicle.ts hard gates so the PDP list and the
 * active-vehicle band agree. Returns the matched canonical pattern, or null.
 */
export function matchedPattern(
  row: FitmentRow,
  productPatterns: string[],
  wheelBoreMm: number | null
): string | null {
  const rowPats = Array.isArray(row.canonical_bolt_patterns) ? row.canonical_bolt_patterns : []
  const hit = productPatterns.find((p) => rowPats.includes(p))
  if (!hit) return null
  const hub = typeof row.hub_bore_mm === "number" ? row.hub_bore_mm : null
  const boreOk = hub == null || wheelBoreMm == null ? true : wheelBoreMm >= hub
  return boreOk ? hit : null
}

/**
 * Reduce cached fitment rows to a deduped, sorted, capped list of vehicles
 * confirmed to fit the product (bolt + bore hard gates). `raw` supplies the
 * display identity; non-ok rows and identity-less rows are dropped.
 */
export function buildReverseFitment(
  rows: FitmentRow[],
  productPatterns: string[],
  wheelBoreMm: number | null,
  limit: number
): ReverseFitmentVehicle[] {
  if (!productPatterns.length) return []
  const seen = new Set<string>()
  const out: ReverseFitmentVehicle[] = []
  for (const row of rows) {
    if (row.status && row.status !== "ok") continue
    const pattern = matchedPattern(row, productPatterns, wheelBoreMm)
    if (!pattern) continue
    const id = extractVehicleIdentity(row.raw)
    if (!id) continue
    const key = `${id.make}|${id.model}|${id.trim ?? ""}|${id.yearLabel}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ year: id.yearLabel, make: id.make, model: id.model, trim: id.trim, boltPattern: pattern })
  }
  out.sort(
    (a, b) =>
      a.make.localeCompare(b.make) ||
      a.model.localeCompare(b.model) ||
      a.year.localeCompare(b.year)
  )
  return out.slice(0, limit)
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest src/modules/wheel-size/__tests__/reverse-fitment.test.ts`
Expected: PASS — all describe blocks green.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/wheel-size/types.ts backend/src/modules/wheel-size/reverse-fitment.ts backend/src/modules/wheel-size/__tests__/reverse-fitment.test.ts
git commit -m "feat(fitment): pure reverse-fitment matcher (bolt+bore) + identity from raw (WB-009)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Service `reverseFitment` + `GET /store/fitment/by-product`

**Files:**
- Modify: `backend/src/modules/wheel-size/service.ts` (add `reverseFitment` + imports)
- Modify: `backend/src/modules/wheel-size/__tests__/service.test.ts` (add a `reverseFitment` test)
- Create: `backend/src/api/store/fitment/by-product/route.ts`

**Interfaces:**
- Consumes: `buildReverseFitment`, `ReverseFitmentVehicle` (Task 1); the `MedusaService`-generated `listWheelSizeFitments({ status })`.
- Produces: `WheelSizeService.reverseFitment({ canonicalBoltPatterns: string[]; wheelBoreMm?: number | null; limit?: number }): Promise<ReverseFitmentVehicle[]>` (consumed by the route + Task 3's storefront fetch); the route `GET /store/fitment/by-product?boltPatterns=<csv>&boreMm=<n>&limit=<n>` → `{ vehicles: ReverseFitmentVehicle[] }`.

- [ ] **Step 1: Write the failing service test**

Append to `backend/src/modules/wheel-size/__tests__/service.test.ts`:

```ts
describe("WheelSizeService.reverseFitment", () => {
  function makeReverseService(rows: any[]) {
    const svc = new (WheelSizeService as any)({ logger: { warn() {}, error() {} } }, { apiKey: "k", baseUrl: "b", defaultRegion: "usdm" })
    svc.listWheelSizeFitments = async (f: any) => rows.filter((r) => f.status === undefined || r.status === f.status)
    return svc
  }
  const raw = (make: string, model: string) => ({ data: [{ make: { name: make }, model: { name: model }, start_year: 2020, end_year: 2020 }] })

  it("returns cached vehicles whose bolt pattern matches the product and clears the hub", async () => {
    const svc = makeReverseService([
      { status: "ok", canonical_bolt_patterns: ["5x114.3"], hub_bore_mm: 64, raw: raw("Honda", "Civic") },
      { status: "ok", canonical_bolt_patterns: ["6x139.7"], hub_bore_mm: 100, raw: raw("Ford", "F150") },
    ])
    const out = await svc.reverseFitment({ canonicalBoltPatterns: ["5x114.3"], wheelBoreMm: 70 })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ make: "Honda", model: "Civic", boltPattern: "5x114.3" })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/modules/wheel-size/__tests__/service.test.ts -t "reverseFitment"`
Expected: FAIL — `svc.reverseFitment is not a function`.

- [ ] **Step 3: Implement `reverseFitment` on the service**

In `backend/src/modules/wheel-size/service.ts`:

1. Change the types import line `import { VehicleFitment } from "./types"` to:

```ts
import { VehicleFitment, ReverseFitmentVehicle } from "./types"
```

2. Add a new import directly below it:

```ts
import { buildReverseFitment } from "./reverse-fitment"
```

3. Add this method to the `WheelSizeService` class, immediately after `getFitment` (after its closing `}` near line 76):

```ts
  /**
   * Reverse fitment: cached vehicles confirmed to fit a product (bolt pattern
   * intersection + wheel bore clears the hub). Pure cache read — no wheel-size
   * API calls, so no quota impact. `raw` supplies the display identity.
   */
  async reverseFitment(p: { canonicalBoltPatterns: string[]; wheelBoreMm?: number | null; limit?: number }): Promise<ReverseFitmentVehicle[]> {
    const rows = await this.listWheelSizeFitments({ status: "ok" })
    return buildReverseFitment(rows, p.canonicalBoltPatterns, p.wheelBoreMm ?? null, p.limit ?? 24)
  }
```

- [ ] **Step 4: Run the service test to verify it passes**

Run: `npx jest src/modules/wheel-size/__tests__/service.test.ts -t "reverseFitment"`
Expected: PASS.

- [ ] **Step 5: Create the store route**

Create `backend/src/api/store/fitment/by-product/route.ts`:

```ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { WHEEL_SIZE_MODULE } from "../../../../modules/wheel-size"
import { resolveOptional } from "../../../../lib/resolve-optional"

// Reverse fitment: which CACHED vehicles fit this product (bolt + bore). Pure
// DB read — no wheel-size API calls, so no quota impact. Degrades to an empty
// list (never 503) because the PDP "confirmed models" section is an enhancement.
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const svc = resolveOptional(req.scope, WHEEL_SIZE_MODULE)
  const { boltPatterns, boreMm, limit } = req.query as Record<string, string>
  const patterns = (boltPatterns ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  if (!svc || patterns.length === 0) { res.json({ vehicles: [] }); return }
  const wheelBoreMm =
    boreMm != null && boreMm !== "" && Number.isFinite(Number(boreMm)) ? Number(boreMm) : null
  const lim = limit != null && limit !== "" && Number.isFinite(Number(limit)) ? Number(limit) : 24
  const vehicles = await svc.reverseFitment({ canonicalBoltPatterns: patterns, wheelBoreMm, limit: lim })
  res.json({ vehicles })
}
```

- [ ] **Step 6: Run the full wheel-size suite (route shares the module import; confirms no break)**

Run: `npx jest src/modules/wheel-size`
Expected: PASS — existing tests + the new `reverse-fitment` and `reverseFitment` cases.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/wheel-size/service.ts backend/src/modules/wheel-size/__tests__/service.test.ts backend/src/api/store/fitment/by-product/route.ts
git commit -m "feat(fitment): reverseFitment service method + GET /store/fitment/by-product (WB-009)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Storefront data layer + PDP loader wiring

**Files:**
- Modify: `storefront/src/lib/data/fitment.ts` (add `getFitmentByProduct`)
- Modify: `storefront/src/modules/product-detail/data/get-product.ts` (call it in `getProductDetail`)

**Interfaces:**
- Consumes: `GET /store/fitment/by-product` (Task 2); `FitmentEntry` from `@modules/product-detail/data/types` (`{ year; make; model; trim?; boltPattern?; notes? }`).
- Produces: `getFitmentByProduct(boltPatternsCanonical: string[], boreMm?: number): Promise<FitmentEntry[]>`; `getProductDetail` now returns a populated `fitment`.

- [ ] **Step 1: Add `getFitmentByProduct` to the data layer**

In `storefront/src/lib/data/fitment.ts`, add this import near the top (after the existing imports):

```ts
import type { FitmentEntry } from "@modules/product-detail/data/types"
```

and append this function at the end of the file:

```ts
/**
 * Reverse fitment for the PDP "confirmed models" list: cached vehicles that fit
 * this product's bolt patterns (+ bore). Server-side; best-effort cache via
 * Next revalidate. Returns [] on any error — the section degrades to 0 models.
 */
export async function getFitmentByProduct(
  boltPatternsCanonical: string[],
  boreMm?: number
): Promise<FitmentEntry[]> {
  if (!boltPatternsCanonical?.length) return []
  try {
    const params = new URLSearchParams({ boltPatterns: boltPatternsCanonical.join(",") })
    if (typeof boreMm === "number" && Number.isFinite(boreMm) && boreMm > 0) {
      params.set("boreMm", String(boreMm))
    }
    const body = await sdk.client.fetch<{ vehicles: FitmentEntry[] }>(
      `/store/fitment/by-product?${params.toString()}`,
      { next: { revalidate: 300 } } as any
    )
    return Array.isArray(body?.vehicles) ? body.vehicles : []
  } catch {
    return []
  }
}
```

- [ ] **Step 2: Wire it into the PDP loader**

In `storefront/src/modules/product-detail/data/get-product.ts`:

1. Add an import near the other data-layer imports (next to `import { getProductByHandle, getProductsList } from "@lib/data/products"`):

```ts
import { getFitmentByProduct } from "@lib/data/fitment"
```

2. Replace the body of `getProductDetail` so it merges in the fitment list:

```ts
export async function getProductDetail(handle: string): Promise<ProductDetail> {
  const region = await getRegion(DEFAULT_COUNTRY)
  if (!region) notFound()
  const product = await getProductByHandle(handle, region.id)
  if (!product) notFound()
  const detail = mapToDetail(product)
  const fitment = await getFitmentByProduct(
    detail.boltPatternsCanonical,
    detail.specs.centerBoreMm || undefined
  )
  return { ...detail, fitment }
}
```

(`mapToDetail` still returns `fitment: []` as the default; `getProductDetail` overrides it. Leave `mapToDetail` unchanged.)

- [ ] **Step 3: Typecheck the touched files**

Run: `npx tsc --noEmit 2>&1 | grep -E "lib/data/fitment|product-detail/data/get-product" || echo "no new errors in touched files"`
Expected: `no new errors in touched files`.

- [ ] **Step 4: Run the full storefront suite (regression gate)**

Run: `npx vitest run`
Expected: PASS — all existing tests (no new unit test; this is I/O + loader wiring).

- [ ] **Step 5: Commit**

```bash
git add storefront/src/lib/data/fitment.ts storefront/src/modules/product-detail/data/get-product.ts
git commit -m "feat(pdp): populate product.fitment via reverse-fitment route (WB-009)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Live verification + close-out

**Files:**
- Create (temporary, not committed): `backend/scratch-wb009-verify.mjs`
- Modify: `docs/future/BACKLOG.md` (WB-009 → done)
- Modify: `docs/STATUS.md` (Fitment + PDP pillar rows + Active work + Last verified + Backend test count)
- Move: `docs/in-progress/specs/2026-06-18-pdp-reverse-fitment-design.md` → `docs/done/specs/`
- Move: `docs/in-progress/plans/2026-06-18-pdp-reverse-fitment.md` → `docs/done/plans/`

**Interfaces:**
- Consumes: a running backend on `:9000` with a publishable key; the routes from Tasks 2-3.
- Produces: a documented green verification (seed cache → reverse route returns the vehicle; bore/no-match excluded) + synced docs. Terminal deliverable for WB-009.

- [ ] **Step 1: Ensure a backend is running with a publishable key**

The backend must be up on `:9000` (the controller starts it). Read the publishable key from `storefront/.env.local` (`NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_...`) and export it as `PUBKEY` for Step 2.

- [ ] **Step 2: Write the verification script**

Create `backend/scratch-wb009-verify.mjs` (scratch — deleted in Step 5, never committed):

```js
// WB-009 verify: seed the fitment cache via a forward lookup, then confirm the
// reverse route returns that vehicle for the matching bolt pattern (and excludes
// a non-matching one). Run: node scratch-wb009-verify.mjs  (backend up on :9000)
const BASE = "http://localhost:9000"
const PUBKEY = process.env.PUBKEY
if (!PUBKEY) throw new Error("set PUBKEY env to a publishable API key")
const H = { "x-publishable-api-key": PUBKEY }
const j = async (u) => (await fetch(u, { headers: H })).json()

// 1) Seed: forward lookup for a vehicle known to be 5x114.3 (Honda Accord).
//    This populates wheel_size_fitment with the Accord's raw + canonical patterns.
const seed = await j(`${BASE}/store/fitment/by-vehicle?make=honda&model=accord&year=2021&region=usdm`)
console.log("seed by-vehicle:", JSON.stringify(seed?.fitment?.canonicalBoltPatterns ?? seed))

// 2) Reverse: ask which cached vehicles fit a 5x114.3 wheel with a generous bore.
const hit = await j(`${BASE}/store/fitment/by-product?boltPatterns=5x114.3&boreMm=70`)
const hondas = (hit.vehicles ?? []).filter((v) => /honda/i.test(v.make) && /accord/i.test(v.model))
console.log("by-product 5x114.3 → vehicles:", (hit.vehicles ?? []).length, "| Accord present:", hondas.length > 0)
console.log("sample:", JSON.stringify((hit.vehicles ?? []).slice(0, 3)))

// 3) Negative: a bogus pattern returns nothing.
const none = await j(`${BASE}/store/fitment/by-product?boltPatterns=99x999`)
console.log("by-product bogus pattern → vehicles (expect 0):", (none.vehicles ?? []).length)

// 4) Bore gate: a tiny wheel bore that no real hub clears returns nothing for 5x114.3.
const tinyBore = await j(`${BASE}/store/fitment/by-product?boltPatterns=5x114.3&boreMm=1`)
console.log("by-product 5x114.3 boreMm=1 → vehicles (expect 0):", (tinyBore.vehicles ?? []).length)

const pass = hondas.length > 0 && (none.vehicles ?? []).length === 0 && (tinyBore.vehicles ?? []).length === 0
console.log(pass ? "PASS: reverse fitment returns the matching vehicle; bogus/bore-fail excluded"
                 : "CHECK: review output above (if seed returned not_found, try another known 5x114.3 vehicle e.g. toyota/camry/2021)")
```

- [ ] **Step 3: Run the verification**

Run: `cd backend && PUBKEY=<key> node scratch-wb009-verify.mjs`
Expected: the seed prints `["5x114.3"]` (or a fallback region's pattern); `by-product 5x114.3 → … Accord present: true`; bogus pattern → 0; `boreMm=1` → 0; final line `PASS: …`. Record the full output. (If the seed returns `not_found`/empty, the script's CHECK note lists a fallback vehicle — re-run with that; do not mark done until a real vehicle round-trips.)

- [ ] **Step 4: Close out the backlog + STATUS**

In `docs/future/BACKLOG.md`, set WB-009 `status: done` and append a `- done:` line:
```
- done: reverse over the wheel_size_fitment cache — pure reverse-fitment.ts (extractVehicleIdentity + matchedPattern + buildReverseFitment, bolt+bore hard gates), service.reverseFitment, GET /store/fitment/by-product (no API calls/quota), wired into the PDP loader. Identity read from the stored raw (no migration). Verified by unit tests + a live seed→reverse round-trip (Accord 5x114.3; bogus pattern + tiny bore excluded).
```

In `docs/STATUS.md`:
- Bump `> **Last verified: 2026-06-18.**` (keep today's date).
- Fitment pillar row: append to the one-liner that reverse-fitment ("N confirmed models") is now live (WB-009 done); remove WB-009 from any row's Open backlog cell if listed (it is under the PDP row).
- PDP pillar row: change `… fitment=[].` → `… reverse-fitment "N confirmed models" live (WB-009 done).` and remove `WB-009` from its Open backlog cell.
- Active work block: replace with `None in progress. **WB-009** (PDP reverse fitment) shipped to \`main\`. Next up: **WB-004** (home Featured/Gallery content) or **WB-005** (tires grouped + indexed).`
- Backend test line: run `npx jest src/modules/wheel-size src/modules/customer-vehicle` (the `test:fitment` set) plus note the prior total; set the Backend count to the exact new passing number (this task adds ~9 wheel-size tests). Do NOT guess — use the number the run prints together with the rest of the suite's known count (was 204; new = 204 + new tests).

- [ ] **Step 5: Delete the scratch file and move the docs**

```bash
rm backend/scratch-wb009-verify.mjs
git mv docs/in-progress/specs/2026-06-18-pdp-reverse-fitment-design.md docs/done/specs/
git mv docs/in-progress/plans/2026-06-18-pdp-reverse-fitment.md docs/done/plans/
```

- [ ] **Step 6: Commit the close-out**

```bash
git add docs/
git commit -m "docs: close WB-009 (PDP reverse fitment) — backlog, STATUS, move spec+plan to done

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Pure `reverse-fitment.ts` (extractVehicleIdentity / matchedPattern / buildReverseFitment) + `ReverseFitmentVehicle` → Task 1. ✓
- `WheelSizeService.reverseFitment` (loads `status="ok"`, no API calls) → Task 2. ✓
- `GET /store/fitment/by-product` (graceful empty, never 503) → Task 2. ✓
- Storefront `getFitmentByProduct` + loader merge replacing `fitment: []` → Task 3. ✓
- Component unchanged → no task touches it. ✓
- Match gate bolt + bore (unknown passes), identity from `raw`, dedupe/sort/cap → Task 1 code + tests. ✓
- Degradation (module off / error / empty → []) → route returns `{vehicles:[]}` (Task 2) + fn try/catch (Task 3). ✓
- Testing: pure unit tests (Task 1), service test (Task 2), live seed→reverse round-trip (Task 4). ✓
- Out of scope (warm cron, reverse API, window refinement, migration) → no task touches them. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full content.

**Type consistency:** `ReverseFitmentVehicle` and the three pure fns keep identical signatures across Tasks 1-2; `reverseFitment({canonicalBoltPatterns, wheelBoreMm?, limit?})` is called the same way by the route and is fed by `getFitmentByProduct(boltPatternsCanonical, boreMm?)`; `FitmentEntry` (year/make/model/trim?/boltPattern?) is structurally a superset of `ReverseFitmentVehicle`, so the route's `vehicles` map cleanly onto it.
