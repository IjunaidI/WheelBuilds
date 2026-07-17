import type { Finish } from "@modules/common/components/wheel"
import type { DiscoveryFilters } from "@modules/discovery/data/types"

import type { StyleDef } from "./style-slug"

/**
 * Apply a `STYLE_DEFS` preset onto already-parsed URL filters (WB-099 Task 4
 * fix wave).
 *
 * Rule: fill `def.param`'s dimension with the coerced preset values ONLY IF
 * that dimension is empty in `filters` (i.e. the URL didn't already set it);
 * otherwise leave `filters` untouched. This makes the preset a DEFAULT, not
 * an unconditional override/lock:
 *
 *   - `/styles/street` (no `?diameters`) -> parsed `diameters` is `[]` ->
 *     preset `[18, 19, 20]` applied.
 *   - `/styles/street?diameters=19` (shopper refined via the rail) -> parsed
 *     `diameters` is `[19]` (non-empty) -> kept as-is, preset NOT re-applied.
 *
 * `parseQueryFromSearchParams` (discovery/data/types.ts) always produces
 * `diameters`/`finishes`/`brands` as arrays — an absent query param yields
 * `[]`, never `undefined` — so "empty" is simply `.length === 0` for all
 * three `StyleParam` variants `STYLE_DEFS` actually uses.
 *
 * Every other dimension (the other two of diameters/finishes/brands, plus
 * boltPatterns/priceMinCents/priceMaxCents) passes through unchanged — this
 * only ever touches `def.param`'s own key. Pure: returns a new object,
 * never mutates `filters`.
 *
 * Unlike `/brands/[slug]` (a genuine LOCK — `hideBrand` removes the Brand
 * section entirely so there's no contradictory affordance), `/styles/[slug]`
 * keeps the full rail, so the pinned dimension's checkboxes are visibly
 * interactive; this fill-if-empty rule is what makes them actually DO
 * something instead of silently no-op'ing back to the preset.
 */
export function applyStylePreset(
  filters: DiscoveryFilters,
  def: StyleDef
): DiscoveryFilters {
  if (def.param === "diameters") {
    if (filters.diameters.length > 0) return filters
    return { ...filters, diameters: def.values.map(Number) }
  }

  if (def.param === "finishes") {
    if (filters.finishes.length > 0) return filters
    return { ...filters, finishes: def.values as Finish[] }
  }

  // def.param === "brands"
  if (filters.brands.length > 0) return filters
  return { ...filters, brands: def.values }
}
