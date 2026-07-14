"use client"

import Icon from "@modules/common/components/icon"
import { openSearch } from "@lib/stores/search-store"

type SearchCtaProps = {
  label?: string
  className?: string
}

/**
 * Labeled search trigger (WB-085). `SearchTrigger` in the nav is icon-only;
 * this pairs the same `openSearch` store action with WB button chrome + a
 * text label for dead-end states (404 pages) where a bare icon isn't enough
 * of a call to action.
 */
const SearchCta = ({
  label = "Search the catalog",
  className,
}: SearchCtaProps) => (
  <button
    type="button"
    onClick={openSearch}
    className={className ?? "btn btn-outline"}
  >
    <Icon name="search" size={14} strokeWidth={1.6} />
    {label}
  </button>
)

export default SearchCta
