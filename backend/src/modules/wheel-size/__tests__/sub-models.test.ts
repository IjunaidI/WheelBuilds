import { subModelsForModelYear, filterEntriesBySubModel } from "../sub-models"

describe("subModelsForModelYear", () => {
  it("Corolla shape: unions trim_levels across entries, deduped, first-seen order", () => {
    const entries = [
      { trim_levels: ["LE Eco"] },
      { trim_levels: ["L", "LE", "XLE", "SE", "XSE"] },
    ]
    expect(subModelsForModelYear(entries)).toEqual(["LE Eco", "L", "LE", "XLE", "SE", "XSE"])
  })

  it("dedupes a sub-model that repeats across entries, keeping first-seen position", () => {
    const entries = [
      { trim_levels: ["LT", "WT"] },
      { trim_levels: ["LT", "LTZ"] }, // LT repeats (diesel + gas engine entries)
    ]
    expect(subModelsForModelYear(entries)).toEqual(["LT", "WT", "LTZ"])
  })

  it("returns [] when every entry has an empty trim_levels array", () => {
    const entries = [{ trim_levels: [] }, { trim_levels: [] }]
    expect(subModelsForModelYear(entries)).toEqual([])
  })

  it("returns [] for an empty entries array", () => {
    expect(subModelsForModelYear([])).toEqual([])
  })

  it("skips an entry with a missing trim_levels key", () => {
    const entries = [{}, { trim_levels: ["LE"] }]
    expect(subModelsForModelYear(entries as any)).toEqual(["LE"])
  })

  it("skips an entry whose trim_levels is null", () => {
    const entries = [{ trim_levels: null }, { trim_levels: ["LE"] }]
    expect(subModelsForModelYear(entries as any)).toEqual(["LE"])
  })
})

describe("filterEntriesBySubModel", () => {
  const entries = [
    { trim_levels: ["LE Eco"] },
    { trim_levels: ["L", "LE", "XLE", "SE", "XSE"] },
  ]

  it("returns ALL entries when subModel is 'Base'", () => {
    expect(filterEntriesBySubModel(entries, "Base")).toEqual(entries)
  })

  it("returns ALL entries when subModel is undefined", () => {
    expect(filterEntriesBySubModel(entries, undefined)).toEqual(entries)
  })

  it("returns ALL entries when subModel is an empty string", () => {
    expect(filterEntriesBySubModel(entries, "")).toEqual(entries)
  })

  it("returns only the entry(ies) whose trim_levels includes the requested sub-model", () => {
    expect(filterEntriesBySubModel(entries, "LE Eco")).toEqual([entries[0]])
    expect(filterEntriesBySubModel(entries, "XSE")).toEqual([entries[1]])
  })

  it("returns BOTH entries when the sub-model appears in 2 entries (spanning engines)", () => {
    const spanning = [
      { trim_levels: ["LT", "WT"] }, // e.g. gas engine
      { trim_levels: ["LT", "LTZ"] }, // e.g. diesel engine
    ]
    expect(filterEntriesBySubModel(spanning, "LT")).toEqual(spanning)
  })

  it("returns [] when the sub-model is real but matches nothing", () => {
    expect(filterEntriesBySubModel(entries, "Platinum")).toEqual([])
  })

  it("returns [] for an empty entries array with a real sub-model requested", () => {
    expect(filterEntriesBySubModel([], "LE")).toEqual([])
  })

  it("treats a missing trim_levels key as no match (not a crash)", () => {
    const withGap = [{}, { trim_levels: ["LE"] }]
    expect(filterEntriesBySubModel(withGap as any, "LE")).toEqual([{ trim_levels: ["LE"] }])
  })
})
