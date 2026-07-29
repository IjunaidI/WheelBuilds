import type { StyleDef } from "./style-slug"

/**
 * Builds the Meilisearch filter clause for a `STYLE_DEFS` preset (WB-120 Q-12).
 *
 * Extracted so the style TILE COUNT and the style LISTING are provably asking
 * the same question. They previously disagreed by up to 30% because the tile
 * summed facet buckets while the listing filtered — see `style-map.ts`.
 *
 * Quoting mirrors `discovery/data/vehicle-constraint.ts`'s `lit()`. Numeric
 * dimensions are deliberately NOT quoted: the index stores diameters as
 * numbers, and Meilisearch compares `diameters = 18` numerically but
 * `diameters = "18"` as a string, which matches nothing.
 */

const lit = (v: string): string => `"${v.replace(/"/g, '\\"')}"`

/** Dimensions stored as numbers in the index. */
const NUMERIC_PARAMS = new Set(["diameters"])

export function styleFilterClause(def: StyleDef): string {
  const quote = NUMERIC_PARAMS.has(def.param)
    ? (v: string) => v
    : (v: string) => lit(v)
  const ors = def.values.map((v) => `${def.param} = ${quote(v)}`).join(" OR ")
  return `(${ors})`
}
