// WB-124 — "In stock only" flags a product when ANY variant has stock, so a
// tyre with 2 buyable sizes out of 62 passes the filter. Measured live
// 2026-07-30: falken-sincera-sn250 2/62, toyo-extensa-hp2 10/62,
// black-rhino-hard-alloys-utv-pkb 1/21.
import { describe, expect, it } from "vitest"

import { buildStockView } from "./stock-view"
import type { FinishOption } from "./types"

type Avail = "in_stock" | "low_stock" | "out_of_stock"

const offset = (value: number, availability: Avail) =>
  ({ value, availability, centerBoreMm: null, loadRatingLb: null, quantity: 1 }) as any

const size = (
  diameter: number,
  availability: Avail,
  offsets: Array<[number, Avail]>
) =>
  ({
    diameter,
    width: 9,
    offsetMm: offsets[0]?.[0] ?? 0,
    availability,
    offsetVariants: offsets.map(([v, a]) => offset(v, a)),
  }) as any

const finish = (raw: string, sizes: any[]) =>
  ({ raw, normalized: "black", imageUrl: null, sizeOptions: sizes }) as unknown as FinishOption

describe("buildStockView", () => {
  it("drops out-of-stock sizes and reports that it trimmed", () => {
    const input = [
      finish("Gloss Black", [
        size(18, "in_stock", [[35, "in_stock"]]),
        size(20, "out_of_stock", [[35, "out_of_stock"]]),
      ]),
    ]
    const view = buildStockView(input)
    expect(view.didTrim).toBe(true)
    expect(view.finishOptions[0].sizeOptions.map((s: any) => s.diameter)).toEqual([18])
  })

  it("KEEPS low_stock — it is still buyable", () => {
    const input = [finish("Gloss Black", [size(18, "low_stock", [[35, "low_stock"]])])]
    const view = buildStockView(input)
    expect(view.finishOptions[0].sizeOptions).toHaveLength(1)
    expect(view.didTrim).toBe(false)
  })

  it("drops a size whose every OFFSET is out of stock, even if the size rolls up as buyable", () => {
    // size.availability is a best-of-siblings roll-up (get-product.ts), so it
    // can read in_stock while no individual offset survives the filter.
    const input = [
      finish("Gloss Black", [
        size(18, "in_stock", [
          [35, "out_of_stock"],
          [45, "out_of_stock"],
        ]),
        size(20, "in_stock", [[35, "in_stock"]]),
      ]),
    ]
    const view = buildStockView(input)
    expect(view.finishOptions[0].sizeOptions.map((s: any) => s.diameter)).toEqual([20])
  })

  it("drops a finish left with no buyable size", () => {
    const input = [
      finish("Gloss Black", [size(18, "out_of_stock", [[35, "out_of_stock"]])]),
      finish("Bronze", [size(20, "in_stock", [[35, "in_stock"]])]),
    ]
    const view = buildStockView(input)
    expect(view.finishOptions.map((f) => f.raw)).toEqual(["Bronze"])
  })

  it("returns the input UNTOUCHED when nothing is buyable, rather than stranding the shopper", () => {
    // Reachable: in_stock is computed at index time, so a product can sell out
    // between the last sync and this render. An empty PDP with no selectable
    // size would be a worse bug than the one being fixed.
    const input = [finish("Gloss Black", [size(18, "out_of_stock", [[35, "out_of_stock"]])])]
    const view = buildStockView(input)
    expect(view.finishOptions).toBe(input)
    expect(view.didTrim).toBe(false)
  })

  it("reports didTrim=false when everything was already buyable", () => {
    const input = [
      finish("Gloss Black", [
        size(18, "in_stock", [[35, "in_stock"]]),
        size(20, "in_stock", [[35, "in_stock"]]),
      ]),
    ]
    expect(buildStockView(input).didTrim).toBe(false)
  })

  it("handles an empty option list without throwing", () => {
    expect(buildStockView([])).toEqual({ finishOptions: [], didTrim: false })
  })

  it("reproduces the reported ratio: 2 buyable sizes out of 62", () => {
    const sizes = Array.from({ length: 62 }, (_, i) =>
      size(15 + i, i < 2 ? "in_stock" : "out_of_stock", [
        [35, i < 2 ? "in_stock" : "out_of_stock"],
      ])
    )
    const view = buildStockView([finish("Black", sizes)])
    expect(view.finishOptions[0].sizeOptions).toHaveLength(2)
    expect(view.didTrim).toBe(true)
  })
})
