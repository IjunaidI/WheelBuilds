# Tire Store — Sub-project 2: Tire discovery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dedicated `/tires` storefront discovery surface — faceted browse of the `product_type = "tire"` Meilisearch docs SP1 produced — built as a parallel `modules/tire-discovery/` module that leaves the live wheel discovery untouched.

**Architecture:** Faithful structural mirror of `modules/discovery/` with the facet vocabulary swapped (rim/size/type/speed/load instead of diameter/bolt/finish) and ALL wheel-fitment chrome removed. New `TireDiscoveryProduct` type; new `get-tire-products.ts` data layer (disjunctive multiSearch + `unstable_cache` + throw-safety); tire facet rail, card, template; `/tires` route + nav links. No changes to `modules/discovery/`, `DiscoveryProduct`, home rails, or the PDP.

**Tech Stack:** Next.js 15 (App Router, React 19), server-only Meilisearch client (`@lib/meilisearch`), shadcn Accordion/Checkbox, WB primitives (`@modules/common/components/*`), Vitest.

## Global Constraints

- **No `wb-` prefix** on any dir/file/export/class (project rule). Tire module lives at `storefront/src/modules/tire-discovery/`.
- **Commit trailer**, own line at end of each commit body: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Prices are integer cents** in the Meili doc (`price_min`/`price_max`); the card divides by 100 for display (`Math.round(cents/100).toLocaleString()`). Keep this.
- **Do NOT touch** `modules/discovery/`, `modules/discovery/data/types.ts` (`DiscoveryProduct`), `modules/home/*`, or `modules/product-detail/*`. The ONE shared import allowed from discovery is the pure escape helper `@modules/discovery/data/escape` (the `lit` function) — import it, don't copy it.
- **No fitment**: render no garage/FitmentSync/FITS/Vehicle-band chrome; parse no `fit*` params; the tire query type has no `vehicleConstraint`/`vehicleFitment`.
- **Server vs client** (storefront CLAUDE.md): data layer + route + template + grid are server components; the header/chips/rail-sections/mobile-trigger/pagination that read or write URL params are `"use client"`.
- **Country code**: use `LocalizedClientLink` for links; for imperative `router.push`, prepend `/${countryCode}` (from `useParams`).
- **Build/verify**: `next.config.js` ignores TS/lint at build. Run `cd storefront && npx tsc --noEmit` and `npx vitest run` separately. Pre-existing tsc errors in `lib/data/*` + a few PDP files are baseline — don't fix them; add none new.
- Run storefront commands from `cd storefront/`. If `pnpm` is not on PATH use `npx -y pnpm@9.10.0 <cmd>` (vitest/tsc can run via `npx` directly).

## File structure

**Create (all under `storefront/src/`):**
- `modules/tire-discovery/data/types.ts` — `TireDiscoveryProduct`, `TireDiscoveryQuery`, `TireDiscoveryFilters`, `TireFacetCounts`, `TireDiscoveryResult`, `EMPTY_TIRE_FILTERS`, `TIRE_SORT` (reuse `SortOption`/`SORT_LABELS`), `parseTireQueryFromSearchParams`, `DEFAULT_PAGE_SIZE`.
- `modules/tire-discovery/data/cache-key.ts` — `tireDiscoveryCacheKey`.
- `modules/tire-discovery/data/get-tire-products.ts` — `getTireDiscoveryProducts`.
- `modules/tire-discovery/use-tire-query.ts` — client hook.
- `modules/tire-discovery/templates/index.tsx` + `skeleton.tsx`.
- `modules/tire-discovery/components/{header,active-chips,empty-state,pagination}/index.tsx`.
- `modules/tire-discovery/components/filter-rail/{index,filter-sections,mobile-trigger,skeleton}.tsx`.
- `modules/tire-discovery/components/grid/{index,tire-product-card,skeleton}.tsx`.
- `app/[countryCode]/(main)/tires/{page,loading}.tsx`.
- Test files under `modules/tire-discovery/__tests__/` (Vitest).

**Modify:**
- `modules/layout/templates/nav/index.tsx` — add `{ label: "Tires", href: "/tires" }`.
- `modules/layout/components/mobile-menu/index.tsx` — add the same item to its `NAV_ITEMS`.

**Reference (read the real wheel file when a task says "mirror"):** `modules/discovery/data/{types,cache-key,get-products,escape}.ts`, `modules/discovery/data/use-discovery-query.ts` (client hook), `modules/discovery/templates/{index,skeleton}.tsx`, `modules/discovery/components/**`, `app/[countryCode]/(main)/store/{page,loading}.tsx`.

---

## Task 1: Tire data types + query parser + cache key

**Files:**
- Create: `storefront/src/modules/tire-discovery/data/types.ts`
- Create: `storefront/src/modules/tire-discovery/data/cache-key.ts`
- Test: `storefront/src/modules/tire-discovery/__tests__/types.test.ts`, `.../cache-key.test.ts`

**Interfaces:**
- Produces: the tire type vocabulary consumed by every later task. Key types (full code below).

- [ ] **Step 1: Write the failing tests**

