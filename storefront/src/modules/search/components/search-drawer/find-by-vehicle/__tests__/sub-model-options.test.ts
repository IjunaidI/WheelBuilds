import { describe, it, expect } from "vitest"
import { toSubModelOptions } from "../sub-model-options"

// WB-113: the 4th select's options are now built straight from the
// sub-model union `{ subModels: string[] }` the store route returns — value
// === label === the sub-model string, no slug/name split like the retired
// engine-modification `toOptions` path.
describe("toSubModelOptions", () => {
  it("maps a non-empty sub-model union to value===label options, Corolla-shape", () => {
    expect(toSubModelOptions(["LE Eco", "L", "LE", "XLE", "SE", "XSE"])).toEqual([
      { value: "LE Eco", label: "LE Eco" },
      { value: "L", label: "L" },
      { value: "LE", label: "LE" },
      { value: "XLE", label: "XLE" },
      { value: "SE", label: "SE" },
      { value: "XSE", label: "XSE" },
    ])
  })

  it("collapses an empty union to a single Base option — the mandatory-field fallback", () => {
    expect(toSubModelOptions([])).toEqual([{ value: "Base", label: "Base" }])
  })

  it("treats undefined/null the same as an empty union", () => {
    expect(toSubModelOptions(undefined)).toEqual([{ value: "Base", label: "Base" }])
    expect(toSubModelOptions(null)).toEqual([{ value: "Base", label: "Base" }])
  })

  it("drops blank/empty-string entries defensively", () => {
    expect(toSubModelOptions(["LE", "", "XLE"])).toEqual([
      { value: "LE", label: "LE" },
      { value: "XLE", label: "XLE" },
    ])
  })
})
