import { describe, it, expect } from "vitest"
import { variantThumbnail } from "./variant-thumbnail"

describe("variantThumbnail", () => {
  it("prefers the per-finish metadata.image_url over the product thumbnail", () => {
    expect(
      variantThumbnail({
        metadata: { image_url: "https://cdn.example.com/bronze.jpg" },
        product: { thumbnail: "https://cdn.example.com/black.jpg" },
      })
    ).toBe("https://cdn.example.com/bronze.jpg")
  })

  it("falls back to the product thumbnail when metadata has no image_url", () => {
    expect(
      variantThumbnail({
        metadata: {},
        product: { thumbnail: "https://cdn.example.com/black.jpg" },
      })
    ).toBe("https://cdn.example.com/black.jpg")
  })

  it("falls back to the product thumbnail when metadata is missing entirely", () => {
    expect(
      variantThumbnail({ product: { thumbnail: "https://cdn.example.com/black.jpg" } })
    ).toBe("https://cdn.example.com/black.jpg")
  })

  it("falls back when metadata.image_url is blank/whitespace", () => {
    expect(
      variantThumbnail({
        metadata: { image_url: "   " },
        product: { thumbnail: "https://cdn.example.com/black.jpg" },
      })
    ).toBe("https://cdn.example.com/black.jpg")
  })

  it("falls back when metadata.image_url is not a string", () => {
    expect(
      variantThumbnail({
        metadata: { image_url: 12345 },
        product: { thumbnail: "https://cdn.example.com/black.jpg" },
      })
    ).toBe("https://cdn.example.com/black.jpg")
  })

  it("returns undefined/null cleanly for a null/undefined variant", () => {
    expect(variantThumbnail(null)).toBeUndefined()
    expect(variantThumbnail(undefined)).toBeUndefined()
  })

  it("returns undefined when neither metadata nor product thumbnail exist", () => {
    expect(variantThumbnail({})).toBeUndefined()
  })
})
