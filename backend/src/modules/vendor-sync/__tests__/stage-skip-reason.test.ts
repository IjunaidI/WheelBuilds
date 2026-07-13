import { stageSkipReason } from "../pipeline/stage"

describe("stageSkipReason (WB-084 image gate + WB-089 L3 price gate)", () => {
  it("drops image-less rows", () => {
    expect(stageSkipReason({ imageUrl: "", msrpUsd: 100 })).toBe("no-image")
    expect(stageSkipReason({ imageUrl: null, msrpUsd: 100 })).toBe("no-image")
  })
  it("drops non-positive / missing MSRP once an image is present", () => {
    expect(stageSkipReason({ imageUrl: "x", msrpUsd: 0 })).toBe("invalid-price")
    expect(stageSkipReason({ imageUrl: "x", msrpUsd: -5 })).toBe("invalid-price")
    expect(stageSkipReason({ imageUrl: "x", msrpUsd: NaN })).toBe("invalid-price")
  })
  it("stages a real row", () => {
    expect(stageSkipReason({ imageUrl: "x", msrpUsd: 369.99 })).toBeNull()
  })
})
