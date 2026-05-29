import { FacetCounts } from "../../data/types"
import FilterSections from "./filter-sections"

type FilterRailProps = {
  facets: FacetCounts
}

/**
 * Desktop filter rail — sticky aside on the left of the catalog grid.
 * Hidden on mobile; mobile uses `<MobileFilterTrigger>` instead.
 */
const FilterRail = ({ facets }: FilterRailProps) => (
  <aside
    aria-label="Filters"
    className="hidden small:block w-[260px] shrink-0 sticky top-4 self-start"
  >
    <FilterSections facets={facets} />
  </aside>
)

export default FilterRail
