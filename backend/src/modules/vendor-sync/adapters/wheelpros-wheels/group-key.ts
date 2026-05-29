/**
 * Compute the group key for a wheel row.
 *
 * Grouping rule:
 *  - DisplayStyleNo present -> group by Brand + DisplayStyleNo + Finish.
 *    Finish may be empty; rows with the same brand+model and blank finish
 *    still cluster (per the Asanti 172 case in wheelInvPriceData.csv).
 *  - DisplayStyleNo empty -> there is no model anchor, so each row is its
 *    own single-variant product. Key is the part_number so siblings cannot
 *    accidentally merge.
 *
 * The `sku:` prefix on the fallback path makes it unambiguous in logs which
 * branch produced the key and prevents collisions with a real Brand+Model+
 * Finish string that happened to look like a part number.
 */
export function computeWheelGroupKey(opts: {
  brand: string
  displayStyleNo: string | null
  finish: string | null
  partNumber: string
}): string {
  const brand = opts.brand.trim()
  const displayStyleNo = opts.displayStyleNo?.trim() ?? ""
  const finish = opts.finish?.trim() ?? ""

  if (!displayStyleNo) {
    return `sku:${opts.partNumber}`
  }

  return `${brand}|${displayStyleNo}|${finish}`
}
