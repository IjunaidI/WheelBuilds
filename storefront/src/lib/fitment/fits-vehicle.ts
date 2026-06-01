// storefront/src/lib/fitment/fits-vehicle.ts
type Win = { min: number; max: number } | null | undefined
type ProductLike = {
  boltPatternsCanonical?: string[]
  specs?: { centerBoreMm?: number }
  sizeOptions?: { diameter: number; width: number; offsetMm: number; offsetVariants?: { value: number }[] }[]
}
type VehicleLike = {
  canonicalBoltPatterns?: string[]
  hubBoreMm?: number | null
  diameterWindow?: Win; widthWindow?: Win; offsetWindow?: Win
}
export type FitVerdict = { fits: boolean; hardGatesPass: boolean; withinWindow: boolean; reasons: string[] }

const inWin = (vals: number[], w: Win): boolean =>
  !w ? true : vals.some((v) => v >= w.min && v <= w.max)

export function fitsVehicle(product: ProductLike, vehicle: VehicleLike): FitVerdict {
  const reasons: string[] = []
  const pPats = product.boltPatternsCanonical ?? []
  const vPats = vehicle.canonicalBoltPatterns ?? []
  const boltOk = vPats.length > 0 && pPats.some((p) => vPats.includes(p))
  if (!boltOk) reasons.push("Bolt pattern does not match your vehicle.")

  const hub = vehicle.hubBoreMm ?? null
  const wheelBore = product.specs?.centerBoreMm ?? null
  const boreOk = hub == null || wheelBore == null ? boltOk : wheelBore >= hub
  if (boltOk && !boreOk) reasons.push("Wheel bore is smaller than your vehicle's hub.")

  const hardGatesPass = boltOk && boreOk

  const sizes = product.sizeOptions ?? []
  // Offsets: include every selectable ET (sibling offsetVariants), not just the default offsetMm.
  const offsets = sizes.flatMap((s) => (s.offsetVariants?.length ? s.offsetVariants.map((o) => o.value) : [s.offsetMm]))
  const withinWindow = hardGatesPass &&
    inWin(sizes.map((s) => s.diameter), vehicle.diameterWindow) &&
    inWin(sizes.map((s) => s.width), vehicle.widthWindow) &&
    inWin(offsets, vehicle.offsetWindow)

  return { fits: hardGatesPass, hardGatesPass, withinWindow, reasons }
}
