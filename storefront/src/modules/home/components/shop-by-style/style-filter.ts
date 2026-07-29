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

/**
 * `StyleDef.param` is the STOREFRONT's URL/facet-bucket name, which is NOT
 * always the Meilisearch attribute name — `brands` (the URL param and the
 * `FacetCounts` key) is `brand` in the index.
 *
 * Getting this wrong is silent and total: Meilisearch rejects the whole
 * `multiSearch` with "Attribute `brands` is not filterable", so ONE bad query
 * takes every style's count down with it and `getStyleCounts` falls back to
 * the very summed counts it exists to replace. That is exactly what shipped
 * on 2026-07-29 and was caught only by checking the live site — the unit test
 * had encoded the same wrong assumption as the code.
 *
 * The `attributeIsFilterable` test pins each mapping against the index's real
 * filterable-attribute list so this cannot regress silently again.
 */
const PARAM_TO_FILTER_ATTR: Record<StyleDef["param"], string> = {
  diameters: "diameters",
  finishes: "finishes",
  brands: "brand",
}

/** Dimensions stored as numbers in the index. */
const NUMERIC_PARAMS = new Set(["diameters"])

export function styleFilterClause(def: StyleDef): string {
  const attr = PARAM_TO_FILTER_ATTR[def.param] ?? def.param
  const quote = NUMERIC_PARAMS.has(def.param)
    ? (v: string) => v
    : (v: string) => lit(v)
  const ors = def.values.map((v) => `${attr} = ${quote(v)}`).join(" OR ")
  return `(${ors})`
}

/** The Meilisearch attribute a style preset filters on. Exported for tests. */
export function styleFilterAttribute(param: StyleDef["param"]): string {
  return PARAM_TO_FILTER_ATTR[param] ?? param
}
