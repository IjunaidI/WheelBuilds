import { speedRatingRank } from "./speed-rating-rank"
import type { OemTire } from "@lib/garage/types"

export type TireFitSpec = OemTire

function fits(spec: TireFitSpec, oem: OemTire): boolean {
  if (spec.size !== oem.size) return false
  if (oem.loadIndex != null && spec.loadIndex != null && spec.loadIndex < oem.loadIndex) return false
  if (
    oem.speedRating != null &&
    spec.speedRating != null &&
    speedRatingRank(spec.speedRating) < speedRatingRank(oem.speedRating)
  )
    return false
  return true
}

/** True when the tire offers a variant that fits some OEM tire (size + load + speed,
 *  meet-or-exceed; missing data passes). Single verdict for badge/PDP/reverse/filter. */
export function tireFitsVehicle(productSpecs: TireFitSpec[], vehicleOemTires: OemTire[]): boolean {
  if (!productSpecs?.length || !vehicleOemTires?.length) return false
  return productSpecs.some((s) => vehicleOemTires.some((o) => fits(s, o)))
}
export const tireProductHasFittingVariant = tireFitsVehicle

/** Three-state tire fit verdict — the tire-side analog of the wheel `FitTier`
 *  "unknown" branch (see `fits-vehicle.ts`). A vehicle with no OEM tire data on
 *  file is "unknown" (we simply have nothing to check against), never
 *  collapsed into "no" — "no data" must never render as a disproven mismatch.
 *  Reuses `tireFitsVehicle`'s own match logic for the fits/no split so the
 *  two functions can never disagree on a vehicle that DOES have data. */
export type TireFitVerdict = "fits" | "no" | "unknown"

export function tireFitVerdict(
  productSpecs: TireFitSpec[],
  vehicleOemTires: OemTire[]
): TireFitVerdict {
  if (!vehicleOemTires?.length) return "unknown"
  return tireFitsVehicle(productSpecs, vehicleOemTires) ? "fits" : "no"
}
