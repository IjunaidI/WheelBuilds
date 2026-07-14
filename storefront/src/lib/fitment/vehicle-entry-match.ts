// storefront/src/lib/fitment/vehicle-entry-match.ts
//
// Shared "does this fitment-list row represent the active garage vehicle"
// logic. Both the wheel fitment list (`product-detail/components/fitment`)
// and the tire fitment list (`product-detail/components/tire/fitment`) render
// a `{ year, make, model, trim? }` row per confirmed vehicle and need to
// highlight the one row matching the active garage vehicle. Year is a string
// that may be a single year ("2021") or a range ("2013–2017" / "2013-2017");
// trim is best-effort (absent on either side can't disprove a match).
//
// WB-091 P13: previously the tire list only compared make+model, so e.g. a
// 1998 Civic highlighted the 2021 Civic row. This centralizes the wheel
// list's range-aware year + trim matching so both surfaces agree.

export type FitmentEntryLike = {
  year: string
  make: string
  model: string
  trim?: string
}

export type ActiveVehicleLike = {
  year: number
  make: string
  model: string
  trim?: string
}

/** True when `entryYear` (a single year like "2021" or a range like
 *  "2013–2017" / "2013-2017") contains `activeYear`. */
export function yearMatches(entryYear: string, activeYear: number): boolean {
  const parts = entryYear.match(/^(\d+)\s*[–-]\s*(\d+)$/)
  if (parts) {
    const start = parseInt(parts[1], 10)
    const end = parseInt(parts[2], 10)
    return activeYear >= start && activeYear <= end
  }
  return String(activeYear) === entryYear
}

/** True when both trims are present and match case-insensitively, OR either
 *  side lacks a trim value (nothing to disprove the match with). */
export function trimMatches(entryTrim: string | undefined, activeTrim: string | undefined): boolean {
  if (!activeTrim || !entryTrim) return true
  return activeTrim.toLowerCase() === entryTrim.toLowerCase()
}

/** True when a fitment-list row represents the active garage vehicle: exact
 *  case-insensitive make + model, range-aware year, and best-effort trim. */
export function entryMatchesVehicle(
  entry: FitmentEntryLike,
  active: ActiveVehicleLike | null | undefined
): boolean {
  if (!active) return false
  return (
    entry.make.toLowerCase() === active.make.toLowerCase() &&
    entry.model.toLowerCase() === active.model.toLowerCase() &&
    yearMatches(entry.year, active.year) &&
    trimMatches(entry.trim, active.trim)
  )
}
