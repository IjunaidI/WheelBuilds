# Home Catalog Wiring — Design Spec

- **Date:** 2026-06-16
- **Status:** Approved (design); pending implementation plan
- **Scope owner:** storefront (`storefront/src/modules/home`, `storefront/src/modules/common/components`)
- **Related:** [[project_fitment_audit_standing]], `storefront/CLAUDE.md` (Discovery + reusable-primitive conventions), price-unit convention (dollars in Medusa, cents in the index)

## 1. Problem

The homepage "catalog pieces" render **hardcoded demo data with dead links**. Verified (via live Meilisearch queries + full source read):

- **NEW THIS WEEK** (`modules/home/components/new-drops-row/index.tsx`) — hardcoded `DROPS` array of 6 fake products (BLACKLINE BL-7, etc.), price as a pre-formatted string, no handle. Renders a home-only `product-card.tsx` (a structural subset duplicate of `DiscoveryProductCard`) drawing a decorative `<Wheel>` SVG. Per-card link `/products/<slugify(name)>` → 404; section action → `/collections` → 404.
- **SHOP BY STYLE** (`shop-by-style/index.tsx`) — hardcoded `STYLE_TILES` with **fabricated counts** (12/84/127…). Every tile links to `/categories` → 404.
- **TRUSTED BRANDS** (`shop-by-brand/index.tsx`, component `ShopByBrand`) — hardcoded `BRANDS` of 12 fake names; eyebrow "42 BRANDS · ALL AUTHORIZED" is fabricated. Tiles + "View all" → `/collections` → 404.

The brand-count claim appears in **three** places that disagree: Hero `TRUST_POINTS` ("42"), this eyebrow ("42"), TrustStrip ("40+").

## 2. Goal

Wire the three catalog sections to **real Meilisearch data** through **reusable components** with **working links**, show **no fabricated numbers**, and reconcile the brand count to a single source of truth. Delete the duplicate/dead code introduced by the demo build.

### In scope
- NEW THIS WEEK, SHOP BY STYLE, TRUSTED BRANDS.
- Reusable component set (one shared product card + two new tiles).
- Link rewiring to `/store?<facet>=…`.
- Brand-count single source of truth.
- Delete dead code; fix stale docs.

### Out of scope (deferred follow-ups)
- FEATURED BLOCKS / BUILD GALLERY editorial sections (hand-curated, no data source).
- Newsletter submit endpoint, wishlist persistence, BuildGallery "14.2K posts" (toast/placeholder fakes).
- A real backend **style taxonomy** (see §6 — future option).

## 3. Data source (verified)

A single existing call yields everything: `getDiscoveryProducts({ filters: EMPTY_FILTERS, sort: "newest", page: 1 })` (`modules/discovery/data/get-products.ts`), which returns `DiscoveryResult { products, facets }` where `facets: FacetCounts` includes `brands`, `diameters`, `finishes`, `boltPatterns` distributions over all wheels (`product_type = "wheel"`).

Live verification (248 wheels):
- `facets.brands` = 12 keys: Black Rhino Hard Alloys (90), Performance Replicas (85), Petrol (28), Black Rhino Hard Alloys - UTV (15), Tuff (8), TSW (7), Level 8 (5), DUB 1PC (3), Victor Equipment (3), OHM (2), Mandrus (1), XD Powersports (1).
- `facets.diameters` = {14:11, 15:26, 16:28, 17:135, 18:13, 19:8, 20:67, 22:50, 24:16, 26:14}.
- `sort:"newest"` → `created_at:desc`, real handles + vendor-CDN `thumbnail` + integer-cents `priceCents`.

The adapter **swallows Meilisearch failures** and returns an empty result (`get-products.ts` ~197–201). Consumers must degrade gracefully.

## 4. Design

### 4.1 Data layer — one cached call powers all sections
New file `modules/home/data/get-home-catalog.ts`:

```ts
import "server-only"
import { cache } from "react"
import { getDiscoveryProducts } from "@modules/discovery/data/get-products"
import { EMPTY_FILTERS, type DiscoveryProduct, type FacetCounts } from "@modules/discovery/data/types"

export type HomeCatalog = { newestProducts: DiscoveryProduct[]; facets: FacetCounts }

export const getHomeCatalog = cache(async (): Promise<HomeCatalog> => {
  const { products, facets } = await getDiscoveryProducts({
    filters: EMPTY_FILTERS, sort: "newest", page: 1,
  })
  return { newestProducts: products, facets }
})
```

