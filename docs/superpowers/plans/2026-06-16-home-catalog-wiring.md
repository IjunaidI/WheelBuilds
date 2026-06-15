# Home Catalog Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the homepage NEW THIS WEEK, SHOP BY STYLE, and TRUSTED BRANDS sections to real Meilisearch data through reusable components with working `/store?<facet>=` links, showing no fabricated numbers.

**Architecture:** One `react.cache`-wrapped server fetch (`getHomeCatalog`) calls the existing Discovery adapter once per request and returns `{ newestProducts, facets }`. The three sections become async server components: NEW THIS WEEK reuses the existing `DiscoveryProductCard`; TRUSTED BRANDS renders a new `BrandTile` from `facets.brands`; SHOP BY STYLE renders a new `CategoryTile` from a pure `styleTiles(facets)` mapping (curated style→facet config with live counts). The real brand count becomes a single source of truth shared by the eyebrow, Hero, and TrustStrip.

**Tech Stack:** Next.js 15 (App Router, React 19 Server Components), TypeScript, Meilisearch (via the existing server-only Discovery adapter), Vitest (`pnpm test:unit`, node env), Tailwind + the WB `.frame` design classes.

**Reference:** spec `docs/superpowers/specs/2026-06-16-home-catalog-wiring-design.md`. All work is in `storefront/`. Run all commands from `storefront/`. Hrefs are passed WITHOUT `countryCode` (`LocalizedClientLink` prepends it). `next.config.js` sets `typescript.ignoreBuildErrors` + `eslint.ignoreDuringBuilds`, so type/lint errors do NOT fail the build — run `npx tsc --noEmit` separately. The storefront dev server is expected to be running on `http://localhost:8000` for render checks.

---

## File Structure

**Create**
- `src/modules/home/components/shop-by-style/style-map.ts` — pure curated style→facet config + `styleTiles(facets)`.
- `src/modules/home/components/shop-by-style/style-map.test.ts` — Vitest unit test for `styleTiles`.
- `src/modules/home/data/get-home-catalog.ts` — `react.cache`d single fetch returning `{ newestProducts, facets }`.
- `src/modules/common/components/brand-tile/index.tsx` — TRUSTED BRANDS tile.
- `src/modules/common/components/category-tile/index.tsx` — SHOP BY STYLE tile.

**Modify**
- `src/modules/home/components/new-drops-row/index.tsx` — async; reuse `DiscoveryProductCard`.
- `src/modules/home/components/shop-by-brand/index.tsx` — async; render `BrandTile` from facets.
- `src/modules/home/components/shop-by-style/index.tsx` — async; render `CategoryTile` from `styleTiles`.
- `src/app/[countryCode]/(main)/page.tsx` — compute `brandCount`, pass to Hero + TrustStrip.
- `src/modules/home/components/hero/index.tsx` — accept `brandCount` prop; dynamic trust-point.
- `src/modules/home/components/trust-strip/index.tsx` — accept `brandCount` prop; dynamic item.
- `storefront/CLAUDE.md`, `src/modules/discovery/components/grid/product-card.tsx` (docstring), `src/app/[countryCode]/(main)/store/page.tsx` (comment) — fix stale "mock/404/data-live" claims.

**Delete**
- `src/modules/home/components/new-drops-row/product-card.tsx` — duplicate of `DiscoveryProductCard`, single consumer.
- `src/modules/home/components/featured-products/` — whole module, unused (not imported by `page.tsx`).

---

## Task 1: Pure style→facet mapping (`style-map.ts`) — TDD

**Files:**
- Create: `src/modules/home/components/shop-by-style/style-map.ts`
- Test: `src/modules/home/components/shop-by-style/style-map.test.ts`

> Both files use `import type` for cross-module types so esbuild erases them — Vitest needs no path-alias config.

- [ ] **Step 1: Write the failing test**

