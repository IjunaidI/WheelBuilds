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

  // Size/offset windows come from wheel-size.com (null when no spec is on file).
  // A "confirmed" fit must be VERIFIED against a real window — a shared bolt
  // pattern (e.g. 5x114.3 is on countless cars and wheels) is not a fit on its
  // own, which is why a random same-pattern wheel must NOT read as guaranteed.
  const haveWindow = !!(vehicle.diameterWindow || vehicle.widthWindow || vehicle.offsetWindow)
  const withinWindow =
    hardGatesPass &&
    haveWindow &&
    inWin(sizes.map((s) => s.diameter), vehicle.diameterWindow) &&
    inWin(sizes.map((s) => s.width), vehicle.widthWindow) &&
    inWin(offsets, vehicle.offsetWindow)

  if (hardGatesPass && haveWindow && !withinWindow)
    reasons.push("This wheel's size or offset is outside your vehicle's spec range.")
  if (hardGatesPass && !haveWindow)
    reasons.push("No fitment spec on file for your vehicle to confirm size.")

  // A wheel fits only when it physically mounts (bolt pattern + bore) AND is
  // offered in a diameter/width/offset inside the vehicle's verified window.
  const fits = hardGatesPass && withinWindow

  return { fits, hardGatesPass, withinWindow, reasons }
}
