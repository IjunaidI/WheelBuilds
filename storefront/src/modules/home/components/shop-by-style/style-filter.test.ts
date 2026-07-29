// WB-120 Q-12 — the style tile count and the style listing must ask
// Meilisearch the same question. They disagreed by up to 30% because the tile
// summed facet buckets while the listing filtered.
import { describe, expect, it } from "vitest"

import { STYLE_DEFS } from "./style-map"
import { styleFilterAttribute, styleFilterClause } from "./style-filter"

describe("styleFilterClause", () => {
  it("leaves numeric diameters unquoted", () => {
    // The index stores diameters as numbers: `diameters = "18"` string-compares
    // and matches nothing.
    expect(
      styleFilterClause({
        label: "STREET",
        finish: "bronze",
        param: "diameters",
        values: ["18", "19", "20"],
      })
    ).toBe("(diameters = 18 OR diameters = 19 OR diameters = 20)")
  })

  it("quotes string dimensions", () => {
    expect(
      styleFilterClause({
        label: "LUXURY",
        finish: "silver",
        param: "finishes",
        values: ["silver"],
      })
    ).toBe('(finishes = "silver")')
  })

  it("quotes a brand containing spaces and hyphens", () => {
    expect(
      styleFilterClause({
        label: "UTV",
        finish: "bronze",
        param: "brands",
        values: ["Black Rhino Hard Alloys - UTV"],
      })
    ).toBe('(brand = "Black Rhino Hard Alloys - UTV")')
  })

  it("escapes an embedded double quote rather than breaking the clause", () => {
    expect(
      styleFilterClause({
        label: "X",
        finish: "black",
        param: "brands",
        values: ['He said "hi"'],
      })
    ).toBe('(brand = "He said \\"hi\\"")')
  })

  it("produces a parenthesised OR for every real STYLE_DEF", () => {
    for (const def of STYLE_DEFS) {
      const clause = styleFilterClause(def)
      expect(clause.startsWith("(")).toBe(true)
      expect(clause.endsWith(")")).toBe(true)
      expect(clause.split(" OR ")).toHaveLength(def.values.length)
    }
  })
})

// The regression that shipped on 2026-07-29 and reached production.
//
// `StyleDef.param` is the STOREFRONT's URL/facet-bucket name; the index
// attribute is not always the same string. `brands` is `brand` in
// Meilisearch, so the UTV and OFF-ROAD queries were rejected with "Attribute
// `brands` is not filterable" — and because multiSearch is ATOMIC, that one
// bad query took all six style counts down with it, silently falling back to
// the summed counts the whole feature exists to replace.
//
// The original test asserted `(brands = ...)`, i.e. it encoded the same wrong
// assumption as the code, which is why only a live check caught it. This
// block pins the mapping against the index's REAL filterable attributes.
describe("styleFilterAttribute — pinned to the index's filterable attributes", () => {
  // Verbatim from GET /indexes/products/settings/filterable-attributes
  // (2026-07-29). If a style preset ever filters on something absent here,
  // every style count silently reverts to the double-counted numbers.
  const FILTERABLE = new Set([
    "aspect_ratios", "bolt_patterns", "bolt_patterns_canonical", "brand",
    "center_bores", "diameters", "finishes", "in_stock", "load_indexes",
    "offsets", "price_max", "price_min", "product_type", "rim_diameters",
    "section_widths", "speed_ratings", "tire_sizes", "tire_type", "widths",
  ])

  it("maps the brands URL param to the singular `brand` index attribute", () => {
    expect(styleFilterAttribute("brands")).toBe("brand")
  })

  it("every STYLE_DEF filters on an attribute the index can actually filter", () => {
    for (const def of STYLE_DEFS) {
      const attr = styleFilterAttribute(def.param)
      expect(
        FILTERABLE.has(attr),
        `style "${def.label}" filters on "${attr}", which is not filterable`
      ).toBe(true)
    }
  })
})
