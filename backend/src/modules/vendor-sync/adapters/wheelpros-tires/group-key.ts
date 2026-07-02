/**
 * Compute the group key for a tire row.
 *
 *  - Model confidently extracted -> group by Brand + Model. All sizes of a
 *    Brand+Model collapse into one product, size carried as the variant axis.
 *  - Not confident -> per-SKU fallback (`sku:<partNumber>`), so unrelated rows
 *    never merge. Mirrors computeWheelGroupKey's DisplayStyleNo fallback.
 *
 * Pure function -- no side effects.
 */
export function computeTireGroupKey(opts: {
  brand: string
  model: string | null
  confident: boolean
  partNumber: string
}): string {
  if (opts.confident && opts.model) {
    return `${opts.brand.trim()}|${opts.model.trim()}`
  }
  return `sku:${opts.partNumber}`
}
