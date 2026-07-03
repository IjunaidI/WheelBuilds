import TireHeader from "../components/header"
import TireFitmentSync from "../components/fitment-sync"
import TireActiveChips from "../components/active-chips"
import TireFilterRail from "../components/filter-rail"
import TireMobileFilterTrigger from "../components/filter-rail/mobile-trigger"
import TireGrid from "../components/grid"
import TirePagination from "../components/pagination"
import TireEmpty from "../components/empty-state"
import { DEFAULT_PAGE_SIZE, TireDiscoveryResult } from "../data/types"

type TireDiscoveryTemplateProps = {
  result: TireDiscoveryResult
  currentPage: number
}

/**
 * Top-level Tire Discovery (catalog) layout. Server component — it accepts
 * the already-fetched result from the page above (which awaits
 * `getTireDiscoveryProducts`). The header / rail / mobile trigger / chips /
 * pagination are client components that read filter state from URL search
 * params via `useTireQuery`.
 *
 * Mirrors `modules/discovery/templates/index.tsx`. Mounts `<TireFitmentSync>`
 * (WB-063 T5) so a garage vehicle's OEM tire sizes auto-apply as `?fit=`; no
 * `fit` prop is threaded to the grid (tires have no bolt-pattern/offset
 * fitment badge on the card, only the size-based auto-filter).
 *
 * Layout:
 *   small+: header + chips + [ rail 260px | grid+pagination ]
 *   mobile: header + chips + filter button (opens bottom Vaul) + grid stacked
 */
const TireDiscoveryTemplate = ({
  result,
  currentPage,
}: TireDiscoveryTemplateProps) => {
  const totalPages = Math.max(
    1,
    Math.ceil(result.totalCount / (result.pageSize || DEFAULT_PAGE_SIZE))
  )

  return (
    <section className="px-5 pt-6 pb-16 xsmall:px-8 small:px-20 small:pt-8 small:pb-20">
      <TireFitmentSync />
      <TireHeader totalCount={result.totalCount} />
      <TireActiveChips />
      <TireMobileFilterTrigger
        facets={result.facets}
        totalCount={result.totalCount}
      />
      <div className="flex items-start gap-8">
        <TireFilterRail facets={result.facets} />
        <div className="flex-1 min-w-0">
          {result.products.length === 0 ? (
            <TireEmpty />
          ) : (
            <>
              <TireGrid products={result.products} />
              <TirePagination
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

export default TireDiscoveryTemplate
