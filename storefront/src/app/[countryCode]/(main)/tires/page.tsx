import { Metadata } from "next"
import { redirect } from "next/navigation"

import { canonicalUrl } from "@lib/util/canonical"
import { getTireDiscoveryProducts } from "@modules/tire-discovery/data/get-tire-products"
import { parseTireQueryFromSearchParams, DEFAULT_PAGE_SIZE } from "@modules/tire-discovery/data/types"
import TireDiscoveryTemplate from "@modules/tire-discovery/templates"
import { clampPage, withClampedPage } from "@modules/discovery/data/clamp-page"

export const metadata: Metadata = {
  title: "All tires",
  description: "Explore the full Wheel Builds tire catalog.",
  // WB-095 X2: pinned to DEFAULT_REGION regardless of the country code this
  // request happened to resolve to (WB-071 F-D single-region lock).
  alternates: { canonical: canonicalUrl("/tires") },
}

type TiresPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
  params: Promise<{ countryCode: string }>
}

/**
 * Tire discovery (catalog) page. Live data via the Meilisearch tire-discovery
 * adapter (getTireDiscoveryProducts) — see
 * `modules/tire-discovery/data/get-tire-products.ts`. Mirrors the wheel
 * `/store` route shape; no fitment/vehicleConstraint branch (Spec 2 scope
 * for the vehicle-fit seam is wheels only).
 */
export default async function TiresPage({ searchParams, params }: TiresPageProps) {
  const sp = await searchParams
  const query = parseTireQueryFromSearchParams(sp)
  const result = await getTireDiscoveryProducts(query)

  // WB-088 D11 (mirrors the wheel /store route): an out-of-range `?page`
  // must redirect to the last valid page instead of rendering the 0-match
  // empty state for filters that genuinely have matches. Skipped during a
  // real outage (`result.ok === false`) — see the wheel route's comment for
  // why.
  if (result.ok !== false) {
    const lastPage = clampPage(
      query.page,
      result.totalCount,
      result.pageSize || DEFAULT_PAGE_SIZE
    )
    if (lastPage !== query.page) {
      const { countryCode } = await params
      const qs = withClampedPage(sp, lastPage)
      redirect(`/${countryCode}/tires${qs ? `?${qs}` : ""}`)
    }
  }

  return (
    <TireDiscoveryTemplate
      result={result}
      currentPage={query.page}
      inStockOnly={!!query.filters.inStockOnly}
    />
  )
}
