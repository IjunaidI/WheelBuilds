import { canonicalBoltPatterns } from "./canonical-bolt-pattern"
import { boreClears } from "./bore-clearance"

type Win = { min: number; max: number } | null | undefined

export type FitVehicle = {
  canonicalBoltPatterns?: string[]
  hubBoreMm?: number | null
  diameterWindow?: Win
  widthWindow?: Win
  offsetWindow?: Win
}

const inWin = (v: number | null, w: Win): boolean =>
  v == null ? true : !w ? true : v >= w.min && v <= w.max

const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v)
  return null
}

export type VariantFitInput = {
  boltPatternRaw?: unknown
  centerBoreMm?: unknown
  diameterIn?: unknown
  widthIn?: unknown
  offsetMm?: unknown
}

/**
 * Does ONE variant fit the vehicle — checking its bolt pattern AND its size
 * together (the thing the coarse search index can't express for multi-pattern
 * wheels). Mirrors the PDP's per-variant gate (buildFitView / fitsVehicle):
 * bolt pattern must match + bore must clear the hub (hard), and
 * diameter/width/offset must be within the vehicle's spec window when we have
 * one (a null window / missing value can't be checked, so it passes).
 *
 * Per-variant fitment tier — the finer-grained verdict `variantFitsVehicle`
 * collapses to a boolean. "no" covers bolt mismatch, empty-vehicle-patterns,
 * and bore-below-hub (beyond `boreClears`'s tolerance); "check" is bolt+bore
 * clearing but at least one size window not satisfied; "fits" is all three.
 * There is no "unknown" here — that's a surface (display) concern, not this
 * pure per-variant gate's.
 */
export function variantFitTier(v: VariantFitInput, vehicle: FitVehicle): "fits" | "check" | "no" {
  const vPats = vehicle.canonicalBoltPatterns ?? []
  if (!vPats.length) return "no" // surfaces map empty-vehicle to unknown; strict callers want "no"
  const boltOk = canonicalBoltPatterns(String(v.boltPatternRaw ?? "")).some((p) => vPats.includes(p))
  if (!boltOk) return "no"
  const hub = vehicle.hubBoreMm ?? null
  const bore = num(v.centerBoreMm)
  if (!boreClears(bore, hub)) return "no"
  const inWindow =
    inWin(num(v.diameterIn), vehicle.diameterWindow) &&
    inWin(num(v.widthIn), vehicle.widthWindow) &&
    inWin(num(v.offsetMm), vehicle.offsetWindow)
  return inWindow ? "fits" : "check"
}

export function variantFitsVehicle(v: VariantFitInput, vehicle: FitVehicle): boolean {
  return variantFitTier(v, vehicle) === "fits"
}

const TIER_RANK = { fits: 2, check: 1, no: 0 } as const

/**
 * Best fitment tier across a product's variants — the finer-grained verdict
 * `productHasFittingVariant` collapses to a boolean. Ranks fits > check > no
 * and early-breaks once any variant reaches "fits".
 */
export function productFitTier(
  variants: { metadata?: Record<string, unknown> | null }[] | undefined,
  vehicle: FitVehicle
): "fits" | "check" | "no" {
  if (!variants?.length) return "no"
  let best: "fits" | "check" | "no" = "no"
  for (const variant of variants) {
    const m = variant.metadata ?? {}
    const t = variantFitTier(
      {
        boltPatternRaw: m.bolt_pattern_raw,
        centerBoreMm: m.center_bore_mm,
        diameterIn: m.wheel_diameter_in,
        widthIn: m.wheel_width_in,
        offsetMm: m.offset_mm,
      },
      vehicle
    )
    if (TIER_RANK[t] > TIER_RANK[best]) best = t
    if (best === "fits") break
  }
  return best
}

/**
 * True when a product has ≥1 variant that genuinely fits the vehicle. Used to
 * post-filter discovery results so the catalog list matches the PDP exactly —
 * a multi-bolt-pattern wheel whose matching pattern is only offered in a
 * non-fitting size is correctly excluded.
 */
export function productHasFittingVariant(
  variants: { metadata?: Record<string, unknown> | null }[] | undefined,
  vehicle: FitVehicle
): boolean {
  return productFitTier(variants, vehicle) === "fits"
}
