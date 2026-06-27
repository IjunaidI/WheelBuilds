/**
 * Compute the group key for a wheel row.
 *
 * Grouping rule:
 *  - DisplayStyleNo present -> group by Brand + DisplayStyleNo (finish ignored).
 *    All colors of a Brand+Model collapse into one product, with finish carried
 *    as a variant axis (WB-059).
 *  - DisplayStyleNo empty -> there is no model anchor, so each row is its
 *    own single-variant product. Key is the part_number so siblings cannot
 *    accidentally merge.
 *
 * The `sku:` prefix on the fallback path makes it unambiguous in logs which
 * branch produced the key and prevents collisions with a real Brand+Model
 * string that happened to look like a part number.
 */
export function computeWheelGroupKey(opts: {
  brand: string
  displayStyleNo: string | null
  finish: string | null
  partNumber: string
}): string {
  const brand = opts.brand.trim()
  const displayStyleNo = opts.displayStyleNo?.trim() ?? ""

  if (!displayStyleNo) {
    return `sku:${opts.partNumber}`
  }

  // Finish is intentionally NOT part of the key: all colors of a Brand+Model
  // collapse into one product, with finish carried as a variant axis (WB-059).
  return `${brand}|${displayStyleNo}`
}
