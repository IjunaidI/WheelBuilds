# Tire Fitment Reach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close two tire-fitment reach gaps — a reverse "N confirmed models" list on the tire PDP (WB-065, mirroring the wheel WB-009), and a Wheels|Tires destination toggle in the vehicle-picker drawer so a car pick can land on `/tires` pre-fitted (WB-066).

**Architecture:** WB-065 is a pure reverse over the already-cached `wheel_size_fitment` rows — match cached vehicles whose OEM tire sizes (`extractOemTireSizes`) intersect the product's canonical `tire_sizes`, identity from the cached `raw` — surfaced via a new store route + a tire-PDP section, mirroring the wheel reverse-fitment pipeline exactly. WB-066 adds a client toggle + a pure `fitmentDestinationUrl` builder that routes to `/store?fit=<boltPatterns>` or `/tires?fit=<oemTireSizes>`. No new wheel-size API calls, no DB migration.

**Tech Stack:** MedusaJS 2.13.6 backend (MikroORM, Jest), Next.js 15 storefront (App Router, React 19, Vitest), the existing `wheel-size` + `product-detail` (tire branch) + `search` modules.

## Global Constraints

- No `wb-`/`WB`/`wheelbuilds-` prefix on any dir, file, export, or CSS class.
- **OEM-only** reverse match (`extractOemTireSizes` already filters `is_stock === true`) — no aftermarket/plus-size, matching WB-063 forward.
- **Pure cache read** for the reverse path: `service.reverseTireFitment` lists `status: "ok"` rows and reuses the existing `extractVehicleIdentity` + `extractOemTireSizes` — no wheel-size API calls, no quota, no migration.
- The reverse store route degrades to `{ vehicles: [] }` and never 503s; `getFitmentByTireProduct` returns `[]` on any error/empty input; the tire PDP section is additive (renders nothing meaningful when empty).
- Canonical tire sizes are the join key on BOTH sides (vehicle via `extractOemTireSizes` → `canonicalizeTireSize`; product `tire_sizes`/`canonicalSize` are already canonical from SP1). Do NOT re-canonicalize the product side.
- Storefront import aliases `@modules/*` / `@lib/*` (NOT `@/…` except the shadcn `@/components/ui/*` already in use). Backend tsconfig maps `*` → `./src/*`.
- Storefront build ignores TS/lint errors; the gate is `npx tsc --noEmit` (no NEW errors beyond the ~14-error storefront baseline) + the named unit suites. Backend gate: `pnpm test:fitment` + `npx tsc --noEmit`.
- Commit trailer, own line at the end of every commit message: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Backend — reverse tire fitment (type + pure helper + tests + service + route)

**Files:**
- Modify: `backend/src/modules/wheel-size/types.ts` (add `ReverseTireFitmentVehicle`)
- Create: `backend/src/modules/wheel-size/reverse-tire-fitment.ts`
- Create: `backend/src/modules/wheel-size/__tests__/reverse-tire-fitment.test.ts`
- Modify: `backend/src/modules/wheel-size/service.ts` (add `reverseTireFitment`)
- Create: `backend/src/api/store/fitment/by-tire-product/route.ts`

**Interfaces:**
- Consumes (existing): `extractVehicleIdentity(raw): { make, model, trim?, yearLabel } | null` (exported from `./reverse-fitment`); `extractOemTireSizes(raw): string[]` (exported from `./oem-tire-sizes`, canonical + `is_stock`-only + front/rear-flattened + deduped); `this.listWheelSizeFitments({ status })`.
- Produces: `ReverseTireFitmentVehicle`; `buildReverseTireFitment(rows, productSizes, limit)`; `service.reverseTireFitment({ tireSizes, limit? })`; `GET /store/fitment/by-tire-product?sizes=<CSV>&limit=` → `{ vehicles: ReverseTireFitmentVehicle[] }`.

- [ ] **Step 1: Add the type**

In `backend/src/modules/wheel-size/types.ts`, directly after the existing `ReverseFitmentVehicle` type (ends at the `boltPattern` line), add:

```ts
export type ReverseTireFitmentVehicle = {
  year: string
  make: string
  model: string
  trim?: string
  /** The matched canonical OEM tire size, e.g. "225/55R18". */
  size: string
}
```

- [ ] **Step 2: Write the failing test**

Create `backend/src/modules/wheel-size/__tests__/reverse-tire-fitment.test.ts`:

