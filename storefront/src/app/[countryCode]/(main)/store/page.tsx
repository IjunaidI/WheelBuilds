import { Metadata } from "next"
import { redirect } from "next/navigation"

import { canonicalUrl } from "@lib/util/canonical"
import DiscoveryTemplate from "@modules/discovery/templates"
import { countOtherType } from "@modules/search/cross-type-count"
import {
  getDiscoveryProducts,
  parseQueryFromSearchParams,
} from "@modules/discovery/data/get-products"
import { clampPage, withClampedPage } from "@modules/discovery/data/clamp-page"
import { DEFAULT_PAGE_SIZE } from "@modules/discovery/data/types"

export const metadata: Metadata = {
  title: "All wheels",
  description: "Explore the full Wheel Builds catalog.",
  // WB-095 X2: pinned to DEFAULT_REGION regardless of the country code this
  // request happened to resolve to (WB-071 F-D single-region lock).
  alternates: { canonical: canonicalUrl("/store") },
}

type StorePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
  params: Promise<{ countryCode: string }>
}

/**
 * Discovery (catalog) page. Live data via the Meilisearch Discovery adapter
 * (getDiscoveryProducts) — see `modules/discovery/data/get-products.ts`.
 *
 * The legacy `modules/store/` (`StoreTemplate`, `PaginatedProducts`,
 * `RefinementList`) was deleted in WB-086 D1 — it was already orphaned
 * (this page has rendered `DiscoveryTemplate` since Discovery shipped).
 */
export default async function StorePage({ searchParams, params }: StorePageProps) {
  const sp = await searchParams
  const query = parseQueryFromSearchParams(sp)
  const result = await getDiscoveryProducts(query)

  // WB-088 D11: an out-of-range `?page` (e.g. a stale bookmark/shared link
  // after the catalog shrank, or a hand-edited URL) must not render the
  // 0-match empty state for a filter combination that genuinely has
  // matches — redirect to the last valid page instead. `result.totalCount`
  // is Meili's real, exhaustive total for these filters regardless of
  // whether the requested page's `hits` came back empty, so this decision
  // is made from data already fetched (no extra round trip on the happy
  // path). Skipped during a real outage (`result.ok === false`) — its
  // totalCount is a synthetic 0, not a real page count, so clamping then
  // would silently strip the shopper's `?page` during a transient Meili
  // blip instead of showing the honest outage block at their current URL.
  if (result.ok !== false) {
    const lastPage = clampPage(
      query.page,
      result.totalCount,
      result.pageSize || DEFAULT_PAGE_SIZE
    )
    if (lastPage !== query.page) {
      const { countryCode } = await params
      const qs = withClampedPage(sp, lastPage)
      redirect(`/${countryCode}/store${qs ? `?${qs}` : ""}`)
    }
  }

  const inFitMode = !!query.vehicleConstraint?.length

  // WB-126: only on the zero-result path, ask whether the OTHER catalogue has
  // matches, so the empty state can point across instead of dead-ending. The
  // client's video was exactly this: "Falken" searched from the wheels page,
  // where it honestly has 0 matches while 65 tyres exist.
  const otherTypeCount =
    result.ok !== false && result.products.length === 0 && query.q
      ? await countOtherType(query.q, "wheel")
      : 0

  return (
    <DiscoveryTemplate
      result={result}
      currentPage={query.page}
      fit={inFitMode}
      activeDiameters={query.filters.diameters}
      otherTypeCount={otherTypeCount}
      inStockOnly={!!query.filters.inStockOnly}
    />
  )
}
