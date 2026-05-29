"use client"

import Icon from "@modules/common/components/icon"
import { openSearch } from "@lib/stores/search-store"

type SearchTriggerProps = {
  ariaLabel?: string
  size?: number
  className?: string
  style?: React.CSSProperties
}

const SearchTrigger = ({
  ariaLabel = "Open search",
  size = 16,
  className,
  style,
}: SearchTriggerProps) => (
  <button
    type="button"
    onClick={openSearch}
    aria-label={ariaLabel}
    className={className}
    style={{
      background: "none",
      border: "none",
      padding: 0,
      cursor: "pointer",
      color: "var(--ink)",
      display: "inline-flex",
      ...style,
    }}
  >
    <Icon name="search" size={size} />
  </button>
)

export default SearchTrigger
