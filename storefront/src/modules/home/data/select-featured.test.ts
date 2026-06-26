import { describe, it, expect } from "vitest"
import { selectFeatured } from "./select-featured"

const p = (id: string, handle: string) => ({ id, handle } as any)

describe("selectFeatured", () => {
  it("empty curated → first `limit` in order", () => {
    const products = [p("1", "a"), p("2", "b"), p("3", "c")]
    expect(selectFeatured(products, [], 2).map((x) => x.handle)).toEqual(["a", "b"])
  })
  it("orders curated handles first, then backfills with the rest", () => {
    const products = [p("1", "a"), p("2", "b"), p("3", "c")]
    expect(selectFeatured(products, ["c", "a"], 3).map((x) => x.handle)).toEqual(["c", "a", "b"])
  })
  it("drops curated handles not present", () => {
    const products = [p("1", "a"), p("2", "b")]
    expect(selectFeatured(products, ["zzz", "b"], 3).map((x) => x.handle)).toEqual(["b", "a"])
  })
  it("dedups by id (curated handle also in the backfill set)", () => {
    const products = [p("1", "a"), p("2", "b")]
    expect(selectFeatured(products, ["a"], 3).map((x) => x.id)).toEqual(["1", "2"])
  })
  it("caps at `limit`", () => {
    const products = [p("1", "a"), p("2", "b"), p("3", "c")]
    expect(selectFeatured(products, ["a", "b", "c"], 2).map((x) => x.handle)).toEqual(["a", "b"])
  })
})
