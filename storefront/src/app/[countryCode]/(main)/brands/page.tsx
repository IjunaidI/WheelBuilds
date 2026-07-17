import { Metadata } from "next"

import { canonicalUrl } from "@lib/util/canonical"
import { listBrandCollections } from "@lib/data/collections"
import { getHomeCatalog } from "@modules/home/data/get-home-catalog"
import { buildBrandTiles } from "@modules/brands/data/brand-tiles"
import BrandsHero from "@modules/brands/components/hero"
import BrandTileGrid from "@modules/brands/components/tile-grid"

// Static — this page's content (the tile grid) is dynamic, but the metadata
// itself doesn't depend on any of that data, same pattern as `/store`'s
// static `metadata` export.
export const metadata: Metadata = {
  title: "Shop by Brand",
  description:
    "Every authorized wheel brand in the Wheel Builds catalog, with live inventory counts.",
  // WB-095 X2: absolute, us-pinned regardless of the country code that
  // happened to resolve this request (WB-071 F-D single-region lock).
  alternates: { canonical: canonicalUrl("/brands") },
}

/**
 * `/brands` index (WB-099 Task 3). Lists every live brand with a product
 * count, each tile linking to its pinned `/brands/<handle>` page.
 *
 * Counts come from `getHomeCatalog().facets.brands` (shared react.cache hit
 * — no extra Meilisearch round trip beyond what the layout/home already
 * pays for on this request); handles come from `listBrandCollections()`
 * (every Medusa brand collection). `buildBrandTiles` is the pure exact-title
 * join between the two — see `modules/brands/data/brand-tiles.ts` for why
 * the join is intentionally NOT normalized.
 */
export default async function BrandsPage() {
  const [{ facets }, collections] = await Promise.all([
    getHomeCatalog(),
    listBrandCollections(),
  ])
  const tiles = buildBrandTiles(facets.brands, collections)

  return (
    <>
      <BrandsHero
        eyebrow={`${tiles.length} ${tiles.length === 1 ? "BRAND" : "BRANDS"} · ALL AUTHORIZED`}
        title="Shop by Brand"
        description="Browse the full authorized wheel lineup by manufacturer, then filter down to the exact fitment you need."
      />
      <div className="px-5 pt-8 pb-16 xsmall:px-8 small:px-20 small:pb-20">
        {tiles.length === 0 ? (
          <p style={{ color: "var(--graphite)" }}>
            No brands are available right now — check back soon.
          </p>
        ) : (
          <BrandTileGrid tiles={tiles} />
        )}
      </div>
    </>
  )
}
