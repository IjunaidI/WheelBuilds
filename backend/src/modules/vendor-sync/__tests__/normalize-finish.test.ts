import { normalizeFinish } from "../search/normalize-finish"

describe("normalizeFinish", () => {
  it("maps black-family finishes to black", () => {
    expect(normalizeFinish("Gloss Black")).toBe("black")
    expect(normalizeFinish("Matte Black")).toBe("black")
    expect(normalizeFinish("Satin Black Milled")).toBe("black")
  })

  it("maps bronze/gold/copper finishes to bronze", () => {
    expect(normalizeFinish("Satin Bronze")).toBe("bronze")
    expect(normalizeFinish("Brushed Gold")).toBe("bronze")
    expect(normalizeFinish("Copper")).toBe("bronze")
  })

  it("maps silver/chrome/machined finishes to silver", () => {
    expect(normalizeFinish("Brushed Silver")).toBe("silver")
    expect(normalizeFinish("Chrome")).toBe("silver")
    expect(normalizeFinish("Machined")).toBe("silver")
    expect(normalizeFinish("Gunmetal")).toBe("silver")
  })

  it("defaults unknown or empty finishes to black", () => {
    expect(normalizeFinish(null)).toBe("black")
    expect(normalizeFinish("")).toBe("black")
    expect(normalizeFinish("Rainbow Glitter")).toBe("black")
  })
})
