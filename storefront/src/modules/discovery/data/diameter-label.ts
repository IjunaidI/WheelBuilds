/**
 * Pure formatter for a discovery card's diameter chip (WB-088 D5).
 *
 * A wheel product can span multiple diameters (e.g. offered in 17/18/20).
 * The card previously showed only `diameters[0]` (and "0\"" when empty),
 * understating a multi-size product. This renders the honest min–max range
 * instead, and narrows to the matching diameter(s) when the shopper has an
 * active diameter filter selected — so a card in a "20-inch" filtered view
 * reads "20″" rather than the product's full range.
 *
 * Returns null when `diameters` is empty — the caller (product-card.tsx)
 * decides the fallback (omit the chip / an "N sizes"-style label), mirroring
 * the tire card's `rimRangeLabel` returning "" for the same case.
 */
export function diameterLabel(
  diameters: number[],
  activeDiameters?: number[]
): string | null {
  if (!diameters.length) return null

  let pool = diameters
  if (activeDiameters?.length) {
    const active = new Set(activeDiameters)
    const matching = diameters.filter((d) => active.has(d))
    if (matching.length) pool = matching
  }

  const sorted = Array.from(new Set(pool)).sort((a, b) => a - b)
  const min = sorted[0]
  const max = sorted[sorted.length - 1]
  return min === max ? `${min}″` : `${min}″–${max}″`
}