Create `storefront/src/modules/tire-discovery/__tests__/types.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { parseTireQueryFromSearchParams, EMPTY_TIRE_FILTERS } from "../data/types"

describe("parseTireQueryFromSearchParams", () => {
  it("defaults to empty filters / relevance / page 1", () => {
    expect(parseTireQueryFromSearchParams(undefined)).toEqual({
      filters: EMPTY_TIRE_FILTERS, sort: "relevance", page: 1,
    })
  })
  it("parses CSV + repeated params, coercing numbers (finite only)", () => {
    const q = parseTireQueryFromSearchParams({
      brands: "Falken,BKT", rimDiameters: "22,20,x", sizes: "305/45R22",
      tireTypes: ["passenger", "light-truck"], speedRatings: "S,T",
      loadIndexes: "118,120", priceMin: "50", priceMax: "400", sort: "price-asc", page: "3",
    })
    expect(q.filters.brands).toEqual(["Falken", "BKT"])
    expect(q.filters.rimDiameters).toEqual([22, 20]) // "x" dropped (non-finite)
    expect(q.filters.sizes).toEqual(["305/45R22"])
    expect(q.filters.tireTypes).toEqual(["passenger", "light-truck"])
    expect(q.filters.speedRatings).toEqual(["S", "T"])
    expect(q.filters.loadIndexes).toEqual([118, 120])
    expect(q.filters.priceMinCents).toBe(50)
    expect(q.filters.priceMaxCents).toBe(400)
    expect(q.sort).toBe("price-asc")
    expect(q.page).toBe(3)
  })
  it("falls back to relevance for an unknown sort, floors page at 1", () => {
    const q = parseTireQueryFromSearchParams({ sort: "bogus", page: "-4" })
    expect(q.sort).toBe("relevance")
    expect(q.page).toBe(1)
  })
  it("reads free-text q", () => {
    expect(parseTireQueryFromSearchParams({ q: "wildpeak" }).q).toBe("wildpeak")
  })
})
```

Create `storefront/src/modules/tire-discovery/__tests__/cache-key.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { tireDiscoveryCacheKey } from "../data/cache-key"
import { EMPTY_TIRE_FILTERS } from "../data/types"

const base = { filters: EMPTY_TIRE_FILTERS, sort: "relevance" as const, page: 1 }

describe("tireDiscoveryCacheKey", () => {
  it("is order-independent across filter arrays", () => {
    const a = tireDiscoveryCacheKey({ ...base, filters: { ...EMPTY_TIRE_FILTERS, brands: ["A", "B"] } })
    const b = tireDiscoveryCacheKey({ ...base, filters: { ...EMPTY_TIRE_FILTERS, brands: ["B", "A"] } })
    expect(a).toBe(b)
  })
  it("carries a tire discriminant so it can't collide with wheel keys", () => {
    expect(tireDiscoveryCacheKey(base)).toContain("tire")
  })
  it("differs when a filter changes", () => {
    const a = tireDiscoveryCacheKey(base)
    const b = tireDiscoveryCacheKey({ ...base, filters: { ...EMPTY_TIRE_FILTERS, tireTypes: ["passenger"] } })
    expect(a).not.toBe(b)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd storefront && npx vitest run src/modules/tire-discovery`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `data/types.ts`**

```ts
/**
 * Tire discovery data types + URL-param parser. Parallel to the wheel
 * modules/discovery/data/types.ts, with tire facet vocabulary and NO fitment.
 * parseTireQueryFromSearchParams is co-located so the client use-tire-query
 * hook can import it without pulling the server-only Meilisearch client.
 */

export type TireType = "passenger" | "light-truck" | "other"

export type TireDiscoveryProduct = {
  id: string
  handle: string
  brand: string
  name: string
  /** Cents. price_min = min variant price. */
  priceCents: number
  thumbnail: string | null
  /** tire_sizes.length → "N sizes". */
  sizeCount: number
  /** Sorted rim inches → "17\"–22\"" range. */
  rimDiameters: number[]
  tireType: TireType
  isNew?: boolean
}

export type SortOption = "relevance" | "price-asc" | "price-desc" | "newest" | "name-asc"

export const SORT_LABELS: Record<SortOption, string> = {
  relevance: "Relevance",
  "price-asc": "Price · Low to high",
  "price-desc": "Price · High to low",
  newest: "Newest first",
  "name-asc": "Name · A to Z",
}

/** Keys correspond 1:1 with the filter-rail sections. */
export type TireDiscoveryFilters = {
  brands: string[]
  rimDiameters: number[]
  sizes: string[]
  tireTypes: string[]
  speedRatings: string[]
  loadIndexes: number[]
  priceMinCents?: number
  priceMaxCents?: number
}

export const EMPTY_TIRE_FILTERS: TireDiscoveryFilters = {
  brands: [], rimDiameters: [], sizes: [], tireTypes: [], speedRatings: [], loadIndexes: [],
}

export type TireDiscoveryQuery = {
  filters: TireDiscoveryFilters
  sort: SortOption
  page: number
  q?: string
}

export type TireFacetCounts = {
  brands: Record<string, number>
  rimDiameters: Record<string, number>
  sizes: Record<string, number>
  tireTypes: Record<string, number>
  speedRatings: Record<string, number>
  loadIndexes: Record<string, number>
}

export type TireDiscoveryResult = {
  products: TireDiscoveryProduct[]
  totalCount: number
  pageSize: number
  facets: TireFacetCounts
}

export const DEFAULT_PAGE_SIZE = 12

export function parseTireQueryFromSearchParams(
  sp: Record<string, string | string[] | undefined> | undefined
): TireDiscoveryQuery {
  if (!sp) return { filters: EMPTY_TIRE_FILTERS, sort: "relevance", page: 1 }

  const arr = (k: string): string[] => {
    const v = sp[k]
    if (!v) return []
    return Array.isArray(v) ? v : v.split(",").filter(Boolean)
  }
  const nums = (k: string): number[] =>
    arr(k).map((s) => Number(s)).filter((n) => Number.isFinite(n))
  const num = (k: string): number | undefined => {
    const v = sp[k]
    if (!v) return undefined
    const n = Number(Array.isArray(v) ? v[0] : v)
    return Number.isFinite(n) ? n : undefined
  }

  const sortRaw = (Array.isArray(sp.sort) ? sp.sort[0] : sp.sort) ?? "relevance"
  const sort: SortOption = (
    ["relevance", "price-asc", "price-desc", "newest", "name-asc"] as SortOption[]
  ).includes(sortRaw as SortOption)
    ? (sortRaw as SortOption)
    : "relevance"

  return {
    filters: {
      brands: arr("brands"),
      rimDiameters: nums("rimDiameters"),
      sizes: arr("sizes"),
      tireTypes: arr("tireTypes"),
      speedRatings: arr("speedRatings"),
      loadIndexes: nums("loadIndexes"),
      priceMinCents: num("priceMin"),
      priceMaxCents: num("priceMax"),
    },
    sort,
    page: Math.max(1, num("page") ?? 1),
    q: (Array.isArray(sp.q) ? sp.q[0] : sp.q) || undefined,
  }
}
```

