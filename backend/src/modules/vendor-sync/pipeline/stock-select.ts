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
