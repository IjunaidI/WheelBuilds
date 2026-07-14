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
//
// WB-104 T2: two more dishonesties in the original compare. (1) make/model
// were compared with a bare `.toLowerCase()`, but the drawer's `active.make`/
// `active.model` are wheel-size SLUGS ("land-rover") while the reverse-
// fitment identity's `entry.make`/`entry.model` are display NAMES
// ("Land Rover") — a multi-word make could never highlight. Fixed by
// slug-normalizing both sides (direction-agnostic: works slug<->slug,
// name<->name, or either direction mixed). (2) trim compare didn't know
// about WB-104 T1's `trimNarrowed`: a union row (>1 distinct trims folded
// together) now carries `trim: undefined` and must anchor on year/make/model
// alone; a row narrowed to exactly one trim should match the active
// vehicle's trim LABEL *or* its `modificationSlug` (the raw wheel-size
// dropdown value), since the two don't always agree textually.

import { slugify } from "./slugify"

export type FitmentEntryLike = {
  year: string
  make: string
  model: string
  trim?: string
  /** True when this row was narrowed to exactly one specific trim (as
   *  opposed to a multi-trim union that happened to share a trim value —
   *  see reverse-fitment.ts `extractVehicleIdentity`). Absent/undefined is
   *  treated as "not narrowed". */
  trimNarrowed?: boolean
}

export type ActiveVehicleLike = {
  year: number
  make: string
  model: string
  trim?: string
  /** The raw wheel-size modification slug picked in the YMM dropdown — may
   *  disagree textually with `trim` (a human label), so a trim-narrowed row
   *  is allowed to match either. */
  modificationSlug?: string
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

/**
 * True when a fitment-list row's trim doesn't rule out the active vehicle.
 *
 * - No trim on the row (union row, or simply never recorded) is always
 *   permissive — nothing to disprove the match with.
 * - No active vehicle, or an active vehicle with neither a trim label nor a
 *   modificationSlug on file, is likewise permissive.
 * - A row NOT narrowed to one specific trim (trimNarrowed falsy) falls back
 *   to a plain slug-normalized label compare against `active.trim`
 *   (permissive again if the active vehicle has no trim label).
 * - A row that IS trim-narrowed compares its trim, slug-normalized, against
 *   BOTH `active.trim` (label) and `active.modificationSlug` (the raw
 *   dropdown value) — either agreeing is enough.
 */
export function trimMatches(
  entry: Pick<FitmentEntryLike, "trim" | "trimNarrowed">,
  active: Pick<ActiveVehicleLike, "trim" | "modificationSlug"> | null | undefined
): boolean {
  if (!entry.trim) return true
  if (!active) return true
  const entrySlug = slugify(entry.trim)
  if (entry.trimNarrowed) {
    if (!active.trim && !active.modificationSlug) return true
    const labelHit = active.trim != null && slugify(active.trim) === entrySlug
    const slugHit = active.modificationSlug != null && slugify(active.modificationSlug) === entrySlug
    return labelHit || slugHit
  }
  if (!active.trim) return true
  return slugify(active.trim) === entrySlug
}

/** True when a fitment-list row represents the active garage vehicle:
 *  slug-normalized make + model (direction-agnostic — a garage-drawer slug
 *  matches a reverse-fitment display name), range-aware year, and
 *  trim-aware best-effort trim (see `trimMatches`). */
export function entryMatchesVehicle(
  entry: FitmentEntryLike,
  active: ActiveVehicleLike | null | undefined
): boolean {
  if (!active) return false
  return (
    slugify(entry.make) === slugify(active.make) &&
    slugify(entry.model) === slugify(active.model) &&
    yearMatches(entry.year, active.year) &&
    trimMatches(entry, active)
  )
}
