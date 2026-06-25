import { ProductDetail } from "../../data/types"

export type SpecRow = { label: string; value: string }

/**
 * The visible spec rows for a wheel. Real values only — any numeric field that
 * is 0/missing is OMITTED rather than rendered as a fake "0 lb"/"0 mm". The
 * admin-metadata string fields (construction/origin/warranty) keep the WB-029
 * null-guard; this extends the same honesty to the numerics + the always-"1"
 * finish-options count. (WB-056)
 */
export function buildSpecRows(specs: ProductDetail["specs"]): SpecRow[] {
  const rows: SpecRow[] = []
  if (specs.construction) rows.push({ label: "Construction", value: specs.construction })
  if (specs.weightLb > 0) rows.push({ label: "Per-wheel weight", value: `${specs.weightLb} lb` })
  if (specs.loadRatingLb > 0)
    rows.push({ label: "Load rating", value: `${specs.loadRatingLb.toLocaleString()} lb` })
  if (specs.centerBoreMm > 0) rows.push({ label: "Center bore", value: `${specs.centerBoreMm} mm` })
  if (specs.hubBoreMm) rows.push({ label: "Hub bore", value: `${specs.hubBoreMm} mm` })
  if (specs.countryOfOrigin)
    rows.push({ label: "Country of origin", value: specs.countryOfOrigin })
  if (specs.warranty) rows.push({ label: "Warranty", value: specs.warranty })
  if (specs.finishOptions > 1)
    rows.push({ label: "Finish options", value: `${specs.finishOptions}` })
  return rows
}
