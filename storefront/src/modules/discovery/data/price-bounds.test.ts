// WB-120 Q-15 — the Price filter carried hard-coded $0/$2,500 placeholders.
// Meilisearch returns facetStats for numeric filterable attributes, and
// price_min/price_max already are filterable, so real bounds cost nothing but
// asking. Verified live 2026-07-29: { min: 7800, max: 245000 } -> $78-$2,450.
import { describe, expect, it } from "vitest"

import { priceBoundsFromFacetStats } from "./price-bounds"

describe("priceBoundsFromFacetStats", () => {
  it("converts the live cents stats to whole dollars", () => {
    expect(
      priceBoundsFromFacetStats({
        price_min: { min: 7800, max: 245000 },
        price_max: { min: 7800, max: 245000 },
      })
    ).toEqual({ minUsd: 78, maxUsd: 2450 })
  })

  it("floors the min and ceils the max so no real product falls outside", () => {
    // $78.99 -> 78 (not 79), $2450.01 -> 2451 (not 2450).
    expect(
      priceBoundsFromFacetStats({
        price_min: { min: 7899, max: 245001 },
        price_max: { min: 7899, max: 245001 },
      })
    ).toEqual({ minUsd: 78, maxUsd: 2451 })
  })

  it("falls back to price_min's max when price_max stats are absent", () => {
    expect(
      priceBoundsFromFacetStats({ price_min: { min: 7800, max: 245000 } })
    ).toEqual({ minUsd: 78, maxUsd: 2450 })
  })

  it.each([
    ["undefined stats", undefined],
    ["empty stats", {}],
    ["missing min", { price_min: { max: 245000 } }],
    ["missing max", { price_min: { min: 7800 } }],
    ["negative", { price_min: { min: -1, max: 245000 } }],
    ["non-finite", { price_min: { min: NaN, max: 245000 } }],
  ])("returns null for %s rather than guessing", (_label, stats) => {
    // A fabricated bound would silently exclude real products from a
    // shopper's range; callers fall back to their static placeholders.
    expect(priceBoundsFromFacetStats(stats as any)).toBeNull()
  })

  it("returns null for a collapsed range", () => {
    expect(
      priceBoundsFromFacetStats({ price_min: { min: 10000, max: 10000 } })
    ).toBeNull()
  })
})
