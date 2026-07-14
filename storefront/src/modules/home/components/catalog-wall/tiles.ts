/**
 * Pure slice for the Catalog Wall (WB-085 N6). New Arrivals (new-drops-row)
 * already shows `newest.slice(0, newDropsCount)` — without this offset the
 * Catalog Wall repeated the same products directly underneath. Slicing off
 * the front here keeps the two sections honest about what's actually "new"
 * vs. what's just "more of the catalog".
 */
export const catalogWallTiles = <T,>(
  newest: T[],
  newDropsCount: number,
  spans: number
): T[] => newest.slice(newDropsCount).slice(0, spans)
