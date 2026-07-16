type CollectionLike = { title?: string | null } | null | undefined

/**
 * Pure URL builder for the `/collections/[handle]` → Discovery redirect
 * (WB-086 D1). Not a `"use server"` module — every export of one of those
 * must be async, and this needs to stay a plain sync function to be
 * unit-testable without pulling in Next's request machinery.
 *
 * The `?brands=<title>` join is exact by provenance, not a guess: the
 * backend's `ensureBrandCollection` (backend/src/modules/vendor-sync/pipeline/bootstrap.ts:126-147)
 * sets `collection.title` verbatim from the same vendor `rep` object that
 * feeds `buildProductMetadata`'s `brand` field, which is what
 * `buildSearchDocument` indexes as the Meilisearch `brand` facet. So the
 * title is only URL-encoded here — never trimmed, uppercased, or otherwise
 * normalized — matching the established `?brands=` prior art (PDP
 * breadcrumb, tire breadcrumb, footer brand links, home shop-by-brand).
 */
export function collectionRedirectUrl(
  countryCode: string,
  collection: CollectionLike
): string {
  const base = `/${countryCode}/store`

  if (!collection?.title) {
    return base
  }

  return `${base}?brands=${encodeURIComponent(collection.title)}`
}