Create `src/modules/home/components/shop-by-style/style-map.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { styleTiles } from "./style-map"
import type { FacetCounts } from "@modules/discovery/data/types"

const facets: FacetCounts = {
  categories: {},
  brands: { "Black Rhino Hard Alloys": 90, "Black Rhino Hard Alloys - UTV": 15 },
  diameters: { "15": 2, "17": 4, "18": 1, "19": 2, "20": 3, "22": 5, "24": 1 },
  boltPatterns: {},
  finishes: { silver: 7, black: 100 },
}

describe("styleTiles", () => {
  it("sums diameter facets for STREET and builds a CSV href", () => {
    const street = styleTiles(facets).find((t) => t.label === "STREET")
    expect(street).toBeDefined()
    expect(street!.count).toBe(6) // 1 + 2 + 3
    expect(street!.href).toBe("/store?diameters=18,19,20")
  })

  it("reads a single finish facet for LUXURY", () => {
    const luxury = styleTiles(facets).find((t) => t.label === "LUXURY")
    expect(luxury!.count).toBe(7)
    expect(luxury!.href).toBe("/store?finishes=silver")
  })

  it("URL-encodes brand values for UTV", () => {
    const utv = styleTiles(facets).find((t) => t.label === "UTV")
    expect(utv!.count).toBe(15)
    expect(utv!.href).toBe("/store?brands=Black%20Rhino%20Hard%20Alloys%20-%20UTV")
  })

  it("drops tiles whose count is zero", () => {
    const empty: FacetCounts = {
      categories: {}, brands: {}, diameters: {}, boltPatterns: {}, finishes: {},
    }
    expect(styleTiles(empty)).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit`
