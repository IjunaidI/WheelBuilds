// WB-124 — the PDP banner is a CLAIM about what the shopper is being shown.
// Getting it wrong tells someone their options are filtered by their car when
// they are not, which is exactly the class of dishonesty this whole batch of
// work exists to remove.
import { describe, expect, it } from "vitest"

import { filterNotice } from "./filter-notice"

describe("filterNotice", () => {
  it("says nothing when no filter is active", () => {
    expect(filterNotice({ fitActive: false, stockActive: false })).toBeNull()
  })

  it("mentions only stock when only stock is on", () => {
    const n = filterNotice({ fitActive: false, stockActive: true })
    expect(n?.message).toBe("Showing only sizes that are in stock.")
    expect(n?.message).not.toMatch(/fit|vehicle/i)
  })

  it("names the vehicle when only fitment is on", () => {
    const n = filterNotice({
      fitActive: true,
      stockActive: false,
      vehicleLabel: "2019 Toyota Corolla",
    })
    expect(n?.message).toBe("Showing only sizes that fit your 2019 Toyota Corolla.")
    expect(n?.message).not.toMatch(/in stock/i)
  })

  it("mentions BOTH when both are on", () => {
    const n = filterNotice({
      fitActive: true,
      stockActive: true,
      vehicleLabel: "2019 Toyota Corolla",
    })
    expect(n?.message).toBe(
      "Showing only sizes that fit your 2019 Toyota Corolla and are in stock."
    )
  })

  it("falls back to a generic vehicle rather than naming one it does not know", () => {
    for (const label of [undefined, null, "", "   "]) {
      const n = filterNotice({ fitActive: true, stockActive: false, vehicleLabel: label })
      expect(n?.message).toBe("Showing only sizes that fit your vehicle.")
    }
  })

  it("always offers an escape", () => {
    for (const [fitActive, stockActive] of [
      [true, false],
      [false, true],
      [true, true],
    ] as const) {
      expect(filterNotice({ fitActive, stockActive })?.action).toBe("Show all sizes")
    }
  })
})
