// WB-121 Q-16 — 45 live products render "Center bore 999 mm". 999 is
// WheelPros' sentinel for bore-to-order, which is real feed data, but printed
// literally it is a plausible-looking number a shopper could act on — worse
// than an omitted row.
import { describe, expect, it } from "vitest"

import {
  CENTER_BORE_SENTINEL,
  centerBoreDisplay,
  isSentinelBore,
} from "./center-bore"

describe("centerBoreDisplay", () => {
  it("renders a real bore with its unit", () => {
    expect(centerBoreDisplay(73.1)).toEqual({ kind: "value", text: "73.1 mm" })
    expect(centerBoreDisplay(106.1)).toEqual({ kind: "value", text: "106.1 mm" })
  })

  it("renders the 999 sentinel as honest bore-to-order copy, not a number", () => {
    // Hiding the row would also be defensible, but for a forged wheel
    // "machined to fit" is real information, not an absence.
    expect(centerBoreDisplay(CENTER_BORE_SENTINEL)).toEqual({
      kind: "custom",
      text: "Custom / bore-to-order",
    })
  })

  it("hides genuinely absent values (the WB-056 rule, preserved)", () => {
    for (const v of [null, undefined, 0, -1, NaN]) {
      expect(centerBoreDisplay(v as any).kind).toBe("hidden")
    }
  })

  it("does not treat a near-sentinel as the sentinel", () => {
    // A real 998.9 bore would be absurd, but the rule must be exact so a
    // future genuine value can never be silently swallowed.
    expect(centerBoreDisplay(998).kind).toBe("value")
    expect(centerBoreDisplay(1000).kind).toBe("value")
  })
})

describe("isSentinelBore", () => {
  it("identifies only the exact sentinel", () => {
    expect(isSentinelBore(999)).toBe(true)
    expect(isSentinelBore(73.1)).toBe(false)
    expect(isSentinelBore(null)).toBe(false)
    expect(isSentinelBore(undefined)).toBe(false)
  })
})
