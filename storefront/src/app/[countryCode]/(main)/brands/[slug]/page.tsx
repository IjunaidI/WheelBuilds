import { Metadata } from "next"

import { canonicalUrl } from "@lib/util/canonical"
import DiscoveryTemplate from "@modules/discovery/templates"
import {
  getDiscoveryProducts,
  parseQueryFromSearchParams,
} from "@modules/discovery/data/get-products"
import { getBrandCollectionOrNotFound } from "@modules/brands/data/get-brand"
import BrandsHero from "@modules/brands/components/hero"

type Props = {
  params: Promise<{ countryCode: string; slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * `/brands/[slug]` (WB-099 Task 3) — a brand-pinned Discovery page. `slug` is
 * the Medusa brand-collection handle (WB-086's mechanism); `collection.title`
 * is byte-identical to the Meilisearch `brand` facet value
 * (`ensureBrandCollection` sets it verbatim from the same vendor string), so
 * pinning `filters.brands=[collection.title]` below is an exact join, never
 * normalized — see `getBrandCollectionOrNotFound`'s doc comment.
 *
 * `notFound()` (thrown inside `getBrandCollectionOrNotFound` for an unknown
 * slug) propagates through both `generateMetadata` and the page component —
 * same pattern as the PDP (`products/[handle]/page.tsx`).
 *
 * Every OTHER facet/sort/page still comes straight from the URL via
 * `parseQueryFromSearchParams` — only `filters.brands` is overridden here —
 * so the brand page stays fully filterable within the brand. `hideBrand`
 * (WB-099 Task 1) omits the Brand facet from the rail so a shopper can't
 * uncheck the pinned brand or add a second one; `clearAll` (also Task 1)
 * targets the current pathname, so "Clear all" stays on this brand page
 * instead of bouncing to `/store`.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const collection = await getBrandCollectionOrNotFound(slug)
  // Suffix comes from the root `metadata.title.template` (WB-095 X1) — the
  // brand name alone resolves to e.g. "Fuel | Wheel Builds". Don't hand-roll
  // "| Wheel Builds" here or it doubles up.
  const title = collection.title
  const description = `Shop ${collection.title} wheels — every size, finish, and fitment, with live inventory.`
  return {
    title,
    description,
    // WB-095 X2: absolute, us-pinned regardless of the country code this
    // request happened to resolve to (WB-071 F-D single-region lock).
    alternates: { canonical: canonicalUrl(`/brands/${slug}`) },
  }
}

export default async function BrandPage({ params, searchParams }: Props) {
  const { slug } = await params
  const collection = await getBrandCollectionOrNotFound(slug)

  const sp = await searchParams
  const query = parseQueryFromSearchParams(sp)
  // The pin. Exact title, not normalized — see the module doc comment.
  query.filters.brands = [collection.title]

  const result = await getDiscoveryProducts(query)
  const inFitMode = !!query.vehicleConstraint?.length

  return (
    <>
      <BrandsHero
        eyebrow={`BRAND · ${result.totalCount.toLocaleString()} ${
          result.totalCount === 1 ? "RESULT" : "RESULTS"
        }`}
        title={collection.title}
      />
      <DiscoveryTemplate
        result={result}
        currentPage={query.page}
        fit={inFitMode}
        activeDiameters={query.filters.diameters}
        hideBrand
      />
    </>
  )
}
