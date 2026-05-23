"use client"

import { useGarage } from "@lib/garage/use-garage"
import { openSearch } from "@lib/stores/search-store"

const GaragePill = () => {
  const { active } = useGarage()

  const label = active
    ? `Garage Â· ${active.year} ${active.make} ${active.model}${active.trim ? ` ${active.trim}` : ""}`
    : "Garage Â· Select a vehicle"

  return (
    <button
      type="button"
      onClick={openSearch}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: 26,
        padding: "0 12px",
        border: "1px solid var(--hairline)",
        borderRadius: 14,
        background: "white",
        fontSize: 12,
        fontWeight: 600,
        color: "var(--ink)",
        cursor: "pointer",
        fontFamily: "inherit",
        maxWidth: 320,
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
      }}
      aria-label={active ? `Switch garage vehicle (currently ${label})` : "Pick a vehicle for fitment"}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          background: active ? "var(--orange)" : "var(--ink-soft)",
          flexShrink: 0,
        }}
      />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
        {label}
      </span>
    </button>
  )
}

export default GaragePill