```ts
import { buildReverseTireFitment } from "../reverse-tire-fitment"

// raw with both a display identity AND is_stock front tires (what extractOemTireSizes reads).
const rawOf = (
  make: string | null,
  model: string | null,
  trim: string | undefined,
  start: number | null,
  end: number | null,
  tires: string[]
) => ({
  data: [{
    make: make ? { name: make } : undefined,
    model: model ? { name: model } : undefined,
    trim, start_year: start, end_year: end,
    wheels: tires.map((t) => ({ is_stock: true, front: { tire: t }, rear: { tire: t } })),
  }],
})

const ok = (make: string, model: string, trim: string | undefined, start: number, end: number, tires: string[]) =>
  ({ status: "ok", raw: rawOf(make, model, trim, start, end, tires) })

describe("buildReverseTireFitment", () => {
  it("returns deduped, sorted, capped matches on canonical size intersection", () => {
    const rows = [
      ok("Toyota", "Tacoma", undefined, 2016, 2023, ["265/70R16"]),
      ok("Honda", "Accord", "Sport", 2018, 2022, ["235/40R19", "225/50R18"]),
      ok("Honda", "Accord", "Sport", 2018, 2022, ["235/40R19"]), // duplicate identity
    ]
    const out = buildReverseTireFitment(rows, ["235/40R19", "265/70R16"], 24)
    expect(out.map((v) => `${v.make} ${v.model}`)).toEqual(["Honda Accord", "Toyota Tacoma"]) // sorted + deduped
    expect(out[0]).toMatchObject({ year: "2018–2022", trim: "Sport", size: "235/40R19" })
  })
  it("skips non-ok rows and rows with no size intersection", () => {
    const rows = [
      { status: "not_found", raw: rawOf("A", "B", undefined, 2020, 2020, ["235/40R19"]) },
      ok("C", "D", undefined, 2020, 2020, ["205/55R16"]), // no overlap with product
    ]
    expect(buildReverseTireFitment(rows, ["235/40R19"], 24)).toEqual([])
  })
  it("skips identity-less rows", () => {
    const rows = [ok(null, "B", undefined, 2020, 2020, ["235/40R19"])]
    expect(buildReverseTireFitment(rows, ["235/40R19"], 24)).toEqual([])
  })
  it("caps at the limit", () => {
    const rows = Array.from({ length: 5 }, (_, i) => ok(`Make${i}`, "M", undefined, 2020, 2020, ["235/40R19"]))
    expect(buildReverseTireFitment(rows, ["235/40R19"], 3)).toHaveLength(3)
  })
  it("returns empty when the product has no sizes", () => {
    expect(buildReverseTireFitment([ok("A", "B", undefined, 2020, 2020, ["235/40R19"])], [], 24)).toEqual([])
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd backend && npx -y pnpm@9.10.0 test:fitment 2>&1 | grep -iE "reverse-tire|Cannot find module"`
Expected: FAIL — module `../reverse-tire-fitment` not found.

- [ ] **Step 4: Implement the pure helper**

Create `backend/src/modules/wheel-size/reverse-tire-fitment.ts`:

```ts
import { extractVehicleIdentity } from "./reverse-fitment"
import { extractOemTireSizes } from "./oem-tire-sizes"
import { ReverseTireFitmentVehicle } from "./types"

type FitmentRow = { raw?: any; status?: string }

/**
 * Reduce cached fitment rows to a deduped, sorted, capped list of vehicles whose
 * factory (OEM) tire size matches the product. `extractOemTireSizes` supplies the
 * canonical is_stock sizes; `extractVehicleIdentity` the display identity — both
 * read the same cached `raw` reverse-fitment already consumes. Non-ok and
 * identity-less rows are dropped. Mirrors buildReverseFitment (WB-009).
 */
export function buildReverseTireFitment(
  rows: FitmentRow[],
  productSizes: string[],
  limit: number
): ReverseTireFitmentVehicle[] {
  if (!productSizes.length) return []
  const productSet = new Set(productSizes)
  const seen = new Set<string>()
  const out: ReverseTireFitmentVehicle[] = []
  for (const row of rows) {
    if (row.status && row.status !== "ok") continue
    const vehicleSizes = extractOemTireSizes(row.raw)
    const size = vehicleSizes.find((s) => productSet.has(s))
    if (!size) continue
    const id = extractVehicleIdentity(row.raw)
    if (!id) continue
    const key = `${id.make}|${id.model}|${id.trim ?? ""}|${id.yearLabel}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ year: id.yearLabel, make: id.make, model: id.model, trim: id.trim, size })
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

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && npx -y pnpm@9.10.0 test:fitment 2>&1 | tail -6`
Expected: all suites pass (the reverse-tire-fitment suite green, no regressions).

- [ ] **Step 6: Add the service method**

In `backend/src/modules/wheel-size/service.ts`: add the import near the existing `import { buildReverseFitment } from "./reverse-fitment"`:

```ts
import { buildReverseTireFitment } from "./reverse-tire-fitment"
import { ReverseFitmentVehicle, ReverseTireFitmentVehicle, ... } from "./types"  // add ReverseTireFitmentVehicle to the existing types import
```

Then add this method directly after the existing `reverseFitment(...)` method (mirror its shape):

```ts
  /**
   * Reverse tire fitment: cached vehicles whose factory (OEM) tire size matches a
   * product's canonical sizes. Pure cache read — no wheel-size API calls, no quota.
   */
  async reverseTireFitment(p: { tireSizes: string[]; limit?: number }): Promise<ReverseTireFitmentVehicle[]> {
    const rows = await this.listWheelSizeFitments({ status: "ok" })
    return buildReverseTireFitment(
      rows as unknown as Parameters<typeof buildReverseTireFitment>[0],
      p.tireSizes,
      p.limit ?? 24
    )
  }
