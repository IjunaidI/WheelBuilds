import { canonicalBoltPatterns } from "@lib/fitment/canonical-bolt-pattern"
import type { FinishOption, ProductDetail, SizeOption } from "./types"

type Win = { min: number; max: number } | null | undefined

export type FitVehicle = {
  canonicalBoltPatterns?: string[]
  hubBoreMm?: number | null
  diameterWindow?: Win
  widthWindow?: Win
  offsetWindow?: Win
}

export type FitView = {
  /** ≥1 fitting variant AND the vehicle has ≥1 spec window. False → callers show everything. */
  hasFit: boolean
  /** Only the fitting bolt patterns (subset of product.boltPatternOptions). */
  boltPatterns: string[]
  /** Only finishes with ≥1 fitting variant; each finish's sizeOptions trimmed to fitting sizes. */
  finishOptions: FinishOption[]
}

const inWin = (v: number, w: Win): boolean => (!w ? true : v >= w.min && v <= w.max)

/**
 * A size fits the vehicle when its bolt pattern is one of the vehicle's canonical
 * patterns, its diameter/width are within window, and it has ≥1 offset variant
 * whose ET is within the offset window and whose bore clears the hub. Mirrors the
 * gate semantics in lib/fitment/fits-vehicle.ts (null bore / null window pass).
 */
function sizeFits(size: SizeOption, vehicle: FitVehicle): boolean {
  const vPats = vehicle.canonicalBoltPatterns ?? []
  const boltOk =
    vPats.length > 0 && canonicalBoltPatterns(size.boltPattern).some((p) => vPats.includes(p))
  if (!boltOk) return false
  if (!inWin(size.diameter, vehicle.diameterWindow)) return false
  if (!inWin(size.width, vehicle.widthWindow)) return false

  const hub = vehicle.hubBoreMm ?? null
  const boreClears = (bore: number | null) => hub == null || bore == null || bore >= hub

  const offsets = size.offsetVariants ?? []
  if (offsets.length === 0) return inWin(size.offsetMm, vehicle.offsetWindow) && boreClears(null)
  return offsets.some((o) => inWin(o.value, vehicle.offsetWindow) && boreClears(o.centerBoreMm))
}

export function buildFitView(product: ProductDetail, vehicle: FitVehicle): FitView {
  const noFit: FitView = {
    hasFit: false,
    boltPatterns: product.boltPatternOptions,
    finishOptions: product.finishOptions,
  }

  const haveWindow = !!(vehicle.diameterWindow || vehicle.widthWindow || vehicle.offsetWindow)
  if (!haveWindow) return noFit

  const finishOptions: FinishOption[] = product.finishOptions
    .map((f) => ({ ...f, sizeOptions: f.sizeOptions.filter((s) => sizeFits(s, vehicle)) }))
    .filter((f) => f.sizeOptions.length > 0)

  if (finishOptions.length === 0) return noFit

  const boltPatterns = Array.from(
    new Set(finishOptions.flatMap((f) => f.sizeOptions.map((s) => s.boltPattern)))
  ).filter((p) => product.boltPatternOptions.includes(p))

  return {
    hasFit: true,
    boltPatterns: boltPatterns.length ? boltPatterns : product.boltPatternOptions,
    finishOptions,
  }
}
