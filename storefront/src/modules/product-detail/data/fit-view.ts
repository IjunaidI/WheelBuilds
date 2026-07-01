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
  /**
   * True when the vehicle has a bolt pattern AND this wheel offers a
   * bolt-compatible variant. When true, callers show ONLY the fitting subset
   * and never fall back to the full option set (bolt pattern is the floor).
   */
  hasFit: boolean
  /** Only the fitting bolt patterns (subset of product.boltPatternOptions). */
  boltPatterns: string[]
  /** Only finishes with ≥1 fitting variant; each finish's sizeOptions trimmed to fitting sizes. */
  finishOptions: FinishOption[]
}

const inWin = (v: number, w: Win): boolean => (!w ? true : v >= w.min && v <= w.max)

/**
 * HARD compatibility — the wheel physically mounts on the vehicle: its bolt
 * pattern is one the vehicle uses and (per offset variant) the bore clears the
 * hub. This is the PRIMARY fitment gate. A shopper who arrived via "fits my car"
 * must only ever see bolt-compatible options — bolt pattern is never relaxed.
 */
function boltCompatible(size: SizeOption, vehicle: FitVehicle): boolean {
  const vPats = vehicle.canonicalBoltPatterns ?? []
  const boltOk =
    vPats.length > 0 && canonicalBoltPatterns(size.boltPattern).some((p) => vPats.includes(p))
  if (!boltOk) return false

  const hub = vehicle.hubBoreMm ?? null
  const boreClears = (bore: number | null) => hub == null || bore == null || bore >= hub
  const offsets = size.offsetVariants ?? []
  if (offsets.length === 0) return boreClears(null)
  return offsets.some((o) => boreClears(o.centerBoreMm))
}

/**
 * SOFT refinement on top of bolt-compatible — the diameter/width/offset also
 * fall inside the vehicle's wheel-size spec window. A null window passes (we
 * only have this data for SOME vehicles), so when a vehicle has no windows this
 * is equivalent to bolt-compatible and filtering falls back to bolt pattern
 * alone. Never used to relax bolt pattern, only to narrow within it.
 */
function withinWindows(size: SizeOption, vehicle: FitVehicle): boolean {
  if (!inWin(size.diameter, vehicle.diameterWindow)) return false
  if (!inWin(size.width, vehicle.widthWindow)) return false
  const offsets = size.offsetVariants ?? []
  if (offsets.length === 0) return inWin(size.offsetMm, vehicle.offsetWindow)
  return offsets.some((o) => inWin(o.value, vehicle.offsetWindow))
}

const trim = (
  finishes: FinishOption[],
  keep: (s: SizeOption) => boolean
): FinishOption[] =>
  finishes
    .map((f) => ({ ...f, sizeOptions: f.sizeOptions.filter(keep) }))
    .filter((f) => f.sizeOptions.length > 0)

export function buildFitView(product: ProductDetail, vehicle: FitVehicle): FitView {
  const noFit: FitView = {
    hasFit: false,
    boltPatterns: product.boltPatternOptions,
    finishOptions: product.finishOptions,
  }

  // Bolt pattern is the gate. Without any bolt-pattern data we cannot filter, so
  // fall back to the full set — but a vehicle with zero fitment data also never
  // produces a ?fit= filter, so this is a safety net, not a reachable route.
  if (!(vehicle.canonicalBoltPatterns && vehicle.canonicalBoltPatterns.length)) return noFit

  // Floor: only bolt-compatible variants (never other bolt patterns).
  const compatible = trim(product.finishOptions, (s) => boltCompatible(s, vehicle))
  if (compatible.length === 0) return noFit // wheel offers no matching bolt pattern

  // Refine to the spec window WHEN it leaves options; if the window would empty
  // the whole wheel (out-of-spec-but-bolt-compatible, or no window data at all),
  // keep the bolt-compatible floor — we never widen back to other patterns and
  // never fall through to the full catalog.
  const inSpec = trim(compatible, (s) => withinWindows(s, vehicle))
  const finishOptions = inSpec.length > 0 ? inSpec : compatible

  const boltPatterns = Array.from(
    new Set(finishOptions.flatMap((f) => f.sizeOptions.map((s) => s.boltPattern)))
  ).filter((p) => product.boltPatternOptions.includes(p))

  return {
    hasFit: true,
    boltPatterns: boltPatterns.length ? boltPatterns : product.boltPatternOptions,
    finishOptions,
  }
}