```

- [ ] **Step 7: Add the store route**

Create `backend/src/api/store/fitment/by-tire-product/route.ts` (mirror `by-product/route.ts`):

```ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { WHEEL_SIZE_MODULE } from "../../../../modules/wheel-size"
import type WheelSizeService from "../../../../modules/wheel-size/service"
import { resolveOptional } from "../../../../lib/resolve-optional"

// Reverse tire fitment: which CACHED vehicles' factory tire size matches this
// product. Pure DB read — no wheel-size API calls, so no quota impact. Degrades
// to an empty list (never 503) because the PDP "confirmed models" section is an
// enhancement.
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const svc = resolveOptional<WheelSizeService>(req.scope, WHEEL_SIZE_MODULE)
  const { sizes, limit } = req.query as Record<string, string>
  const tireSizes = (sizes ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  if (!svc || tireSizes.length === 0) { res.json({ vehicles: [] }); return }
  const lim = limit != null && limit !== "" && Number.isFinite(Number(limit)) ? Number(limit) : 24
  const vehicles = await svc.reverseTireFitment({ tireSizes, limit: lim })
  res.json({ vehicles })
}
```

- [ ] **Step 8: Type-check + full fitment suite**

Run: `cd backend && npx -y pnpm@9.10.0 test:fitment 2>&1 | tail -6` → all pass.
Run: `cd backend && npx tsc --noEmit 2>&1 | grep -iE "reverse-tire|by-tire-product|wheel-size/service|wheel-size/types" || echo "no new errors in touched files"` → the echo (there is one pre-existing admin-route baseline error elsewhere; only NEW errors in these files fail).

- [ ] **Step 9: Commit**

```bash
git add backend/src/modules/wheel-size/types.ts backend/src/modules/wheel-size/reverse-tire-fitment.ts backend/src/modules/wheel-size/__tests__/reverse-tire-fitment.test.ts backend/src/modules/wheel-size/service.ts backend/src/api/store/fitment/by-tire-product/route.ts
git commit -m "feat(wheel-size): reverse tire fitment (cached vehicles by OEM tire size) (WB-065)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Storefront — tire reverse-fitment data (types + data layer + loader)

**Files:**
- Modify: `storefront/src/modules/product-detail/data/types.ts` (add `TireFitmentEntry` + `TireProductDetail.fitment`)
- Modify: `storefront/src/modules/product-detail/data/tire/map-tire-detail.ts` (default `fitment: []`)
- Modify: `storefront/src/lib/data/fitment.ts` (add `getFitmentByTireProduct`)
- Modify: `storefront/src/modules/product-detail/data/get-product.ts` (tire branch: fetch reverse + merge)

**Interfaces:**
- Consumes: `GET /store/fitment/by-tire-product?sizes=<CSV>` → `{ vehicles }` (Task 1); `TireSizeOption.canonicalSize` (existing, on `product-detail/data/tire/tire-size-options.ts`); the existing `sdk` + `getFitmentByProduct` pattern in `lib/data/fitment.ts`.
- Produces: `TireFitmentEntry = { year, make, model, trim?, size }`; `TireProductDetail.fitment: TireFitmentEntry[]`; `getFitmentByTireProduct(sizes: string[]): Promise<TireFitmentEntry[]>`.

- [ ] **Step 1: Add the storefront type + field**

In `storefront/src/modules/product-detail/data/types.ts`: directly after the existing `FitmentEntry` type (the `{ year; make; model; … }` block around line 72), add:

```ts
/** A vehicle whose factory (OEM) tire size matches this tire. Drives the tire fitment list. */
export type TireFitmentEntry = {
  year: string
  make: string
  model: string
  trim?: string
  size: string
}
```

