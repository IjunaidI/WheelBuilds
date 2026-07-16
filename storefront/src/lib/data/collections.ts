import { sdk } from "@lib/config"
import { cache } from "react"
import { HttpTypes } from "@medusajs/types"

export const getCollectionByHandle = cache(async function (
  handle: string
): Promise<HttpTypes.StoreCollection> {
  return sdk.store.collection
    .list({ handle }, { next: { tags: ["collections"] } })
    .then(({ collections }) => collections[0])
})

const LIST_BRAND_COLLECTIONS_PAGE_SIZE = 100

/**
 * Every collection in the store, minimally shaped for the /brands index
 * join (WB-099 Task 2). Collections here ARE the brand collections
 * (vendor-sync's `ensureBrandCollection` sets `title` to the exact Meili
 * `brand` facet value); this call is unfiltered, so if the seed ever added
 * non-brand demo collections they'd come back too — that's fine, the join
 * in `modules/brands/data/brand-tiles.ts` only keeps titles that also
 * appear in the brand facet count map, so anything else drops out.
 *
 * Paginates through the full result set (`count` from the response) rather
 * than assuming everything fits on one page.
 */
export const listBrandCollections = cache(async function (): Promise<
  { title: string; handle: string }[]
> {
  const collections: { title: string; handle: string }[] = []
  let offset = 0

  while (true) {
    const { collections: page, count } = await sdk.store.collection.list(
      { limit: LIST_BRAND_COLLECTIONS_PAGE_SIZE, offset },
      { next: { tags: ["collections"] } }
    )

    collections.push(...page.map(({ title, handle }) => ({ title, handle })))

    offset += page.length
    if (offset >= count || page.length === 0) {
      break
    }
  }

  return collections
})
