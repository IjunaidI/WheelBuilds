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
 * Build the Shop-by-Style tiles from a live FacetCounts. Each tile's count is
 * the sum of its matched facet values; tiles with a zero count are dropped so
 * the homepage never shows an empty style. The href points at filtered /store
 * (values URL-encoded, comma-joined — parseQueryFromSearchParams reads CSV).
 */
export function styleTiles(facets: FacetCounts): StyleTile[] {
  return STYLE_DEFS.map((def) => {
    const dist = facets[PARAM_TO_FACET[def.param]] ?? {}
    const count = def.values.reduce((sum, v) => sum + (dist[v] ?? 0), 0)
    const href = `/store?${def.param}=${def.values.map(encodeURIComponent).join(",")}`
    return { label: def.label, href, count, finish: def.finish }
  }).filter((t) => t.count > 0)
}
