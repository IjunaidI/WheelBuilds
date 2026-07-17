import { describe, it, expect } from "vitest"
import { BASE_SUB_MODEL, normalizeStoredSubModel } from "./sub-model"

describe("normalizeStoredSubModel", () => {
  it("passes a real live sub-model string through unchanged (Corolla trim_levels shape)", () => {
    expect(normalizeStoredSubModel("LE")).toBe("LE")
    expect(normalizeStoredSubModel("LE Eco")).toBe("LE Eco")
    expect(normalizeStoredSubModel("XSE")).toBe("XSE")
  })

  it("passes an offline TRIMS_BY_MODEL marketing trim through unchanged", () => {
    expect(normalizeStoredSubModel("Trail Boss")).toBe("Trail Boss")
    expect(normalizeStoredSubModel("1500")).toBe("1500")
    expect(normalizeStoredSubModel("ZR2")).toBe("ZR2")
  })

  it("passes 'Base' through unchanged (idempotent)", () => {
    expect(normalizeStoredSubModel(BASE_SUB_MODEL)).toBe(BASE_SUB_MODEL)
  })

  it("normalizes an unset/blank value to Base", () => {
    expect(normalizeStoredSubModel(undefined)).toBe(BASE_SUB_MODEL)
    expect(normalizeStoredSubModel(null)).toBe(BASE_SUB_MODEL)
    expect(normalizeStoredSubModel("")).toBe(BASE_SUB_MODEL)
  })

  it("normalizes an OLD-shape engine-modification hash slug to Base — the regression this guards", () => {
    // Real fixture values from find-by-vehicle/__tests__/to-options.test.ts's
    // captured wheel-size /modifications/ shape.
    expect(normalizeStoredSubModel("32b586f1cd")).toBe(BASE_SUB_MODEL)
    expect(normalizeStoredSubModel("7a1c9e0f42")).toBe(BASE_SUB_MODEL)
  })
})