Then in the `TireProductDetail` type (the `kind: "tire"` block), add a `fitment` field after `specs`:

```ts
  specs: TireSpecs
  fitment: TireFitmentEntry[]
}
```

- [ ] **Step 2: Default `fitment: []` in the pure mapper**

In `storefront/src/modules/product-detail/data/tire/map-tire-detail.ts`, add `fitment: [],` to the returned object (after the `specs: { … }` block, mirroring how the wheel `mapToDetail` returns `fitment: []` as a default the loader overrides):

```ts
    specs: {
      construction:
        (typeof pmeta.construction === "string" && pmeta.construction) ||
        (typeof rep.construction_type === "string" && rep.construction_type) ||
        null,
      plyRating: (typeof rep.ply_rating === "string" && rep.ply_rating) || null,
      tireType,
      weightLb,
    },
    fitment: [], // default; getProductDetail overrides via reverse tire fitment (WB-065)
  }
```

- [ ] **Step 3: Add the data-layer fetch**

In `storefront/src/lib/data/fitment.ts`, add a function mirroring `getFitmentByProduct` (import `TireFitmentEntry` from the product-detail types; if the file has no such import, add `import type { TireFitmentEntry } from "@modules/product-detail/data/types"`). Place it right after `getFitmentByProduct`:

```ts
/**
 * Reverse tire fitment for the tire PDP "confirmed models" list: cached vehicles
 * whose factory tire size matches this product's canonical sizes. Server-side;
 * best-effort cache via Next revalidate. Returns [] on any error (section degrades).
 */
export async function getFitmentByTireProduct(sizes: string[]): Promise<TireFitmentEntry[]> {
  if (!sizes?.length) return []
  try {
    const params = new URLSearchParams()
    params.set("sizes", sizes.join(","))
    const body = await sdk.client.fetch<{ vehicles: TireFitmentEntry[] }>(
      `/store/fitment/by-tire-product?${params.toString()}`,
      { next: { revalidate: 300 } } as any
    )
    return Array.isArray(body?.vehicles) ? body.vehicles : []
  } catch {
    return []
  }
}
```

