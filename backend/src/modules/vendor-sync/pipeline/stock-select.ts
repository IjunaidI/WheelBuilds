/** Parts staged this run that also have a current (active-or-not) product row. */
export function selectStockPartNumbers(
  stagedPartNumbers: string[],
  currentPartNumbers: Set<string>
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const pn of stagedPartNumbers) {
    if (currentPartNumbers.has(pn) && !seen.has(pn)) {
      seen.add(pn)
      out.push(pn)
    }
  }
  return out
}

/**
 * Parts to run a stock pass on during a stock-only run. Source is the FULL set
 * of parts staged this run (vendor_feed_staging), NOT only those with positive
 * stock (vendor_stock_staging): a part that sold out at EVERY warehouse has no
 * stock-staging row, so sourcing from stock-staging skips it and its Medusa
 * levels never zero (WB-089 L5). Intersect with current products so we only
 * touch parts that actually have a Medusa product / inventory item.
 */
export function stockOnlyPartsToApply(
  feedStagedPartNumbers: string[],
  currentPartNumbers: Set<string>
): string[] {
  return selectStockPartNumbers(feedStagedPartNumbers, currentPartNumbers)
}
