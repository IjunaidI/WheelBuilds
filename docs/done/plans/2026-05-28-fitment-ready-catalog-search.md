# Fitment-Ready Catalog + Faceted Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the mock Wheel Builds storefront (Discovery + PDP + search) to the real Medusa catalog and stand up faceted Meilisearch search for wheels, with the index built deliberately as the substrate for spec-match vehicle fitment.

**Architecture:** A Meilisearch product index — populated by a `transformer` that flattens each wheel product's variants into facet/fitment arrays (incl. a canonical bolt-pattern key and filterable center bore) — powers Discovery browse/filter/search. PDP reads live price/stock from the Medusa Store API directly. Search text + YMM/garage flows all land on `/store` (the single results surface).

**Tech Stack:** MedusaJS 2.13.6 backend (`@rokmohar/medusa-plugin-meilisearch` 1.3.5, jest), Next.js 15 / React 19 storefront, Meilisearch, `meilisearch` JS client.

**Spec:** [`docs/done/specs/2026-05-28-fitment-ready-catalog-search-design.md`](../specs/2026-05-28-fitment-ready-catalog-search-design.md)

**Conventions reminder (from CLAUDE.md):**
- `pnpm` may not be on PATH on Windows. Use `npx -y pnpm@9.10.0 <cmd>` for installs, or `backend/node_modules/.bin/medusa.CMD` for the CLI.
- After editing `medusa-config.js`, delete `backend/.medusa/server` before restart (stale-config trap).
- Backend tsconfig paths: `import ... from 'lib/...'` resolves to `src/...`. No `@/` prefix in backend.
- Storefront aliases: `@lib/*`, `@modules/*`. Storefront has **no unit-test runner** — storefront tasks verify by `npx tsc --noEmit`, `pnpm build:next`, and manual checks against the live dev DB. Backend pure logic is jest-tested via `pnpm test:sync`.
- Run all backend commands from `backend/`, storefront from `storefront/`.

---

## File Structure

**Backend (new):**
- `backend/src/modules/vendor-sync/search/bolt-pattern-canonical.ts` — pure: vendor bolt-pattern string → canonical `["{count}x{pcd_mm}"]` array. The make-or-break fitment key.
- `backend/src/modules/vendor-sync/search/normalize-finish.ts` — pure: free-text vendor finish → `"black" | "bronze" | "silver"`.
- `backend/src/modules/vendor-sync/search/build-search-document.ts` — pure: Medusa product (+variants) → flat indexed document.
- `backend/src/modules/vendor-sync/__tests__/bolt-pattern-canonical.test.ts`
- `backend/src/modules/vendor-sync/__tests__/normalize-finish.test.ts`
- `backend/src/modules/vendor-sync/__tests__/build-search-document.test.ts`

**Backend (modify):**
- `backend/medusa-config.js` — Meilisearch plugin block: widen `fields`, set index settings, wire the `transformer`.

**Storefront (new):**
- `storefront/src/lib/meilisearch.ts` — server-side raw `meilisearch` client + index name.

**Storefront (modify):**
- `storefront/src/modules/discovery/data/types.ts` — add `vehicleConstraint?` to `DiscoveryQuery`.
- `storefront/src/modules/discovery/data/get-products.ts` — real Meilisearch query + facet mapping.
- `storefront/src/modules/product-detail/data/get-product.ts` — real Medusa fetch + mapping.
- `storefront/src/app/[countryCode]/(main)/products/[handle]/page.tsx` — restore `notFound()`.
- `storefront/src/modules/search/actions.ts` + the YMM/garage panes — route to `/store?q=`.

**Storefront (delete, end of plan):**
- `storefront/src/modules/discovery/data/mock-products.ts`, `mock-facets.ts`
- `storefront/src/modules/product-detail/data/mock-detail.ts`
- `storefront/src/app/[countryCode]/(main)/results/` (legacy results route)
- `storefront/src/modules/store/`, `storefront/src/modules/products/` (orphaned reference dirs — verify no imports first)

---

## Phase 1 — Backend: fitment-ready Meilisearch index

### Task 1: Canonical bolt-pattern normalizer

The single highest-risk unit: this string must equal wheel-size.com's format in Spec 2, or fitment returns nothing. Canonical form is `"{count}x{pcd_mm}"` where pcd is millimetres (inches × 25.4), trailing `.0` trimmed, snapped to the nearest standard PCD. Dual-drilled patterns (`6X135/5.5`) yield multiple entries.

**Files:**
- Create: `backend/src/modules/vendor-sync/search/bolt-pattern-canonical.ts`
- Test: `backend/src/modules/vendor-sync/__tests__/bolt-pattern-canonical.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/src/modules/vendor-sync/__tests__/bolt-pattern-canonical.test.ts`:

```typescript
import { canonicalBoltPatterns } from "../search/bolt-pattern-canonical"

describe("canonicalBoltPatterns", () => {
  it("normalizes a millimetre pattern", () => {
    expect(canonicalBoltPatterns("5X120")).toEqual(["5x120"])
  })

  it("converts an inch pattern to millimetres", () => {
    // 5.0 in × 25.4 = 127.0 mm
    expect(canonicalBoltPatterns("5X5.0")).toEqual(["5x127"])
  })

  it("preserves a one-decimal standard PCD", () => {
    expect(canonicalBoltPatterns("5X114.3")).toEqual(["5x114.3"])
  })

  it("snaps a near-standard value to the standard PCD", () => {
    // 4.5 in = 114.3 mm exactly; 4.49 in = 114.05 → snaps to 114.3
    expect(canonicalBoltPatterns("5X4.49")).toEqual(["5x114.3"])
  })

  it("splits a dual-drilled pattern, sharing the lug count", () => {
    // 6 lug, 135 mm and 5.5 in (139.7 mm)
    expect(canonicalBoltPatterns("6X135/5.5")).toEqual(["6x135", "6x139.7"])
  })

  it("returns an empty array for unparseable input", () => {
    expect(canonicalBoltPatterns("")).toEqual([])
    expect(canonicalBoltPatterns("N/A")).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx -y pnpm@9.10.0 exec jest src/modules/vendor-sync/__tests__/bolt-pattern-canonical.test.ts`
Expected: FAIL — `Cannot find module '../search/bolt-pattern-canonical'`.

- [ ] **Step 3: Write the implementation**

Create `backend/src/modules/vendor-sync/search/bolt-pattern-canonical.ts`:

```typescript
/**
 * Convert a vendor bolt-pattern string into canonical PCD form(s):
 *   "{lugCount}x{pcdMillimetres}"  e.g. "5x114.3", "6x139.7"
 *
 * - Values < 20 are treated as inches and converted to mm (×25.4); values
 *   >= 20 are already mm. (Mirrors parse-helpers' inch/mm heuristic.)
 * - The mm value is rounded to one decimal and snapped to the nearest
 *   standard PCD when within 1.0 mm.
 * - Dual-drilled patterns ("6X135/5.5") share the lug count and yield one
 *   entry per circle.
 * - Unparseable input yields an empty array.
 *
 * This canonical form MUST match the format used on the wheel-size.com side
 * in Spec 2 — it is the fitment join key.
 */

const STANDARD_PCDS = [
  98, 100, 105, 108, 110, 112, 114.3, 115, 118, 120, 120.65, 127, 130, 135,
  139.7, 150, 160, 165.1, 170, 205,
]

function toMillimetres(raw: number): number {
  return raw < 20 ? raw * 25.4 : raw
}

function snap(mm: number): number {
  const rounded = Math.round(mm * 10) / 10
  let best = rounded
  let bestDelta = Infinity
  for (const std of STANDARD_PCDS) {
    const delta = Math.abs(std - rounded)
    if (delta < bestDelta) {
      bestDelta = delta
      best = std
    }
  }
  return bestDelta <= 1.0 ? best : rounded
}

function format(count: number, mm: number): string {
  // Trim a trailing ".0": 127.0 → "127", keep "114.3".
  const pcd = Number.isInteger(mm) ? String(mm) : String(mm)
  return `${count}x${pcd}`
}

export function canonicalBoltPatterns(input: string): string[] {
  if (!input) return []
  const cleaned = input.trim().toUpperCase()

  // Expect "{count}X{circle}[/{circle}...]" — e.g. "6X135/5.5".
  const match = cleaned.match(/^(\d+)\s*X\s*(.+)$/)
  if (!match) return []

  const count = parseInt(match[1], 10)
  if (!Number.isFinite(count) || count <= 0) return []

  const circles = match[2].split("/").map((s) => parseFloat(s.trim()))
  const out: string[] = []
  for (const c of circles) {
    if (!Number.isFinite(c) || c <= 0) continue
    const mm = snap(toMillimetres(c))
    out.push(format(count, mm))
  }
  return out
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx -y pnpm@9.10.0 exec jest src/modules/vendor-sync/__tests__/bolt-pattern-canonical.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
cd backend && git add src/modules/vendor-sync/search/bolt-pattern-canonical.ts src/modules/vendor-sync/__tests__/bolt-pattern-canonical.test.ts && git commit -m "feat(search): canonical bolt-pattern normalizer for fitment index"
```

---

### Task 2: Finish normalizer

Maps the vendor's free-text finish (`"Gloss Black"`, `"Machined"`, …) to the storefront's 3-value `Finish` enum (`black | bronze | silver`), defaulting to `black`. Spec §5 G1.

**Files:**
- Create: `backend/src/modules/vendor-sync/search/normalize-finish.ts`
- Test: `backend/src/modules/vendor-sync/__tests__/normalize-finish.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/src/modules/vendor-sync/__tests__/normalize-finish.test.ts`:

```typescript
import { normalizeFinish } from "../search/normalize-finish"

describe("normalizeFinish", () => {
  it("maps black-family finishes to black", () => {
    expect(normalizeFinish("Gloss Black")).toBe("black")
    expect(normalizeFinish("Matte Black")).toBe("black")
    expect(normalizeFinish("Satin Black Milled")).toBe("black")
  })

  it("maps bronze/gold/copper finishes to bronze", () => {
    expect(normalizeFinish("Satin Bronze")).toBe("bronze")
    expect(normalizeFinish("Brushed Gold")).toBe("bronze")
    expect(normalizeFinish("Copper")).toBe("bronze")
  })

  it("maps silver/chrome/machined finishes to silver", () => {
    expect(normalizeFinish("Brushed Silver")).toBe("silver")
    expect(normalizeFinish("Chrome")).toBe("silver")
    expect(normalizeFinish("Machined")).toBe("silver")
    expect(normalizeFinish("Gunmetal")).toBe("silver")
  })

  it("defaults unknown or empty finishes to black", () => {
    expect(normalizeFinish(null)).toBe("black")
    expect(normalizeFinish("")).toBe("black")
    expect(normalizeFinish("Rainbow Glitter")).toBe("black")
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx -y pnpm@9.10.0 exec jest src/modules/vendor-sync/__tests__/normalize-finish.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `backend/src/modules/vendor-sync/search/normalize-finish.ts`:

```typescript
/**
 * Collapse a free-text vendor finish into the storefront's 3-bucket Finish
 * enum (black | bronze | silver). Keyword precedence: bronze/gold/copper →
 * bronze; silver/chrome/machined/gunmetal/grey → silver; everything else
 * (incl. black and unknowns) → black. The raw vendor string is kept in
 * product metadata elsewhere; this is only for the swatch + facet bucket.
 */

export type Finish = "black" | "bronze" | "silver"

const BRONZE = ["bronze", "gold", "copper", "brass"]
const SILVER = [
  "silver",
  "chrome",
  "machined",
  "polished",
  "gunmetal",
  "grey",
  "gray",
  "titanium",
  "graphite",
]