- [ ] **Step 4: Implement `data/cache-key.ts`**

```ts
import type { TireDiscoveryQuery } from "./types"

/** Stable, order-independent unstable_cache key; the "tire" tag prevents any
 *  collision with the wheel "discovery" cache namespace. */
export function tireDiscoveryCacheKey(query: TireDiscoveryQuery): string {
  const f = query.filters
  const norm = (a: ReadonlyArray<string | number>) => [...a].map(String).sort().join(",")
  return JSON.stringify({
    _t: "tire",
    brands: norm(f.brands),
    rimDiameters: norm(f.rimDiameters),
    sizes: norm(f.sizes),
    tireTypes: norm(f.tireTypes),
    speedRatings: norm(f.speedRatings),
    loadIndexes: norm(f.loadIndexes),
    priceMin: f.priceMinCents ?? null,
    priceMax: f.priceMaxCents ?? null,
    sort: query.sort,
    page: query.page,
    q: query.q ?? "",
  })
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd storefront && npx vitest run src/modules/tire-discovery`
Expected: PASS (types + cache-key).

- [ ] **Step 6: Commit**

```bash
git add storefront/src/modules/tire-discovery/data/types.ts storefront/src/modules/tire-discovery/data/cache-key.ts storefront/src/modules/tire-discovery/__tests__/types.test.ts storefront/src/modules/tire-discovery/__tests__/cache-key.test.ts
git commit -m "feat(tire-discovery): data types + query parser + cache key (WB-005 SP2)"
```

---

## Task 2: Tire data layer (`get-tire-products.ts`)

**Files:**
- Create: `storefront/src/modules/tire-discovery/data/get-tire-products.ts`
- Test: `storefront/src/modules/tire-discovery/__tests__/get-tire-products.test.ts`

**Interfaces:**
- Consumes: types from Task 1; `lit` from `@modules/discovery/data/escape`; `meili`/`PRODUCTS_INDEX` from `@lib/meilisearch`.
- Produces: `getTireDiscoveryProducts(query: TireDiscoveryQuery): Promise<TireDiscoveryResult>`. Also exports the pure `buildTireFilters`, `hitToTireProduct` for testing.

- [ ] **Step 1: Write the failing tests** (pure functions; the multiSearch itself is integration-verified at build/smoke — mirror the wheel test scope)

Create `storefront/src/modules/tire-discovery/__tests__/get-tire-products.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { buildTireFilters, hitToTireProduct } from "../data/get-tire-products"
import { EMPTY_TIRE_FILTERS } from "../data/types"

describe("buildTireFilters", () => {
  it("always scopes to product_type = tire", () => {
    expect(buildTireFilters(EMPTY_TIRE_FILTERS)).toContain('product_type = "tire"')
  })
  it("adds a clause per selected facet", () => {
    const c = buildTireFilters({
      ...EMPTY_TIRE_FILTERS, brands: ["Falken"], rimDiameters: [22],
      tireTypes: ["passenger"], speedRatings: ["S"], loadIndexes: [118], sizes: ["305/45R22"],
    })
    expect(c.some((x) => x.startsWith("brand IN"))).toBe(true)
    expect(c.some((x) => x.startsWith("rim_diameters IN"))).toBe(true)
    expect(c.some((x) => x.startsWith("tire_sizes IN"))).toBe(true)
    expect(c.some((x) => x.startsWith("tire_type IN"))).toBe(true)
    expect(c.some((x) => x.startsWith("speed_ratings IN"))).toBe(true)
    expect(c.some((x) => x.startsWith("load_indexes IN"))).toBe(true)
  })
  it("omits the skipped dimension (disjunctive facets)", () => {
    const c = buildTireFilters({ ...EMPTY_TIRE_FILTERS, brands: ["Falken"], rimDiameters: [22] }, "rimDiameters")
    expect(c.some((x) => x.startsWith("rim_diameters IN"))).toBe(false)
    expect(c.some((x) => x.startsWith("brand IN"))).toBe(true)
  })
  it("adds price clauses on price_min", () => {
    const c = buildTireFilters({ ...EMPTY_TIRE_FILTERS, priceMinCents: 5000, priceMaxCents: 40000 })
    expect(c).toContain("price_min >= 5000")
    expect(c).toContain("price_min <= 40000")
  })
})

describe("hitToTireProduct", () => {
  it("maps fields incl. sizeCount + sorted rimDiameters + priceCents", () => {
    const p = hitToTireProduct({
      id: "t1", handle: "falken-wildpeak-at4w", title: "Falken WDPEAK AT4W", brand: "Falken",
      thumbnail: "x.jpg", tire_sizes: ["305/45R22", "305/50R20", "LT37X12.50R18"],
      rim_diameters: [22, 18, 20], tire_type: "light-truck", price_min: 40500, price_max: 46200,
      created_at: null,
    } as any)
    expect(p).toMatchObject({
      id: "t1", handle: "falken-wildpeak-at4w", name: "Falken WDPEAK AT4W", brand: "Falken",
      priceCents: 40500, sizeCount: 3, rimDiameters: [18, 20, 22], tireType: "light-truck", thumbnail: "x.jpg",
    })
  })
  it("defaults missing arrays/thumbnail safely", () => {
    const p = hitToTireProduct({ id: "t2", handle: "h", title: "t", brand: "B", price_min: 0 } as any)
    expect(p.sizeCount).toBe(0)
    expect(p.rimDiameters).toEqual([])
    expect(p.thumbnail).toBeNull()
    expect(p.tireType).toBe("other")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd storefront && npx vitest run src/modules/tire-discovery/__tests__/get-tire-products`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `data/get-tire-products.ts`** (mirror the wheel `get-products.ts` NON-fit path; drop the entire fit-mode branch + `facetsFromProducts`)

