// storefront/src/modules/tire-discovery/components/filter-rail/filter-facet-keys.ts
//
// Pure substring filter behind the tire "Size" facet's filter-as-you-type
// input (WB-088 D9). Tire sizes are the one facet on this rail that can
// carry dozens of distinct values (e.g. "225/45R17", "225/50R17", ...) —
// unlike Brand or Tire type, scanning a flat checklist to find one specific
// size is impractical, and Meili's `maxValuesPerFacet` (raised to 500 in
// medusa-config.js, also WB-088 D9) means the full list can genuinely be
// that long. Split out from the component so the match logic is
// unit-testable without a React render harness — mirrors the
// mobile-trigger-copy.ts / price-range.ts pure-helper pattern already used
// in this filter rail.

/**
 * Returns the subset of `keys` whose value contains `query` as a
 * case-insensitive substring, preserving the original order. A blank
 * (whitespace-only) query returns `keys` unchanged so the full facet list
 * shows before the user starts typing.
 */
export function filterFacetKeys(keys: string[], query: string): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return keys
  return keys.filter((k) => k.toLowerCase().includes(q))
}
