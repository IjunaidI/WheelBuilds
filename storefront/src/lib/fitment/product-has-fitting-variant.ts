import { canonicalBoltPatterns } from "./canonical-bolt-pattern"

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
 */
export function variantFitsVehicle(v: VariantFitInput, vehicle: FitVehicle): boolean {
  const vPats = vehicle.canonicalBoltPatterns ?? []
  if (!vPats.length) return false

  const boltOk = canonicalBoltPatterns(String(v.boltPatternRaw ?? "")).some((p) => vPats.includes(p))
  if (!boltOk) return false

  const hub = vehicle.hubBoreMm ?? null
  const bore = num(v.centerBoreMm)
  if (hub != null && bore != null && bore < hub) return false

  return (
    inWin(num(v.diameterIn), vehicle.diameterWindow) &&
    inWin(num(v.widthIn), vehicle.widthWindow) &&
    inWin(num(v.offsetMm), vehicle.offsetWindow)
  )
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
  if (!variants?.length) return false
  return variants.some((variant) => {
    const m = variant.metadata ?? {}
    return variantFitsVehicle(
      {
        boltPatternRaw: m.bolt_pattern_raw,
        centerBoreMm: m.center_bore_mm,
        diameterIn: m.wheel_diameter_in,
        widthIn: m.wheel_width_in,
        offsetMm: m.offset_mm,
      },
      vehicle
    )
  })
}