```ts
import "server-only"
import { unstable_cache } from "next/cache"
import type { MultiSearchResult } from "meilisearch"
import { meili, PRODUCTS_INDEX } from "@lib/meilisearch"
import { lit } from "@modules/discovery/data/escape"
import {
  DEFAULT_PAGE_SIZE, EMPTY_TIRE_FILTERS, SortOption, TireDiscoveryFilters,
  TireDiscoveryProduct, TireDiscoveryQuery, TireDiscoveryResult, TireFacetCounts, TireType,
} from "./types"
import { tireDiscoveryCacheKey } from "./cache-key"

const NEW_DAYS = 30
const NEW_MS = NEW_DAYS * 24 * 60 * 60 * 1000

const TIRE_FACET_FIELDS = ["brand", "rim_diameters", "tire_sizes", "tire_type", "speed_ratings", "load_indexes"] as const

export function buildTireFilters(
  f: TireDiscoveryFilters,
  skip?: keyof TireDiscoveryFilters
): string[] {
  const clauses: string[] = ['product_type = "tire"']
  if (skip !== "brands" && f.brands.length) clauses.push(`brand IN [${f.brands.map(lit).join(", ")}]`)
  if (skip !== "rimDiameters" && f.rimDiameters.length) clauses.push(`rim_diameters IN [${f.rimDiameters.map(lit).join(", ")}]`)
  if (skip !== "sizes" && f.sizes.length) clauses.push(`tire_sizes IN [${f.sizes.map(lit).join(", ")}]`)
  if (skip !== "tireTypes" && f.tireTypes.length) clauses.push(`tire_type IN [${f.tireTypes.map(lit).join(", ")}]`)
  if (skip !== "speedRatings" && f.speedRatings.length) clauses.push(`speed_ratings IN [${f.speedRatings.map(lit).join(", ")}]`)
  if (skip !== "loadIndexes" && f.loadIndexes.length) clauses.push(`load_indexes IN [${f.loadIndexes.map(lit).join(", ")}]`)
  if (f.priceMinCents != null) clauses.push(`price_min >= ${f.priceMinCents}`)
  if (f.priceMaxCents != null) clauses.push(`price_min <= ${f.priceMaxCents}`)
  return clauses
}

function sortExpr(sort: SortOption): string[] {
  switch (sort) {
    case "price-asc": return ["price_min:asc"]
    case "price-desc": return ["price_min:desc"]
    case "newest": return ["created_at:desc"]
    case "name-asc": return ["title:asc"]
    default: return []
  }
}

type TireHit = {
  id: string; handle: string; title: string; brand: string; thumbnail: string | null
  tire_sizes?: string[]; rim_diameters?: number[]; tire_type?: TireType
  price_min: number; price_max: number; created_at: string | null
}

export function hitToTireProduct(h: TireHit): TireDiscoveryProduct {
  const createdMs = h.created_at ? Date.parse(h.created_at) : NaN
  return {
    id: h.id, handle: h.handle, name: h.title, brand: h.brand,
    priceCents: h.price_min,
    thumbnail: h.thumbnail ?? null,
    sizeCount: h.tire_sizes?.length ?? 0,
    rimDiameters: [...(h.rim_diameters ?? [])].sort((a, b) => a - b),
    tireType: h.tire_type ?? "other",
    isNew: Number.isFinite(createdMs) ? Date.now() - createdMs < NEW_MS : false,
  }
}

function emptyResult(pageSize: number): TireDiscoveryResult {
  return {
    products: [], totalCount: 0, pageSize,
    facets: { brands: {}, rimDiameters: {}, sizes: {}, tireTypes: {}, speedRatings: {}, loadIndexes: {} },
  }
}

const facetQueryByDim: Record<string, keyof TireDiscoveryFilters> = {
  brand: "brands", rim_diameters: "rimDiameters", tire_sizes: "sizes",
  tire_type: "tireTypes", speed_ratings: "speedRatings", load_indexes: "loadIndexes",
}

async function fetchTireDiscoveryProducts(query: TireDiscoveryQuery): Promise<TireDiscoveryResult> {
  const pageSize = DEFAULT_PAGE_SIZE
  const offset = (query.page - 1) * pageSize

  const { results } = await meili.multiSearch({
    queries: [
      {
        indexUid: PRODUCTS_INDEX, q: query.q ?? "",
        filter: buildTireFilters(query.filters).join(" AND "),
        sort: sortExpr(query.sort), limit: pageSize, offset,
      },
      ...TIRE_FACET_FIELDS.map((field) => ({
        indexUid: PRODUCTS_INDEX, q: query.q ?? "",
        filter: buildTireFilters(query.filters, facetQueryByDim[field]).join(" AND "),
        facets: [field], limit: 0,
      })),
    ],
  })

  const [hitsRes, ...facetRes] = results as MultiSearchResult<TireHit>[]
  const facetByField: Record<string, Record<string, number>> = {}
  TIRE_FACET_FIELDS.forEach((field, i) => {
    facetByField[field] = facetRes[i]?.facetDistribution?.[field] ?? {}
  })
  const facets: TireFacetCounts = {
    brands: facetByField["brand"], rimDiameters: facetByField["rim_diameters"],
    sizes: facetByField["tire_sizes"], tireTypes: facetByField["tire_type"],
    speedRatings: facetByField["speed_ratings"], loadIndexes: facetByField["load_indexes"],
  }
  return {
    products: hitsRes.hits.map(hitToTireProduct),
    totalCount: hitsRes.estimatedTotalHits ?? hitsRes.hits.length,
    pageSize, facets,
  }
}

export async function getTireDiscoveryProducts(query: TireDiscoveryQuery): Promise<TireDiscoveryResult> {
  try {
    const cached = unstable_cache(
      () => fetchTireDiscoveryProducts(query),
      ["tire-discovery", tireDiscoveryCacheKey(query)],
      { revalidate: 60, tags: ["discovery", "tire-discovery"] }
    )
    return await cached()
  } catch (e) {
    console.error("[tire-discovery] Meilisearch query failed:", e)
    return emptyResult(DEFAULT_PAGE_SIZE)
  }
}
```

