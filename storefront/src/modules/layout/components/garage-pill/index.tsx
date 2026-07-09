"use client"

import { useGarage } from "@lib/garage/use-garage"
import { openSearch } from "@lib/stores/search-store"

const GaragePill = () => {
  const { active, isLoaded } = useGarage()

  // While an authed garage load is in flight (isLoaded === false, WB-073
  // Task 5/G6), `active` reads null just like the genuinely-empty case —
  // rendering "Select a vehicle" here would flash it for every returning
  // customer with an active vehicle, then flip to their real one a beat
  // later (the same empty-flash class G6 fixed for GarageManager). Show a
  // neutral loading label instead until the load genuinely settles.
  // GARAGE-DISABLED (WB-076): with the cache-only provider isLoaded is always
  // true, so the loading branch is dormant — kept for restoration. Labels
  // de-garaged: the pill now reads "Vehicle · …".
  const label = !isLoaded
    ? "Vehicle · …"
    : active
    ? `Vehicle · ${active.year} ${active.make} ${active.model}${active.trim ? ` ${active.trim}` : ""}`
    : "Vehicle · Select one"

  return (
    <button
      type="button"
      onClick={openSearch}
      className="inline-flex max-w-[320px] items-center gap-2 h-7 px-3 rounded-full border border-[var(--hairline)] bg-white text-[12px] font-semibold text-[var(--ink)] overflow-hidden whitespace-nowrap text-ellipsis transition-colors hover:bg-[var(--soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
      aria-label={
        !isLoaded
          ? "Loading your vehicle"
          : active
          ? `Switch vehicle (currently ${label})`
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
