import { describe, it, expect } from "vitest"
import { pickDefaultSize } from "../group-sizes"

describe("pickDefaultSize", () => {
  it("returns null (not undefined) for an empty size list", () => {
    expect(pickDefaultSize([])).toBeNull()
  })
})
