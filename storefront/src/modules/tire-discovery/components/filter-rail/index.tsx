import { TireFacetCounts } from "../../data/types"
import FilterSections from "./filter-sections"

type FilterRailProps = {
  facets: TireFacetCounts
}

/**
 * Desktop filter rail — sticky aside on the left of the tire catalog grid.
 * Hidden on mobile; mobile uses `<TireMobileFilterTrigger>` instead. Mirrors
 * modules/discovery/components/filter-rail/index.tsx with the tire facet
 * vocabulary — no Vehicle band (tires have no fitment).
 */
const TireFilterRail = ({ facets }: FilterRailProps) => (
  <aside
    aria-label="Filters"
    className="hidden small:block w-[260px] shrink-0 sticky top-4 self-start"
  >
    <FilterSections facets={facets} instanceId="rail" />
  </aside>
)

export default TireFilterRail
