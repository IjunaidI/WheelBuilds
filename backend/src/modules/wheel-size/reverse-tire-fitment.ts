import { extractVehicleIdentity } from "./reverse-fitment"
import { extractOemTires } from "./oem-tires"
import { speedRatingRank } from "./speed-rating-rank"
import { OemTire, ReverseTireFitmentVehicle } from "./types"

type FitmentRow = { raw?: any; status?: string }

/** A product's per-variant tire spec — same shape as OemTire (size + load + speed). */
export type TireFitSpec = OemTire

/**
 * Meet-or-exceed match rule between a product spec and a vehicle's OEM tire.
 * Size must match exactly. Load index and speed rating each individually gate:
 * missing data on EITHER side passes that dimension (never falsely excludes on
 * absent data), otherwise the spec must be >= the OEM value.
 */
function specFitsOem(spec: TireFitSpec, oem: OemTire): boolean {
  if (spec.size !== oem.size) return false
  if (oem.loadIndex != null && spec.loadIndex != null && spec.loadIndex < oem.loadIndex) return false
  if (
    oem.speedRating != null &&
    spec.speedRating != null &&
    speedRatingRank(spec.speedRating) < speedRatingRank(oem.speedRating)
  ) {
    return false
  }
  return true
}

/**
 * Reduce cached fitment rows to a deduped, sorted, capped list of vehicles whose
 * factory (OEM) tire — size AND load index AND speed rating, meet-or-exceed —
 * is satisfied by some spec on the product. `extractOemTires` supplies the
 * canonical is_stock tires (size + load + speed); `extractVehicleIdentity` the
 * display identity — both read the same cached `raw` reverse-fitment already
 * consumes. Non-ok and identity-less rows are dropped. Mirrors buildReverseFitment
 * (WB-009); extends buildReverseTireFitment's size-only rule to multi-axis (WB-068).
 */
export function buildReverseTireFitment(
  rows: FitmentRow[],
  productSpecs: TireFitSpec[],
  limit: number
): ReverseTireFitmentVehicle[] {
  if (!productSpecs.length) return []
  const seen = new Set<string>()
  const out: ReverseTireFitmentVehicle[] = []
  for (const row of rows) {
    if (row.status && row.status !== "ok") continue
    const oemTires = extractOemTires(row.raw)
    let matchedSize: string | undefined
    for (const oem of oemTires) {
      if (productSpecs.some((spec) => specFitsOem(spec, oem))) {
        matchedSize = oem.size
        break
      }
    }
    if (!matchedSize) continue
    const id = extractVehicleIdentity(row.raw)
    if (!id) continue
    const key = `${id.make}|${id.model}|${id.trim ?? ""}|${id.yearLabel}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ year: id.yearLabel, make: id.make, model: id.model, trim: id.trim, size: matchedSize })
  }
  out.sort(
    (a, b) =>
      a.make.localeCompare(b.make) ||
      a.model.localeCompare(b.model) ||
      a.year.localeCompare(b.year)
  )
  return out.slice(0, limit)
}
