import { canonicalizeTireSize } from "./canonicalize-tire-size"

/**
 * A tire fits the vehicle when any of its (canonical) sizes matches one of the
 * vehicle's OEM tire sizes. Product `tire_sizes` are already canonical; the
 * vehicle set is canonicalized here to be safe. Single source of truth for the
 * tire card badge, the discovery fit gate, and the tire-PDP chip. Pure.
 */
export function tireFitsVehicle(productSizes: string[], vehicleOemSizes: string[]): boolean {
  if (!productSizes.length || !vehicleOemSizes.length) return false
  const vset = new Set(vehicleOemSizes.map(canonicalizeTireSize).filter(Boolean))
  return productSizes.map(canonicalizeTireSize).some((s) => s && vset.has(s))
}
