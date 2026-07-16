import { notFound } from "next/navigation"

import { getCollectionByHandle } from "@lib/data/collections"

export type BrandCollection = {
  title: string
  handle: string
}

/**
 * Resolve a `/brands/[slug]` route param to its brand collection, or 404.
 *
 * Centralized (rather than inlined separately in `generateMetadata` and the
 * page component, which both need the exact same lookup) so the two call
 * sites can never drift — mirrors the PDP's `getProductDetail`
 * (`modules/product-detail/data/get-product.ts`), which throws `notFound()`
 * once and lets it propagate through both.
 *
 * `getCollectionByHandle`'s Store API call returns `collections[0]`, which is
 * `undefined` for an unknown handle despite the SDK's non-optional return
 * type — hence the runtime `collection?.title` guard rather than trusting
 * the type.
 */
export async function getBrandCollectionOrNotFound(
  slug: string
): Promise<BrandCollection> {
  const collection = await getCollectionByHandle(slug)
  if (!collection?.title) {
    notFound()
  }
  return { title: collection.title, handle: collection.handle }
}
