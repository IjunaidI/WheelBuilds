import { extractVehicleIdentity } from "./reverse-fitment"
import { extractOemTireSizes } from "./oem-tire-sizes"
import { ReverseTireFitmentVehicle } from "./types"

type FitmentRow = { raw?: any; status?: string }

/**
 * Reduce cached fitment rows to a deduped, sorted, capped list of vehicles whose
 * factory (OEM) tire size matches the product. `extractOemTireSizes` supplies the
 * canonical is_stock sizes; `extractVehicleIdentity` the display identity — both
 * read the same cached `raw` reverse-fitment already consumes. Non-ok and
 * identity-less rows are dropped. Mirrors buildReverseFitment (WB-009).
 */
export function buildReverseTireFitment(
  rows: FitmentRow[],
  productSizes: string[],
  limit: number
): ReverseTireFitmentVehicle[] {
  if (!productSizes.length) return []
  const productSet = new Set(productSizes)
  const seen = new Set<string>()
  const out: ReverseTireFitmentVehicle[] = []
  for (const row of rows) {
    if (row.status && row.status !== "ok") continue
    const vehicleSizes = extractOemTireSizes(row.raw)
    const size = vehicleSizes.find((s) => productSet.has(s))
    if (!size) continue
    const id = extractVehicleIdentity(row.raw)
    if (!id) continue
    const key = `${id.make}|${id.model}|${id.trim ?? ""}|${id.yearLabel}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ year: id.yearLabel, make: id.make, model: id.model, trim: id.trim, size })
  }
  out.sort(
    (a, b) =>
      a.make.localeCompare(b.make) ||
      a.model.localeCompare(b.model) ||
      a.year.localeCompare(b.year)
  )
  return out.slice(0, limit)
}
