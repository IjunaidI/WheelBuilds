# Home tire rail — Design

> Date: 2026-07-03. Status: in-progress. Pillar: Home / merchandising. Backlog: **WB-064**.
> The tire store is live (WB-005) and has forward fitment (WB-063), but the home page is still
> eight wheel-only sections — nothing signals that Wheel Builds also sells tires. This adds one
> home section: a live rail of the newest tires, so the "we sell tires too" message lands on the
> landing page.

## Context

The home page ([`app/[countryCode]/(main)/page.tsx`](../../../storefront/src/app/[countryCode]/(main)/page.tsx))
composes eight sections: Hero → **New This Week** (newest wheels) → Shop by Style → Featured →
Shop by Brand → Catalog Wall → Trust → Newsletter. Every one is wheel-focused.

The tire surface already exists and is live:
- [`getTireDiscoveryProducts(query)`](../../../storefront/src/modules/tire-discovery/data/get-tire-products.ts)
  — the Meilisearch tire adapter. Returns `TireDiscoveryResult { products: TireDiscoveryProduct[], … }`
  and **swallows Meilisearch failures**, returning an empty result rather than throwing.
- [`EMPTY_TIRE_FILTERS`](../../../storefront/src/modules/tire-discovery/data/types.ts) — the no-filter default.
- [`TireProductCard`](../../../storefront/src/modules/tire-discovery/components/grid/tire-product-card.tsx)
  — the tire card used across `/tires` and tire-PDP "related". It already renders the WB-063
  `TireFitBadge`, so a card shows a "FITS" badge automatically when a garage vehicle matches.

The wheels rail this mirrors is
[`new-drops-row`](../../../storefront/src/modules/home/components/new-drops-row/index.tsx): a server
component that reads the newest products and renders a responsive card grid under a `SectionHeader`
+ `MicroLink`, returning `null` when there are no products.

## Decision (from brainstorming)

- **A live tire product rail**, not a static promo banner — showing real tires proves the inventory.
- **Placement: directly after New This Week**, high on the page, so it reads "new wheels, and tires too."
- **Newest tires** (`sort: "newest"`), first 6 — mirroring the wheels rail's selection.
- **No fit-aware filtering of the rail itself.** Every visitor sees the same newest tires; the
  per-card `TireFitBadge` already signals fit when a vehicle is active. (Fit-filtering the rail would
  require a client component or a server fit seam — out of scope, YAGNI.)
- **No promo banner, no hero/trust-copy rewrites.** Just the one section.

## Architecture

Three changes, all in the storefront `home` module + the page:

### 1. Data helper — `modules/home/data/get-home-tires.ts`

```ts
import { getTireDiscoveryProducts } from "@modules/tire-discovery/data/get-tire-products"
import { EMPTY_TIRE_FILTERS } from "@modules/tire-discovery/data/types"
import type { TireDiscoveryProduct } from "@modules/tire-discovery/data/types"

/** The newest N tires for the home rail. Throw-safe: the tire adapter returns
 *  an empty result on Meilisearch failure, so this degrades to []. */
export async function getHomeTires(limit = 6): Promise<TireDiscoveryProduct[]> {
  const { products } = await getTireDiscoveryProducts({
    filters: EMPTY_TIRE_FILTERS,
    sort: "newest",
    page: 1,
  })
  return products.slice(0, limit)
}
```

A thin wrapper — keeps the section file declarative and gives one place to change the source later
(e.g. a curated `NEXT_PUBLIC_FEATURED_TIRE_HANDLES` list, mirroring `get-featured.ts`, if wanted).

### 2. Section — `modules/home/components/shop-tires-row/index.tsx`

A **server component** mirroring `new-drops-row`:

```tsx
import SectionHeader from "@modules/common/components/section-header"
import MicroLink from "@modules/common/components/micro-link"
import TireProductCard from "@modules/tire-discovery/components/grid/tire-product-card"
import { getHomeTires } from "@modules/home/data/get-home-tires"

const ShopTiresRow = async () => {
  const tires = await getHomeTires(6)
  if (tires.length === 0) return null

  return (
    <section className="px-5 pt-16 pb-12 xsmall:px-8 small:px-20 small:pt-[120px] small:pb-20">
      <SectionHeader
        counter="09"
        title="Shop Tires"
        description="Grip that matches the build — tires for every fitment."
        action={<MicroLink href="/tires">View all tires</MicroLink>}
      />
      <div className="grid grid-cols-2 small:grid-cols-3 medium:grid-cols-6 gap-4">
        {tires.map((t) => (
          <TireProductCard key={t.id} product={t} />
        ))}
      </div>
    </section>
  )
}

export default ShopTiresRow
```

- `counter="09"` continues the decorative section-number sequence (the wheels rail is `"08"`); these
  counters are ornamental, not a computed index.
- Same responsive grid classes and section padding as `new-drops-row` for visual consistency.
- `TireProductCard`'s prop is `product: TireDiscoveryProduct` — the exact type `getHomeTires` returns.

### 3. Wire-in — `app/[countryCode]/(main)/page.tsx`

Import `ShopTiresRow` and render `<ShopTiresRow />` immediately after `<NewDropsRow />`. One import
line + one JSX line. No change to `generateMetadata` or any other section.

## Data flow

```
Home (server) → <ShopTiresRow/> → getHomeTires(6)
  → getTireDiscoveryProducts({ EMPTY_TIRE_FILTERS, sort:"newest", page:1 })  [live Meili, throw-safe]
  → .products.slice(0,6) → <TireProductCard/> ×N  (each renders TireFitBadge for the active vehicle)
empty tires (no data / Meili down) → getHomeTires returns [] → section renders null (no empty shell)
```

## Error handling

No new error handling. `getTireDiscoveryProducts` already returns an empty `TireDiscoveryResult` on
any Meilisearch failure, so `getHomeTires` returns `[]` and the section renders nothing — the same
degrade-to-null contract the wheels rail and every other home section follow.

## Testing

The logic is `getTireDiscoveryProducts(...).products.slice(0, 6)` — no branching worth a unit test,
and the sibling `new-drops-row` has no test either. The gate is:
- `npx tsc --noEmit` clean on the two new files + the page (no new errors beyond the storefront baseline);
- `next build` compiles `/` (the section is a server component with no new client boundary).

A trivial test asserting `slice` would assert the language, not the behavior — omitted deliberately.

## Out of scope

- Any promo banner / split "wheels + tires" hero band.
- Fit-aware filtering of the rail (per-card `TireFitBadge` already covers fit signalling).
- Hero, Trust-strip, or metadata copy changes to mention tires.
- A curated tire-handles env list (the `getHomeTires` seam leaves room for it later; not built now).

## References

- Mirror source: [`new-drops-row`](../../../storefront/src/modules/home/components/new-drops-row/index.tsx).
- Tire surface: WB-005 (tire store) + WB-063 (tire fitment) — `modules/tire-discovery/`.
- Home merchandising precedent: [`get-featured.ts`](../../../storefront/src/modules/home/data/get-featured.ts) (curated + fallback pattern, if a curated tire list is wanted later).
