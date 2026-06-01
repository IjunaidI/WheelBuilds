import DiscoveryHeader from "../components/header"
import FitmentSync from "../components/fitment-sync"
import ActiveChips from "../components/active-chips"
import FilterRail from "../components/filter-rail"
import MobileFilterTrigger from "../components/filter-rail/mobile-trigger"
import DiscoveryGrid from "../components/grid"
import DiscoveryPagination from "../components/pagination"
import DiscoveryEmpty from "../components/empty-state"
import { DEFAULT_PAGE_SIZE, DiscoveryResult } from "../data/types"

type DiscoveryTemplateProps = {
  result: DiscoveryResult
  currentPage: number
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
 */
const DiscoveryTemplate = ({
  result,
  currentPage,
}: DiscoveryTemplateProps) => {
  const totalPages = Math.max(
    1,
    Math.ceil(result.totalCount / (result.pageSize || DEFAULT_PAGE_SIZE))
  )

  return (
    <section className="px-5 pt-6 pb-16 xsmall:px-8 small:px-20 small:pt-8 small:pb-20">
      <FitmentSync />
      <DiscoveryHeader totalCount={result.totalCount} />
      <ActiveChips />
      <MobileFilterTrigger
        facets={result.facets}
        totalCount={result.totalCount}
      />
      <div className="flex items-start gap-8">
        <FilterRail facets={result.facets} />
        <div className="flex-1 min-w-0">
          {result.products.length === 0 ? (
            <DiscoveryEmpty />
          ) : (
            <>
              <DiscoveryGrid products={result.products} />
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