Note: if `@modules/discovery/data/escape` does not export `lit` under that name, open the file and import whatever the escape helper is actually called (it quotes strings / passes numbers raw). If the import path can't resolve, copy the tiny helper into `tire-discovery/data/escape.ts` instead.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd storefront && npx vitest run src/modules/tire-discovery/__tests__/get-tire-products`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add storefront/src/modules/tire-discovery/data/get-tire-products.ts storefront/src/modules/tire-discovery/__tests__/get-tire-products.test.ts
git commit -m "feat(tire-discovery): Meili data layer (disjunctive facets, cache, throw-safe) (WB-005 SP2)"
```

---

## Task 3: Tire client query hook (`use-tire-query.ts`)

**Files:**
- Create: `storefront/src/modules/tire-discovery/use-tire-query.ts`

**Interfaces:**
- Produces: a `"use client"` hook exposing `filters`, `sort`, `page`, `q`, and `setSort(sort)`, `setPage(page)`, `toggleArrayFilter(key, value)`, `setPriceRange(minDollars, maxDollars)`, `clearAll()`. Each mutator updates the current-pathname URL search params (reset `page` to 1 on any filter/sort change) via `router.push`, using `usePathname()` so it works on `/tires`.

- [ ] **Step 1: Mirror the wheel hook**

Open `storefront/src/modules/discovery/data/use-discovery-query.ts` (the wheel client query hook — find its real path; storefront CLAUDE.md lists it under `modules/discovery/data/`). Copy it to `storefront/src/modules/tire-discovery/use-tire-query.ts` and apply this transform map:

| Wheel | Tire |
|---|---|
| `parseQueryFromSearchParams` (from `@modules/discovery/data/types`) | `parseTireQueryFromSearchParams` (from `./data/types`) |
| array filter keys `brands/diameters/boltPatterns/finishes` | `brands/rimDiameters/sizes/tireTypes/speedRatings/loadIndexes` |
| number-array keys `diameters` | `rimDiameters`, `loadIndexes` (coerce to Number in the param serialization) |
| the URL param names it reads/writes | match Task 1's param names (`brands`, `rimDiameters`, `sizes`, `tireTypes`, `speedRatings`, `loadIndexes`, `priceMin`, `priceMax`, `sort`, `page`, `q`) |
| any `fit*` param handling | REMOVE (no fitment) |

Keep the hook route-agnostic: it must use `usePathname()` (not a hardcoded `/store`) so pushes land on `/tires`. Preserve the "reset page to 1 on filter/sort change" behavior and the country-code handling exactly as the wheel hook does it.

- [ ] **Step 2: Type-check compiles**

Run: `cd storefront && npx tsc --noEmit 2>&1 | grep -i "tire-discovery" || echo "no new tire-discovery tsc errors"`
Expected: `no new tire-discovery tsc errors`.

- [ ] **Step 3: Commit**

```bash
git add storefront/src/modules/tire-discovery/use-tire-query.ts
git commit -m "feat(tire-discovery): client URL-query hook (WB-005 SP2)"
```

---

## Task 4: Tire product card + grid + skeleton

**Files:**
- Create: `storefront/src/modules/tire-discovery/components/grid/tire-product-card.tsx`
- Create: `storefront/src/modules/tire-discovery/components/grid/index.tsx`
- Create: `storefront/src/modules/tire-discovery/components/grid/skeleton.tsx`
- Test: `storefront/src/modules/tire-discovery/__tests__/rim-range.test.ts`

**Interfaces:**
- Consumes: `TireDiscoveryProduct`. Produces `TireGrid` + `TireProductCard`.

- [ ] **Step 1: Write the failing test for the rim-range helper**

Create `storefront/src/modules/tire-discovery/__tests__/rim-range.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { rimRangeLabel } from "../components/grid/tire-product-card"

