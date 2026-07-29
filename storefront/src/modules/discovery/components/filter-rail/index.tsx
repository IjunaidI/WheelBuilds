import { FacetCounts } from "../../data/types"
import FilterSections from "./filter-sections"

type FilterRailProps = {
  facets: FacetCounts
  /** Real catalog price range in dollars (WB-120 Q-15); null = use placeholders. */
  priceBounds?: { minUsd: number; maxUsd: number } | null
  /** WB-099 Task 1: omits the Brand section (pinned-brand pages, e.g. `/brands/fuel`). */
  hideBrand?: boolean
}

/**
 * Desktop filter rail — sticky aside on the left of the catalog grid.
 * Hidden on mobile; mobile uses `<MobileFilterTrigger>` instead.
 */
const FilterRail = ({ facets, priceBounds, hideBrand = false }: FilterRailProps) => (
  <aside
    aria-label="Filters"
    className="hidden small:block w-[260px] shrink-0 sticky top-4 self-start"
  >
    <FilterSections
      facets={facets}
      priceBounds={priceBounds}
      instanceId="rail"
      hideBrand={hideBrand}
    />
  </aside>
)

export default FilterRail
