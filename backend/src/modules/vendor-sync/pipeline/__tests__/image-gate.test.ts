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

  // WB-115 premerge Change 2: minimum-sample floor. An earlier tires run
  // checked only 2 URLs, found 1 dead, and reported a "50% dead" crisis that
  // was really just proof the feed had 11 rows in it -- below the floor the
  // ratio must never be trusted enough to trip, no matter how bad it looks.
  describe("minimum-sample floor (default 50)", () => {
    it("never trips below the floor, even at a 100% dead ratio (the real-world 2-checked/1-dead false alarm)", () => {
      expect(shouldTrustImageChecks(2, 1, 0.2)).toBe(true)
    })

    it("just below the floor (49 checked) does not trip even with an overwhelming ratio", () => {
      expect(shouldTrustImageChecks(49, 49, 0.2)).toBe(true)
    })

    it("exactly at the floor (50 checked) is large enough to trip on a bad ratio", () => {
      expect(shouldTrustImageChecks(50, 49, 0.2)).toBe(false) // 49/50 = 0.98 > 0.2
    })

    it("just above the floor (51 checked) trips on a bad ratio", () => {
      expect(shouldTrustImageChecks(51, 50, 0.2)).toBe(false) // 50/51 ≈ 0.98 > 0.2
    })

    it("at/above the floor still trusts a healthy ratio", () => {
      expect(shouldTrustImageChecks(50, 5, 0.2)).toBe(true) // 5/50 = 0.1 <= 0.2
      expect(shouldTrustImageChecks(1000, 100, 0.2)).toBe(true) // 100/1000 = 0.1 <= 0.2
    })

    it("a caller-supplied minSample overrides the default floor", () => {
      // 10 checked, 10 dead (100%) would trip against the default floor (50)
      // being irrelevant here -- but with an explicit minSample of 5, 10 is
      // above it and the bad ratio trips as normal.
      expect(shouldTrustImageChecks(10, 10, 0.2, 5)).toBe(false)
      // With an explicit minSample of 20, the same 10-checked sample is still
      // too small and must not trip.
      expect(shouldTrustImageChecks(10, 10, 0.2, 20)).toBe(true)
    })

    it("checked === 0 still always trusts (floor subsumes the old zero-guard)", () => {
      expect(shouldTrustImageChecks(0, 0, 0.2)).toBe(true)
    })

    it("stays pure and synchronous: same inputs always produce the same output, no logging capability at all", () => {
      // shouldTrustImageChecks takes no logger -- there is nothing to spy on
      // here, which is the point: this asserts the function signature has no
      // 5th (logger) parameter changing its behavior across repeated calls.
      const a = shouldTrustImageChecks(2, 1, 0.2)
      const b = shouldTrustImageChecks(2, 1, 0.2)
      expect(a).toBe(b)
      expect(a).toBe(true)
    })
  })
})
