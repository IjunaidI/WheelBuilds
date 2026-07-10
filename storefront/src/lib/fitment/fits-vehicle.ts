// storefront/src/lib/fitment/fits-vehicle.ts
import { FitTier } from "./fit-tier"
import { boreClears } from "./bore-clearance"

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
export type FitVerdict = {
  status: FitTier
  fits: boolean
  hardGatesPass: boolean
  withinWindow: boolean
  reasons: string[]
}

const scalarInWin = (v: number, w: Win): boolean => (!w ? true : v >= w.min && v <= w.max)

export function fitsVehicle(product: ProductLike, vehicle: VehicleLike): FitVerdict {
  const pPats = product.boltPatternsCanonical ?? []
  const vPats = vehicle.canonicalBoltPatterns ?? []

  // S5: no bolt-pattern data on file for this vehicle is an UNKNOWN fitment,
  // not a disproven mismatch — we simply have nothing to check it against.
  if (vPats.length === 0) {
    return {
      status: "unknown",
      fits: false,
      hardGatesPass: false,
      withinWindow: false,
      reasons: ["We don't have fitment data for your vehicle yet."],
    }
  }

  // F5: product has no parseable bolt pattern → unknown, not a false mismatch.
  if (pPats.length === 0) {
    return {
      status: "unknown",
      fits: false,
      hardGatesPass: false,
      withinWindow: false,
      reasons: ["We don't have fitment data for this wheel yet."],
    }
  }

  const reasons: string[] = []
  const boltOk = pPats.some((p) => vPats.includes(p))
  if (!boltOk) reasons.push("Bolt pattern does not match your vehicle.")

  const hub = vehicle.hubBoreMm ?? null
  const wheelBore = product.specs?.centerBoreMm ?? null
  const boreOk = boltOk && boreClears(wheelBore, hub)
  if (boltOk && !boreOk) reasons.push("Wheel bore is smaller than your vehicle's hub.")

  const hardGatesPass = boltOk && boreOk

  const sizes = product.sizeOptions ?? []

  // Size/offset windows come from wheel-size.com (null when no spec is on
  // file). A product fits only if ONE size satisfies diameter AND width AND
  // has an in-window offset TOGETHER (per-size conjunction) — checking each
  // dimension independently across different sizes (S1) would let a product
  // read as "fits" when no single buildable size actually clears the vehicle.
  const withinWindow =
    hardGatesPass &&
    sizes.some(
      (s) =>
        scalarInWin(s.diameter, vehicle.diameterWindow) &&
        scalarInWin(s.width, vehicle.widthWindow) &&
        (s.offsetVariants?.length
          ? s.offsetVariants.some((o) => scalarInWin(o.value, vehicle.offsetWindow))
          : scalarInWin(s.offsetMm, vehicle.offsetWindow))
    )

  if (hardGatesPass && !withinWindow)
    reasons.push("Aggressive fitment — outside the typical range for your vehicle. Verify clearance before ordering.")

  const status: FitTier = !hardGatesPass ? "no-fit" : withinWindow ? "fits" : "check"
  const fits = status === "fits"

  return { status, fits, hardGatesPass, withinWindow, reasons }
}
