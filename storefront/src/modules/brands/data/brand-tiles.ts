/**
 * Pure join between the live Meili brand→count map (`getHomeCatalog().facets.brands`
 * — brand title to product count) and the Medusa brand collections
 * (`listBrandCollections()` — `{title, handle}[]`), for the `/brands` index
 * (WB-099 Task 3).
 *
 * The join key is `title`, matched EXACTLY (no lowercasing/trimming/etc) —
 * per WB-086 provenance, `ensureBrandCollection` sets a collection's `title`
 * byte-identical to the Meili `brand` facet value it was derived from, so an
 * exact match is the correct join, and normalizing here would only paper
 * over (or silently hide) a real drift between the two systems.
 *
 * A brand with a facet count but no matching collection handle can't
 * resolve to a real page, so it's dropped rather than linked anywhere
 * fallback-ish (e.g. `/store?brands=`) — a tile must resolve. Callers
 * should treat any drop as unexpected (ideally zero in a healthy store)
 * since every brand facet value is supposed to have a backing collection.
 * A collection with no facet count (0, or simply absent from the map) is
 * also dropped — there's nothing to show for it.
 */

export type BrandCollectionRef = {
  title: string
  handle: string
}

export type BrandTile = {
  name: string
  count: number
  href: string
}

export function buildBrandTiles(
  countMap: Record<string, number>,
  collections: BrandCollectionRef[]
): BrandTile[] {
  const handleByTitle = new Map(
    collections.map((collection) => [collection.title, collection.handle])
  )

  const tiles: BrandTile[] = []
  let droppedNoCollection = 0

  for (const [name, count] of Object.entries(countMap)) {
    if (!count) {
      // No products under this brand right now — nothing to show.
      continue
    }

    const handle = handleByTitle.get(name)
    if (!handle) {
      droppedNoCollection += 1
      continue
    }

    tiles.push({ name, count, href: `/brands/${handle}` })
  }

  if (droppedNoCollection > 0) {
    console.warn(
      `[buildBrandTiles] ${droppedNoCollection} brand(s) with a live product count had no matching collection handle and were dropped from the /brands index`
    )
  }

  return tiles.sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count
    }
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  })
}
