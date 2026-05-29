"use client"

import { useGarage } from "@lib/garage/use-garage"
import { openSearch } from "@lib/stores/search-store"

const GaragePill = () => {
  const { active } = useGarage()

  const label = active
    ? `Garage · ${active.year} ${active.make} ${active.model}${active.trim ? ` ${active.trim}` : ""}`
    : "Garage · Select a vehicle"

  return (
    <button
      type="button"
      onClick={openSearch}
      className="inline-flex max-w-[320px] items-center gap-2 h-7 px-3 rounded-full border border-[var(--hairline)] bg-white text-[12px] font-semibold text-[var(--ink)] overflow-hidden whitespace-nowrap text-ellipsis transition-colors hover:bg-[var(--soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
      aria-label={
        active
          ? `Switch garage vehicle (currently ${label})`
          : "Pick a vehicle for fitment"
      }
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
        style={{
          background: active ? "var(--orange)" : "var(--ink-soft)",
        }}
      />
      <span className="overflow-hidden text-ellipsis">{label}</span>
    </button>
  )
}

export default GaragePill