`react.cache` dedupes across the sibling sections → **one Meili round-trip per request**. On Meili outage the wrapped adapter returns `products: []` / empty facets, which each section handles per §4.6.

### 4.2 Reusable components (`modules/common/components`)
1. **Product card** — reuse `DiscoveryProductCard` (`modules/discovery/components/grid/product-card.tsx`) **in place**. It is already the canonical card (real thumbnail with `<Wheel>` fallback, NEW `Chip`, `FitBadge` island, `priceCents/100` display) and is already shared by the discovery grid + PDP related. **Delete** the duplicate `new-drops-row/product-card.tsx` (single consumer, structural subset). No physical move (would churn discovery + PDP imports). Optional non-breaking `density?: "rail" | "grid"` prop tuning only the `<Image sizes>` hint for the 6-up rail.
2. **`BrandTile`** (new, `common/components/brand-tile/index.tsx`) — server-safe, props `{ name: string; href: string; count?: number }`. Reuses the existing `.frame .brand-chip` CSS class + `Chip` for the count.
3. **`CategoryTile`** (new, `common/components/category-tile/index.tsx`) — server-safe, props `{ label: string; href: string; count?: number; finish?: Finish }`. Reuses the existing `.frame .style-tile` CSS class + `MicroLink("Explore")` + `Wheel` + optional `Chip` count.

No new CSS classes; no new module directory; `wb-`-prefix rule respected. Hrefs are always passed **without** `countryCode` (`LocalizedClientLink` prepends it).

### 4.3 NewDropsRow → async server component
- `const { newestProducts } = await getHomeCatalog()`.
- Render `newestProducts.slice(0, 6)` as `<DiscoveryProductCard product={p} />`.
- If `newestProducts.length === 0` → render `null` (mirror `product-detail/components/related/index.tsx` empty-guard).
- Section action `MicroLink` → `/store?sort=newest` (label "View all", drop the fake "08" number; the decorative section counter stays as page chrome).
- Delete the `DROPS` array.

### 4.4 ShopByBrand → async server component
- `const { facets } = await getHomeCatalog()`.
- `Object.entries(facets.brands)` (optionally sorted by count desc) → `<BrandTile name={name} count={count} href={`/store?brands=${encodeURIComponent(name)}`} />`. Brand value is the **exact raw facet key** (Meili exact-string match) — never uppercased/hardcoded.
- Eyebrow = `${brandCount} BRANDS · ALL AUTHORIZED` where `brandCount = Object.keys(facets.brands).length` (§4.7).
- "View all brands" `MicroLink` → `/store` (no brands-index route exists).
- If `brandCount === 0` → render `null`.
- Delete the `BRANDS` array.

### 4.5 ShopByStyle → async server component
- `const { facets } = await getHomeCatalog()`.
- A pure module `shop-by-style/style-map.ts` exports the curated config + a `styleTiles(facets)` function returning `{ label, href, count, finish }[]`, counts derived from `facets` (no extra queries):

| Tile | `/store` filter | Count source |
|---|---|---|
| STREET | `diameters=18,19,20` | sum `facets.diameters[18]+[19]+[20]` |
| TRUCK & DUALLY | `diameters=22,24,26` | sum `facets.diameters[22]+[24]+[26]` |
| LUXURY | `finishes=silver` | `facets.finishes.silver` |
| UTV | `brands=Black Rhino Hard Alloys - UTV` | `facets.brands["Black Rhino Hard Alloys - UTV"]` |
| OFF-ROAD | `brands=Black Rhino Hard Alloys` | `facets.brands["Black Rhino Hard Alloys"]` |
| DRAG | `diameters=15,17` | sum `facets.diameters[15]+[17]` |

- Render only tiles with `count > 0` (never show an empty/zero style).
- `href` uses CSV-joined values (`parseQueryFromSearchParams` accepts CSV); brand values URL-encoded.
- **Honesty note:** UTV + diameter tiles map cleanly; OFF-ROAD / LUXURY / DRAG are approximations (no true style data), but the displayed count is the **real** count for that filter. The config is the only thing that changes when a real taxonomy lands (§6).
- Delete the `STYLE_TILES` array.

