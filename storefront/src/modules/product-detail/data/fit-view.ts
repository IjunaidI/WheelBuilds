import { canonicalBoltPatterns } from "@lib/fitment/canonical-bolt-pattern"
import type { FinishOption, OffsetVariant, ProductDetail, SizeOption } from "./types"

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

const boreClearsHub = (bore: number | null, hub: number | null) =>
  hub == null || bore == null || bore >= hub

/**
 * A single offset variant "fits" the vehicle when its OWN bore clears the hub
 * AND its OWN offset falls in the window — bore and offset are checked on the
 * SAME variant, never mixed across two different variants of the same size
 * (that mismatch was the WB-072 S4 bug: a size could pass because variant A's
 * bore cleared while variant B's ET was in-window, with no single variant
 * satisfying both).
 */
function offsetVariantFits(o: OffsetVariant, vehicle: FitVehicle): boolean {
  return boreClearsHub(o.centerBoreMm, vehicle.hubBoreMm ?? null) && inWin(o.value, vehicle.offsetWindow)
}

/** This size's offset variants that individually satisfy bore-clears AND in-window. */
function fittingOffsetVariants(size: SizeOption, vehicle: FitVehicle): OffsetVariant[] {
  const offsets = size.offsetVariants ?? []
  return offsets.filter((o) => offsetVariantFits(o, vehicle))
}

/**
 * Single fitment predicate — bolt pattern (size-level, the HARD gate, never
 * relaxed) AND diameter/width windows (size-level) AND at least one offset
 * variant that PAIRS a clearing bore with an in-window offset on the same
 * variant. When the size has no offsetVariants at all, fall back to the
 * size-level offsetMm/bore (there's nothing else to check against).
 */
function sizeFits(size: SizeOption, vehicle: FitVehicle): boolean {
  const vPats = vehicle.canonicalBoltPatterns ?? []
  const boltOk =
    vPats.length > 0 && canonicalBoltPatterns(size.boltPattern).some((p) => vPats.includes(p))
  if (!boltOk) return false

  if (!inWin(size.diameter, vehicle.diameterWindow)) return false
  if (!inWin(size.width, vehicle.widthWindow)) return false

  const offsets = size.offsetVariants ?? []
  if (offsets.length === 0) {
    return boreClearsHub(null, vehicle.hubBoreMm ?? null) && inWin(size.offsetMm, vehicle.offsetWindow)
  }
  return offsets.some((o) => offsetVariantFits(o, vehicle))
}

/**
 * Filters each finish's sizeOptions down to the fitting sizes (per `sizeFits`)
 * AND — WB-072 S3 — trims each surviving size's `offsetVariants` to only the
 * individually-fitting ones, so a fit-filtered PDP never surfaces an
 * out-of-window/non-clearing ET under an "only options that fit" banner.
 * Sizes that fit via the empty-offsetVariants fallback are left as-is (there's
 * no variant list to trim).
 */
const trim = (finishes: FinishOption[], vehicle: FitVehicle): FinishOption[] =>
  finishes
    .map((f) => ({
      ...f,
      sizeOptions: f.sizeOptions.filter((s) => sizeFits(s, vehicle)).map((s) => {
        const offsets = s.offsetVariants ?? []
        if (offsets.length === 0) return s
        return { ...s, offsetVariants: fittingOffsetVariants(s, vehicle) }
      }),
    }))
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

  // Keep ONLY the genuinely-fitting sizes: bolt-compatible AND within the
  // vehicle's spec window on every dimension we have data for (a null window
  // passes — it can't be checked). So with spec data this really narrows by
  // diameter/width/offset; without it, it's bolt pattern + bore. Same predicate
  // as fitsVehicle, so the chip/section/filtering agree. hasFit:false when
  // nothing fits → the hero shows a "doesn't fit your car" state, never a silent
  // fall-through to every option.
  const finishOptions = trim(product.finishOptions, vehicle)
  if (finishOptions.length === 0) return noFit // nothing fits → hero shows a "doesn't fit" state

  const boltPatterns = Array.from(
    new Set(finishOptions.flatMap((f) => f.sizeOptions.map((s) => s.boltPattern)))
  ).filter((p) => product.boltPatternOptions.includes(p))

  return {
    hasFit: true,
    boltPatterns: boltPatterns.length ? boltPatterns : product.boltPatternOptions,
    finishOptions,
  }
}
