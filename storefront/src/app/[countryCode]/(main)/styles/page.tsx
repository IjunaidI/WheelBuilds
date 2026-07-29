import { Metadata } from "next"

import { canonicalUrl } from "@lib/util/canonical"
import { getHomeCatalog } from "@modules/home/data/get-home-catalog"
import { styleTiles } from "@modules/home/components/shop-by-style/style-map"
import { styleSlug } from "@modules/home/components/shop-by-style/style-slug"
import StylesHero from "@modules/styles/components/hero"
import StyleTileGrid from "@modules/styles/components/tile-grid"

// Static — this page's content (the tile grid) is dynamic, but the metadata
// itself doesn't depend on any of that data, same pattern as `/brands`'s
// static `metadata` export.
export const metadata: Metadata = {
  title: "Shop by Style",
  description:
    "Curated wheel styles — street, truck & dually, luxury, UTV, off-road, and drag — with live inventory counts.",
  // WB-095 X2: absolute, us-pinned regardless of the country code that
  // happened to resolve this request (WB-071 F-D single-region lock).
  alternates: { canonical: canonicalUrl("/styles") },
}

/**
 * `/styles` index (WB-099 Task 4). Lists every live `STYLE_DEFS` tile with a
 * product count, each linking to its `/styles/<slug>` page.
 *
 * `styleTiles(facets)` (home's Shop-by-Style helper) already builds `/store?…`
 * hrefs for the homepage section — here those hrefs are remapped to
 * `/styles/<slug>` via `styleSlug(label)` so this index routes into the new
 * pinned pages instead. Counts come from `getHomeCatalog().facets` (shared
 * react.cache hit — no extra Meilisearch round trip beyond what the
 * layout/home already pays for on this request). A def whose live count is 0
 * is dropped by `styleTiles` itself, same as the homepage section.
 */
export default async function StylesPage() {
  const { facets, styleCounts } = await getHomeCatalog()
  const tiles = styleTiles(facets, styleCounts).map((tile) => ({
    ...tile,
    href: `/styles/${styleSlug(tile.label)}`,
  }))

  return (
    <>
      <StylesHero
        eyebrow={`${tiles.length} ${tiles.length === 1 ? "STYLE" : "STYLES"} · CURATED`}
        title="Shop by Style"
        description="Curated wheel styles built from real size, finish, and brand data — pick a look, then refine it further."
      />
      <div className="px-5 pt-8 pb-16 xsmall:px-8 small:px-20 small:pb-20">
        {tiles.length === 0 ? (
          <p style={{ color: "var(--graphite)" }}>
            No styles are available right now — check back soon.
          </p>
        ) : (
          <StyleTileGrid tiles={tiles} />
        )}
      </div>
    </>
  )
}
