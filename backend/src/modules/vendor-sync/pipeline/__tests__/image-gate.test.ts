import { stageSkipReason, shouldTrustImageChecks } from "../stage"

describe("stageSkipReason — image reachability gate (WB-115)", () => {
  describe("no-image takes precedence over everything, including unreachable", () => {
    it("empty string imageUrl -> no-image regardless of imageReachable", () => {
      expect(stageSkipReason({ imageUrl: "", msrpUsd: 100 }, false)).toBe("no-image")
      expect(stageSkipReason({ imageUrl: "", msrpUsd: 100 }, true)).toBe("no-image")
      expect(stageSkipReason({ imageUrl: "", msrpUsd: 100 }, undefined)).toBe("no-image")
    })
    it("null imageUrl -> no-image regardless of imageReachable", () => {
      expect(stageSkipReason({ imageUrl: null, msrpUsd: 100 }, false)).toBe("no-image")
      expect(stageSkipReason({ imageUrl: null, msrpUsd: 100 }, true)).toBe("no-image")
    })
  })

  describe("imageReachable === false -> image-unreachable, once an image URL is present", () => {
    it("valid url, unreachable, valid price -> image-unreachable", () => {
      expect(
        stageSkipReason({ imageUrl: "https://vendor.example/x.jpg", msrpUsd: 100 }, false)
      ).toBe("image-unreachable")
    })
    it("valid url, unreachable, invalid price -> image-unreachable wins (image checked before price)", () => {
      expect(stageSkipReason({ imageUrl: "x", msrpUsd: 0 }, false)).toBe("image-unreachable")
    })
  })

  describe("imageReachable === undefined (not checked) is treated as reachable -- fail open", () => {
    it("undefined does not skip -- falls through to the price check", () => {
      expect(stageSkipReason({ imageUrl: "x", msrpUsd: 100 }, undefined)).toBeNull()
    })
    it("omitting the argument entirely behaves the same as passing undefined", () => {
      expect(stageSkipReason({ imageUrl: "x", msrpUsd: 100 })).toBeNull()
    })
    it("undefined + invalid price still reports invalid-price, not image-unreachable", () => {
      expect(stageSkipReason({ imageUrl: "x", msrpUsd: 0 }, undefined)).toBe("invalid-price")
    })
  })

  describe("imageReachable === true is reachable", () => {
    it("does not skip on the image gate", () => {
      expect(stageSkipReason({ imageUrl: "x", msrpUsd: 100 }, true)).toBeNull()
    })
  })

  describe("invalid-price still fires once the image checks pass", () => {
    it("reachable image, non-positive/NaN price -> invalid-price", () => {
      expect(stageSkipReason({ imageUrl: "x", msrpUsd: 0 }, true)).toBe("invalid-price")
      expect(stageSkipReason({ imageUrl: "x", msrpUsd: -5 }, true)).toBe("invalid-price")
      expect(stageSkipReason({ imageUrl: "x", msrpUsd: NaN }, true)).toBe("invalid-price")
    })
  })

  describe("a fully-valid row stages", () => {
    it("returns null whether explicitly reachable or unchecked", () => {
      expect(stageSkipReason({ imageUrl: "x", msrpUsd: 369.99 }, true)).toBeNull()
      expect(stageSkipReason({ imageUrl: "x", msrpUsd: 369.99 }, undefined)).toBeNull()
      expect(stageSkipReason({ imageUrl: "x", msrpUsd: 369.99 })).toBeNull()
    })
  })
})

describe("shouldTrustImageChecks (WB-115 circuit breaker)", () => {
  it("returns true when checked === 0, regardless of dead count (guards the division)", () => {
    expect(shouldTrustImageChecks(0, 0, 0.2)).toBe(true)
  })

  it("returns true exactly at the threshold (dead/checked === maxRatio is not > maxRatio)", () => {
    expect(shouldTrustImageChecks(100, 20, 0.2)).toBe(true) // 20/100 = 0.2
  })

  it("returns true just under the threshold", () => {
    expect(shouldTrustImageChecks(100, 19, 0.2)).toBe(true) // 19/100 = 0.19
  })

  it("returns false just over the threshold", () => {
    expect(shouldTrustImageChecks(100, 21, 0.2)).toBe(false) // 21/100 = 0.21
  })

  it("returns false for the live WB-115 finding (664/2852 dead, well over a 20% breaker)", () => {
    expect(shouldTrustImageChecks(2852, 664, 0.2)).toBe(false)
  })
})