export function normalizeFinish(raw: string | null | undefined): Finish {
  const s = (raw ?? "").toLowerCase()
  if (!s) return "black"
  if (BRONZE.some((k) => s.includes(k))) return "bronze"
  if (SILVER.some((k) => s.includes(k))) return "silver"
  return "black"
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx -y pnpm@9.10.0 exec jest src/modules/vendor-sync/__tests__/normalize-finish.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd backend && git add src/modules/vendor-sync/search/normalize-finish.ts src/modules/vendor-sync/__tests__/normalize-finish.test.ts && git commit -m "feat(search): vendor-finish normalizer to storefront enum"
```

---

### Task 3: Search-document builder (the transformer core)

A pure function turning one Medusa wheel product (with variants + metadata + prices) into the flat document we index. Keeping it pure makes it jest-testable; `medusa-config.js` will wrap it in the plugin `transformer` (Task 4).

**Files:**
- Create: `backend/src/modules/vendor-sync/search/build-search-document.ts`
- Test: `backend/src/modules/vendor-sync/__tests__/build-search-document.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/src/modules/vendor-sync/__tests__/build-search-document.test.ts`:

```typescript
import { buildSearchDocument } from "../search/build-search-document"

const product = {
  id: "prod_1",
  handle: "teraflex-nomad-matte-black",
  title: "Teraflex Nomad Matte Black",
  thumbnail: "https://cdn.example.com/x.jpg",
  created_at: "2026-05-01T00:00:00.000Z",
  metadata: { product_type: "wheel", brand: "Teraflex", finish: "Matte Black" },
  variants: [
    {
      sku: "W-1",
      prices: [{ amount: 36999, currency_code: "usd" }],
      metadata: {
        wheel_diameter_in: 17,
        wheel_width_in: 8.5,
        bolt_pattern_raw: "5X5.0",
        offset_mm: -12,
        center_bore_mm: 71.5,
      },
    },
    {
      sku: "W-2",
      prices: [{ amount: 41999, currency_code: "usd" }],
      metadata: {
        wheel_diameter_in: 18,
        wheel_width_in: 9,
        bolt_pattern_raw: "5X5.0",
        offset_mm: 0,
        center_bore_mm: 71.5,
      },
    },
  ],
}

describe("buildSearchDocument", () => {
  it("flattens variants into facet + fitment arrays", () => {
    const doc = buildSearchDocument(product as any)
    expect(doc).toMatchObject({
      id: "prod_1",
      handle: "teraflex-nomad-matte-black",
      brand: "Teraflex",
      finish: "black",
      product_type: "wheel",
      diameters: [17, 18],
      widths: [8.5, 9],
      bolt_patterns: ["5X5.0"],
      bolt_patterns_canonical: ["5x127"],
      offsets: [-12, 0],
      center_bores: [71.5],
      price_min: 36999,
      price_max: 41999,
    })
  })

  it("returns null for non-wheel products (excluded from this index cut)", () => {
    const tire = { ...product, metadata: { product_type: "tire", brand: "X" } }
    expect(buildSearchDocument(tire as any)).toBeNull()
  })

  it("survives missing variant metadata with safe defaults", () => {
    const sparse = {
      id: "p2",
      handle: "h2",
      title: "t2",
      metadata: { product_type: "wheel", brand: "B" },
      variants: [{ sku: "s", prices: [], metadata: {} }],
    }
    const doc = buildSearchDocument(sparse as any)
    expect(doc).toMatchObject({
      id: "p2",
      brand: "B",
      finish: "black",
      diameters: [],
      bolt_patterns_canonical: [],
      price_min: 0,
      price_max: 0,
    })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx -y pnpm@9.10.0 exec jest src/modules/vendor-sync/__tests__/build-search-document.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `backend/src/modules/vendor-sync/search/build-search-document.ts`:

```typescript
import { canonicalBoltPatterns } from "./bolt-pattern-canonical"
import { normalizeFinish } from "./normalize-finish"

/** Minimal shape we read off a Medusa product in the Meilisearch transformer. */
type IndexableVariant = {
  sku?: string
  prices?: { amount: number; currency_code: string }[]
  metadata?: Record<string, unknown> | null
}
type IndexableProduct = {
  id: string
  handle: string
  title: string
  description?: string
  thumbnail?: string | null
  created_at?: string
  metadata?: Record<string, unknown> | null
  variants?: IndexableVariant[]
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null

const uniqSorted = (xs: number[]): number[] =>
  Array.from(new Set(xs)).sort((a, b) => a - b)

const uniqStr = (xs: string[]): string[] => Array.from(new Set(xs))

/**
 * Medusa wheel product → flat Meilisearch document. Returns null for
 * non-wheel products so the transformer can skip them (tires are a later
 * spec). All consumers of the index read this shape.
 */
export function buildSearchDocument(product: IndexableProduct) {
  const meta = product.metadata ?? {}
  if (meta.product_type !== "wheel") return null

  const variants = product.variants ?? []

  const diameters: number[] = []
  const widths: number[] = []
  const offsets: number[] = []
  const centerBores: number[] = []
  const boltRaw: string[] = []
  const boltCanonical: string[] = []
  const usdPrices: number[] = []
  const skus: string[] = []

  for (const v of variants) {
    if (typeof v.sku === "string" && v.sku) skus.push(v.sku)
    const vm = v.metadata ?? {}
    const d = num(vm.wheel_diameter_in)
    if (d !== null) diameters.push(d)
    const w = num(vm.wheel_width_in)
    if (w !== null) widths.push(w)
    const o = num(vm.offset_mm)
    if (o !== null) offsets.push(o)
    const cb = num(vm.center_bore_mm)
    if (cb !== null) centerBores.push(cb)
    const bp = typeof vm.bolt_pattern_raw === "string" ? vm.bolt_pattern_raw : ""
    if (bp) {
      boltRaw.push(bp)
      boltCanonical.push(...canonicalBoltPatterns(bp))
    }
    for (const p of v.prices ?? []) {
      if (p.currency_code === "usd" && Number.isFinite(p.amount)) {
        usdPrices.push(p.amount)
      }
    }
  }

  return {
    id: product.id,
    handle: product.handle,
    title: product.title,
    description: product.description ?? "",
    thumbnail: product.thumbnail ?? null,
    created_at: product.created_at ?? null,
    product_type: "wheel",
    brand: typeof meta.brand === "string" ? meta.brand : "",
    finish: normalizeFinish(meta.finish as string | null | undefined),
    skus: uniqStr(skus),
    diameters: uniqSorted(diameters),
    widths: uniqSorted(widths),
    offsets: uniqSorted(offsets),
    center_bores: uniqSorted(centerBores),
    bolt_patterns: uniqStr(boltRaw),
    bolt_patterns_canonical: uniqStr(boltCanonical),
    price_min: usdPrices.length ? Math.min(...usdPrices) : 0,
    price_max: usdPrices.length ? Math.max(...usdPrices) : 0,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx -y pnpm@9.10.0 exec jest src/modules/vendor-sync/__tests__/build-search-document.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full vendor-sync suite (no regressions)**

Run: `cd backend && npx -y pnpm@9.10.0 run test:sync`
Expected: PASS (all existing tests + the 3 new files).

- [ ] **Step 6: Commit**

```bash
cd backend && git add src/modules/vendor-sync/search/build-search-document.ts src/modules/vendor-sync/__tests__/build-search-document.test.ts && git commit -m "feat(search): build flat Meilisearch document from wheel product"
```

---

### Task 4: Wire the transformer + index settings into medusa-config.js, reindex, verify

**Files:**
- Modify: `backend/medusa-config.js` (the `@rokmohar/medusa-plugin-meilisearch` block, ~lines 165-186)

- [ ] **Step 1: Replace the plugin `products` settings block**

In `backend/medusa-config.js`, add this require near the top of the file (with the other imports/consts):

```javascript
const { buildSearchDocument } = require('./src/modules/vendor-sync/search/build-search-document')
```

Replace the existing `products: { ... }` settings object inside the Meilisearch plugin options with:

```javascript
products: {
  type: 'products',
  enabled: true,
  // Widened so the transformer receives variants + metadata + prices.
  fields: [
    'id', 'title', 'description', 'handle', 'thumbnail', 'created_at',
    'metadata',
    'variants.sku', 'variants.metadata',
    'variants.prices.amount', 'variants.prices.currency_code',
  ],
  indexSettings: {
    searchableAttributes: ['title', 'brand', 'skus'],
    displayedAttributes: [
      'id', 'handle', 'title', 'thumbnail', 'brand', 'finish', 'skus',
      'diameters', 'widths', 'offsets', 'bolt_patterns',
      'bolt_patterns_canonical', 'center_bores',
      'price_min', 'price_max', 'created_at', 'product_type',
    ],
    filterableAttributes: [
      'brand', 'finish', 'diameters', 'widths', 'bolt_patterns',
      'bolt_patterns_canonical', 'offsets', 'center_bores',
      'price_min', 'price_max', 'product_type',
    ],
    sortableAttributes: ['price_min', 'created_at', 'title'],
  },
  primaryKey: 'id',
  // Skip non-wheel products (returns null) — tires are a later spec.
  transformer: (product) => buildSearchDocument(product),
},
```

> Note: if the plugin filters out documents where the transformer returns `null` is not supported, fall back to returning `{ id: product.id, product_type: 'tire', _skip: true }` and add `product_type` to a filter excluding tires at query time. Verify behavior in Step 4.

- [ ] **Step 2: Clear the stale built config**

Run: `cd backend && rm -rf .medusa/server`
(PowerShell: `Remove-Item -Recurse -Force .medusa/server`)
Expected: no output; directory removed.

- [ ] **Step 3: Start the backend against the dev DB**

Ensure `.env` has `MEILISEARCH_HOST`, `MEILISEARCH_ADMIN_KEY`, `VENDOR_WHEELPROS_WHEELS_ENABLED=true`, and `DATABASE_URL` pointing at the dev DB with synced wheels.
Run: `cd backend && npx -y pnpm@9.10.0 run dev`
Expected: server boots without throwing on the `require(...)` of the transformer; logs show the Meilisearch plugin initializing.

- [ ] **Step 4: Trigger a reindex and inspect one document**

Existing products only re-index on write. Force a full reindex (pick whichever the plugin/version supports; the first that works):
- Re-save a product from the admin (`/app`), OR
- Run a vendor-sync apply of the latest run: `npx -y pnpm@9.10.0 run vendor-sync:apply <run-id>` (re-emits product events), OR
- Hit the plugin's reindex/hooks endpoint if present.

Then inspect a document directly from Meilisearch:

Run (replace host/key):
```bash
curl -s -H "Authorization: Bearer $MEILISEARCH_ADMIN_KEY" "$MEILISEARCH_HOST/indexes/products/search" -H 'Content-Type: application/json' -d '{"q":"","limit":1}' | jq '.hits[0]'
```
Expected: a hit with populated `brand`, `finish`, `diameters` (array), `bolt_patterns_canonical` (array like `["5x127"]`), `center_bores`, `price_min`/`price_max` > 0. If `price_min` is 0 or arrays are empty, the plugin isn't passing `variants.prices`/`variants.metadata` — adjust the `fields` list in Step 1 (try `'variants.calculated_price'` or `'*variants.prices'`) and reindex again.

- [ ] **Step 5: Confirm index settings applied**

Run:
```bash
curl -s -H "Authorization: Bearer $MEILISEARCH_ADMIN_KEY" "$MEILISEARCH_HOST/indexes/products/settings" | jq '{filterableAttributes, sortableAttributes}'
```
Expected: `filterableAttributes` includes `brand, finish, diameters, bolt_patterns_canonical, center_bores, price_min`; `sortableAttributes` includes `price_min, created_at`.

- [ ] **Step 6: Commit**

```bash
cd backend && git add medusa-config.js && git commit -m "feat(search): index wheels with facet + fitment fields via transformer"
```

---

## Phase 2 — Storefront: Discovery on real Meilisearch

### Task 5: Server-side Meilisearch client

The storefront only ships `@meilisearch/instant-meilisearch` (an InstantSearch adapter). The Discovery adapter runs in a Server Component and needs `filter`/`facets`/`sort` + `facetDistribution`, so add the raw `meilisearch` client.

**Files:**
- Create: `storefront/src/lib/meilisearch.ts`
- Modify: `storefront/package.json` (via install)

- [ ] **Step 1: Install the client**

Run: `cd storefront && npx -y pnpm@9.10.0 add meilisearch`
Expected: `meilisearch` added to `dependencies`.

- [ ] **Step 2: Create the client module**

Create `storefront/src/lib/meilisearch.ts`:

```typescript
import { MeiliSearch } from "meilisearch"

/**
 * Server-side Meilisearch client for the Discovery adapter. Reuses the same
 * env the InstantSearch client uses (search-client.ts). Distinct from that
 * adapter, which exists only for any client-side InstantSearch widgets.
 */
const host =
  process.env.NEXT_PUBLIC_SEARCH_ENDPOINT || "http://127.0.0.1:7700"
const apiKey = process.env.NEXT_PUBLIC_SEARCH_API_KEY || "test_key"

export const meili = new MeiliSearch({ host, apiKey })

export const PRODUCTS_INDEX =
  process.env.NEXT_PUBLIC_INDEX_NAME || "products"
```

- [ ] **Step 3: Typecheck**

Run: `cd storefront && npx tsc --noEmit`
Expected: no NEW errors in `lib/meilisearch.ts` (pre-existing errors listed in storefront/CLAUDE.md are unrelated).

- [ ] **Step 4: Commit**

```bash
cd storefront && git add package.json pnpm-lock.yaml src/lib/meilisearch.ts && git commit -m "feat(storefront): add server-side meilisearch client"
```

---

### Task 6: Rewrite the Discovery adapter

Replace the mock body of `getDiscoveryProducts` with a real Meilisearch query: a hits query for the page + disjunctive facet queries (each facet counted with the *other* filters applied), batched via `multiSearch`. Add the inert `vehicleConstraint` seam for Spec 2. Keep all exported types and `parseQueryFromSearchParams` stable.

**Files:**
- Modify: `storefront/src/modules/discovery/data/types.ts` (add `vehicleConstraint?`)
- Modify: `storefront/src/modules/discovery/data/get-products.ts` (full rewrite of the data-fetching body)

- [ ] **Step 1: Add the fitment seam to the query type**

In `storefront/src/modules/discovery/data/types.ts`, change the `DiscoveryQuery` type to add an optional vehicle constraint (Spec 2 fills it; unused now):

```typescript
export type DiscoveryQuery = {
  filters: DiscoveryFilters
  sort: SortOption
  page: number
  /** Free-text search term (from the search drawer). */
  q?: string
  /**
   * Spec 2 (fitment) seam: extra Meilisearch filter clauses derived from the
   * active vehicle's wheel-size.com spec. Empty/undefined in this spec.
   */
  vehicleConstraint?: string[]
}
```

- [ ] **Step 2: Rewrite `get-products.ts`**

Replace the entire contents of `storefront/src/modules/discovery/data/get-products.ts` with:

```typescript
/**
 * Discovery data adapter — real Meilisearch wiring.
 *
 * Powers everything in `modules/discovery/components/*`. Reads the products
 * index built by the backend transformer (see
 * backend/src/modules/vendor-sync/search/build-search-document.ts).
 *
 * - Hits + total: one filtered search (the current page).
 * - Facet counts: disjunctive — each facet dimension is counted with the
 *   OTHER filters applied (not its own), via a multiSearch batch.
 * - `vehicleConstraint` (Spec 2) is appended to every filter when present;
 *   it is always absent in this spec.
 *
 * Types stay stable — no consumer changes.
 */

import { meili, PRODUCTS_INDEX } from "@lib/meilisearch"
import {
  DEFAULT_PAGE_SIZE,
  DiscoveryFilters,
  DiscoveryProduct,
  DiscoveryQuery,
  DiscoveryResult,
  EMPTY_FILTERS,
  FacetCounts,
  SortOption,
} from "./types"
import { Finish } from "@modules/common/components/wheel"

const FACET_FIELDS = ["brand", "diameters", "bolt_patterns", "finish"] as const

const NEW_DAYS = 30
const NEW_MS = NEW_DAYS * 24 * 60 * 60 * 1000

/** Escape a value for a Meilisearch filter string literal. */
const lit = (v: string | number) =>
  typeof v === "number" ? String(v) : `"${String(v).replace(/"/g, '\\"')}"`

/**
 * Build the array of filter clauses for a set of DiscoveryFilters, optionally
 * skipping one dimension (used for disjunctive facet counting) and always
 * scoping to wheels + any vehicle constraint.
 */
function buildFilters(
  f: DiscoveryFilters,
  q: DiscoveryQuery,
  skip?: keyof DiscoveryFilters
): string[] {
  const clauses: string[] = ['product_type = "wheel"']

  if (skip !== "brands" && f.brands.length)
    clauses.push(`brand IN [${f.brands.map(lit).join(", ")}]`)
  if (skip !== "diameters" && f.diameters.length)
    clauses.push(`diameters IN [${f.diameters.map(lit).join(", ")}]`)
  if (skip !== "boltPatterns" && f.boltPatterns.length)
    clauses.push(`bolt_patterns IN [${f.boltPatterns.map(lit).join(", ")}]`)
  if (skip !== "finishes" && f.finishes.length)
    clauses.push(`finish IN [${f.finishes.map(lit).join(", ")}]`)
  if (f.priceMinCents != null) clauses.push(`price_min >= ${f.priceMinCents}`)
  if (f.priceMaxCents != null) clauses.push(`price_min <= ${f.priceMaxCents}`)

  if (q.vehicleConstraint?.length) clauses.push(...q.vehicleConstraint)

  return clauses
}

function sortExpr(sort: SortOption): string[] {
  switch (sort) {
    case "price-asc":
      return ["price_min:asc"]
    case "price-desc":
      return ["price_min:desc"]
    case "newest":
      return ["created_at:desc"]
    case "name-asc":
      return ["title:asc"]
    case "relevance":
    default:
      return []
  }
}

type Hit = {
  id: string
  handle: string
  title: string
  brand: string
  finish: Finish
  thumbnail: string | null
  diameters: number[]
  widths: number[]
  bolt_patterns: string[]
  price_min: number
  price_max: number
  created_at: string | null
}

function hitToProduct(h: Hit): DiscoveryProduct {
  const createdMs = h.created_at ? Date.parse(h.created_at) : NaN
  return {
    id: h.id,
    handle: h.handle,
    name: h.title,
    brand: h.brand,
    priceCents: h.price_min,
    finish: (h.finish as Finish) ?? "black",
    diameter: h.diameters?.[0] ?? 0,
    width: h.widths?.[0] ?? 0,
    boltPattern: h.bolt_patterns?.[0] ?? "",
    categories: [], // Spec §5 G2: no backend source yet.
    isNew: Number.isFinite(createdMs) ? Date.now() - createdMs < NEW_MS : false,
  }
}

function emptyResult(pageSize: number): DiscoveryResult {
  return {
    products: [],
    totalCount: 0,
    pageSize,
    facets: {
      categories: {},
      brands: {},
      diameters: {},
      boltPatterns: {},
      finishes: {},
    },
  }
}

export async function getDiscoveryProducts(
  query: DiscoveryQuery
): Promise<DiscoveryResult> {
  const pageSize = DEFAULT_PAGE_SIZE
  const offset = (query.page - 1) * pageSize

  // One hits query + one facet query per dimension (disjunctive), batched.
  const facetQueryByDim: Record<string, keyof DiscoveryFilters> = {
    brand: "brands",
    diameters: "diameters",
    bolt_patterns: "boltPatterns",
    finish: "finishes",
  }

  try {
    const { results } = await meili.multiSearch({
      queries: [
        {
          indexUid: PRODUCTS_INDEX,
          q: query.q ?? "",
          filter: buildFilters(query.filters, query).join(" AND "),
          sort: sortExpr(query.sort),
          limit: pageSize,
          offset,
        },
        ...FACET_FIELDS.map((field) => ({
          indexUid: PRODUCTS_INDEX,
          q: query.q ?? "",
          filter: buildFilters(
            query.filters,
            query,
            facetQueryByDim[field]
          ).join(" AND "),
          facets: [field],
          limit: 0,
        })),
      ],
    })

    const [hitsRes, ...facetRes] = results
    // facetRes is in the same order as FACET_FIELDS.
    const facetByField: Record<string, Record<string, number>> = {}
    FACET_FIELDS.forEach((field, i) => {
      facetByField[field] =
        (facetRes[i] as any)?.facetDistribution?.[field] ?? {}
    })

    const facets: FacetCounts = {
      categories: {}, // Spec §5 G2: no backend source yet.
      brands: facetByField["brand"],
      diameters: facetByField["diameters"],
      boltPatterns: facetByField["bolt_patterns"],
      finishes: facetByField["finish"],
    }

    return {
      products: (hitsRes.hits as Hit[]).map(hitToProduct),
      totalCount:
        (hitsRes as any).estimatedTotalHits ?? hitsRes.hits.length,
      pageSize,
      facets,
    }
  } catch (e) {
    // Meilisearch unreachable / index missing → empty state, not a crash.
    console.error("[discovery] Meilisearch query failed:", e)
    return emptyResult(pageSize)
  }
}

export function parseQueryFromSearchParams(
  sp: Record<string, string | string[] | undefined> | undefined
): DiscoveryQuery {
  if (!sp) return { filters: EMPTY_FILTERS, sort: "relevance", page: 1 }

  const arr = (k: string): string[] => {
    const v = sp[k]
    if (!v) return []
    return Array.isArray(v) ? v : v.split(",").filter(Boolean)
  }
  const num = (k: string): number | undefined => {
    const v = sp[k]
    if (!v) return undefined
    const n = Number(Array.isArray(v) ? v[0] : v)
    return Number.isFinite(n) ? n : undefined
  }

  const sortRaw = (Array.isArray(sp.sort) ? sp.sort[0] : sp.sort) ?? "relevance"
  const sort: SortOption = [
    "relevance",
    "price-asc",
    "price-desc",
    "newest",
    "name-asc",
  ].includes(sortRaw as SortOption)
    ? (sortRaw as SortOption)
    : "relevance"

  return {
    filters: {
      categories: arr("categories"),
      brands: arr("brands"),
      diameters: arr("diameters")
        .map((s) => Number(s))
        .filter((n) => Number.isFinite(n)),
      boltPatterns: arr("boltPatterns"),
      finishes: arr("finishes") as DiscoveryQuery["filters"]["finishes"],
      priceMinCents: num("priceMin"),
      priceMaxCents: num("priceMax"),
    },
    sort,
    page: Math.max(1, num("page") ?? 1),
    q: (Array.isArray(sp.q) ? sp.q[0] : sp.q) || undefined,
  }
}
```

> The `facetOf` helper tolerates the multiSearch result shape across `meilisearch` client minor versions (`facetDistribution` keyed by field). If `estimatedTotalHits` is absent in your version, it falls back to `hits.length` — Step 5 verifies counts.

- [ ] **Step 3: Typecheck**

Run: `cd storefront && npx tsc --noEmit`
Expected: no new errors in `get-products.ts`/`types.ts`. (`mock-products.ts`/`mock-facets.ts` are now unused; they're deleted in Task 9.)

- [ ] **Step 4: Build**

Run: `cd storefront && npx -y pnpm@9.10.0 run build:next`
Expected: build succeeds (it bypasses the backend wait).

- [ ] **Step 5: Manual verification against live data**

With backend + Meilisearch running and the storefront on `pnpm dev`:
1. Open `/us/store` — real wheels render in the grid (not the BLACKLINE mock).
2. Click a Brand facet — grid narrows; facet counts on the OTHER dimensions update, the Brand list keeps showing all brands with counts (disjunctive).
3. Click a Diameter facet — grid narrows to that diameter.
4. Sort by Price · Low to high — order changes; cheapest first.
5. Set a price max — grid respects it.
Record the result (pass/fail per check) in the task notes.

- [ ] **Step 6: Commit**

```bash
cd storefront && git add src/modules/discovery/data/get-products.ts src/modules/discovery/data/types.ts && git commit -m "feat(storefront): Discovery on real Meilisearch with disjunctive facets"
```

---

## Phase 3 — Storefront: PDP on real Medusa

### Task 7: Rewrite the PDP adapter + restore notFound

Map a real Medusa product (live price/stock) to `ProductDetail`. Group variants into `sizeOptions` by Diameter×Width, read specs from variant metadata, fill missing-source specs with safe defaults, related from the same brand collection, `fitment: []`.

**Files:**
- Modify: `storefront/src/modules/product-detail/data/get-product.ts` (full rewrite)
- Modify: `storefront/src/app/[countryCode]/(main)/products/[handle]/page.tsx` (notFound)

- [ ] **Step 1: Rewrite `get-product.ts`**

Replace the entire contents of `storefront/src/modules/product-detail/data/get-product.ts` with:

```typescript
/**
 * Product Detail adapter — real Medusa wiring.
 *
 * Reads the authoritative product (live price + inventory) from the Medusa
 * Store API, so PDP never shows a stale Meilisearch snapshot. Maps the
 * Medusa product + its variants → ProductDetail. Types stay stable.
 *
 * fitment: [] until Spec 2 (wheel-size.com). The Fitment section degrades to
 * "no fitment confirmed yet" on an empty list.
 */

import { notFound } from "next/navigation"
import { HttpTypes } from "@medusajs/types"
import { getProductByHandle, getProductsList } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import { DiscoveryProduct } from "@modules/discovery/data/types"
import { Finish } from "@modules/common/components/wheel"
import { ProductDetail, SizeOption } from "./types"

const DEFAULT_COUNTRY = process.env.NEXT_PUBLIC_DEFAULT_REGION || "us"

const num = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) ? v : 0

function normalizeFinish(raw: unknown): Finish {
  const s = String(raw ?? "").toLowerCase()
  if (/bronze|gold|copper|brass/.test(s)) return "bronze"
  if (/silver|chrome|machined|polished|gunmetal|gr[ae]y|titanium|graphite/.test(s))
    return "silver"
  return "black"
}

function availabilityOf(qty: number): SizeOption["availability"] {
  if (qty <= 0) return "out_of_stock"
  if (qty <= 4) return "low_stock"
  return "in_stock"
}

/**
 * Group variants into the Diameter×Width size matrix the hero expects.
 * `productWeightLb` is the single product-level weight (vendor data has no
 * per-size weight) — applied to every size.
 */
function toSizeOptions(
  variants: HttpTypes.StoreProductVariant[],
  productWeightLb: number
): SizeOption[] {
  const byKey = new Map<string, SizeOption>()
  for (const v of variants) {
    const m = (v.metadata ?? {}) as Record<string, unknown>
    const diameter = num(m.wheel_diameter_in)
    const width = num(m.wheel_width_in)
    const offsetMm = num(m.offset_mm)
    const key = `${diameter}x${width}`
    const qty = num((v as any).inventory_quantity)
    const priceCents = Math.round(
      num((v.calculated_price as any)?.calculated_amount) * 100
    )
    const existing = byKey.get(key)
    if (existing) {
      existing.offsetVariants = [
        ...(existing.offsetVariants ?? []),
        { value: offsetMm, backspaceIn: "" },
      ]
    } else {
      byKey.set(key, {
        diameter,
        width,
        offsetMm,
        oemOffsetMm: offsetMm,
        offsetVariants: [{ value: offsetMm, backspaceIn: "" }],
        weightLb: productWeightLb,
        availability: availabilityOf(qty),
        priceCentsOverride: priceCents || undefined,
      })
    }
  }
  return Array.from(byKey.values()).sort(
    (a, b) => a.diameter - b.diameter || a.width - b.width
  )
}

function mapToDetail(product: HttpTypes.StoreProduct): ProductDetail {
  const pmeta = (product.metadata ?? {}) as Record<string, unknown>
  const variants = product.variants ?? []
  const rep = (variants[0]?.metadata ?? {}) as Record<string, unknown>
  const finish = normalizeFinish(pmeta.finish)

  const fromCents = Math.min(
    ...variants.map((v) =>
      Math.round(num((v.calculated_price as any)?.calculated_amount) * 100)
    ).filter((n) => n > 0),
    Number.MAX_SAFE_INTEGER
  )

  const boltPatterns = Array.from(
    new Set(
      variants
        .map((v) => String((v.metadata as any)?.bolt_pattern_raw ?? ""))
        .filter(Boolean)
    )
  )

  const weightLb = num((product as any).weight) / 453.592

  return {
    // DiscoveryProduct base
    id: product.id!,
    handle: product.handle!,
    brand: String(pmeta.brand ?? ""),
    name: product.title ?? "",
    priceCents: Number.isFinite(fromCents) ? fromCents : 0,
    finish,
    diameter: num(rep.wheel_diameter_in),
    width: num(rep.wheel_width_in),
    boltPattern: boltPatterns[0] ?? "",
    categories: [],
    isNew: false,
    fitsActiveVehicle: false,

    // ProductDetail extras
    description: product.description ?? "",
    specs: {
      construction: "—", // Spec §5: not in vendor data (plan gap 4.1).
      weightLb,
      loadRatingLb: num(rep.load_rating_lb),
      centerBoreMm: num(rep.center_bore_mm),
      countryOfOrigin: "—",
      warranty: "—",
      finishOptions: 1,
    },
    finishOptions: [finish],
    sizeOptions: toSizeOptions(variants, weightLb),
    boltPatternOptions: boltPatterns,
    fitment: [], // Spec 2
    relatedHandles: [],
  }
}

export async function getProductDetail(handle: string): Promise<ProductDetail> {
  const region = await getRegion(DEFAULT_COUNTRY)
  if (!region) notFound()
  const product = await getProductByHandle(handle, region.id)
  if (!product) notFound()
  return mapToDetail(product)
}

export async function getRelatedProducts(
  product: ProductDetail
): Promise<DiscoveryProduct[]> {
  const region = await getRegion(DEFAULT_COUNTRY)
  if (!region) return []

  // Re-read the product to get its brand collection id. getProductByHandle is
  // React.cache'd, so this dedupes with the fetch in getProductDetail (free).
  const full = await getProductByHandle(product.handle, region.id)
  const collectionId = (full as any)?.collection_id
  if (!collectionId) return []

  // Same brand collection, excluding the current product.
  const { response } = await getProductsList({
    queryParams: { collection_id: [collectionId], limit: 8 } as any,
    countryCode: DEFAULT_COUNTRY,
  })

  return response.products
    .filter((p) => p.handle !== product.handle)
    .slice(0, 6)
    .map((p) => {
      const m = (p.variants?.[0]?.metadata ?? {}) as Record<string, unknown>
      const pmeta = (p.metadata ?? {}) as Record<string, unknown>
      return {
        id: p.id!,
        handle: p.handle!,
        brand: String(pmeta.brand ?? ""),
        name: p.title ?? "",
        priceCents: Math.round(
          num((p.variants?.[0]?.calculated_price as any)?.calculated_amount) *
            100
        ),
        finish: normalizeFinish(pmeta.finish),
        diameter: num(m.wheel_diameter_in),
        width: num(m.wheel_width_in),
        boltPattern: String(m.bolt_pattern_raw ?? ""),
        categories: [],
      }
    })
}
```

> `weightLb`, `construction`, `countryOfOrigin`, `warranty` have no vendor source (Spec §5) — shown as `—`/derived. The Specs section renders these gracefully. Related products use a brand-scoped list; refine the `collection_id` filter in Step 4 once you confirm the brand collection id is on `product.collection_id`.

- [ ] **Step 2: Restore `notFound` wiring on the page**

In `storefront/src/app/[countryCode]/(main)/products/[handle]/page.tsx`, the adapter now calls `notFound()` internally, so no page change is strictly required. Confirm `generateMetadata` still works when the product exists. (No code change needed; `notFound()` thrown inside `getProductDetail` propagates.)

- [ ] **Step 3: Typecheck**

Run: `cd storefront && npx tsc --noEmit`
Expected: no new errors in `get-product.ts`. (`mock-detail.ts` now unused — deleted in Task 9.)

- [ ] **Step 4: Manual verification against live data**

With everything running:
1. From `/us/store`, click a real product card → PDP loads that product (title/brand match the card, not BLACKLINE).
2. Price shown matches the variant's live calculated price.
3. The size matrix lists the product's real Diameter×Width combos; out-of-stock variants are disabled.
4. Visit a deliberately bogus handle `/us/products/does-not-exist` → 404 (not the mock).
5. The "Similar wheels" row shows other real products.

- [ ] **Step 5: Commit**

```bash
cd storefront && git add src/modules/product-detail/data/get-product.ts && git commit -m "feat(storefront): PDP on real Medusa product + variant mapping"
```

---

## Phase 4 — Search routing + cleanup

### Task 8: Route search + YMM/garage to /store, wire text query

Make Discovery the single results surface: the search drawer submit and the YMM/garage "Find My Fit" flows navigate to `/store?q=<text>` (and for vehicle flows, to `/store` — the fitment constraint is added in Spec 2). Discovery already reads `q` (Task 6 wires it into Meilisearch).

**Files:**
- Modify: `storefront/src/modules/search/actions.ts` (or the search-drawer submit handler that calls it)
- Modify: `storefront/src/modules/search/components/search-drawer/header.tsx` (submit → `/store?q=`)
- Verify: `ymm-pane.tsx` / `garage-pane.tsx` already route to `/store` (per storefront/CLAUDE.md) — no change needed beyond confirming.

- [ ] **Step 1: Find the drawer submit handler**

Run: `cd storefront && grep -rn "results/" src/modules/search src/modules/layout`
Expected: shows where the text query currently routes to `/<country>/results/<query>` (drawer header and/or `search-trigger`).

- [ ] **Step 2: Change the submit destination to `/store?q=`**

In the search submit handler (the file from Step 1, e.g. `search-drawer/header.tsx`), replace the navigation:

```typescript
// before:
// router.push(`/${countryCode}/results/${encodeURIComponent(q)}`)
// after:
router.push(`/${countryCode}/store?q=${encodeURIComponent(q)}`)
```

Keep the existing `addRecentSearch(q)` call if present.

- [ ] **Step 3: Confirm YMM/garage panes route to /store**

Run: `cd storefront && grep -rn "/store" src/modules/search/components/search-drawer/find-by-vehicle`
Expected: `ymm-pane.tsx` and `garage-pane.tsx` already `router.push(.../store)`. If they still point at `/results`, change them to `/store` to match. (Spec 2 will append the fitment query param here.)

- [ ] **Step 4: Typecheck + build**

Run: `cd storefront && npx tsc --noEmit && npx -y pnpm@9.10.0 run build:next`
Expected: passes.

- [ ] **Step 5: Manual verification**

1. Open the search drawer (Cmd/Ctrl+K), type a brand, submit → lands on `/us/store?q=<brand>` with matching results.
2. Use a YMM selection / garage vehicle → lands on `/us/store` (full catalog for now; fitment filter is Spec 2).

- [ ] **Step 6: Commit**

```bash
cd storefront && git add src/modules/search && git commit -m "feat(storefront): route search + YMM/garage to Discovery (/store)"
```

---

### Task 9: Retire the legacy results route + delete dead mock/reference code

**Files:**
- Delete: `storefront/src/app/[countryCode]/(main)/results/`
- Delete: `storefront/src/modules/discovery/data/mock-products.ts`, `mock-facets.ts`
- Delete: `storefront/src/modules/product-detail/data/mock-detail.ts`
- Delete (verify no imports first): `storefront/src/modules/store/`, `storefront/src/modules/products/`

- [ ] **Step 1: Confirm nothing imports the dead code**

Run:
```bash
cd storefront && grep -rn "modules/store\b\|modules/products\b\|mock-products\|mock-facets\|mock-detail\|/results" src/app src/modules | grep -v "modules/product-detail"
```
Expected: only the `results/` route dir itself and the to-be-deleted files appear. If any *kept* file imports them, fix that import before deleting (e.g. `search/actions.ts` if it still references the results template).

- [ ] **Step 2: Delete the legacy results route + search results template**

```bash
cd storefront && rm -rf "src/app/[countryCode]/(main)/results" src/modules/search/templates/search-results-template
```
Then remove the now-unused `search()` export in `src/modules/search/actions.ts` if nothing else imports it (re-check with grep); otherwise leave it.

- [ ] **Step 3: Delete mock data files**

```bash
cd storefront && rm src/modules/discovery/data/mock-products.ts src/modules/discovery/data/mock-facets.ts src/modules/product-detail/data/mock-detail.ts
```

- [ ] **Step 4: Delete orphaned reference modules**

```bash
cd storefront && rm -rf src/modules/store src/modules/products
```

> If Step 1 found a kept import of these (e.g. `lib/data/products.ts` imports `SortOptions` from `@modules/store/components/refinement-list/sort-products`), do NOT delete that path. Instead move the needed symbol into a neutral location (e.g. inline the `SortOptions` type in `lib/data/products.ts`) first, then delete. Re-run Step 1 to confirm clean.

- [ ] **Step 5: Typecheck + lint + build**

Run: `cd storefront && npx tsc --noEmit && npx -y pnpm@9.10.0 run lint && npx -y pnpm@9.10.0 run build:next`
Expected: no NEW errors beyond the pre-existing ones documented in storefront/CLAUDE.md. Build succeeds.

- [ ] **Step 6: Commit**

```bash
cd storefront && git add -A && git commit -m "chore(storefront): retire legacy results route + mock/reference code"
```

---

## Final verification (Spec §9, against live dev DB + Meilisearch)

- [ ] Backend: `cd backend && npx -y pnpm@9.10.0 run test:sync` — all green (normalizers + builder + existing suite).
- [ ] `/us/store` shows real synced wheels; each facet (brand / diameter / bolt pattern / finish / price) narrows the grid with sensible disjunctive counts; sort works.
- [ ] A real product card → PDP renders real specs / size matrix / live price / stock; bogus handle → 404.
- [ ] Search drawer text query → `/us/store?q=` with relevant hits; YMM/garage → `/us/store`.
- [ ] `bolt_patterns_canonical` in a sampled index document matches the expected `{count}x{mm}` form (the Spec 2 join key).

---

## Notes for the implementer

- **Fitment seam left intact for Spec 2:** `bolt_patterns_canonical` + `center_bores` + ranges are indexed and filterable; `DiscoveryQuery.vehicleConstraint` exists and is appended to every filter (empty now); `canonicalBoltPatterns` is the shared util the wheel-size.com side will reuse. Do not remove these even though they look unused.
- **Price units:** the vendor-sync apply stored `prices.amount` as cents (`Math.round(msrpUsd*100)`). The index carries those cents directly; the PDP reads `calculated_price.calculated_amount` (major units) and ×100 to match the storefront's cents convention. If a price looks 100× off, reconcile these two conventions at the point flagged in Task 7 Step 1.
- **If the Meilisearch transformer doesn't receive variant prices/metadata** (Task 4 Step 4 shows empty arrays / zero price), the fix is the plugin `fields` list — not the builder. Iterate there.
