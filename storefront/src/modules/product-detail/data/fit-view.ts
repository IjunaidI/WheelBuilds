import { canonicalBoltPatterns } from "@lib/fitment/canonical-bolt-pattern"
import { boreClears } from "@lib/fitment/bore-clearance"
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
   * Best tier reachable across all surviving sizes — "fits" when at least one
   * size is a full match (bolt pattern + in-window dims + a variant that
   * pairs a clearing bore with an in-window offset), "check" when nothing
   * fully fits but something is bolt-compatible and bore-clearing (PDP shows
   * these with an aggressive "verify fitment" badge instead of hiding them —
   * WB-077), "no" when nothing survives at all.
   */
  bestTier: "fits" | "check" | "no"
  /**
   * True when the vehicle has a bolt pattern AND this wheel offers a
   * bolt-compatible, bore-clearing variant (i.e. `bestTier !== "no"`). When
   * true, callers show ONLY the surviving subset (fits + check) and never
   * fall back to the full option set (bolt pattern is the floor).
   */
  hasFit: boolean
  /** Only the fitting bolt patterns (subset of product.boltPatternOptions). */
  boltPatterns: string[]
  /** Only finishes with ≥1 surviving variant; each finish's sizeOptions trimmed to surviving sizes and tagged with `tier`. */
  finishOptions: FinishOption[]
}

const inWin = (v: number, w: Win): boolean => (!w ? true : v >= w.min && v <= w.max)

/**
 * A single offset variant's tier — bore and offset are checked on the SAME
 * variant, never mixed across two different variants of the same size (that
 * mismatch was the WB-072 S4 bug: a size could wrongly pass because variant
 * A's bore cleared while variant B's ET was in-window, with no single
 * variant satisfying both). "no" when this variant's bore never clears the
 * hub (not even within `boreClears`' tolerance); "fits" when it clears AND
 * the offset is in-window; "check" when it clears but the offset is out of
 * window — plausible, but worth a human double-check.
 */
const offsetTier = (o: OffsetVariant, vehicle: FitVehicle): "fits" | "check" | "no" => {
  if (!boreClears(o.centerBoreMm, vehicle.hubBoreMm ?? null)) return "no"
  return inWin(o.value, vehicle.offsetWindow) ? "fits" : "check"
}

/**
 * Single fitment tier predicate — bolt pattern (size-level, the HARD gate,
 * never relaxed: a mismatch is always "no") AND diameter/width windows
 * (size-level) AND the best tier reachable across this size's offset
 * variants, each individually paired (bore + offset checked on the SAME
 * variant via `offsetTier`). "fits" only when diameter AND width are
 * in-window AND some variant itself reaches "fits"; "check" when
 * bolt-compatible and at least one variant's bore clears, but the size isn't
 * a full match (out-of-window diameter/width, or every clearing variant's
 * offset misses its window); "no" when bolt pattern fails or NO variant even
 * clears the hub.
 */
function sizeTier(size: SizeOption, vehicle: FitVehicle): "fits" | "check" | "no" {
  const vPats = vehicle.canonicalBoltPatterns ?? []
  const boltOk = vPats.length > 0 && canonicalBoltPatterns(size.boltPattern).some((p) => vPats.includes(p))
  if (!boltOk) return "no"

  const dw = inWin(size.diameter, vehicle.diameterWindow)
  const ww = inWin(size.width, vehicle.widthWindow)

  const offsets = size.offsetVariants ?? []
  if (offsets.length === 0) {
    if (!boreClears(null, vehicle.hubBoreMm ?? null)) return "no"
    return dw && ww && inWin(size.offsetMm, vehicle.offsetWindow) ? "fits" : "check"
  }

  const tiers = offsets.map((o) => offsetTier(o, vehicle))
  if (tiers.every((t) => t === "no")) return "no" // no offset even clears bore → not shown
  const anyFits = dw && ww && tiers.includes("fits")
  return anyFits ? "fits" : "check"
}

/**
 * Filters each finish's sizeOptions down to the surviving sizes (per
 * `sizeTier` !== "no") AND — WB-072 S3, extended by WB-077 — trims each
 * surviving size's `offsetVariants` to drop only the non-clearing ("no")
 * ones; "check" offsets stay visible (only the bore-failing ones vanish) so
 * a shopper can eyeball an aggressive-but-plausible ET instead of it being
 * silently hidden. Surviving offsets are then ordered fits-before-check
 * (stable) so `offsetVariants[0]` is a genuinely-fitting ET whenever the size
 * has one — the hero defaults the selected offset to `offsetVariants[0]`
 * (WB-077 I1). A check-only size has no fitting ET; its aggressive banner
 * tells the shopper to verify clearance. Each surviving size is tagged with
 * its own `tier` for the PDP badge.
 */
function trim(finishOptions: FinishOption[], vehicle: FitVehicle): FinishOption[] {
  return finishOptions
    .map((f) => ({
      ...f,
      sizeOptions: f.sizeOptions
        .map((s) => ({ s, tier: sizeTier(s, vehicle) }))
        .filter((x): x is { s: SizeOption; tier: "fits" | "check" } => x.tier !== "no")
        .map(({ s, tier }) => ({
          ...s,
          tier,
          offsetVariants: (s.offsetVariants ?? [])
            .map((o) => ({ o, t: offsetTier(o, vehicle) }))
            .filter((x) => x.t !== "no")
            // Array.prototype.sort is stable (Node 11+/V8) — equal-tier offsets
            // keep their original product order; only fits jump ahead of check.
            .sort((a, b) => (a.t === b.t ? 0 : a.t === "fits" ? -1 : 1))
            .map((x) => x.o),
        })),
    }))
    .filter((f) => f.sizeOptions.length > 0)
}

export function buildFitView(product: ProductDetail, vehicle: FitVehicle): FitView {
  const noFit: FitView = {
    bestTier: "no",
    hasFit: false,
    boltPatterns: product.boltPatternOptions,
    finishOptions: product.finishOptions,
  }

  // Bolt pattern is the gate. Without any bolt-pattern data we cannot filter, so
  // fall back to the full set — but a vehicle with zero fitment data also never
  // produces a ?fit= filter, so this is a safety net, not a reachable route.
  if (!(vehicle.canonicalBoltPatterns && vehicle.canonicalBoltPatterns.length)) return noFit

  // Keep every bolt-compatible, bore-clearing size — genuine full matches as
  // "fits", out-of-window-but-plausible ones as "check" (WB-077: these used
  // to be silently dropped; now they surface with an aggressive
  // verify-fitment badge instead of disappearing). hasFit:false only when
  // NOTHING survives at all → the hero shows a "doesn't fit your car" state,
  // never a silent fall-through to every option.
  const finishOptions = trim(product.finishOptions, vehicle)
  if (finishOptions.length === 0) return noFit // nothing survives → hero shows a "doesn't fit" state

  const anyFits = finishOptions.some((f) => f.sizeOptions.some((s) => s.tier === "fits"))
  const bestTier: "fits" | "check" = anyFits ? "fits" : "check"

  const boltPatterns = Array.from(
    new Set(finishOptions.flatMap((f) => f.sizeOptions.map((s) => s.boltPattern)))
  ).filter((p) => product.boltPatternOptions.includes(p))

  return {
    bestTier,
    hasFit: true,
    boltPatterns: boltPatterns.length ? boltPatterns : product.boltPatternOptions,
    finishOptions,
  }
}
