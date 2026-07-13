import { hasImage } from "../search/has-image"

describe("hasImage", () => {
  it("is false for null / undefined / empty / whitespace", () => {
    expect(hasImage(null)).toBe(false)
    expect(hasImage(undefined)).toBe(false)
    expect(hasImage("")).toBe(false)
    expect(hasImage("   ")).toBe(false)
  })
  it("is true for a real url", () => {
    expect(hasImage("https://cdn.example.com/x.jpg")).toBe(true)
  })
})
