// WB-120 Q-12 — the style tile count and the style listing must ask
// Meilisearch the same question. They disagreed by up to 30% because the tile
// summed facet buckets while the listing filtered.
import { describe, expect, it } from "vitest"

import { STYLE_DEFS } from "./style-map"
import { styleFilterClause } from "./style-filter"

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
    ).toBe('(brands = "Black Rhino Hard Alloys - UTV")')
  })

  it("escapes an embedded double quote rather than breaking the clause", () => {
    expect(
      styleFilterClause({
        label: "X",
        finish: "black",
        param: "brands",
        values: ['He said "hi"'],
      })
    ).toBe('(brands = "He said \\"hi\\"")')
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