(Match the file's real `sdk` reference + `catch` style — read the existing `getFitmentByProduct` above it and mirror exactly.)

- [ ] **Step 4: Wire the loader to fetch + merge**

In `storefront/src/modules/product-detail/data/get-product.ts`, the tire branch currently returns the mapper directly:

```ts
  if ((product.metadata as any)?.product_type === "tire") {
    return mapTireDetail(product)
  }
```

Change it to fetch the reverse fitment over the product's canonical sizes and merge (mirroring the wheel branch below it). Import `getFitmentByTireProduct` alongside the existing `getFitmentByProduct` import at the top of the file:

```ts
  if ((product.metadata as any)?.product_type === "tire") {
    const tire = mapTireDetail(product)
    const sizes = Array.from(new Set(tire.sizeOptions.map((o) => o.canonicalSize).filter(Boolean)))
    const fitment = await getFitmentByTireProduct(sizes)
    return { ...tire, fitment }
  }
```

- [ ] **Step 5: Type-check**

Run: `cd storefront && npx tsc --noEmit 2>&1 | grep -iE "data/types|map-tire-detail|lib/data/fitment|get-product" || echo "no new errors in touched files"` → the echo.

- [ ] **Step 6: Commit**

```bash
git add storefront/src/modules/product-detail/data/types.ts storefront/src/modules/product-detail/data/tire/map-tire-detail.ts storefront/src/lib/data/fitment.ts storefront/src/modules/product-detail/data/get-product.ts
git commit -m "feat(tire-pdp): load reverse tire fitment onto TireProductDetail (WB-065)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Storefront — tire PDP fitment section

**Files:**
- Create: `storefront/src/modules/product-detail/components/tire/fitment.tsx`
- Modify: `storefront/src/modules/product-detail/templates/tire-detail.tsx` (render it)

**Interfaces:**
- Consumes: `TireProductDetail` + `TireFitmentEntry` (Task 2); `useGarage()` (`@lib/garage/use-garage`, returns `{ active }`, `active.oemTireSizes?: string[]`); `tireFitsVehicle(productSizes, vehicleOemSizes)` (`@lib/fitment/tire-fits-vehicle`, boolean); `openSearch` (`@lib/stores/search-store`).
- Produces: default-export `TireFitment` (client component).

- [ ] **Step 1: Build the section by mirroring the wheel fitment component**

READ `storefront/src/modules/product-detail/components/fitment/index.tsx` (the wheel version, 194 lines). Create `storefront/src/modules/product-detail/components/tire/fitment.tsx` as its mirror with EXACTLY these transforms (keep all the layout/classes/markup identical so the two sections look the same):

- `"use client"` at the top (the wheel one has it — keep it).
- Props `{ product: TireProductDetail }`; import `TireFitmentEntry, TireProductDetail` from `../../data/types`.
- Replace the fit verdict: the wheel uses `fitsVehicle(product, active)` returning a `{ fits, withinWindow, reasons }` object. The tire uses the boolean `tireFitsVehicle`:
  ```ts
  import { tireFitsVehicle } from "@lib/fitment/tire-fits-vehicle"
  ...
  const productSizes = product.sizeOptions.map((o) => o.canonicalSize)
  const activeFits =
    active?.oemTireSizes?.length ? tireFitsVehicle(productSizes, active.oemTireSizes) : null
  ```
  (`activeFits` is `boolean | null` — `null` when no active vehicle or it has no OEM sizes. Use it exactly where the wheel component uses `activeFits`.)
- Header eyebrow: `` `FITMENT · ${product.fitment.length} CONFIRMED MODELS` ``; title `"Does it fit your ride?"`; description: `"Every vehicle below runs this tire size from the factory. The list is non-exhaustive — check your door-jamb placard or ask us to confirm."`
- Active-vehicle status band: keep the three branches (active+fits / active+!fits / no active) and the same styling. Simplify the secondary copy — `tireFitsVehicle` has no `withinWindow`/`reasons`, so:
  - fits → title `` `Fits your ${active.year} ${active.make} ${active.model}${active.trim ? ` ${active.trim}` : ""}` ``; sub `"This tire size is a factory fit for your vehicle."`
  - active && !fits → title `` `${active.year} ${active.make} ${active.model} runs a different factory tire size.` ``; sub `"This size isn't the OEM fit for your vehicle — check your placard before ordering."`
  - no active → title `"Pick a vehicle to check the fit instantly."`; sub `"Your selection is saved across the site."` + the `<Button onClick={openSearch}>Pick vehicle</Button>`.
- The list: iterate `product.fitment` into a `TireFitmentRow` (mirror `FitmentRow`) whose entry is a `TireFitmentEntry`; render `{entry.year} {entry.make} {entry.model}{entry.trim ? ` ${entry.trim}` : ""}` and, in the mono sub-line, `{entry.size}` (there is no `boltPattern`/`notes` on the tire entry — show only the size). Keep the `YOUR VEHICLE` highlight-chip logic keyed on make+model match while `activeFits`.
- Drop the "Submit your build for fitment" footer `<a href="#">` (it's a dead link; the tire section omits it — end the section after the list).

- [ ] **Step 2: Render it in the tire template**

In `storefront/src/modules/product-detail/templates/tire-detail.tsx`: import it and render `<TireFitment product={product} />` between `<TireSpecs …/>` and `<TireRelated …/>` (this is where the wheel template renders its Fitment section relative to Specs/Related). Update the module doc-comment line that says "minus the Fitment section" to reflect that the tire PDP now has one (WB-065).

```tsx
import TireFitment from "../components/tire/fitment"
...
    <TireSpecs product={product} />
    <TireFitment product={product} />
    <TireRelated products={related} />
```

- [ ] **Step 3: Type-check + build sanity**

Run: `cd storefront && npx tsc --noEmit 2>&1 | grep -iE "components/tire/fitment|tire-detail" || echo "no new errors in touched files"` → the echo.
Run: `cd storefront && npx next build 2>&1 | grep -E "Compiled|Failed to compile" | head -3` → compiles (a full build can be env-blocked by the PRE-EXISTING backend-dependent `generateStaticParams` in `collections`/`categories` — that is NOT this task's regression; if the build fails ONLY there, rely on the tsc gate and note it).

- [ ] **Step 4: Commit**

```bash
git add storefront/src/modules/product-detail/components/tire/fitment.tsx storefront/src/modules/product-detail/templates/tire-detail.tsx
git commit -m "feat(tire-pdp): reverse-fitment 'N confirmed models' section (WB-065)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Storefront — funnel destination URL builder (pure fn + tests)

**Files:**
- Create: `storefront/src/modules/search/components/search-drawer/find-by-vehicle/destination-url.ts`
- Create: `storefront/src/modules/search/components/search-drawer/find-by-vehicle/__tests__/destination-url.test.ts`

**Interfaces:**
- Produces: `type FitmentTarget = "wheels" | "tires"`; `fitmentDestinationUrl({ countryCode, target, boltPatterns, oemTireSizes }): string`.

- [ ] **Step 1: Write the failing test**

Create `storefront/src/modules/search/components/search-drawer/find-by-vehicle/__tests__/destination-url.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { fitmentDestinationUrl } from "../destination-url"

describe("fitmentDestinationUrl", () => {
  it("routes wheels to /store with the bolt-pattern fit param", () => {
    expect(
      fitmentDestinationUrl({ countryCode: "us", target: "wheels", boltPatterns: ["5x114.3"], oemTireSizes: ["225/55R18"] })
    ).toBe("/us/store?fit=5x114.3")
  })
  it("routes tires to /tires with the OEM-size fit param (CSV, order preserved)", () => {
    expect(
      fitmentDestinationUrl({ countryCode: "us", target: "tires", boltPatterns: ["5x114.3"], oemTireSizes: ["225/55R18", "255/50R18"] })
    ).toBe("/us/tires?fit=225/55R18,255/50R18")
  })
  it("falls back to the bare path when the chosen target's fit array is empty", () => {
    expect(
      fitmentDestinationUrl({ countryCode: "ca", target: "tires", boltPatterns: ["5x114.3"], oemTireSizes: [] })
    ).toBe("/ca/tires")
    expect(
      fitmentDestinationUrl({ countryCode: "ca", target: "wheels", boltPatterns: [], oemTireSizes: ["225/55R18"] })
    ).toBe("/ca/store")
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd storefront && npx vitest run src/modules/search/components/search-drawer/find-by-vehicle/__tests__/destination-url`
Expected: FAIL — cannot resolve `../destination-url`.

- [ ] **Step 3: Implement the builder**

Create `storefront/src/modules/search/components/search-drawer/find-by-vehicle/destination-url.ts`:

```ts
export type FitmentTarget = "wheels" | "tires"

/**
 * Where a vehicle pick in the "find by vehicle" drawer should land. Wheels →
 * /store filtered by bolt pattern; tires → /tires filtered by OEM tire size.
 * Falls back to the bare path when the chosen target has no fit values.
 */
export function fitmentDestinationUrl(args: {
  countryCode: string
  target: FitmentTarget
  boltPatterns: string[]
  oemTireSizes: string[]
}): string {
  const { countryCode, target, boltPatterns, oemTireSizes } = args
  if (target === "tires") {
    const fit = oemTireSizes.length ? `?fit=${oemTireSizes.join(",")}` : ""
    return `/${countryCode}/tires${fit}`
  }
  const fit = boltPatterns.length ? `?fit=${boltPatterns.join(",")}` : ""
  return `/${countryCode}/store${fit}`
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd storefront && npx vitest run src/modules/search/components/search-drawer/find-by-vehicle/__tests__/destination-url`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add storefront/src/modules/search/components/search-drawer/find-by-vehicle/destination-url.ts storefront/src/modules/search/components/search-drawer/find-by-vehicle/__tests__/destination-url.test.ts
git commit -m "feat(search): fitmentDestinationUrl builder (wheels /store, tires /tires) (WB-066)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Storefront — Wheels|Tires toggle + funnel wiring

**Files:**
- Create: `storefront/src/modules/search/components/search-drawer/find-by-vehicle/destination-toggle.tsx`
- Modify: `storefront/src/modules/search/components/search-drawer/find-by-vehicle/ymm-pane.tsx`
- Modify: `storefront/src/modules/search/components/search-drawer/find-by-vehicle/garage-pane.tsx`

**Interfaces:**
- Consumes: `fitmentDestinationUrl` + `FitmentTarget` (Task 4); `useGarage()` (existing in both panes); the panes' existing `router`, `countryCode`, and fitment values.
- Produces: default-export `DestinationToggle` (`{ value: FitmentTarget; onChange: (t: FitmentTarget) => void }`).

- [ ] **Step 1: Build the toggle**

Create `storefront/src/modules/search/components/search-drawer/find-by-vehicle/destination-toggle.tsx`:

```tsx
"use client"

import { FitmentTarget } from "./destination-url"

type DestinationToggleProps = {
  value: FitmentTarget
  onChange: (t: FitmentTarget) => void
}

const OPTIONS: { key: FitmentTarget; label: string }[] = [
  { key: "wheels", label: "Wheels" },
  { key: "tires", label: "Tires" },
]

/** "Shop for: Wheels | Tires" segmented control for the find-by-vehicle drawer. */
const DestinationToggle = ({ value, onChange }: DestinationToggleProps) => (
  <div className="flex items-center gap-3">
    <span className="text-[11px] uppercase tracking-wide text-[var(--ink-soft)] font-[var(--mono)]">
      Shop for
    </span>
    <div
      className="inline-flex rounded-[var(--radius)] border p-0.5"
      style={{ borderColor: "var(--hairline)", background: "var(--soft)" }}
      role="group"
      aria-label="Shop for wheels or tires"
    >
      {OPTIONS.map((o) => {
        const selected = value === o.key
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            aria-pressed={selected}
            className="px-3 py-1 text-[12px] font-semibold rounded-[calc(var(--radius)-2px)] transition-colors"
            style={{
              background: selected ? "var(--orange)" : "transparent",
              color: selected ? "white" : "var(--ink)",
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  </div>
)

export default DestinationToggle
```

- [ ] **Step 2: Wire the YMM pane**

In `ymm-pane.tsx`:
1. Add imports: `import DestinationToggle from "./destination-toggle"` and `import { fitmentDestinationUrl, FitmentTarget } from "./destination-url"`.
2. Add state near the other `useState`s: `const [target, setTarget] = useState<FitmentTarget>("wheels")`.
3. In `submit`, the existing code computes `fitParam` from bolt patterns and ends with `router.push(\`/${countryCode}/store${fitParam}\`)`. Replace ONLY that final push with the builder, using the fitment lookup's values (`fitment.canonicalBoltPatterns` and `fitment.oemTireSizes` when the lookup succeeded, else empty arrays). Keep every existing branch (the `update(...)`, the "no fitment data" toast, the error toast) exactly as-is — only the destination URL changes:

```ts
      onClose()
      const boltPatterns =
        fitment && !("error" in fitment) && fitment.status === "ok" ? fitment.canonicalBoltPatterns : []
      const oemTireSizes =
        fitment && !("error" in fitment) ? (fitment.oemTireSizes ?? []) : []
      router.push(fitmentDestinationUrl({ countryCode, target, boltPatterns, oemTireSizes }))
```

   (Remove the now-unused `fitParam` variable if it is no longer referenced. The `toast(...)` "no fitment data" branch stays — it fires when wheels are the target and there's no bolt pattern; it is still accurate.)
4. Render the toggle in the form, directly above the submit `<Button>`:

```tsx
      <div className="mt-3">
        <DestinationToggle value={target} onChange={setTarget} />
      </div>
      <Button type="submit" disabled={!canSubmit} className="w-full mt-2">
```

- [ ] **Step 3: Wire the garage pane**

In `garage-pane.tsx`:
1. Add imports: `import DestinationToggle from "./destination-toggle"` and `import { fitmentDestinationUrl, FitmentTarget } from "./destination-url"`.
2. Add state: `const [target, setTarget] = useState<FitmentTarget>("wheels")`.
3. In `selectVehicle`, the vehicle may already carry `oemTireSizes` (saved via the YMM flow since WB-063). Seed it, and when the pane re-resolves fitment for an older vehicle, persist + use the fresh OEM sizes too. Concretely:
   - Near the top of `selectVehicle`, after `let patterns = v.canonicalBoltPatterns ?? []`, add: `let oemTireSizes = v.oemTireSizes ?? []`.
   - Inside the re-resolution block, the existing `update(id, { … })` call does NOT currently write `oemTireSizes`. Add `oemTireSizes: fitment.oemTireSizes,` to that `update(...)` object (mirroring the YMM pane), and after the existing `patterns = fitment.canonicalBoltPatterns` assignment, also set `oemTireSizes = fitment.oemTireSizes ?? []`.
   - Replace the final `const fitParam = …; onClose(); router.push(\`/${countryCode}/store${fitParam}\`)` with:
     ```ts
     onClose()
     router.push(fitmentDestinationUrl({ countryCode, target, boltPatterns: patterns, oemTireSizes }))
     ```
4. Render the toggle above the vehicles list (inside the returned list `return`, as the first child of the outer `<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>`):

```tsx
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="pb-1"><DestinationToggle value={target} onChange={setTarget} /></div>
      {vehicles.map((v) => {
```

   (Do NOT add the toggle to the empty-vehicles early return — it's only meaningful when there are vehicles to select.)

- [ ] **Step 4: Type-check + build sanity**

Run: `cd storefront && npx tsc --noEmit 2>&1 | grep -iE "destination-toggle|ymm-pane|garage-pane|destination-url" || echo "no new errors in touched files"` → the echo.
Run: `cd storefront && npx next build 2>&1 | grep -E "Compiled|Failed to compile" | head -3` → compiles (same pre-existing collections/categories caveat as Task 3 — not a regression from this task).

- [ ] **Step 5: Commit**

```bash
git add storefront/src/modules/search/components/search-drawer/find-by-vehicle/destination-toggle.tsx storefront/src/modules/search/components/search-drawer/find-by-vehicle/ymm-pane.tsx storefront/src/modules/search/components/search-drawer/find-by-vehicle/garage-pane.tsx
git commit -m "feat(search): Wheels|Tires destination toggle routes a vehicle pick to /tires (WB-066)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Docs + full gate

**Files:**
- Modify: `docs/future/BACKLOG.md` (add WB-065 + WB-066, done)
- Modify: `docs/STATUS.md` (Fitment + PDP pillars + Active work + Last verified)
- Move: the spec + this plan from `docs/in-progress/` → `docs/done/`

- [ ] **Step 1: Full gates**

Run: `cd backend && npx -y pnpm@9.10.0 test:fitment 2>&1 | tail -4` → PASS (record count; the new reverse-tire-fitment suite is included).
Run: `cd storefront && npx vitest run 2>&1 | tail -4` → PASS (record count; includes the new destination-url suite).
Run: `cd storefront && npx tsc --noEmit 2>&1 | grep -c "error TS"` → confirm the count equals the pre-existing baseline (no new).

- [ ] **Step 2: Backlog**

Add two `### WB-NNN` items to `docs/future/BACKLOG.md` (status `done`), following the existing item template (status/area/evidence/problem/fix/verify/notes/refs):
- **WB-065 · Tire PDP has no reverse "confirmed models" list** — done. Fix: reverse over the cached `wheel_size_fitment` rows matching OEM tire size (mirrors WB-009); `buildReverseTireFitment` + `reverseTireFitment` + `GET /store/fitment/by-tire-product` + `TireFitment` PDP section; pure cache read, no API/migration. Evidence: the files from Tasks 1–3. Refs → the done/ spec + plan.
- **WB-066 · Vehicle-picker funnel routes only to wheels** — done. Fix: a Wheels|Tires destination toggle in the YMM + garage panes + a pure `fitmentDestinationUrl` builder; tires land on `/tires?fit=<oemTireSizes>`. Evidence: the files from Tasks 4–5. Refs → the done/ spec + plan.

- [ ] **Step 3: STATUS**

Update `docs/STATUS.md`: in the Fitment pillar note that tires now have BOTH forward (WB-063) and reverse (WB-065) fitment; in the PDP pillar note the tire PDP gained the "confirmed models" section; add a compact Active-work entry for WB-065/066; set "Last verified" to 2026-07-03.

- [ ] **Step 4: Move spec + plan to done/**

```bash
git mv docs/in-progress/specs/2026-07-03-tire-fitment-reach-design.md docs/done/specs/2026-07-03-tire-fitment-reach-design.md
git mv docs/in-progress/plans/2026-07-03-tire-fitment-reach.md docs/done/plans/2026-07-03-tire-fitment-reach.md
```

Then update the WB-065/066 backlog `refs:` links to the `docs/done/…` paths (so no stale `in-progress` refs remain).

- [ ] **Step 5: doc-review + commit**

Run the `/doc-review` fast checks (banned-token scan, moved-file link resolution, evidence-path existence). Fix any drift. Then:

```bash
git add docs/
git commit -m "docs: tire fitment reach landed (WB-065 reverse + WB-066 funnel)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review notes (for the executor)

- **Spec coverage:** WB-065 backend §Architecture (type/helper/service/route) → Task 1; storefront data (type/loader/data-layer) → Task 2; PDP section → Task 3. WB-066 builder → Task 4; toggle + wiring → Task 5. Docs → Task 6. Every spec architecture item maps to a task.
- **Type consistency:** backend `ReverseTireFitmentVehicle { …, size }` (Task 1) ↔ storefront `TireFitmentEntry { …, size }` (Task 2) — same field names; the route returns `{ vehicles }` (Task 1) and `getFitmentByTireProduct` reads `body.vehicles` (Task 2). `FitmentTarget` is defined once in `destination-url.ts` (Task 4) and imported by the toggle (Task 5). `tireFitsVehicle` returns a boolean (Task 3 uses it as such, no `.fits`/`.reasons`).
- **Reuse (DRY):** `extractVehicleIdentity` + `extractOemTireSizes` are imported, not re-implemented; the tire fitment section + toggle mirror existing components; `fitmentDestinationUrl` centralizes both panes' routing.
- **Out of scope (spec):** aftermarket/plus-size (OEM-only via `extractOemTireSizes`); a "submit your build" CTA (the dead `<a href="#">` is dropped, not reimplemented); changing the wheel funnel default; hero-tile/popular-chip tire paths; toggle persistence.
- **Ordering:** T1→T2→T3 (reverse, linear on the type/route contract); T4→T5 (funnel, builder before wiring); T6 docs last. T4 is independent of T1–T3 and could run anytime, but the linear order keeps the ledger simple.