Expected: FAIL — `Failed to resolve import "./style-map"` (file does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/modules/home/components/shop-by-style/style-map.ts`:

```ts
import type { Finish } from "@modules/common/components/wheel"
import type { FacetCounts } from "@modules/discovery/data/types"

export type StyleTile = {
  label: string
  href: string
  count: number
  finish: Finish
}

type StyleParam = "diameters" | "finishes" | "brands"

type StyleDef = {
  label: string
  finish: Finish
  param: StyleParam
  values: string[]
}

// Curated mapping of marketing "style" labels onto REAL Discovery facets. No
// style taxonomy exists in the data yet (spec §6); counts are computed live
// from the facet distribution so no number is fabricated. UTV + the diameter
// tiles map cleanly; OFF-ROAD / LUXURY / DRAG are approximations. When a real
// style facet lands, only this array changes.
export const STYLE_DEFS: StyleDef[] = [
  { label: "STREET", finish: "bronze", param: "diameters", values: ["18", "19", "20"] },
  { label: "TRUCK & DUALLY", finish: "black", param: "diameters", values: ["22", "24", "26"] },
  { label: "LUXURY", finish: "silver", param: "finishes", values: ["silver"] },
  { label: "UTV", finish: "bronze", param: "brands", values: ["Black Rhino Hard Alloys - UTV"] },
  { label: "OFF-ROAD", finish: "black", param: "brands", values: ["Black Rhino Hard Alloys"] },
  { label: "DRAG", finish: "silver", param: "diameters", values: ["15", "17"] },
]

const PARAM_TO_FACET: Record<StyleParam, keyof FacetCounts> = {
  diameters: "diameters",
  finishes: "finishes",
  brands: "brands",
}

/**
 * Build the Shop-by-Style tiles from a live FacetCounts. Each tile's count is
 * the sum of its matched facet values; tiles with a zero count are dropped so
 * the homepage never shows an empty style. The href points at filtered /store
 * (values URL-encoded, comma-joined — parseQueryFromSearchParams reads CSV).
 */
export function styleTiles(facets: FacetCounts): StyleTile[] {
  return STYLE_DEFS.map((def) => {
    const dist = facets[PARAM_TO_FACET[def.param]] ?? {}
    const count = def.values.reduce((sum, v) => sum + (dist[v] ?? 0), 0)
    const href = `/store?${def.param}=${def.values.map(encodeURIComponent).join(",")}`
    return { label: def.label, href, count, finish: def.finish }
  }).filter((t) => t.count > 0)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit`
Expected: PASS — 4 tests in `style-map.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/modules/home/components/shop-by-style/style-map.ts src/modules/home/components/shop-by-style/style-map.test.ts
git commit -m "feat(home): pure style->facet mapping for Shop by Style

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Cached home-catalog data fetch (`get-home-catalog.ts`)

**Files:**
- Create: `src/modules/home/data/get-home-catalog.ts`

- [ ] **Step 1: Write the implementation**

Create `src/modules/home/data/get-home-catalog.ts`:

```ts
import "server-only"
import { cache } from "react"
import { getDiscoveryProducts } from "@modules/discovery/data/get-products"
import {
  EMPTY_FILTERS,
  type DiscoveryProduct,
  type FacetCounts,
} from "@modules/discovery/data/types"

export type HomeCatalog = {
  newestProducts: DiscoveryProduct[]
  facets: FacetCounts
}

/**
 * Single source of catalog data for the homepage. react.cache dedupes it
 * across the sibling sections (NewDropsRow, ShopByBrand, ShopByStyle, and the
 * page-level brand count), so all of them share ONE Meilisearch round-trip per
 * request. getDiscoveryProducts swallows Meili failures into an empty result,
 * so this never throws — callers degrade on empty data.
 */
export const getHomeCatalog = cache(async (): Promise<HomeCatalog> => {
  const { products, facets } = await getDiscoveryProducts({
    filters: EMPTY_FILTERS,
    sort: "newest",
    page: 1,
  })
  return { newestProducts: products, facets }
})
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep get-home-catalog`
Expected: no output (no errors in the new file).

- [ ] **Step 3: Commit**

```bash
git add src/modules/home/data/get-home-catalog.ts
git commit -m "feat(home): cached getHomeCatalog (one Meili call powers all rails)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `BrandTile` component

**Files:**
- Create: `src/modules/common/components/brand-tile/index.tsx`

- [ ] **Step 1: Write the implementation**

Create `src/modules/common/components/brand-tile/index.tsx`:

```tsx
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Label from "@modules/common/components/label"

type BrandTileProps = {
  name: string
  href: string
  /** Product count shown under the name. Omitted = no count line. */
  count?: number
}

/**
 * A brand entry in the TRUSTED BRANDS grid. Reuses the `.brand-chip` design
 * class. href is country-scoped by LocalizedClientLink (pass WITHOUT countryCode).
 */
const BrandTile = ({ name, href, count }: BrandTileProps) => (
  <LocalizedClientLink
    href={href}
    className="brand-chip"
    style={{ textDecoration: "none" }}
  >
    <span
      style={{
        fontFamily: "var(--display)",
        fontWeight: 900,
        fontSize: 22,
        color: "var(--ink)",
        letterSpacing: "0.04em",
      }}
    >
      {name}
    </span>
    {typeof count === "number" && (
      <Label tone="muted" style={{ marginTop: 4, display: "block" }}>
        {count} {count === 1 ? "wheel" : "wheels"}
      </Label>
    )}
  </LocalizedClientLink>
)

export default BrandTile
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep brand-tile`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/modules/common/components/brand-tile/index.tsx
git commit -m "feat(common): BrandTile primitive

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `CategoryTile` component

**Files:**
- Create: `src/modules/common/components/category-tile/index.tsx`

> Mirrors the existing inline `.style-tile` markup from `shop-by-style/index.tsx`, parameterized. Uses only confirmed primitives (Display, Label, Wheel, Icon, LocalizedClientLink).

- [ ] **Step 1: Write the implementation**

Create `src/modules/common/components/category-tile/index.tsx`:

```tsx
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Wheel, { Finish } from "@modules/common/components/wheel"
import Display from "@modules/common/components/display"
import Label from "@modules/common/components/label"
import Icon from "@modules/common/components/icon"

type CategoryTileProps = {
  label: string
  href: string
  /** Live product count for this style filter. Omitted = no count line. */
  count?: number
  finish?: Finish
}

/**
 * A style entry in the SHOP BY STYLE grid. Reuses the `.style-tile` design
 * class. href is country-scoped by LocalizedClientLink (pass WITHOUT countryCode).
 */
const CategoryTile = ({ label, href, count, finish = "black" }: CategoryTileProps) => (
  <LocalizedClientLink
    href={href}
    className="style-tile"
    style={{ textDecoration: "none", color: "inherit" }}
  >
    <div>
      <Display size={22} className="small:!text-[28px]">
        {label}
      </Display>
      {typeof count === "number" && (
        <Label tone="muted" style={{ marginTop: 8, display: "block" }}>
          {count} {count === 1 ? "wheel" : "wheels"}
        </Label>
      )}
      <span
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.06em]"
        style={{ marginTop: 32, display: "inline-flex", color: "var(--orange)" }}
      >
        Explore
        <Icon name="arrow-right" size={14} color="#FF6A00" strokeWidth={2} />
      </span>
    </div>
    <Wheel size={140} finish={finish} />
  </LocalizedClientLink>
)

export default CategoryTile
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep category-tile`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/modules/common/components/category-tile/index.tsx
git commit -m "feat(common): CategoryTile primitive

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Wire NEW THIS WEEK to real products

**Files:**
- Modify: `src/modules/home/components/new-drops-row/index.tsx`
- Delete: `src/modules/home/components/new-drops-row/product-card.tsx`

- [ ] **Step 1: Replace the section with the real-data version**

Replace the entire contents of `src/modules/home/components/new-drops-row/index.tsx` with:

```tsx
import SectionHeader from "@modules/common/components/section-header"
import MicroLink from "@modules/common/components/micro-link"
import DiscoveryProductCard from "@modules/discovery/components/grid/product-card"
import { getHomeCatalog } from "@modules/home/data/get-home-catalog"

const NewDropsRow = async () => {
  const { newestProducts } = await getHomeCatalog()
  const drops = newestProducts.slice(0, 6)
  if (drops.length === 0) return null

  return (
    <section className="px-5 pt-16 pb-12 xsmall:px-8 small:px-20 small:pt-[120px] small:pb-20">
      <SectionHeader
        counter="08"
        title="New This Week"
        description="Fresh fitments, first to land — first to ship."
        action={<MicroLink href="/store?sort=newest">View all</MicroLink>}
      />
      <div className="grid grid-cols-2 small:grid-cols-3 medium:grid-cols-6 gap-4">
        {drops.map((p) => (
          <DiscoveryProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  )
}

export default NewDropsRow
```

- [ ] **Step 2: Delete the duplicate home-only card**

```bash
git rm src/modules/home/components/new-drops-row/product-card.tsx
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep new-drops-row`
Expected: no output. (If a residual import of the deleted `./product-card` appears, it means another file referenced it — verify with `grep -rn "new-drops-row/product-card" src` and remove; expected: only `index.tsx` referenced it.)

- [ ] **Step 4: Render check**

Run: `curl -s http://localhost:8000/us | grep -oE 'assets\.wheelpros\.com[^"&\\]*' | head -1`
Expected: a real vendor-CDN URL prints (the NEW THIS WEEK cards now render real product images).

- [ ] **Step 5: Commit**

```bash
git add src/modules/home/components/new-drops-row/index.tsx
git commit -m "feat(home): wire NEW THIS WEEK to newest products via getHomeCatalog

Reuses DiscoveryProductCard; deletes the duplicate home-only card. Section
action links to /store?sort=newest. Renders null when no products.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Wire TRUSTED BRANDS to real brand facets

**Files:**
- Modify: `src/modules/home/components/shop-by-brand/index.tsx`

- [ ] **Step 1: Replace the section with the real-data version**

Replace the entire contents of `src/modules/home/components/shop-by-brand/index.tsx` with:

```tsx
import SectionHeader from "@modules/common/components/section-header"
import MicroLink from "@modules/common/components/micro-link"
import BrandTile from "@modules/common/components/brand-tile"
import { getHomeCatalog } from "@modules/home/data/get-home-catalog"

const ShopByBrand = async () => {
  const { facets } = await getHomeCatalog()
  const brands = Object.entries(facets.brands).sort((a, b) => b[1] - a[1])
  if (brands.length === 0) return null

  return (
    <section
      className="px-5 py-16 xsmall:px-8 small:px-20 small:py-[120px] bg-white"
      style={{ borderTop: "1px solid var(--hairline)" }}
    >
      <SectionHeader
        eyebrow={`${brands.length} BRANDS · ALL AUTHORIZED`}
        title="Trusted Brands"
        action={<MicroLink href="/store">View all brands</MicroLink>}
      />
      <div className="grid grid-cols-2 xsmall:grid-cols-3 small:grid-cols-4 gap-3 small:gap-4">
        {brands.map(([name, count]) => (
          <BrandTile
            key={name}
            name={name}
            count={count}
            href={`/store?brands=${encodeURIComponent(name)}`}
          />
        ))}
      </div>
    </section>
  )
}

export default ShopByBrand
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep shop-by-brand`
Expected: no output.

- [ ] **Step 3: Render check**

Run: `curl -s http://localhost:8000/us | grep -oE '/store\?brands=[^"]*' | head -3`
Expected: real `/store?brands=<encoded brand>` hrefs print (e.g. `Black%20Rhino%20Hard%20Alloys`).

- [ ] **Step 4: Commit**

```bash
git add src/modules/home/components/shop-by-brand/index.tsx
git commit -m "feat(home): wire TRUSTED BRANDS to real Meili brand facet + counts

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Wire SHOP BY STYLE to the curated facet map

**Files:**
- Modify: `src/modules/home/components/shop-by-style/index.tsx`

- [ ] **Step 1: Replace the section with the real-data version**

Replace the entire contents of `src/modules/home/components/shop-by-style/index.tsx` with:

```tsx
import Display from "@modules/common/components/display"
import CategoryTile from "@modules/common/components/category-tile"
import { getHomeCatalog } from "@modules/home/data/get-home-catalog"
import { styleTiles } from "./style-map"

const ShopByStyle = async () => {
  const { facets } = await getHomeCatalog()
  const tiles = styleTiles(facets)
  if (tiles.length === 0) return null

  return (
    <section className="px-5 pb-16 xsmall:px-8 small:px-20 small:pb-[120px]">
      <Display size={32} className="mb-6 small:!text-[40px] small:mb-8">
        Shop by Style
      </Display>
      <div className="grid grid-cols-2 small:grid-cols-3 gap-4">
        {tiles.map((t) => (
          <CategoryTile
            key={t.label}
            label={t.label}
            href={t.href}
            count={t.count}
            finish={t.finish}
          />
        ))}
      </div>
    </section>
  )
}

export default ShopByStyle
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep shop-by-style`
Expected: no output.

- [ ] **Step 3: Render check**

Run: `curl -s http://localhost:8000/us | grep -oE '/store\?(diameters|finishes|brands)=[^"]*' | head`
Expected: real filtered `/store?diameters=18,19,20` / `?finishes=silver` / `?brands=…` hrefs from the style tiles.

- [ ] **Step 4: Commit**

```bash
git add src/modules/home/components/shop-by-style/index.tsx
git commit -m "feat(home): wire SHOP BY STYLE to curated facet map with live counts

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Brand-count single source of truth (page + Hero + TrustStrip)

**Files:**
- Modify: `src/app/[countryCode]/(main)/page.tsx`
- Modify: `src/modules/home/components/hero/index.tsx`
- Modify: `src/modules/home/components/trust-strip/index.tsx`

- [ ] **Step 1: Compute `brandCount` in the page and pass it down**

In `src/app/[countryCode]/(main)/page.tsx`, add the import and the fetch, and pass the prop to `<Hero>` and `<TrustStrip>`.

Add after the existing imports (after the `Newsletter` import line):

```tsx
import { getHomeCatalog } from "@modules/home/data/get-home-catalog"
```

Replace the component body:

```tsx
export default async function Home() {
  const { facets } = await getHomeCatalog()
  const brandCount = Object.keys(facets.brands).length

  return (
    <>
      <Hero brandCount={brandCount} />
      <NewDropsRow />
      <ShopByStyle />
      <FeaturedBlocks />
      <ShopByBrand />
      <BuildGallery />
      <TrustStrip brandCount={brandCount} />
      <Newsletter />
    </>
  )
}
```

- [ ] **Step 2: Accept `brandCount` in Hero and use it for the trust point**

In `src/modules/home/components/hero/index.tsx`:

Change the signature line:

```tsx
const Hero = ({ brandCount }: { brandCount?: number }) => {
```

Delete the module-level `TRUST_POINTS` const (lines 13–18) and instead declare it inside the component, after the `primaryCtaText` block (before `return (`):

```tsx
  const TRUST_POINTS = [
    { l: "Fitment guaranteed", s: "Or your money back" },
    { l: "Free returns", s: "30 days, unmounted" },
    { l: "Free ship $199+", s: "2–3 day delivery" },
    { l: "Authorized dealer", s: brandCount ? `${brandCount} brands` : "Premium brands" },
  ]
```

(The `.map` over `TRUST_POINTS` in the JSX is unchanged.)

- [ ] **Step 3: Accept `brandCount` in TrustStrip and use it for the item**

In `src/modules/home/components/trust-strip/index.tsx`:

Change the signature and move `ITEMS` inside the component so it can read `brandCount`. Replace the module-level `const ITEMS = [...]` and `const TrustStrip = () => (` with:

```tsx
const TrustStrip = ({ brandCount }: { brandCount?: number }) => {
  const ITEMS: { icon: IconName; h: string; s: string }[] = [
    { icon: "shipping", h: "Free shipping $199+", s: "Lower 48, ground" },
    { icon: "shield", h: "Fitment guarantee", s: "Or your money back" },
    {
      icon: "badge",
      h: "Authorized dealer",
      s: brandCount ? `${brandCount} premium brands` : "Premium brands",
    },
    { icon: "return", h: "30-day returns", s: "Unmounted wheels" },
  ]

  return (
```

The closing of the component changes from `)` to `)\n}` — i.e. wrap the existing returned JSX in `return ( … )` and close the function body. Concretely, the final two lines become:

```tsx
    })}
    </div>
  )
}

export default TrustStrip
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -E "page.tsx|hero/index|trust-strip"`
Expected: no output.

- [ ] **Step 5: Render check — all three counts agree**

Run: `curl -s http://localhost:8000/us | grep -oE '[0-9]+ (premium )?brands|[0-9]+ BRANDS' | sort | uniq -c`
Expected: the same brand number appears in the eyebrow (`N BRANDS`), Hero (`N brands`), and TrustStrip (`N premium brands`) — no more 42/42/40+ mismatch.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[countryCode]/(main)/page.tsx" src/modules/home/components/hero/index.tsx src/modules/home/components/trust-strip/index.tsx
git commit -m "feat(home): single source of truth for the brand count

Real Object.keys(facets.brands).length flows from the page to the eyebrow,
Hero, and TrustStrip (was hardcoded 42/42/40+). Falls back to static copy
when Meili is unavailable.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Cleanup + docs

**Files:**
- Delete: `src/modules/home/components/featured-products/` (whole dir)
- Modify: `storefront/CLAUDE.md`, `src/modules/discovery/components/grid/product-card.tsx` (docstring), `src/app/[countryCode]/(main)/store/page.tsx` (comment)

- [ ] **Step 1: Confirm the dead module is unreferenced, then delete it**

Run: `grep -rn "home/components/featured-products" src` and `grep -rn "featured-products" "src/app/[countryCode]/(main)/page.tsx"`
Expected: no references (the module is not imported anywhere).

```bash
git rm -r src/modules/home/components/featured-products
```

- [ ] **Step 2: Fix the stale DiscoveryProductCard docstring**

In `src/modules/discovery/components/grid/product-card.tsx`, replace the docstring paragraph that claims the link 404s:

Old:
```tsx
 * When real data lands, `handle` resolves to a real product page; today the
 * link goes to /products/<mock-handle> which 404s — that's fine for chrome.
```
New:
```tsx
 * `handle` resolves to the real PDP. Reused by the Discovery grid, the PDP
 * "Similar wheels" row, and the home NEW THIS WEEK rail.
```

- [ ] **Step 3: Fix the stale `store/page.tsx` "MOCK data" comment**

Run: `grep -n "MOCK" "src/app/[countryCode]/(main)/store/page.tsx"`
For each matching comment, reword it to state the page reads the live Meilisearch adapter (remove the word "MOCK"). Example: change a line like `// MOCK data for now` to `// Live Meilisearch adapter (getDiscoveryProducts).`

- [ ] **Step 4: Fix the storefront/CLAUDE.md "data-live home" claim**

In `storefront/CLAUDE.md`, update the "Design coverage" wording that says the home is already "data-live / wired against real data". Replace the relevant Home/Notes cell text with: `Home catalog sections (NEW THIS WEEK, SHOP BY STYLE, TRUSTED BRANDS) are wired to live Meilisearch data via getHomeCatalog; FEATURED BLOCKS / BUILD GALLERY / NEWSLETTER remain editorial/placeholder.`

- [ ] **Step 5: Type-check (ensure no dangling imports from the deletion)**

Run: `npx tsc --noEmit 2>&1 | grep -iE "featured-products|product-rail"`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(home): delete dead featured-products module + fix stale docs

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Unit tests**

Run: `pnpm test:unit`
Expected: PASS (includes the 4 `styleTiles` tests).

- [ ] **Step 2: Type-check the touched surface**

Run: `npx tsc --noEmit 2>&1 | grep -iE "home/|brand-tile|category-tile|get-home-catalog|style-map"`
Expected: no output (no new type errors introduced by this work; pre-existing errors elsewhere are out of scope).

- [ ] **Step 3: Render the homepage and confirm real catalog data**

Run:
```bash
curl -s http://localhost:8000/us > /tmp/home.html
echo "product images: $(grep -oE 'assets\.wheelpros\.com[^"&\\]*' /tmp/home.html | wc -l)"
echo "brand links:    $(grep -oE '/store\?brands=[^"]*' /tmp/home.html | sort -u | wc -l)"
echo "style links:    $(grep -oE '/store\?(diameters|finishes)=[^"]*' /tmp/home.html | sort -u | wc -l)"
echo "newest action:  $(grep -oc '/store?sort=newest' /tmp/home.html)"
echo "any dead links: $(grep -oE 'href="[^"]*/(collections|categories)"' /tmp/home.html | wc -l)  (expect 0 from these sections)"
```
Expected: product images > 0, brand links > 0, style links > 0, newest action present, and zero bare `/collections` or `/categories` links from the wired sections.

- [ ] **Step 4: Spot-check a brand click-through resolves to a filtered catalog**

Pick one brand href from Step 3 and confirm `/us/store?brands=<that value>` returns HTTP 200 and shows only that brand:

Run: `curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:8000/us/store?brands=Black%20Rhino%20Hard%20Alloys"`
Expected: `200`.

- [ ] **Step 5: Final commit (if any verification fixes were made)**

```bash
git add -A
git commit -m "test(home): verify catalog wiring end-to-end

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

(If Steps 1–4 pass with no changes, skip this commit.)

---

## Notes / out of scope
- FEATURED BLOCKS, BUILD GALLERY, NEWSLETTER stay editorial/placeholder (no data source).
- Wishlist persistence, newsletter submit, BuildGallery post count — separate follow-ups.
- A real backend **style taxonomy** is future work (spec §6); when it lands, only `style-map.ts` (and the backend) change — `CategoryTile`/`ShopByStyle` are unaffected.
- The `vendor-sync` service container bug (cron/admin-approve can't apply) is unrelated to this plan; tracked separately.
