import DiscoveryHeader from "../components/header"
import FitmentSync from "../components/fitment-sync"
import ActiveChips from "../components/active-chips"
import FilterRail from "../components/filter-rail"
import MobileFilterTrigger from "../components/filter-rail/mobile-trigger"
import DiscoveryGrid from "../components/grid"
import DiscoveryPagination from "../components/pagination"
import DiscoveryEmpty from "../components/empty-state"
import DiscoveryOutage from "../components/empty-state/outage"
import { DEFAULT_PAGE_SIZE, DiscoveryResult } from "../data/types"
import { totalPagesFor } from "../data/clamp-page"

type DiscoveryTemplateProps = {
  result: DiscoveryResult
  currentPage: number
  fit?: boolean
  /** Active diameter filter (WB-088 D5), threaded to the grid's cards. */
  activeDiameters?: number[]
  /**
   * WB-099 Task 1: omits the Brand facet section from BOTH the desktop rail
   * and the mobile drawer. For a future server-pinned brand page (e.g.
   * `/brands/fuel`) a shopper shouldn't be able to uncheck the pinned brand
   * or add a second one. Defaults to `false` so `/store` is unchanged.
   */
  hideBrand?: boolean
  /**
   * WB-126: how many TYRES match the same `?q`. Only non-zero on the
   * zero-result path, where the empty state offers a link across. Resolved
   * by the route (this template is sync).
   */
  otherTypeCount?: number
  /** WB-124: the rail's "In stock only" state, carried into each PDP link. */
  inStockOnly?: boolean
}

/**
 * Top-level Discovery (catalog) layout. Server component — it accepts the
 * already-fetched result from the page above (which awaits
 * `getDiscoveryProducts`). The header / rail / mobile trigger / chips /
 * pagination are client components that read filter state from URL search
 * params via `useDiscoveryQuery`.
 *
 * Layout:
 *   small+: header + chips + [ rail 260px | grid+pagination ]
 *   mobile: header + chips + filter button (opens bottom Vaul) + grid stacked
 *
 * `result.ok === false` (WB-088 D6) means the Meilisearch query itself
 * failed, not that 0 products genuinely matched — rendered as
 * `<DiscoveryOutage>` instead of the 0-match `<DiscoveryEmpty>` so an infra
 * blip doesn't read as "no wheels match these filters".
 *
 * `currentPage` is guaranteed <= `totalPages` by the time it reaches this
 * template (WB-088 D11) — the `/store` route redirects an out-of-range
 * `?page` to the last valid page (via `clampPage`, using this same
 * `totalPagesFor`) before ever calling this component, so an out-of-range
 * request never lands on the 0-match empty state for filters that actually
 * have matches.
 */
const DiscoveryTemplate = ({
  result,
  currentPage,
  fit = false,
  activeDiameters,
  hideBrand = false,
  otherTypeCount = 0,
  inStockOnly = false,
}: DiscoveryTemplateProps) => {
  // result.totalCount already reflects only the candidates that were
  // fetched/checked (bounded by FIT_CANDIDATE_CAP in fit mode — see
  // get-products.ts), so this pagination math never produces phantom pages
  // beyond what was actually loaded, capped or not. (WB-074 D2)
  const totalPages = totalPagesFor(result.totalCount, result.pageSize || DEFAULT_PAGE_SIZE)

  return (
    <section className="px-5 pt-6 pb-16 xsmall:px-8 small:px-20 small:pt-8 small:pb-20">
      <FitmentSync />
      <DiscoveryHeader totalCount={result.totalCount} isCapped={result.isCapped} />
      <ActiveChips />
      <MobileFilterTrigger
        facets={result.facets}
        priceBounds={result.priceBounds}
        totalCount={result.totalCount}
        isCapped={result.isCapped}
        hideBrand={hideBrand}
      />
      <div className="flex items-start gap-8">
        <FilterRail
          facets={result.facets}
          priceBounds={result.priceBounds}
          hideBrand={hideBrand}
        />
        <div className="flex-1 min-w-0">
          {result.ok === false ? (
            <DiscoveryOutage />
          ) : result.products.length === 0 ? (
            <DiscoveryEmpty otherTypeCount={otherTypeCount} />
          ) : (
            <>
              <DiscoveryGrid
                products={result.products}
                fit={fit}
                inStockOnly={inStockOnly}
                activeDiameters={activeDiameters}
              />
              <DiscoveryPagination
                currentPage={currentPage}
                totalPages={totalPages}
              />
            </>
          )}
        </div>
      </div>
    </section>
  )
}

export default DiscoveryTemplate
