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
