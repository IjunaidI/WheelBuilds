import DiscoveryHeader from "../components/header"
import ActiveChips from "../components/active-chips"
import FilterRail from "../components/filter-rail"
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
 * `getDiscoveryProducts`). The header / rail / chips / pagination are client
 * components that read filter state from URL search params via
 * `useDiscoveryQuery`.
 *
 * Structure:
 *   [ header: title + count + sort + garage chip                  ]
 *   [ active filter chips strip (hidden when no filters)          ]
 *   [ rail 260px ][ grid / empty state ........................ ]
 *                 [ pagination at the bottom of the right column ]
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
    <section style={{ padding: "32px 80px 80px" }}>
      <DiscoveryHeader totalCount={result.totalCount} />
      <ActiveChips />
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
