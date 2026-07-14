/**
 * Facet-entry sort for the filter-rail `ChecklistSection` (WB-088 D10).
 *
 * Default: count desc, then key alpha — reasonable for non-numeric
 * dimensions (brand, finish, tire type) where there's no natural small-to-
 * large order.
 *
 * `numeric: true` sorts ascending by `Number(key)` instead. Numeric facets
 * (wheel diameter, tire rim diameter, tire load index) need this because the
 * default count-first sort falls back to STRING comparison for the tie
 * break, and even when counts differ it still reads as broken for a size
 * dimension — e.g. "10" < "9" lexicographically, so an 18/19/20 diameter
 * list would render as 18, 19, 20 only by luck of the count ordering and
 * scramble as soon as counts change. A shopper expects sizes small-to-large
 * regardless of which bucket has more stock.
 *
 * Shared between the wheel (`discovery/components/filter-rail/filter-sections.tsx`)
 * and tire (`tire-discovery/components/filter-rail/filter-sections.tsx`) rails —
 * one implementation, not two copies to keep in sync.
 */
export function sortFacetEntries(
  facetMap: Record<string, number>,
  numeric?: boolean
): [string, number][] {
  const entries = Object.entries(facetMap)
  return numeric
    ? entries.sort((a, b) => Number(a[0]) - Number(b[0]))
    : entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}