### 4.6 Error handling / degradation
- Meili down → empty products + empty facets → NewDropsRow & ShopByBrand render `null`; ShopByStyle filters to 0 qualifying tiles → the section renders `null` (not an empty grid). Rule: every section returns `null` when it has nothing real to show.
- `thumbnail` is `string|null`; the card already falls back to `<Wheel>`. Image-less rows are filtered at staging, so for wheels it is effectively non-null — the guard is defensive.
- Price stays integer cents end-to-end; reusing `DiscoveryProductCard` (which divides by 100 for display) inherently fixes the demo card's pre-formatted string and avoids reintroducing a 100× bug.

### 4.7 Brand-count single source of truth
`brandCount = Object.keys(facets.brands).length`. `page.tsx` becomes async, calls `getHomeCatalog()` (same cached call), and passes `brandCount` to the consumers that don't fetch:
- `ShopByBrand` eyebrow (computes its own, identical value — same cached call).
- `Hero` — add a `brandCount?: number` prop; `TRUST_POINTS` "Authorized dealer · 42 brands" reads it; falls back to its current static text when `brandCount` is falsy (Meili outage).
- `TrustStrip` — same prop + fallback for "Authorized dealer · 40+ premium brands".

### 4.8 Cleanup + docs
- Delete `modules/home/components/new-drops-row/product-card.tsx`.
- Delete the unused `modules/home/components/featured-products/` module (flagged dead in `storefront/CLAUDE.md`; not imported by `page.tsx`).
- Fix stale claims: `storefront/CLAUDE.md` "home is data-live / already wired against real data" (false today); `DiscoveryProductCard` docstring "links 404"; `store/page.tsx` "MOCK data" comment.

## 5. File manifest

**New**
- `modules/home/data/get-home-catalog.ts`
- `modules/common/components/brand-tile/index.tsx`
- `modules/common/components/category-tile/index.tsx`
- `modules/home/components/shop-by-style/style-map.ts` (pure config + `styleTiles(facets)`)

**Edit**
- `modules/home/components/new-drops-row/index.tsx`
- `modules/home/components/shop-by-brand/index.tsx`
- `modules/home/components/shop-by-style/index.tsx`
- `app/[countryCode]/(main)/page.tsx` (async; pass `brandCount`)
- `modules/home/components/hero/index.tsx` (+ `brandCount` prop)
- `modules/home/components/trust-strip/index.tsx` (+ `brandCount` prop)
- `storefront/CLAUDE.md`, `DiscoveryProductCard` docstring, `store/page.tsx` comment

**Delete**
- `modules/home/components/new-drops-row/product-card.tsx`
- `modules/home/components/featured-products/` (whole module)

## 6. Future (not now)
Real style taxonomy: create off-road/luxury/street/truck/drag/utv product categories, assign them during vendor-sync apply (`apply.ts` already sets `category_ids`), add a `style` field to `build-search-document.ts` + a Meili `filterableAttribute`, and switch `style-map.ts` from facet-derived to a `style` facet. Only `style-map.ts` (and the backend) change — `CategoryTile` and `ShopByStyle` are unaffected.

## 7. Testing / acceptance

**Unit (Vitest):** `style-map.ts` `styleTiles(facets)` — given a sample `FacetCounts`, returns correct hrefs + summed counts and drops 0-count tiles.

**Manual / render verification** (against the live local stack):
- `/us` renders 6 real product cards with vendor-CDN images and real "FROM $price"; cards link to real `/products/<handle>` (PDP 200).
- TRUSTED BRANDS shows real brand tiles; eyebrow count = `Object.keys(facets.brands).length`; tiles link to `/store?brands=<exact>` and land on a correctly filtered catalog.
- SHOP BY STYLE shows only non-zero tiles with **real** counts; tiles link to filtered `/store` results.
- Hero / TrustStrip / eyebrow brand counts all match.
- No link 404s from these sections.
- `npx tsc --noEmit` shows no new errors from the change.

**Acceptance:** zero fabricated numbers on the three sections; zero 404 links; one canonical product card; one cached data call per request.