describe("rimRangeLabel", () => {
  it("shows a range for multiple rim diameters", () => {
    expect(rimRangeLabel([18, 20, 22])).toBe('18"–22"')
  })
  it("shows a single value for one rim diameter", () => {
    expect(rimRangeLabel([22])).toBe('22"')
  })
  it("returns empty string for no rim diameters", () => {
    expect(rimRangeLabel([])).toBe("")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd storefront && npx vitest run src/modules/tire-discovery/__tests__/rim-range`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `tire-product-card.tsx`**

```tsx
import Image from "next/image"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Label from "@modules/common/components/label"
import Display from "@modules/common/components/display"
import Chip from "@modules/common/components/chip"
import { TireDiscoveryProduct, TireType } from "../../data/types"

const TIRE_TYPE_LABEL: Record<TireType, string> = {
  passenger: "Passenger",
  "light-truck": "Light truck",
  other: "Specialty",
}

/** "18\"–22\"" for a range, "22\"" for one, "" for none. Exported for tests. */
export function rimRangeLabel(rims: number[]): string {
  if (!rims.length) return ""
  const min = rims[0]
  const max = rims[rims.length - 1]
  return min === max ? `${min}"` : `${min}"–${max}"`
}

type TireProductCardProps = { product: TireDiscoveryProduct }

const TireProductCard = ({ product }: TireProductCardProps) => {
  const rim = rimRangeLabel(product.rimDiameters)
  return (
    <LocalizedClientLink
      href={`/products/${product.handle}`}
      className="product-card group block"
      aria-label={`${product.brand} ${product.name}`}
    >
      <div className="relative aspect-square bg-[var(--soft)] flex items-center justify-center overflow-hidden">
        {product.thumbnail ? (
          <Image
            src={product.thumbnail}
            alt={`${product.brand} ${product.name}`}
            fill
            sizes="(min-width: 1024px) 25vw, 50vw"
            className="object-contain p-4"
          />
        ) : (
          <div className="h-[70%] w-[70%] rounded-full border-[10px] border-[var(--hairline)] bg-[var(--ink)]/[0.04]" aria-hidden />
        )}
        {product.isNew && (
          <div className="absolute top-2.5 left-2.5">
            <Chip variant="accent" size="sm">NEW</Chip>
          </div>
        )}
        <div className="absolute top-2.5 right-2.5">
          <Chip variant="outline" size="sm">{TIRE_TYPE_LABEL[product.tireType]}</Chip>
        </div>
      </div>

      <div className="p-3 flex flex-col gap-1">
        <Label tone="muted" style={{ fontSize: 9, display: "block" }}>{product.brand}</Label>
        <Display size={16} as="div" style={{ marginTop: 2 }}>{product.name}</Display>

        <Label tone="muted" style={{ fontSize: 10, marginTop: 6, letterSpacing: "0.06em" }}>
          {product.sizeCount} {product.sizeCount === 1 ? "size" : "sizes"}{rim ? ` · ${rim}` : ""}
        </Label>

        <div className="border-t border-[var(--hairline)] mt-3 pt-3 flex items-baseline justify-between">
          <span className="text-[10px] font-[var(--mono)] uppercase tracking-[0.08em] text-[var(--ink-soft)]">From</span>
          <span className="font-[var(--display)] text-[18px] font-black text-[var(--ink)]">
            <span style={{ color: "var(--orange)" }}>$</span>
            {Math.round(product.priceCents / 100).toLocaleString()}
          </span>
        </div>
      </div>
    </LocalizedClientLink>
  )
}

export default TireProductCard
```

- [ ] **Step 4: Implement `grid/index.tsx` + `grid/skeleton.tsx`** (mirror the wheel grid at `modules/discovery/components/grid/{index,skeleton}.tsx`)

`grid/index.tsx` — server component; same responsive `grid-cols-2 small:grid-cols-3 medium:grid-cols-4 gap-…` as the wheel grid, mapping `products` → `<TireProductCard product={p} />` (no `fit` prop). `grid/skeleton.tsx` — copy the wheel grid skeleton verbatim (it's field-agnostic placeholder cards).

- [ ] **Step 5: Run tests + type-check**

Run: `cd storefront && npx vitest run src/modules/tire-discovery/__tests__/rim-range` → PASS.
Run: `cd storefront && npx tsc --noEmit 2>&1 | grep -i "tire-discovery" || echo "no new tire-discovery tsc errors"` → `no new…`.

- [ ] **Step 6: Commit**

```bash
git add storefront/src/modules/tire-discovery/components/grid/
git commit -m "feat(tire-discovery): tire product card + grid (WB-005 SP2)"
```

---

## Task 5: Tire filter rail (sections + rail + mobile trigger + skeleton)

**Files:**
- Create: `storefront/src/modules/tire-discovery/components/filter-rail/{index,filter-sections,mobile-trigger,skeleton}.tsx`

**Interfaces:**
- Consumes: `TireFacetCounts`, `use-tire-query`. Produces `TireFilterRail`, `TireFilterSections`, `TireMobileFilterTrigger`, `TireFilterRailSkeleton`.

- [ ] **Step 1: Mirror the wheel filter rail with the tire vocabulary**

Open `modules/discovery/components/filter-rail/{index,filter-sections,mobile-trigger,skeleton}.tsx`. Copy each into the tire filter-rail dir and apply:

- **REMOVE the entire Vehicle band** (garage label + "Show all wheels" / `fit=0` link) from `filter-sections.tsx` — tires have no fitment.
- **Replace the accordion sections** — wheel `Brand / Diameter / Bolt pattern / Finish / Price` → tire **Brand / Rim diameter / Size / Tire type / Speed rating / Load rating / Price**. Each `ChecklistSection` binds to the matching `TireFacetCounts` key and toggles the matching `TireDiscoveryFilters` key via `use-tire-query`'s `toggleArrayFilter`. Sort each facet's values by count desc then alpha (keep the wheel `ChecklistSection` logic — it's field-agnostic).
  - Rim diameter values render as `${v}"`. Tire type values render via a label map (`passenger`→"Passenger", `light-truck`→"Light truck", `other`→"Specialty"). Size / speed / load render raw.
  - Consider a "show more" affordance ONLY for Size (high cardinality) — if the wheel `ChecklistSection` already caps + expands, reuse it; otherwise render all and note it.
- **Price section** — keep the two dollar `TextInput`s → cents (×100) exactly as the wheel rail (same `TODO(integration)` slider note is fine to carry).
- Import from `./` and `../../data/types` / `../../use-tire-query`; drop any `@lib/garage`/fitment imports.
- `index.tsx` (desktop `<aside>`) and `mobile-trigger.tsx` (Vaul drawer reusing `TireFilterSections`) mirror the wheel versions with the imports/labels swapped ("N results" copy stays generic). `skeleton.tsx` copies verbatim.

- [ ] **Step 2: Type-check compiles**

Run: `cd storefront && npx tsc --noEmit 2>&1 | grep -i "tire-discovery" || echo "no new tire-discovery tsc errors"`
Expected: `no new tire-discovery tsc errors`.

- [ ] **Step 3: Commit**

```bash
git add storefront/src/modules/tire-discovery/components/filter-rail/
git commit -m "feat(tire-discovery): tire filter rail (rim/size/type/speed/load facets, no fitment) (WB-005 SP2)"
```

---

## Task 6: Tire header + active-chips + empty-state + pagination

**Files:**
- Create: `storefront/src/modules/tire-discovery/components/{header,active-chips,empty-state,pagination}/index.tsx`

- [ ] **Step 1: Mirror the wheel components, stripping fitment**

- **header/index.tsx** (mirror `discovery/components/header`): title "All tires", `CATALOG · {N} RESULTS`, the Sort dropdown (reuse `SORT_LABELS` + `use-tire-query`'s `setSort`). **REMOVE the garage/"FITS YOUR {make}" chip** entirely.
- **active-chips/index.tsx** (mirror): a removable chip per active filter (brand / rim / size / tire type / speed / load / priceMin / priceMax) + "Clear all". **REMOVE the `Fits:` chip.** Returns null when nothing active.
- **empty-state/index.tsx** (mirror): a SINGLE generic empty state — "No tires match these filters" + a "Clear all" recovery (via `use-tire-query.clearAll`). **REMOVE the fit-mode empty copy/branch.**
- **pagination/index.tsx**: if the wheel `discovery/components/pagination` is route-agnostic (uses `use-*-query.setPage` + `usePathname`), you may re-export/wrap it; otherwise copy it and point it at `use-tire-query`. Numeric pager, returns null when `totalPages <= 1`.

- [ ] **Step 2: Type-check compiles**

Run: `cd storefront && npx tsc --noEmit 2>&1 | grep -i "tire-discovery" || echo "no new tire-discovery tsc errors"`
Expected: `no new…`.

- [ ] **Step 3: Commit**

```bash
git add storefront/src/modules/tire-discovery/components/header/ storefront/src/modules/tire-discovery/components/active-chips/ storefront/src/modules/tire-discovery/components/empty-state/ storefront/src/modules/tire-discovery/components/pagination/
git commit -m "feat(tire-discovery): header + active chips + empty state + pagination (WB-005 SP2)"
```

---

## Task 7: Tire template + skeleton

**Files:**
- Create: `storefront/src/modules/tire-discovery/templates/{index,skeleton}.tsx`

- [ ] **Step 1: Mirror the wheel template, dropping FitmentSync**

Open `modules/discovery/templates/{index,skeleton}.tsx`. Copy to the tire templates dir and apply:
- Props: `{ result: TireDiscoveryResult; currentPage: number }` (NO `fit` prop).
- **REMOVE `<FitmentSync/>`** (no fitment auto-apply).
- Compose: `TireDiscoveryHeader → TireActiveChips → TireMobileFilterTrigger → [TireFilterRail | (TireEmpty | TireGrid + TirePagination)]`. `totalPages = Math.ceil(totalCount / pageSize)`; empty-vs-grid switch on `products.length`.
- Grid gets no `fit` prop. `skeleton.tsx` mirrors the wheel template skeleton (rail skeleton + grid skeleton).

- [ ] **Step 2: Type-check compiles**

Run: `cd storefront && npx tsc --noEmit 2>&1 | grep -i "tire-discovery" || echo "no new tire-discovery tsc errors"`
Expected: `no new…`.

- [ ] **Step 3: Commit**

```bash
git add storefront/src/modules/tire-discovery/templates/
git commit -m "feat(tire-discovery): discovery template + skeleton (WB-005 SP2)"
```

---

## Task 8: `/tires` route + loading + nav links

**Files:**
- Create: `storefront/src/app/[countryCode]/(main)/tires/{page,loading}.tsx`
- Modify: `storefront/src/modules/layout/templates/nav/index.tsx`, `storefront/src/modules/layout/components/mobile-menu/index.tsx`

- [ ] **Step 1: Implement the route `page.tsx`** (mirror `store/page.tsx`)

```tsx
import { Metadata } from "next"
import { getTireDiscoveryProducts } from "@modules/tire-discovery/data/get-tire-products"
import { parseTireQueryFromSearchParams } from "@modules/tire-discovery/data/types"
import TireDiscoveryTemplate from "@modules/tire-discovery/templates"

export const metadata: Metadata = {
  title: "All tires",
  description: "Explore the full Wheel Builds tire catalog.",
}

type TiresPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function TiresPage({ searchParams }: TiresPageProps) {
  const sp = await searchParams
  const query = parseTireQueryFromSearchParams(sp)
  const result = await getTireDiscoveryProducts(query)
  return <TireDiscoveryTemplate result={result} currentPage={query.page} />
}
```

(Confirm the template's default export name/path matches — adjust the import to the actual export from Task 7.)

- [ ] **Step 2: Implement `loading.tsx`** (mirror `store/loading.tsx`)

```tsx
import TireDiscoveryTemplateSkeleton from "@modules/tire-discovery/templates/skeleton"

export default function Loading() {
  return <TireDiscoveryTemplateSkeleton />
}
```

(Adjust the import to the actual skeleton export from Task 7.)

- [ ] **Step 3: Add the nav links**

In `storefront/src/modules/layout/templates/nav/index.tsx`, add a Tires item to `NAV_ITEMS` immediately after the Wheels item:

```ts
  { label: "Wheels", href: "/store", active: true },
  { label: "Tires", href: "/tires" },
```

In `storefront/src/modules/layout/components/mobile-menu/index.tsx`, add the same `{ label: "Tires", href: "/tires" }` entry to its `NAV_ITEMS` array (right after Wheels).

- [ ] **Step 4: Verify the storefront builds**

Run: `cd storefront && npx -y pnpm@9.10.0 build:next 2>&1 | tail -30`
Expected: build completes; the `/tires` route appears in the route list. (Build ignores TS/lint errors by config, so also run `npx tsc --noEmit 2>&1 | grep -i "tire-discovery" || echo ok` to confirm no new type errors in the module.)

- [ ] **Step 5: Commit**

```bash
git add storefront/src/app/[countryCode]/(main)/tires/ storefront/src/modules/layout/templates/nav/index.tsx storefront/src/modules/layout/components/mobile-menu/index.tsx
git commit -m "feat(tire-discovery): /tires route + loading + Tires nav links (WB-005 SP2)"
```

---

## Task 9: Full gate + docs

**Files:**
- Modify: `docs/future/BACKLOG.md` (WB-005 note), `docs/STATUS.md` (Discovery pillar + Active work).

- [ ] **Step 1: Full storefront gates**

Run: `cd storefront && npx vitest run` — record the count; all tire-discovery tests + all pre-existing pass.
Run: `cd storefront && npx tsc --noEmit 2>&1 | grep -c error` and confirm no NEW errors beyond the documented baseline (`lib/data/*`, the PDP `resolve-variant.test.ts` + related-products drift per storefront/CLAUDE.md).
Run: `cd storefront && npx -y pnpm@9.10.0 build:next` — confirm `/tires` builds.

- [ ] **Step 2: Update docs**

In `docs/future/BACKLOG.md` WB-005: append that SP2 (tire discovery `/tires` route + facet rail) is DONE, SP3 (tire PDP) remains. In `docs/STATUS.md`: the Discovery pillar row notes a tire discovery surface now exists (`/tires`, parallel `tire-discovery` module, facets rim/size/type/speed/load); add an Active-work bullet; bump "Last verified" to 2026-07-02.

- [ ] **Step 3: doc-review + commit**

Run `/doc-review` (or the doc-review skill); fix any drift. Then:

```bash
git add docs/future/BACKLOG.md docs/STATUS.md
git commit -m "docs: WB-005 SP2 (tire discovery) landed"
```

---

## Self-review notes (for the executor)

- **Spec coverage:** Task 1 = types/parse/cache (spec §Types, §URL contract); Task 2 = data layer (spec §Data layer); Task 3 = client hook; Task 4 = card (spec §Card); Task 5 = facet rail (spec §facets); Tasks 6–7 = header/chips/empty/pagination/template; Task 8 = route + nav (spec §Nav); Task 9 = gate + docs. Fitment removed throughout per spec.
- **Reuse boundary:** the only import from `modules/discovery/` is the pure `lit` escape helper (Task 2). Everything else is a copy-and-transform into `tire-discovery/`. `DiscoveryProduct`, home, and the PDP are untouched.
- **Type consistency:** the facet key names (`rimDiameters/sizes/tireTypes/speedRatings/loadIndexes`) are identical across `TireDiscoveryFilters`, `TireFacetCounts`, `buildTireFilters`'s `facetQueryByDim`, the parser param names, and the rail sections. The Meili field names (`rim_diameters/tire_sizes/tire_type/speed_ratings/load_indexes`) match what SP1's `buildTireDocument` emits + `medusa-config.js` registered.
- **Deferred:** search-drawer tire popular-chips (spec out-of-scope); shared-engine extraction (spec out-of-scope); tire PDP (SP3).
