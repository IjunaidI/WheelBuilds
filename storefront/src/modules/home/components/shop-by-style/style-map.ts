import type { Finish } from "@modules/common/components/wheel"
import type { FacetCounts } from "@modules/discovery/data/types"

export type StyleTile = {
  label: string
  href: string
  count: number
  finish: Finish
}

type StyleParam = "diameters" | "finishes" | "brands"

type StyleDef = {
  label: string
  finish: Finish
  param: StyleParam
  values: string[]
}

// Curated mapping of marketing "style" labels onto REAL Discovery facets. No
// style taxonomy exists in the data yet (spec §6); counts are computed live
// from the facet distribution so no number is fabricated. UTV + the diameter
// tiles map cleanly; OFF-ROAD / LUXURY / DRAG are approximations. When a real
// style facet lands, only this array changes.
export const STYLE_DEFS: StyleDef[] = [
  { label: "STREET", finish: "bronze", param: "diameters", values: ["18", "19", "20"] },
  { label: "TRUCK & DUALLY", finish: "black", param: "diameters", values: ["22", "24", "26"] },
  { label: "LUXURY", finish: "silver", param: "finishes", values: ["silver"] },
  { label: "UTV", finish: "bronze", param: "brands", values: ["Black Rhino Hard Alloys - UTV"] },
  { label: "OFF-ROAD", finish: "black", param: "brands", values: ["Black Rhino Hard Alloys"] },
  { label: "DRAG", finish: "silver", param: "diameters", values: ["15", "17"] },
]

const PARAM_TO_FACET: Record<StyleParam, keyof FacetCounts> = {
  diameters: "diameters",
  finishes: "finishes",
  brands: "brands",
}

/**
 * Build the Shop-by-Style tiles. Tiles with a zero count are dropped so the
 * homepage never shows an empty style. The href points at filtered /store
 * (values URL-encoded, comma-joined — parseQueryFromSearchParams reads CSV).
 *
 * WB-120 Q-12 — `counts` (keyed by `StyleDef.label`) is the DISTINCT number of
 * products matching the preset, from `getStyleCounts()`. It exists because
 * summing facet buckets, which is what this did before, DOUBLE-COUNTS every
 * product appearing under more than one value of a multi-valued facet: a wheel
 * offered in both 18" and 20" landed in both buckets, so STREET advertised
 * 1550 while its own listing returned 1076. Measured live 2026-07-29 —
 * TRUCK & DUALLY 733 vs 490 and DRAG 653 vs 593 too, while LUXURY, OFF-ROAD
 * and UTV matched exactly, those being the three single-value presets where
 * the two methods coincide.
 *
 * The summed fallback is kept ONLY for the case where the count query fails.
 * Degrading to an inaccurate count beats `.filter(count > 0)` stripping every
 * tile and blanking the section — but callers should always pass `counts`.
 */
export function styleTiles(
  facets: FacetCounts,
  counts?: Record<string, number>
): StyleTile[] {
  return STYLE_DEFS.map((def) => {
    const dist = facets[PARAM_TO_FACET[def.param]] ?? {}
    const summed = def.values.reduce((sum, v) => sum + (dist[v] ?? 0), 0)
    const count = counts?.[def.label] ?? summed
    const href = `/store?${def.param}=${def.values.map(encodeURIComponent).join(",")}`
    return { label: def.label, href, count, finish: def.finish }
  }).filter((t) => t.count > 0)
}
